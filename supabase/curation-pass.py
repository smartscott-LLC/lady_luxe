#!/usr/bin/env python3
"""Lady Luxe — curation pass over the AlterEgo full feed.

Filters the supplier's full catalog XML by house floors and the house taste
filter (no crotchless/open-cut pieces, no toys or fetish gear), and emits the
candidate list for import: supabase/curation-pass-1.json.
"""
import xml.etree.ElementTree as ET
import json, re, collections
from pathlib import Path

FEED = "/tmp/opencode/alterego-full.xml"
OUT = Path(__file__).parent / "curation-pass-1.json"

FLOORS = {"Shirley of Hollywood": 54, "Provocative": 47, "Me Seduce": 55, "Confidante": 50}
COMPONENT_HOUSES = ["Black Secret", "Gabriella", "Ballerina", "Wolbar"]

BAD = re.compile(
    r"crotchless|open[- ]?crotch|vibrat|dildo|butt[- ]?plug|anal|bondage|bdsm|"
    r"fetish|gag\b|flogger|whip\b|handcuff|nipple|strap[- ]?on|masturbat|penis|"
    r"sex toy|pump\b|clamp",
    re.I,
)

tree = ET.parse(FEED)
seen = {}
for post in tree.getroot().iter("post"):
    sku = (post.findtext("SKU") or "").strip()
    if not sku or sku in seen:
        continue
    brand = (post.findtext("Brand") or "").strip()
    title = (post.findtext("Title") or "").strip()
    content = (post.findtext("Content") or "").strip()
    cats = (post.findtext("Productcategories") or "").strip()
    try:
        trade = float((post.findtext("Tradeprice") or "").strip())
    except ValueError:
        trade = None
    try:
        rrp = float((post.findtext("PriceRRP") or "").strip())
    except ValueError:
        rrp = None
    images = [i.strip() for i in ((post.findtext("Images") or "").split(",")) if i.strip()]
    blob = " ".join([title, content, cats])
    seen[sku] = {
        "brand": brand, "title": title, "trade": trade, "rrp": rrp,
        "sizes": (post.findtext("ProductSize") or "").strip(),
        "images": images, "cats": cats, "bad": bool(BAD.search(blob)),
    }

curated = collections.defaultdict(list)
components = collections.defaultdict(list)
excluded = collections.defaultdict(int)
for sku, r in seen.items():
    house = r["brand"]
    if r["bad"]:
        excluded[house] += 1
        continue
    floor = FLOORS.get(house)
    if floor:
        if r["trade"] and r["trade"] * 2.4 >= floor:
            curated[house].append({
                "sku": sku, "name": r["title"], "trade": r["trade"],
                "retail": round(r["trade"] * 2.4, 2), "rrp": r["rrp"],
                "sizes": r["sizes"], "images": r["images"][:3],
                "featured70": r["trade"] * 2.4 >= 70,
            })
        else:
            excluded[house] += 1
    elif house in COMPONENT_HOUSES:
        components[house].append({
            "sku": sku, "name": r["title"], "trade": r["trade"],
            "retail": round((r["trade"] or 0) * 2.4, 2),
            "sizes": r["sizes"], "images": r["images"][:2],
        })
    else:
        excluded[house] += 1

payload = {
    "floors": FLOORS,
    "curated": {h: sorted(v, key=lambda x: -x["retail"]) for h, v in curated.items()},
    "components": {h: sorted(v, key=lambda x: -x["retail"]) for h, v in components.items()},
    "excluded_taste_or_floor": dict(excluded),
}
OUT.write_text(json.dumps(payload, indent=1))
print("written:", OUT)
for h, v in sorted(curated.items()):
    print(f"{h:24s} {len(v):4d} pieces  (>= $70: {sum(1 for x in v if x['featured70'])})")
print("components:", {h: len(v) for h, v in components.items()})
