#!/usr/bin/env python3
"""Mass brand intake — mirror media + insert product rows for a whole brand.

Reads supabase/<brand>-inventory.json (from brand-inventory.py), takes every
item whose verdict is 'ok' or 'set-exempt' AND has a trade price, uploads its
shots to Supabase storage, and inserts/upserts the product row. Turntables are
attached when a matching file exists in output/ (by SKU).

Usage: python3 intake-brand.py <brand-folder> [--limit N]
"""
import json, os, sys, time, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV = {}
for line in (ROOT / ".env").read_text().splitlines():
    line = line.strip()
    if line and "=" in line and not line.startswith("#"):
        k, _, v = line.partition("=")
        ENV[k] = v.strip()

URL = ENV["SUPABASE_URL"].rstrip("/")
KEY = ENV["SUPABASE_SECRET_KEY"]
BASE = f"{URL}/storage/v1/object/public/images"
SKU_SHOT_RE = None

def upload(path: Path, dest: str, ctype: str) -> bool:
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                f"{URL}/storage/v1/object/images/{dest}",
                data=path.read_bytes(), method="POST",
                headers={"Authorization": f"Bearer {KEY}", "apikey": KEY,
                         "Content-Type": ctype, "x-upsert": "true"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                if resp.status in (200, 201):
                    return True
        except urllib.error.HTTPError as e:
            if e.code in (409,):  # duplicate — fine with x-upsert
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
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read() or b"[]")

def find_turntable(sku: str):
    """A rendered turntable whose source basename matches this SKU's key shots."""
    out_dir = ROOT / "output"
    if not out_dir.is_dir():
        return None
    for d in out_dir.iterdir():
        stem = d.name  # e.g. Sasha-set-1_jpg_1_ba4523bf
        mp4 = d / f"{stem}.mp4"
        if mp4.is_file() and stem.lower().startswith(Path(d.name.split('_jpg')[0]).stem.lower()[:12]):
            pass
    return None

def main():
    brand = sys.argv[1]
    limit = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[2] == "--limit" else None
    rows = json.loads((ROOT / f"supabase/{brand}-inventory.json").read_text())
    eligible = [r for r in rows
                if r["verdict"] in ("ok", "set-exempt") and r["trade"]]
    if limit:
        eligible = eligible[:limit]

    # Group by SKU: the inventory rows are keyed by image URL, so one product
    # with several shots appears as several rows. Merge shots into one item.
    grouped: dict[str, dict] = {}
    for r in eligible:
        sku = r["sku"] or r["key"]
        g = grouped.setdefault(sku, {"title": r["title"], "trade": r["trade"],
                                     "shots": []})
        for s in r["shots"]:
            if s not in g["shots"]:
                g["shots"].append(s)
    print(f"{brand}: {len(rows)} items, {len(eligible)} eligible rows, "
          f"{len(grouped)} unique products")

    ok_n, skip_n, fail_n = 0, 0, 0
    for i, (sku, g) in enumerate(grouped.items(), 1):
        ll_sku = f"LL-{sku}" if not sku.startswith("LL-") else sku
        media = []
        for j, fname in enumerate(g["shots"], 1):
            src = Path("/home/server/Downloads/catalog") / brand / fname
            ext = fname.lower().rsplit(".", 1)[-1]
            ctype = {"webp": "image/webp", "png": "image/png",
                     "jpg": "image/jpeg", "jpeg": "image/jpeg"}.get(ext, "image/jpeg")
            dest = f"products/{ll_sku}-{j}.{ext}"
            if not upload(src, dest, ctype):
                fail_n += 1
                continue
            media.append({"alt": f"{g['title']} view {j}",
                          "url": f"{BASE}/{dest}", "type": "image"})
        if not media:
            print(f"  [{i}] {ll_sku}: no media uploaded — skipped")
            fail_n += 1
            continue
        try:
            trade = float(g["trade"])
        except (TypeError, ValueError):
            skip_n += 1
            continue
        row = {
            "sku": ll_sku,
            "name": g["title"],
            "supplier": "AlterEgo",
            "supplier_sku": sku,
            "wholesale_cost": trade,
            "duty_rate": 0.087,
            "status": "live",
            "media": media,
            "story": "",
        }
        try:
            existing = rest(f"products?sku=eq.{ll_sku}&select=sku,media")
            if existing:
                # Merge: keep existing media, add any new shots not already there
                have = {m.get("url") for m in existing[0].get("media") or []}
                merged = list(existing[0].get("media") or []) + \
                    [m for m in media if m["url"] not in have]
                rest(f"products?sku=eq.{ll_sku}", method="PATCH",
                     body={"media": merged})
                ok_n += 1
            else:
                rest("products", method="POST", body=row)
                ok_n += 1
        except Exception as e:
            print(f"  [{i}] {ll_sku}: insert failed {e}")
            fail_n += 1
        if i % 25 == 0:
            print(f"  [{i}/{len(grouped)}] ok={ok_n} fail={fail_n}")
    print(f"DONE {brand}: merged/inserted {ok_n}, skipped {skip_n}, failed {fail_n}")


if __name__ == "__main__":
    main()
