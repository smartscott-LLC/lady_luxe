#!/usr/bin/env python3
"""Lady Luxe — import the owner's hand-made sets as live bundles.

Reads the supplier feed for any missing component pieces, imports them
(sizes from the feed variants), uploads the owner's stills (front/back,
converted to webp) and films, then creates the bundles + bundle_items.
"""
import json, os, urllib.request, urllib.error
import xml.etree.ElementTree as ET
from pathlib import Path
from io import BytesIO
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ENV = {}
for line in (ROOT / ".env").read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, _, v = line.partition("=")
        ENV[k.strip()] = v.strip()

URL = ENV["SUPABASE_URL"].rstrip("/")
KEY = ENV["SUPABASE_SECRET_KEY"]
FEED = "/tmp/opencode/alterego-full.xml"
SETS_DIR = Path("/home/server/Pictures/sets/vids")
DUTY = 0.087


def rest(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}", data=data, method=method,
        headers={"Authorization": "Bearer " + KEY, "apikey": KEY,
                 "Content-Type": "application/json",
                 "Prefer": "return=representation"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read() or b"[]")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "LadyLuxe/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def upload_bytes(data: bytes, dest: str, ctype: str) -> str:
    bucket = "videos" if ctype.startswith("video/") else "images"
    req = urllib.request.Request(
        f"{URL}/storage/v1/object/{bucket}/{dest}",
        data=data, method="POST",
        headers={"Authorization": "Bearer " + KEY, "apikey": KEY,
                 "Content-Type": ctype, "x-upsert": "true"})
    urllib.request.urlopen(req, timeout=300)
    return f"{URL}/storage/v1/object/public/{bucket}/{dest}"


def png_to_webp_bytes(path: Path, quality=85):
    im = Image.open(path).convert("RGB")
    buf = BytesIO()
    im.save(buf, "WEBP", quality=quality, method=6)
    return buf.getvalue(), "image/webp"


# 1) the feed index (parent rows only — they carry the imagery)
feed_parents = {}
tree = ET.parse(FEED)
for post in tree.getroot().iter("post"):
    sku = (post.findtext("SKU") or "").strip()
    if not sku:
        continue
    parent = (post.findtext("ParentSKU") or "").strip() or sku
    if sku != parent:
        continue
    try:
        trade = float((post.findtext("Tradeprice") or "").strip())
    except ValueError:
        trade = None
    images = [i.strip() for i in ((post.findtext("Images") or "").split(",")) if i.strip()]
    feed_parents[parent] = {"title": (post.findtext("Title") or "").strip(),
                            "trade": trade, "images": images}

# 2) import the missing component pieces
MISSING = [
    {"supplier_sku": "BEAUTYNIGHTBN6612CATHERINE-G", "feed_key": "BEAUTYNIGHTBN6612CATHERINE-G"},
    {"supplier_sku": "BAL589WHITE-G", "feed_key": "BAL589WHITE-G"},
    {"supplier_sku": "BS249BLACK-G", "feed_key": "BS249BLACK-G"},
    {"supplier_sku": "IRALLASTRIDGLOVESWHITE-G", "feed_key": "IRALLASTRIDGLOVESWHITE-G"},
]
sizes_fixups = {
    # feed variant SKUs that carry the size in the SKU itself (O/S pieces)
    "IRALLASTRIDGLOVESWHITE-G": [{"sku": "IRALLASTRIDGLOVESWHITEO/S", "size": "O/S"}],
}

for piece in MISSING:
    ll_sku = "LL-" + piece["supplier_sku"]
    existing = rest(f"products?sku=eq.{ll_sku}&select=sku")
    if existing:
        print(f"piece {ll_sku}: already imported")
        continue
    # find ANY feed row for this piece — some one-size pieces are
    # variant-only (no parent row), like the Astrid gloves
    base = piece["supplier_sku"].upper().removesuffix("-G")
    matches = [post for post in tree.getroot().iter("post")
               if ((post.findtext("SKU") or "").strip().upper()).startswith(base)]
    if not matches:
        print(f"piece {piece['supplier_sku']}: not found in the feed — skipped")
        continue
    # the row with the most images is the product's face; the cheapest
    # variant trade sets the wholesale
    info = max(matches, key=lambda r: len([i for i in ((r.findtext("Images") or "").split(",")) if i.strip()]))
    trade = None
    for r in matches:
        try:
            t = float((r.findtext("Tradeprice") or "").strip())
            trade = t if trade is None else min(trade, t)
        except ValueError:
            pass
    images = [i.strip() for i in ((info.findtext("Images") or "").split(",")) if i.strip()]
    title = (info.findtext("Title") or "").strip()
    feed_sku = (info.findtext("SKU") or "").strip()
    media = []
    for j, img in enumerate(images[:2], 1):
        ext = img.rsplit(".", 1)[-1].lower()
        ctype = {"webp": "image/webp", "png": "image/png"}.get(ext, "image/jpeg")
        dest = f"products/{ll_sku}-{j}.{ext}"
        try:
            data = fetch(img)
        except Exception as e:
            print(f"   {ll_sku}: image fetch failed {e}")
            continue
        if upload_bytes(data, dest, ctype):
            media.append({"alt": title, "url": f"{URL}/storage/v1/object/public/images/{dest}", "type": "image"})
    if not media:
        print(f"piece {ll_sku}: no images — skipped")
        continue
    # variants: the feed's child rows (sizes)
    variants = []
    for post in tree.getroot().iter("post"):
        vsku = (post.findtext("SKU") or "").strip()
        vparent = (post.findtext("ParentSKU") or "").strip() or vsku
        if vparent != feed_sku and vsku != feed_sku:
            continue
        size = (post.findtext("ProductSize") or "").strip()
        if size and vsku not in [v["sku"] for v in variants]:
            variants.append({"sku": vsku, "size": size})
    if not variants:
        variants = sizes_fixups.get(piece["supplier_sku"], [])
    row = {
        "sku": ll_sku,
        "name": title,
        "supplier": "AlterEgo",
        "supplier_sku": feed_sku,
        "wholesale_cost": trade or 0,
        "duty_rate": DUTY,
        "status": "live",
        "media": media,
        "story": "",
        "sizes": variants,
    }
    rest("products", method="POST", body=row)
    print(f"piece {ll_sku}: imported ({title})")

# 3) the sets
SETS = [
    {
        "sku": "LL-ENS-MIDCOUTURE",
        "name": "The Midnight Couture 3-Piece Ensemble",
        "price": 204.98,
        "pieces": ["BEAUTYNIGHTBN6558CORSET-GG", "BEAUTYNIGHTBN6633-G", "BEAUTYNIGHTBN6612CATHERINE-G"],
        "story": (
            "The Midnight Couture Ensemble from the Beauty Night Collection: an intricately "
            "embroidered tattoo-effect corset, a flowing sheer lace robe, and classic lace-top "
            "hold-ups — one unforgettable, head-to-toe look.\n\n"
            "Includes the Savannah Tattoo-Effect Corset (sheer nude tulle with original floral "
            "embroidery, wide back lacing — matching thong included), the Sissy Sheer Lace Robe "
            "(black mesh and lace with slit sleeves and a satin waist tie — matching thong "
            "included), and the Catherine Lace-Top Hold-Ups with deep floral lace tops.\n\n"
            "Every piece arrives in official, gift-ready Beauty Night packaging with "
            "authenticity holograms — including a dedicated storage and wash pouch."
        ),
        "front": "1-front.png",
        "back": "1-back.png",
        "video": "savannah_set.mp4",
    },
    {
        "sku": "LL-ENS-NOIRIVORY",
        "name": "The Monochrome Noir & Ivory 4-Piece Ensemble",
        "price": 130.98,
        "pieces": ["BEAUTYNIGHTBN6329MICHELE-G", "BEAUTYNIGHTBN6458STEPHANWHT-G",
                   "IRALLASTRIDGLOVESWHITE-G", "BAL589WHITE-G"],
        "story": (
            "The Monochrome Noir & Ivory Ensemble — old-Hollywood glamour in luminous white "
            "satin and dramatic black floral lace, composed for bridal nights, anniversaries "
            "and special occasions.\n\n"
            "Includes the Michele Contrast Satin & Lace Chemise (white satin panels, sheer "
            "mesh sides, black embroidered lace — matching thong included), the Stephanie Satin "
            "& Lace Dressing Gown (white satin with black lace panels and a satin waist tie — "
            "matching thong included), the Astrid Stretch Satin Opera Gloves (above the elbow, "
            "white), and the Wedding Touch Lace-Top Hold-Ups (pure white with floral lace tops).\n\n"
            "The chemise and dressing gown arrive in official Beauty Night presentation boxes "
            "with authenticity holograms — including an organza drawstring pouch."
        ),
        "front": "club2front.png",
        "back": "club2back.png",
        "video": "club2.mp4.mp4",
    },
    {
        "sku": "LL-ENS-ROYALVELVET",
        "name": "The Royal Velvet & Vintage Lace 3-Piece Ensemble",
        "price": 139.98,
        "pieces": ["BEAUTYNIGHTBN6545-G", "BEAUTYNIGHTBN6673-G", "BS249BLACK-G"],
        "story": (
            "The Royal Velvet & Vintage Lace Ensemble — deep burgundy satin, sumptuous purple "
            "lace and vintage seamed hosiery in one head-to-toe look of effortless sophistication.\n\n"
            "Includes the Eve Satin & Eyelash Lace Chemise Set (deep purple, floral lace cups, "
            "scalloped eyelash hem — matching thong and eyelash lace eye mask included), the "
            "Burgundy Satin Peignoir Robe (lace accents, wide sleeves, satin waist belt — "
            "matching thong included), and the Ornate Burgundy & Black Back-Seam Hold-Ups.\n\n"
            "Each piece arrives in official, gift-ready designer packaging."
        ),
        "front": "club4front.png",
        "back": "club4back.png",
        "video": "club4.mp4",
    },
]

product_ids = {}
for s in SETS:
    for piece_sku in s["pieces"]:
        ll = "LL-" + piece_sku
        rows = rest(f"products?sku=eq.{ll}&select=id,sku")
        if not rows:
            print(f"!! piece {ll} missing — the set {s['sku']} cannot link it")
            continue
        product_ids[ll] = rows[0]["id"]

for s in SETS:
    existing = rest(f"bundles?sku=eq.{s['sku']}&select=id,sku")
    if existing:
        bundle_id = existing[0]["id"]
    else:
        # media: front (converted webp) + back (converted webp) + the film
        media = []
        front_webp, ftype = png_to_webp_bytes(SETS_DIR / s["front"])
        furl = upload_bytes(front_webp, f"ensembles/{s['sku'].lower()}-front.webp", ftype)
        media.append({"type": "image", "url": furl, "alt": s["name"]})
        if (SETS_DIR / s["back"]).is_file():
            back_webp, btype = png_to_webp_bytes(SETS_DIR / s["back"])
            burl = upload_bytes(back_webp, f"ensembles/{s['sku'].lower()}-back.webp", btype)
            media.append({"type": "image", "url": burl, "alt": f"{s['name']} — back"})
        vdata = (SETS_DIR / s["video"]).read_bytes()
        vurl = upload_bytes(vdata, f"ensembles/{s['sku'].lower()}.mp4", "video/mp4")
        media.append({"type": "turntable", "mp4": vurl, "poster": furl})
        row = {
            "sku": s["sku"],
            "name": s["name"],
            "price": s["price"],
            "story": s["story"],
            "media": media,
            "live": True,
        }
        bundle = rest("bundles", method="POST", body=row)
        bundle_id = (bundle[0]["id"] if isinstance(bundle, list) else bundle["id"])
    # link the pieces — idempotent (skip if already linked)
    have = {i["product_id"] for i in rest(f"bundle_items?select=product_id&bundle_id=eq.{bundle_id}")}
    for piece_sku in s["pieces"]:
        ll = "LL-" + piece_sku
        pid = product_ids.get(ll)
        if pid and pid not in have:
            rest("bundle_items", method="POST", body={"bundle_id": bundle_id, "product_id": pid})
            have.add(pid)
    print(f"set {s['sku']}: ready — {s['name']} at ${s['price']}")

print("SETS DONE")
