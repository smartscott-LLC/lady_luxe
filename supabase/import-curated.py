#!/usr/bin/env python3
"""Lady Luxe — import the curated parent products from the AlterEgo feed.

Collapses the feed's parent/variant structure into product rows: each parent
SKU becomes a product (mirroring its lead image), carrying a `sizes` jsonb of
its size variants ({sku, size}) so the product page can offer a size picker
and the order can record the size-specific variant SKU for the AlterEgo
upload. Floors and the taste filter gate the set.
"""
import json, os, sys, time, urllib.request, urllib.error
import xml.etree.ElementTree as ET
from pathlib import Path

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
DUTY = 0.087
MARKUP = 2.4

FLOORS = {"Shirley of Hollywood": 54, "Provocative": 47, "Me Seduce": 55, "Confidante": 50}
BAD = None


def compile_bad():
    global BAD
    import re
    BAD = re.compile(
        r"crotchless|open[- ]?crotch|vibrat|dildo|butt[- ]?plug|anal|bondage|bdsm|"
        r"fetish|gag\b|flogger|whip\b|handcuff|nipple|strap[- ]?on|masturbat|penis|"
        r"sex toy|pump\b|clamp", re.I)


def upload_bytes(data: bytes, dest: str, ctype: str) -> bool:
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                f"{URL}/storage/v1/object/images/{dest}",
                data=data, method="POST",
                headers={"Authorization": f"Bearer {KEY}", "apikey": KEY,
                         "Content-Type": ctype, "x-upsert": "true"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                if resp.status in (200, 201):
                    return True
        except urllib.error.HTTPError as e:
            if e.code == 409:
                return True
            if e.code == 429:
                time.sleep(2 ** attempt)
                continue
        except Exception:
            time.sleep(2 ** attempt)
    return False


def rest(path: str, method: str = "GET", body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}", data=data, method=method,
        headers={"Authorization": f"Bearer {KEY}", "apikey": KEY,
                 "Content-Type": "application/json",
                 "Prefer": "return=representation,resolution=merge-duplicates"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read() or b"[]")


def gather_parents():
    import re
    parents = {}
    tree = ET.parse(FEED)
    for post in tree.getroot().iter("post"):
        sku = (post.findtext("SKU") or "").strip()
        if not sku:
            continue
        brand = (post.findtext("Brand") or "").strip()
        parent = (post.findtext("ParentSKU") or "").strip() or sku
        try:
            trade = float((post.findtext("Tradeprice") or "").strip())
        except ValueError:
            trade = None
        size = (post.findtext("ProductSize") or "").strip()
        title = (post.findtext("Title") or "").strip()
        content = (post.findtext("Content") or "").strip()
        cats = (post.findtext("Productcategories") or "").strip()
        images = [i.strip() for i in ((post.findtext("Images") or "").split(",")) if i.strip()]

        p = parents.setdefault(parent, {"brand": brand, "trade": None, "variants": [],
                                        "title": title, "content": content, "cats": cats,
                                        "images": [], "bad": False})
        if trade and (p["trade"] is None or trade < p["trade"]):
            p["trade"] = trade
        if size and size not in p["variants"]:
            p["variants"].append(size)
        if sku == parent:
            p["images"] = images
            p["title"] = title
            p["content"] = content
            p["cats"] = cats
            p["bad"] = bool(BAD.search(" ".join([title, content, cats])))
        elif not p["bad"] and BAD.search(" ".join([title, content, cats])):
            p["bad"] = True
    return parents


def main():
    compile_bad()
    parents = gather_parents()

    rows = []
    for parent, p in parents.items():
        house = p["brand"]
        floor = FLOORS.get(house)
        if not floor or p["bad"] or not p["trade"]:
            continue
        retail = round(p["trade"] * 2.4, 2)
        if retail < floor:
            continue
        rows.append({
            "sku": parent, "name": p["title"], "trade": p["trade"],
            "retail": retail, "images": p["images"][:1], "variants": p["variants"],
            "featured70": retail >= 70,
        })

    print(f"curated parent products to import: {len(rows)}")

    ok, fail, skip = 0, 0, 0
    for i, r in enumerate(rows, 1):
        ll_sku = r["sku"] if r["sku"].startswith("LL-") else f"LL-{r['sku']}"
        try:
            existing = rest(f"products?sku=eq.{ll_sku}&select=sku")
            if existing:
                ok += 1
                continue
        except Exception:
            pass
        media = []
        for j, img in enumerate(r["images"][:1], 1):
            ext = img.rsplit(".", 1)[-1].lower()
            ctype = {"webp": "image/webp", "png": "image/png"}.get(ext, "image/jpeg")
            dest = f"products/{ll_sku}-{j}.{ext}"
            try:
                with urllib.request.urlopen(img, timeout=60) as resp:
                    data = resp.read()
            except Exception:
                continue
            if upload_bytes(data, dest, ctype):
                media.append({"alt": r["name"], "url": f"{URL}/storage/v1/object/public/images/{dest}",
                              "type": "image"})
        if not media:
            skip += 1
            continue
        sizes = [{"sku": f"V-{ll_sku}-{n}", "size": s} for n, s in enumerate(r["variants"], 1)]
        sizes = [{"sku": v, "size": s} for v, s in zip(
            [f"{r['sku']}::{s}" for s in r["variants"]], r["variants"])]
        row = {
            "sku": ll_sku,
            "name": r["name"],
            "supplier": "AlterEgo",
            "supplier_sku": r["sku"],
            "wholesale_cost": r["trade"],
            "duty_rate": DUTY,
            "status": "live",
            "media": media,
            "story": "",
            "sizes": sizes,
        }
        try:
            rest("products", method="POST", body=row)
            ok += 1
        except Exception as e:
            print(f"  [{i}] {ll_sku}: insert failed {e}")
            fail += 1
        if i % 25 == 0:
            print(f"  [{i}/{len(rows)}] ok={ok} skip={skip} fail={fail}")
    print(f"DONE: imported {ok}, skipped {skip}, failed {fail}")


if __name__ == "__main__":
    main()
