#!/usr/bin/env python3
"""Lady Luxe — import the curated $70+ pieces from the AlterEgo full feed.

Takes the curation pass output (curation-pass-1.json), mirrors each piece's
lead image into Supabase storage, and inserts the product row at the house
SKU convention. Only pieces above the featured threshold ($70 retail) import.
"""
import json, os, sys, urllib.request, urllib.error
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
DUTY = 0.087
MARKUP = 2.4


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
                import time
                time.sleep(2 ** attempt)
                continue
        except Exception:
            import time
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


def main():
    curation = json.loads((Path(__file__).parent / "curation-pass-1.json").read_text())
    pieces = []
    for house, rows in curation["curated"].items():
        for r in rows:
            if r.get("featured70") and r.get("trade"):
                pieces.append(r)
    print(f"curated $70+ pieces to import: {len(pieces)}")

    ok, fail = 0, 0
    for i, r in enumerate(pieces, 1):
        sku = r["sku"]
        ll_sku = sku if sku.startswith("LL-") else f"LL-{sku}"
        media = []
        for j, img in enumerate(r.get("images", [])[:1], 1):
            ext = img.rsplit(".", 1)[-1].lower()
            ctype = {"webp": "image/webp", "png": "image/png"}.get(ext, "image/jpeg")
            dest = f"products/{ll_sku}-{j}.{ext}"
            try:
                with urllib.request.urlopen(img, timeout=60) as resp:
                    data = resp.read()
            except Exception:
                fail += 1
                media = []
                break
            if upload_bytes(data, dest, ctype):
                media.append({"alt": r["name"], "url": f"{URL}/storage/v1/object/public/images/{dest}",
                              "type": "image"})
        if not media:
            continue
        try:
            existing = rest(f"products?sku=eq.{ll_sku}&select=sku")
            if existing:
                ok += 1
                continue
            row = {
                "sku": ll_sku,
                "name": r["name"],
                "supplier": "AlterEgo",
                "supplier_sku": sku,
                "wholesale_cost": r["trade"],
                "duty_rate": DUTY,
                "status": "live",
                "media": media,
                "story": "",
            }
            rest("products", method="POST", body=row)
            ok += 1
        except Exception as e:
            print(f"  [{i}] {ll_sku}: insert failed {e}")
            fail += 1
        if i % 25 == 0:
            print(f"  [{i}/{len(pieces)}] ok={ok} fail={fail}")
    print(f"DONE: imported {ok}, failed {fail}")


if __name__ == "__main__":
    main()
