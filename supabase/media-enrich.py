#!/usr/bin/env python3
"""Lady Luxe — media enrichment + model-first ordering.

1. For the feed-imported pieces: mirror their remaining supplier shots
   (back/side views) into storage and append them to media.
2. For every live product with multiple images: classify each image by its
   background (uniform light = flat product cover; varied = model-worn) and
   reorder media model-first, so cards and heroes show the worn look.
3. Point any turntable poster at the new lead image.
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


def rest(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}", data=data, method=method,
        headers={"Authorization": "Bearer " + KEY, "apikey": KEY,
                 "Content-Type": "application/json",
                 "Prefer": "return=representation"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read() or b"[]")


def upload_bytes(data: bytes, dest: str, ctype: str) -> bool:
    try:
        req = urllib.request.Request(
            f"{URL}/storage/v1/object/images/{dest}",
            data=data, method="POST",
            headers={"Authorization": "Bearer " + KEY, "apikey": KEY,
                     "Content-Type": ctype, "x-upsert": "true"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status in (200, 201)
    except Exception as e:
        print("   upload failed:", dest, e)
        return False


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "LadyLuxe/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def classify(data: bytes) -> str:
    """'model' if the background is varied, 'cover' if uniform light."""
    try:
        im = Image.open(BytesIO(data)).convert("L").resize((64, 64))
    except Exception:
        return "unknown"
    px = im.load()
    ring = []
    for x in range(64):
        for y in (0, 1, 2, 61, 62, 63):
            ring.append(px[x, y])
    for y in range(64):
        for x in (0, 1, 2, 61, 62, 63):
            ring.append(px[x, y])
    mean = sum(ring) / len(ring)
    var = sum((v - mean) ** 2 for v in ring) / len(ring)
    std = var ** 0.5
    if mean > 190 and std < 28:
        return "cover"     # uniform light background — flat product shot
    return "model"         # varied background — worn / styled shot


def main():
    only_imported = "--backfill" in sys.argv if (sys.argv and len(sys.argv) > 1) else True
    # 1) feed images per parent SKU (for the imported pieces' back/side views)
    feed_images = {}
    if Path(FEED).is_file():
        tree = ET.parse(FEED)
        for post in tree.getroot().iter("post"):
            sku = (post.findtext("SKU") or "").strip()
            if not sku:
                continue
            imgs = [i.strip() for i in ((post.findtext("Images") or "").split(",")) if i.strip()]
            feed_images.setdefault(sku, imgs)

    products = rest("products?select=sku,name,supplier_sku,media,status&status=eq.live")
    print("live products:", len(products))

    reordered, backfilled, unchanged = 0, 0, 0
    for p in products:
        sku = p["sku"]
        media = [m for m in (p.get("media") or []) if m.get("url") or m.get("mp4")]
        if not media:
            continue
        supplier_sku = (p.get("supplier_sku") or "").upper()

        # --- backfill: feed-imported pieces gain their remaining shots ---
        added = []
        if only_imported and (p.get("media") and len(p.get("media")) == 1):
            base_feed = feed_images.get(supplier_sku) or feed_images.get(sku.replace("LL-", "", 1))
            if base_feed and len(base_feed) > 1:
                have = {m.get("url") for m in media}
                for j, img in enumerate(base_feed, 1):
                    dest = f"products/{sku}-{len(media) + 1}.{img.rsplit('.', 1)[-1].lower()}"
                    try:
                        data = fetch(img)
                    except Exception:
                        continue
                    ext = img.rsplit(".", 1)[-1].lower()
                    ctype = {"webp": "image/webp", "png": "image/png"}.get(ext, "image/jpeg")
                    if upload_bytes(data, dest, ctype):
                        entry = {"alt": f"{p['name']} view {j}", "url": f"{URL}/storage/v1/object/public/images/{dest}", "type": "image"}
                        if entry["url"] not in have:
                            media.append(entry)
                            added.append(entry)

        # --- classify + reorder: model-worn first ---
        image_entries = [m for m in media if m.get("type") == "image"]
        if len(image_entries) > 1:
            scored = []
            for m in image_entries:
                try:
                    data = fetch(m["url"])
                    scored.append((classify(data), m))
                except Exception:
                    scored.append(("unknown", m))
            order = {"model": 0, "unknown": 1, "cover": 2}
            image_entries = [m for _, m in sorted(scored, key=lambda s: order[s[0]])]
            other = [m for m in media if m.get("type") != "image"]
            media = image_entries + other
            reordered += 1

        # --- turntable poster follows the lead image ---
        lead = next((m.get("url") for m in media if m.get("type") == "image"), None)
        for m in media:
            if m.get("type") == "turntable" and lead:
                m["poster"] = lead

        if added:
            backfilled += 1
        if added or reordered:
            try:
                rest(f"products?sku=eq.{sku}", method="PATCH", body={"media": media})
            except Exception as e:
                print(f"   {sku}: patch failed {e}")
                continue
    print(f"DONE: backfilled {backfilled}, reordered {reordered}, untouched {len(products) - backfilled}")


import sys
if __name__ == "__main__":
    main()
