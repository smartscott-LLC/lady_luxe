#!/usr/bin/env python3
"""Lady Luxe — attach rendered turntables to their products.

Reads the batch summaries (supabase/<brand>-turntables.json), uploads each
film (mp4 + webm) into the videos bucket, and appends a turntable entry to
the product's media so /featured and the product page pick it up.
"""
import json, os, urllib.request, urllib.error
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


def upload_bytes(data: bytes, dest: str, ctype: str) -> bool:
    try:
        req = urllib.request.Request(
            f"{URL}/storage/v1/object/videos/{dest}",
            data=data, method="POST",
            headers={"Authorization": f"Bearer {KEY}", "apikey": KEY,
                     "Content-Type": ctype, "x-upsert": "true"})
        with urllib.request.urlopen(req, timeout=300) as resp:
            return resp.status in (200, 201)
    except urllib.error.HTTPError as e:
        if e.code == 409:
            return True
        print("   upload failed", e.code, dest)
        return False
    except Exception as e:
        print("   upload error", e, dest)
        return False


def rest(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}", data=data, method=method,
        headers={"Authorization": f"Bearer {KEY}", "apikey": KEY,
                 "Content-Type": "application/json",
                 "Prefer": "return=representation"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read() or b"[]")


brands = ["shirley-of-hollywood", "me-seduce", "confidante", "provocative"]
done, failed = 0, 0
for brand in brands:
    summary = ROOT / f"supabase/{brand}-turntables.json"
    if not summary.is_file():
        continue
    for r in json.loads(summary.read_text()):
        if r["status"] not in ("done", "already-done"):
            print(f"{r['sku']}: skipped ({r['status']})")
            failed += 1
            continue
        out_dir = Path(r["dir"])
        mp4s = sorted(out_dir.glob("*.mp4"))
        webms = sorted(out_dir.glob("*.webm"))
        if not mp4s:
            print(f"{r['sku']}: no mp4 in {out_dir.name}")
            failed += 1
            continue
        ll_sku = r["sku"]
        base = ll_sku.lower().lstrip("ll-")
        mp4_url = f"{URL}/storage/v1/object/public/videos/{base}.mp4"
        webm_url = f"{URL}/storage/v1/object/public/videos/{base}.webm"
        if not upload_bytes(mp4s[0].read_bytes(), f"{base}.mp4", "video/mp4"):
            failed += 1
            continue
        webm_ok = False
        if webms:
            webm_ok = upload_bytes(webms[0].read_bytes(), f"{base}.webm", "video/webm")

        rows = rest(f"products?sku=eq.{ll_sku}&select=sku,media")
        if not rows:
            print(f"{ll_sku}: product missing")
            failed += 1
            continue
        media = rows[0].get("media") or []
        poster = next((m.get("url") for m in media if m.get("type") == "image"), None)
        if any(m.get("type") == "turntable" for m in media):
            done += 1
            continue
        entry = {"type": "turntable", "mp4": mp4_url, "poster": poster}
        if webm_ok:
            entry["webm"] = webm_url
        media.append(entry)
        rest(f"products?sku=eq.{ll_sku}", method="PATCH", body={"media": media})
        done += 1
        print(f"{ll_sku}: film attached ({mp4s[0].name})")

print(f"DONE: attached {done}, failed/skipped {failed}")
