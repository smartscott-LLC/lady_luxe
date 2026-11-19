#!/usr/bin/env python3
"""Brand inventory — group a brand folder's shots into priced curation sheets.

Usage: python3 brand-inventory.py <brand-folder-name>

Maps local image basenames to AlterEgo catalog parents (exact URL-basename
match, then fuzzy), prices via variant rows in stock.csv, applies the brand
floor, and writes supabase/<brand>-curation.md.
"""
import csv, json, os, re, sys
from pathlib import Path

BRAND_DIR = Path("/home/server/Downloads/catalog")
FEEDS = Path("/tmp/opencode/alterego")

BRANDS = {
    "beauty-night": ("Beauty Night", 45),
    "yesx": ("YesX", 47),
    "gracya": ("Gracya", 70),
    "irall": ("Irall", 60),
    "irall-erotic": ("Irall Erotic", 70),
    "provocative": ("Provocative", 80),
    "soh": ("Shirley of Hollywood", 70),
    "roza": ("Roza", 0),
    "black-secret": ("Black Secret", 0),
}
GBP_TO_USD = 1.27
RETAIL_MARKUP = 2.4


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


def shot_key(stem):
    """Strip shot-number / view suffixes to group multiple shots per product."""
    low = stem.lower()
    for pat in (r"[_-]?web\d*$", r"[-_]?\d*x\d+$", r"[-_]?back$", r"[-_]?front$",
                r"[-_]?side$", r"[-_]?\d*side$", r"[-_]?studio\d*$",
                r"[-_]?closeup\d*$", r"[-_]?detail\d*$", r"[-_]?zw$", r"[-_]?hi$",
                r"[-_]?bwlogo$", r"[-_]?\d+$"):
        low = re.sub(pat, "", low)
    low = low.strip("-_")
    while re.search(r"[-_]\d+$", low):
        low = re.sub(r"[-_]\d+$", "", low)
    return low.strip("-_") or stem.lower()


def main():
    folder = sys.argv[1]
    brand, floor = BRANDS[folder]
    src = BRAND_DIR / folder
    files = sorted(p for p in src.iterdir() if p.is_file())
    print(f"{folder}: {len(files)} files, floor ${floor}")

    # --- catalog: parents + image-basename index ---
    parents, by_url = {}, {}
    with open(FEEDS / "catalog.csv", encoding="utf-8-sig", errors="replace") as fh:
        for row in csv.DictReader(fh):
            if (row.get("Product Type") or "") != "variable":
                continue
            sku = (row.get("SKU") or "").strip()
            if not sku:
                continue
            parents[sku] = {"title": (row.get("Title") or "").strip(),
                            "brand": (row.get("Brand") or "").strip()}
            for url in (row.get("Images") or "").split(","):
                if url.strip():
                    by_url.setdefault(nrm(url.rsplit("/", 1)[-1]), sku)

    # --- variant prices ---
    stock = {}
    with open(FEEDS / "stock.csv", encoding="utf-8-sig", errors="replace") as fh:
        for v in csv.DictReader(fh):
            sku = (v.get("Sku") or "").strip()
            rrp, trade = (v.get("Price(RRP)") or "").strip(), (v.get("Trade Price") or "").strip()
            if sku and (rrp or trade):
                stock[sku] = (rrp, trade)

    def price_for(parent_sku):
        base = re.sub(r"-[Gg]+$", "", parent_sku)
        best = ("", "")
        for vsku, (rrp, trade) in stock.items():
            if vsku.startswith(base) and vsku != parent_sku:
                best = (rrp or best[0], trade or best[1])
                if rrp and trade:
                    break
        return best

    # --- group local files ---
    groups, order = {}, []
    for p in files:
        stem = p.name
        while True:
            s2 = re.sub(r"\.(webp|png|jpe?g)$", "", stem)
            if s2 == stem:
                break
            stem = s2
        key = shot_key(stem)
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(p.name)

    # --- resolve groups via URL index ---
    items = []
    for key in order:
        fl = sorted(groups[key])
        psku = None
        for f in fl:  # exact basename match first
            psku = by_url.get(nrm(f))
            if psku:
                break
        if not psku:
            for f in fl:
                n = nrm(f)
                psku = by_url.get(n)
                if psku:
                    break
        meta = parents.get(psku, {}) if psku else {}
        rrp, trade = price_for(psku) if psku else ("", "")
        items.append({"key": key, "sku": psku or "", "title": meta.get("title", ""),
                      "brand": meta.get("brand", "") or brand,
                      "shots": fl, "rrp": rrp, "trade": trade})

    # --- floor verdicts + sheet ---
    rows, flags, unmatched = [], [], []
    for it in sorted(items, key=lambda x: x["key"]):
        try:
            rrp = float(it["rrp"])
        except ValueError:
            rrp = 0.0
        usd = round(rrp * GBP_TO_USD, 2)
        retail = round(float(it["trade"]) * RETAIL_MARKUP, 2) if it["trade"] else 0
        is_set = bool(re.search(r"(?i)\bset\b", it["title"]))
        if not rrp:
            verdict = "NO PRICE"
            unmatched.append(it)
        elif is_set:
            verdict = "set-exempt"
        elif floor and usd < floor:
            verdict = f"BELOW ${floor}"
            flags.append(rows[-1])
        else:
            verdict = "ok"
        rows.append({**it, "rrp_f": rrp, "usd": usd, "retail": retail, "verdict": verdict})

    out = [
        f"# {brand.title()} — curation sheet",
        f"_{len(rows)} items · {sum(len(r['shots']) for r in rows)} shots · "
        f"floor ${floor} · retail = trade × {RETAIL_MARKUP} · ~USD at {GBP_TO_USD}_",
        "",
        f"**Verdicts:** ok {sum(1 for r in rows if r['verdict']=='ok')} · "
        f"set-exempt {sum(1 for r in rows if r['verdict']=='set-exempt')} · "
        f"below floor {sum(1 for r in rows if r['verdict'].startswith('BELOW'))} · "
        f"unpriced {sum(1 for r in rows if r['verdict']=='NO PRICE')}",
        "",
        "| ✓ | Item | SKU | Shots | RRP £ | Trade £ | Retail $ | Verdict |",
        "|---|------|-----|-------|-------|---------|----------|---------|",
    ]
    for r in rows:
        nm = re.sub(rf"^{re.escape(brand)}\s*", "", r["title"], flags=re.I) or r["key"]
        lines = [
            "| [ ] | {} | `{}` | {} | {} | {} | {} | {} |".format(
                nm[:44], r["sku"] or r["key"], len(r["shots"]),
                r["rrp"] or "—", r["trade"] or "—",
                r["retail"] or "—", r["verdict"]),
        ]
        out.extend(lines)

    sheet = Path(f"supabase/{folder}-curation.md")
    sheet.write_text("\n".join(out) + "\n")
    print(f"  → {sheet}: {len(rows)} items, {len(unmatched)} unpriced, "
          f"{len(flags)} below floor")
    for f in flags[:8]:
        print(f"    below: {f['key'][:34]} {f['rrp']}£ ≈${f['usd']}")

    json.dump(rows, open(f"supabase/{folder}-inventory.json", "w"), indent=1)


if __name__ == "__main__":
    main()
