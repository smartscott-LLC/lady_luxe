#!/usr/bin/env python3
"""Lady Luxe — insert launch catalog (products + bundles) into Supabase."""
import json, os, sys
from urllib import request

env = {}
for line in open(os.path.join(os.path.dirname(__file__), "..", ".env")):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()

URL, KEY = env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"]
data = json.load(open(os.path.join(os.path.dirname(__file__), "launch-catalog.json")))

def rest(method, path, payload=None, prefer=None):
    req = request.Request(
        f"{URL}/rest/v1/{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        method=method,
        headers={
            "apikey": KEY,
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
            **({"Prefer": prefer} if prefer else {}),
        },
    )
    try:
        with request.urlopen(req) as r:
            body = r.read().decode()
            return r.status, json.loads(body) if body else []
    except Exception as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return 0, str(e)

# 1) products
prod_rows = []
for p in data["products"]:
    prod_rows.append({
        "sku": p["sku"], "name": p["name"], "tag": p["tag"],
        "supplier": p["supplier"], "supplier_sku": p["supplier_sku"],
        "wholesale_cost": p["wholesale_cost"], "duty_rate": p["duty_rate"],
        "status": "live",
        "media": json.dumps([{"type": "image", "url": p["image"], "alt": p["name"]}]),
        "story": f'{p["desc"]} {p["material"] and "Material: " + p["material"]}'.strip(),
    })

code, resp = rest("POST", "products?on_conflict=sku", prod_rows, prefer="resolution=merge-duplicates,return=representation")
if code not in (200, 201):
    print("products insert FAILED:", code, resp); sys.exit(1)
sku_to_id = {row["supplier_sku"]: row["id"] for row in resp}
print(f"products: {len(resp)} inserted/updated")

# 2) bundles
bundle_rows = []
for b in data["bundles"]:
    bundle_rows.append({
        "sku": b["sku"], "name": b["name"],
        "set_factor": b["set_factor"], "price": b["price"],
        "live": True,
        "media": json.dumps([{"type": "image", "url": b["image"], "alt": b["name"]}]),
        "story": f'Composed by the house in {b["color"].lower()}. Trade of record on file.',
    })

code, resp = rest("POST", "bundles?on_conflict=sku", bundle_rows, prefer="resolution=merge-duplicates,return=representation")
if code not in (200, 201):
    print("bundles insert FAILED:", code, resp); sys.exit(1)
bundle_map = {row["sku"]: row["id"] for row in resp}
print(f"bundles: {len(resp)} inserted/updated")

# 3) link bundles to collection 'midnight'
code, resp = rest("PATCH", "collections?slug=eq.midnight", {"live": True})
print("collection 'midnight':", code)

# 4) bundle_items
items = []
for b in data["bundles"]:
    bid = bundle_map[b["sku"]]
    for psku in b["pieces"]:
        items.append({"bundle_id": bid, "product_id": sku_to_id[psku]})
code, resp = rest("POST", "bundle_items?on_conflict=bundle_id,product_id", items, prefer="resolution=merge-duplicates")
print("bundle_items:", code, len(items), "links")
if code not in (200, 201, 204):
    print(resp); sys.exit(1)

print("\nLaunch catalog is LIVE in Supabase.")
