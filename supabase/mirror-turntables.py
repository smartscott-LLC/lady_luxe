#!/usr/bin/env python3
"""Mirror finished turntables to Supabase and attach to product media.

Reads supabase/<brand>-turntables.json (from turntable-batch.py), uploads
each film pair to storage, and merges a 'turntable' entry into the product's
media array.
"""
import json, sys, time, urllib.request
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


def upload(path: Path, dest: str, ctype: str) -> bool:
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                f"{URL}/storage/v1/object/images/{dest}",
                data=path.read_bytes(), method="POST",
                headers={"Authorization": f"Bearer {KEY}", "apikey": KEY,
                         "Content-Type": ctype, "x-upsert": "true"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                if resp.status in (200, 201, 409):
                    return True
        except Exception:
            time.sleep(2 ** attempt)
    return False


def main():
    brand = sys.argv[1]
    rows = json.loads((ROOT / f"supabase/{brand}-turntables.json").read_text())
    done = [r for r in rows if r["status"] in ("done", "already-done")]
    print(f"{brand}: {len(done)} films to mirror")

    ok = fail = 0
    for r in done:
        sku = r["sku"]
        d = Path(r["dir"])
        stem = d.name
        mp4 = d / f"{stem}.mp4"
        webm = d / f"{stem}.webm"
        if not mp4.is_file():
            print(f"  {sku}: no film — skipped")
            continue
        slug = sku.replace("LL-", "").lower()
        dest_mp4 = f"turntables/{slug}.mp4"
        dest_webm = f"turntables/{slug}.webm"
        if not upload(mp4, dest_mp4, "video/mp4") or not upload(webm, dest_webm, "video/webm"):
            print(f"  {sku}: upload FAILED")
            fail += 1
            continue

        manifest_path = d / "manifest.json"
        poses, frames, dur = [], None, None
        if manifest_path.is_file():
            m = json.loads(manifest_path.read_text())
            poses = [{"angle": p["angle"], "label": p["label"], "time_s": p["time_s"]} for p in m["poses"]]
            frames, dur = m["video"]["frames"], m["video"]["duration_s"]

        req = urllib.request.Request(
            f"{URL}/rest/v1/products?sku=eq.{sku}&select=sku,media",
            headers={"Authorization": f"Bearer {KEY}", "apikey": KEY})
        with urllib.request.urlopen(req, timeout=60) as resp:
            existing = json.loads(resp.read() or "[]")
        if not existing:
            print(f"  {sku}: product not in DB — skipped")
            continue
        media = existing[0].get("media") or []
        if any(m.get("type") == "turntable" for m in media):
            print(f"  {sku}: already attached")
            ok += 1
            continue
        media.append({
            "alt": f"{existing[0]['sku']} 360 turntable", "type": "turntable",
            "mp4": f"{BASE}/{dest_mp4}", "webm": f"{BASE}/{dest_webm}",
            "poster": next((m["url"] for m in media if m.get("type") == "image"), None),
            "poses": poses, "fps": 24, "frames": frames, "duration_s": dur,
        })
        patch = urllib.request.Request(
            f"{URL}/rest/v1/products?sku=eq.{sku}", method="PATCH",
            data=json.dumps({"media": media}).encode(),
            headers={"Authorization": f"Bearer {KEY}", "apikey": KEY,
                     "Content-Type": "application/json", "Prefer": "return=representation"})
        with urllib.request.urlopen(patch, timeout=60) as resp:
            resp.read()
        ok += 1
        print(f"  {sku}: attached ✓")

    print(f"MIRROR DONE: {ok} attached, {fail} failed")


if __name__ == "__main__":
    main()
