#!/usr/bin/env python3
"""
Lady Luxe — new-arrivals intake ingester
=========================================
Reads hand-curated markdown files + media folders, creates products in Supabase,
uploads images/videos to our CDN buckets, and reports anything ambiguous.

USAGE
  python3 supabase/intake-new-arrivals.py [--dry-run]

CONVENTIONS
  1. MD files:   /home/server/lady_luxe/intake/*.md
     - entries separated by a line of --- (or a blank line + ## heading)
     - fields as "Label: value" (case-insensitive), one per line:
         SKU: YX807
         Brand: YesX
         Name: Faux Leather Corset & Skirt
         RRP: 67.49
         Trade: 30.67            (optional — falls back to RRP-based pricing)
         Color: Black
         Sizes: S,M,L,XL
         Category: Corsets       (optional)
         Collection: midnight    (optional — links to a collection slug)
         Description: ...        (optional, single or multi-line)
     - an entry may also be a bundle: include "Ensemble: The Name" + multiple
       "Piece: <SKU>" lines referencing SKUs defined earlier in the same file(s)
  2. Images:      /home/server/Pictures/catalog/**  (filename containing the SKU)
  3. Videos:      /home/server/Pictures/catalog/**  (filename containing the SKU)
     - multiple angles OK: YX807-front.mp4, YX807-back.mp4 → stored as
       <sku>-front.mp4 etc. (order: front, side, back, then alphabetical)
"""
import json, os, re, sys, glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INTAKE_DIR = os.path.join(ROOT, "intake")
MEDIA_ROOTS = ["/home/server/Pictures/catalog"]

env = {}
for line in open(os.path.join(ROOT, ".env")):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()

MARKUP = 2.4

def fnum(s):
    try:
        return float(re.sub(r"[^\d.]", "", str(s)))
    except Exception:
        return None

# ---------------------------------------------------------------- parse MD
FIELD_ALIASES = {
    "sku": "sku", "item": "sku", "code": "sku",
    "brand": "brand",
    "name": "name", "title": "name", "product": "name",
    "rrp": "rrp", "rrp price": "rrp",
    "trade": "trade", "trade price": "trade", "cost": "trade",
    "color": "color", "colour": "color",
    "sizes": "sizes", "size": "sizes",
    "category": "category", "categories": "category",
    "collection": "collection",
    "description": "description", "desc": "description", "details": "description",
    "ensemble": "ensemble", "set": "ensemble",
    "piece": "pieces", "pieces": "pieces",
}

def parse_md(path):
    """returns list of entry dicts; entries split on --- or ## headings"""
    text = open(path, encoding="utf-8").read()
    blocks = re.split(r"\n\s*-{3,}\s*\n|\n(?=##\s)", "\n" + text)
    entries = []
    for block in blocks:
        fields = defaultdict(list)
        desc_lines = []
        current_key = None
        for line in block.splitlines():
            line = line.strip()
            if not line or line.startswith("##") or line.startswith("#"): continue
            m = re.match(r"^([A-Za-z ]{2,20}):\s*(.*)$", line)
            if m and m.group(1).strip().lower() in FIELD_ALIASES:
                current_key = FIELD_ALIASES[m.group(1).strip().lower()]
                if m.group(2).strip(): fields[current_key].append(m.group(2).strip())
                elif current_key == "description": current_key = "description"; desc_lines.append("")
                continue
            if current_key == "description" and line:
                desc_lines.append(line)
        if fields.get("sku") or fields.get("name"):
            e = {k: v for k, v in fields.items()}
            if desc_lines and not e.get("description"):
                e["description"] = " ".join(l for l in desc_lines if l)
            entries.append(e)
    return entries

# ---------------------------------------------------------------- media match
def scan_media():
    imgs, vids = [], []
    for root in MEDIA_ROOTS:
        for dirpath, _, files in os.walk(root):
            for f in files:
                p = os.path.join(dirpath, f)
                low = f.lower()
                if low.endswith((".jpg", ".jpeg", ".png", ".webp")): imgs.append(p)
                elif low.endswith((".mp4", ".mov", ".webm")): vids.append(p)
    return imgs, vids

def media_for(sku, imgs, vids):
    """media whose filename contains the SKU (case-insensitive)"""
    key = sku.lower().replace("-", "").replace("_", "")
    def match(path):
        fname = os.path.basename(path).lower().replace("-", "").replace("_", "")
        return key in fname
    my_imgs = sorted([p for p in imgs if match(p)])
    my_vids = sorted([p for p in vids if match(p)],
                     key=lambda p: (0 if "front" in p.lower() else 1 if "side" in p.lower() else 2 if "back" in p.lower() else 3, p))
    return my_imgs, my_vids

# ---------------------------------------------------------------- main
def main():
    dry = "--dry-run" in sys.argv
    md_files = sorted(glob.glob(os.path.join(INTAKE_DIR, "*.md")))
    if not md_files:
        print(f"No intake files found in {INTAKE_DIR}\nDrop your curated .md files there (template: supabase/intake-template.md)")
        sys.exit(0)

    entries = []
    for md in md_files:
        entries.extend(parse_md(md))
    print(f"Parsed {len(entries)} entries from {len(md_files)} file(s)")

    imgs, vids = scan_media()
    print(f"Media pool: {len(imgs)} images, {len(vids)} videos")

    os.chdir(ROOT)
    from importlib import util
    spec = util.spec_from_file_location("sj", os.path.join("node_modules", ".bin"))
    # use supabase-js via node helper instead — simpler: shell out at the end.

    # build the catalog payload
    products, bundles, missing_media, missing_price = [], [], [], []
    sku_index = {}
    for e in entries:
        sku = e.get("sku", "").strip()
        name = e.get("name", "").strip()
        if not sku or not name:
            print(f"  ⚠ skipping entry without SKU/Name: {e}"); continue
        rrp = fnum(e.get("rrp"))
        trade = fnum(e.get("trade"))
        if trade: price = round(trade * MARKUP * 2) / 2
        elif rrp: price = rrp
        else:
            missing_price.append(sku); price = None
        my_imgs, my_vids = media_for(sku, imgs, vids)
        if not my_imgs and not my_vids: missing_media.append(sku)
        media = []
        for p in my_vids:
            label = os.path.splitext(os.path.basename(p))[0]
            angle = "front" if "front" in label.lower() else "side" if "side" in label.lower() else "back" if "back" in label.lower() else "film"
            media.append({"type": "video", "file": p, "angle": angle, "alt": f"{name} — {angle}"})
        for p in my_imgs:
            media.append({"type": "image", "file": p, "alt": name})
        products.append({
            "sku": f"LL-{sku}", "supplier_sku": sku, "supplier": e.get("brand", "").lower() or "alterego",
            "name": name, "tag": e.get("category", ""), "price": price,
            "wholesale_cost": trade, "duty_rate": 0.087, "status": "live",
            "rrp": rrp, "media": media, "story": e.get("description", ""),
            "color": e.get("color", ""), "sizes": e.get("sizes", ""),
            "collection": e.get("collection", "midnight"),
        })
        sku_index[sku] = f"LL-{sku}"

    # bundles from Ensemble entries
    for e in entries:
        ens = e.get("ensemble")
        if not ens: continue
        piece_skus = [p.strip() for p in e.get("pieces", [])]
        if len(piece_skus) < 2:
            print(f"  ⚠ ensemble '{ens}' needs ≥2 Piece: lines"); continue
        comp = [sku_index.get(ps) for ps in piece_skus if sku_index.get(ps)]
        trade_sum = sum((p["wholesale_cost"] or 0) for p in products if p["sku"] in comp)
        price = round(trade_sum * MARKUP * 0.94 * 2) / 2 if trade_sum else None
        media = []
        for p in products:
            if p["sku"] in comp:
                for m in p["media"]:
                    if m["type"] == "video": media.append(m); break
        ens_sku = "LL-ENS-" + re.sub(r"[^A-Za-z0-9]", "", ens)
        bundles.append({"sku": ens_sku, "name": f"The {ens.title()} Ensemble",
                        "price": price, "set_factor": 0.94, "live": True,
                        "media": media, "pieces": comp,
                        "story": e.get("description", "")})

    # report
    print(f"\nProducts to create: {len(products)}")
    for p in products:
        print(f"  {p['sku']:34} ${p['price'] or 0:8.2f} | media: {len(p['media'])} | {p['name'][:40]}")
    if bundles:
        print(f"Ensembles to create: {len(bundles)}")
        for b in bundles: print(f"  {b['sku']:30} ${b['price'] or 0:8.2f} | {b['name']}")
    if missing_media: print(f"\n⚠ no media found for: {', '.join(missing_media)}")
    if missing_price: print(f"⚠ no price computable for: {', '.join(missing_price)}")

    if dry:
        print("\n(dry run — nothing written)"); return

    # write payload for the node uploader (reuses supabase-js)
    payload = {"products": products, "bundles": bundles}
    json.dump(payload, open(os.path.join(ROOT, "supabase", "intake-payload.json"), "w"), indent=1)
    print("\npayload → supabase/intake-payload.json — uploading via node…")
    os.system("node supabase/upload-intake.mjs")

if __name__ == "__main__":
    main()
