#!/usr/bin/env python3
"""Batch turntable runner for a brand folder.

Picks the top N products by trade price, resolves each product's featured
image (catalog's first image, preferring portrait full-body geometry),
renders turntables sequentially, and writes a summary JSON.

Usage: python3 turntable-batch.py <brand-folder> [count] [seed]
Resume-safe: a product whose output manifest already exists is skipped.
"""
import hashlib, json, math, re, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRAND_DIR = Path("/home/server/Downloads/catalog")
FEEDS = Path("/tmp/opencode/alterego")
OUT = ROOT / "output"
GBP_TO_USD = 1.27

def nrm(s):
    s = s.lower()
    while True:
        s2 = re.sub(r"\.(webp|png|jpe?g)$", "", s)
        if s2 == s:
            break
        s = s2
    s = re.sub(r"-\d{1,4}x\d{1,4}$", "", s)
    s = re.sub(r"(_?web\d+)$", "", s)
    return s.strip("-_")

def asset_dir_for(source: Path) -> Path:
    stem = source.stem  # matches generate_turntable.py normalize_image naming
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", stem).strip("_") or "asset"
    digest = hashlib.sha256(str(source.resolve()).encode()).hexdigest()[:8]
    return OUT / f"{safe}_{digest}"

def main():
    brand = sys.argv[1]
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 20
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else 42197

    rows = json.loads((ROOT / f"supabase/{brand}-inventory.json").read_text())
    eligible = [r for r in rows if r["verdict"] in ("ok", "set-exempt") and r["trade"]]

    # group by SKU
    grouped = {}
    for r in eligible:
        sku = r["sku"] or r["key"]
        g = grouped.setdefault(sku, {"title": r["title"], "trade": float(r["trade"]), "shots": []})
        for s in r["shots"]:
            if s not in g["shots"]:
                g["shots"].append(s)

    # catalog: parent SKU -> first (featured) image basename
    featured = {}
    with open(FEEDS / "catalog.csv", encoding="utf-8-sig", errors="replace") as fh:
        for row in csv_rows(fh):
            sku = (row.get("SKU") or "").strip()
            if not sku:
                continue
            images = (row.get("Images") or "").split(",")
            if images and images[0].strip():
                featured[sku] = nrm(images[0].rsplit("/", 1)[-1])

    def featured_file(sku, shots):
        base = re.sub(r"-[Gg]+$", "", sku)
        want = featured.get(sku) or featured.get(base)
        if want:
            for s in shots:
                if nrm(s) == want:
                    return s
        return shots[0]

    queue = sorted(grouped.items(), key=lambda kv: kv[1]["trade"], reverse=True)

    # resume-aware: drop products whose film already exists, then take N new
    def out_dir_for(sku, g):
        pick = featured_file(sku, g["shots"]) if featured_file else g["shots"][0]
        return asset_dir_for(src_dir / pick)

    src_dir = BRAND_DIR / brand
    pending = []
    for sku, g in queue:
        try:
            out = out_dir_for(sku, g)
        except Exception:
            out = None
        if out and not (out / "manifest.json").is_file():
            pending.append((sku, g))
    queue = pending[:count]

    results = []
    for i, (sku, g) in enumerate(queue, 1):
        ll_sku = f"LL-{sku}" if not sku.startswith("LL-") else sku
        src_dir = BRAND_DIR / brand
        shots = g["shots"]

        # prefer portrait full-body: aspect (w/h) between .45 and .8, height >= 700
        def aspect(name):
            try:
                from PIL import Image
                with Image.open(src_dir / name) as im:
                    return im.width / im.height
            except Exception:
                return 1.0

        pick = featured_file(sku, shots)
        if not (0.45 <= aspect(pick) <= 0.8):
            for s in shots:
                if 0.45 <= aspect(s) <= 0.8:
                    pick = s
                    break

        input_path = src_dir / pick
        out_dir = asset_dir_for(input_path)
        manifest = out_dir / "manifest.json"
        if manifest.is_file():
            results.append({"sku": ll_sku, "status": "already-done", "input": pick, "dir": str(out_dir)})
            print(f"[{i}/{len(queue)}] {ll_sku}: already done ({pick})", flush=True)
            continue

        print(f"[{i}/{len(queue)}] {ll_sku}: rendering {pick} (trade £{g['trade']})", flush=True)
        t0 = time.time()
        proc = subprocess.run(
            [sys.executable, str(ROOT / "generate_turntable.py"),
             "--input", str(input_path), "--bg-mode", "keep", "--duration", "10",
             "--seed", str(seed), "--log-format", "json"],
            cwd=str(ROOT), capture_output=True, text=True, timeout=2400)
        dt = round((time.time() - t0) / 60, 1)
        if proc.returncode == 0 and manifest.is_file():
            m = json.loads(manifest.read_text())
            seam = m.get("loop", {}).get("seam_rms")
            spark = (m.get("cost_estimate") or {}).get("total_spark", 0)
            results.append({"sku": ll_sku, "status": "done", "input": pick,
                            "dir": str(out_dir), "seam_rms": seam, "spark": spark, "minutes": dt})
            print(f"    done in {dt}min — seam {seam}, {round(spark, 1)} SPARK", flush=True)
        else:
            tail = (proc.stderr or proc.stdout or "")[-300:]
            results.append({"sku": ll_sku, "status": "failed", "input": pick, "error": tail})
            print(f"    FAILED after {dt}min", flush=True)

    summary = ROOT / f"supabase/{brand}-turntables.json"
    summary.write_text(json.dumps(results, indent=1))
    done = sum(1 for r in results if r["status"] in ("done", "already-done"))
    print(f"BATCH DONE: {done}/{len(results)} rendered", flush=True)


def csv_rows(fh):
    import csv
    yield from csv.DictReader(fh)


if __name__ == "__main__":
    main()
