#!/usr/bin/env python3
"""Lady Luxe — ensemble film pipeline.

Stage compose : Sogni (FLUX 3 Image Klein) composes a model wearing the
                ensemble's pieces, using each piece's product still as an
                ordered reference. Lands output/ensembles/<sku>/composite.png.
Stage animate : the approved composite runs through generate_turntable.py
                (the same 360° pipeline as the products), uploads mp4+webm,
                and attaches the film to the bundle's media.

Review gate: composites are for your eyes — nothing animates until you
approve it. Usage:

  python3 ensemble-videos.py --stage compose [--sku LL-ENS-...]
  python3 ensemble-videos.py --stage animate --sku LL-ENS-...
"""
import json, os, subprocess, sys, urllib.request
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
SOGNI_KEY = ENV.get("SOGNI_API_KEY", "")
OUT = ROOT / "output" / "ensembles"
SEED = 42197


def rest(path):
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}",
        headers={"apikey": KEY, "Authorization": "Bearer " + KEY})
    return json.load(urllib.request.urlopen(req, timeout=60))


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "LadyLuxe/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def sogni_env():
    env = dict(os.environ)
    env["SOGNI_API_KEY"] = SOGNI_KEY
    return env


def ensemble_list():
    bundles = rest("bundles?select=id,sku,name,price,live&live=eq.true&order=price.desc")
    items = rest("bundle_items?select=bundle_id,product_id")
    products = rest("products?select=id,sku,name,media&status=eq.live")
    by_id = {p["id"]: p for p in products}
    grouped = {}
    for it in items:
        grouped.setdefault(it["bundle_id"], []).append(it["product_id"])
    out = []
    for b in bundles:
        if b["sku"] == "LL-ENS-PETAL":
            continue  # display-withdrawn
        pieces = [by_id.get(pid) for pid in grouped.get(b["id"], [])]
        pieces = [p for p in pieces if p]
        out.append({"sku": b["sku"], "name": b["name"], "price": b["price"], "pieces": pieces})
    return out


def color_word(names):
    for word in ["Claret", "Black", "White", "Pink", "Red", "Blue", "Navy", "Ivory"]:
        if any(word.lower() in n.lower() for n in names):
            return word.lower()
    return "black"


def garment_slots(pieces):
    """Order the pieces' stills: bra first, then brief, belt, chemise/dress."""
    slots = {"bra": [], "brief": [], "belt": [], "drape": [], "other": []}
    for p in pieces:
        name = (p.get("name") or "").lower()
        url = None
        media = p.get("media") or []
        if isinstance(media, list):
            for m in media:
                if m.get("type") == "image" and m.get("url"):
                    url = m["url"]
                    break
        if not url:
            continue
        if "push" in name or "soft cup" in name or ("bra" in name and "belt" not in name):
            slots["bra"].append(url)
        elif "brief" in name or "panty" in name or "thong" in name or "string" in name:
            slots["brief"].append(url)
        elif "belt" in name or "garter" in name:
            slots["belt"].append(url)
        elif "chemise" in name or "babydoll" in name or "gown" in name or "dress" in name or "slip" in name:
            slots["drape"].append(url)
        else:
            slots["other"].append(url)
    return slots["bra"] + slots["brief"] + slots["belt"] + slots["drape"] + slots["other"]


def compose_prompt(piece_names):
    color = color_word(piece_names)
    refs = []
    order_words = ["first", "second", "third", "fourth", "fifth"]
    kinds = []
    for n in piece_names:
        ln = n.lower()
        if "push" in ln or "soft cup" in ln or ("bra" in ln and "belt" not in ln):
            kinds.append("the balconette bra")
        elif "brief" in ln or "panty" in ln or "thong" in ln or "string" in ln:
            kinds.append("the matching brief")
        elif "belt" in ln or "garter" in ln:
            kinds.append("the suspender belt with its garter straps")
        elif "chemise" in ln or "babydoll" in ln or "gown" in ln or "slip" in ln:
            kinds.append("the sheer chemise")
        elif "stocking" in ln or "hosiery" in ln:
            kinds.append("the stockings")
        else:
            kinds.append("the garment")
    for i, kind in enumerate(kinds):
        refs.append(f"the {order_words[i]} image supplies {kind}")
    garment_list = ", ".join(kinds[:-1]) + (f" and {kinds[-1]}" if len(kinds) > 1 else kinds[0])
    legs = ""
    if "the sheer chemise" not in kinds and "the stockings" not in kinds:
        legs = " The suspender straps rest along her thighs and hang free."
    return (
        "TARGET CANVAS: 3:4\n\n"
        f"An editorial lingerie photograph of a model wearing {len(kinds)} {color} lace garments "
        f"shown in the reference images, worn together as one ensemble. "
        + ". ".join(refs)
        + f". The model stands full-body in a three-quarter pose in a dim boudoir with garnet silk "
        f"drapery and warm candlelight, Vogue lingerie editorial lighting, soft shadows on her skin."
        + legs +
        f" Photorealistic with high detail; the garments keep their exact lace, cut, straps and "
        f"{color} color as shown in the references."
    )


def stage_compose(only_sku=None):
    for e in ensemble_list():
        if only_sku and e["sku"] != only_sku:
            continue
        sku_dir = OUT / e["sku"]
        sku_dir.mkdir(parents=True, exist_ok=True)
        composite = sku_dir / "composite.png"
        state = {"sku": e["sku"], "name": e["name"]}
        (sku_dir / "state.json").write_text(json.dumps(state))
        if composite.is_file():
            print(f"{e['sku']}: composite exists — skipping")
            continue
        refs = garment_slots(e["pieces"])
        if len(refs) < 2:
            print(f"{e['sku']}: not enough piece stills ({len(refs)}) — skipped")
            continue
        ref_dir = sku_dir / "refs"
        ref_dir.mkdir(parents=True, exist_ok=True)
        local_refs = []
        for i, url in enumerate(refs[:8], 1):
            ext = url.rsplit(".", 1)[-1].lower()[:4] or "jpg"
            path = ref_dir / f"ref{i}.{ext}"
            path.write_bytes(fetch(url))
            local_refs.append(str(path))
        piece_names = [(p.get("name") or "") for p in e["pieces"]]
        prompt = compose_prompt(piece_names)
        cmd = ["sogni-agent", "-q", "-Q", "hq",
               "-m", "flux3_image_klein_sd_int8_convrot",
               "-w", "896", "-h", "1216",
               "-o", str(composite)]
        for lr in local_refs:
            cmd += ["-c", lr]
        cmd.append(prompt)
        print(f"{e['sku']}: composing with {len(local_refs)} references…")
        proc = subprocess.run(cmd, env=sogni_env(), capture_output=True, text=True, timeout=900)
        if proc.returncode == 0 and composite.is_file():
            print(f"   composite ready: {composite}")
        else:
            tail = (proc.stderr or proc.stdout or "")[-400:]
            print(f"   COMPOSE FAILED: {tail}")


def stage_animate(sku):
    sku_dir = OUT / sku
    composite = sku_dir / "composite.png"
    if not composite.is_file():
        print("no composite to animate — run --stage compose first")
        return
    print(f"{sku}: animating the approved composite…")
    proc = subprocess.run(
        [sys.executable, str(ROOT / "generate_turntable.py"),
         "--input", str(composite), "--bg-mode", "keep", "--duration", "10",
         "--seed", str(SEED), "--log-format", "json"],
        cwd=str(ROOT), capture_output=True, text=True, timeout=3600)
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "")[-400:]
        print(f"   ANIMATE FAILED: {tail}")
        return
    # the rendered film lands in output/<asset-dir>/ — find the newest mp4
    outs = sorted((ROOT / "output").glob("*/*.mp4"), key=lambda f: f.stat().st_mtime, reverse=True)
    if not outs:
        print("   no mp4 produced")
        return
    mp4 = outs[0]
    webm = mp4.with_suffix(".webm")
    ll_sku = sku if sku.startswith("LL-") else f"LL-{sku}"
    base = ll_sku.lower().lstrip("ll-")
    murl = f"{URL}/storage/v1/object/public/videos/ensembles/{base}.mp4"
    wurl = f"{URL}/storage/v1/object/public/videos/ensembles/{base}.webm"
    purl = f"{URL}/storage/v1/object/public/images/ensembles/{base}.png"
    for src, dest, ctype in [
        (mp4, f"ensembles/{base}.mp4", "video/mp4"),
        (webm if webm.is_file() else None, f"ensembles/{base}.webm", "video/webm") if webm.is_file() else (None, None, None),
        (composite, f"ensembles/{base}.png", "image/png"),
    ]:
        if not src:
            continue
        data = src.read_bytes()
        req = urllib.request.Request(
            f"{URL}/storage/v1/object/{'videos' if 'video' in ctype else 'images'}/{dest}",
            data=data, method="POST",
            headers={"Authorization": "Bearer " + KEY, "apikey": KEY,
                     "Content-Type": ctype, "x-upsert": "true"})
        urllib.request.urlopen(req, timeout=300)
    bundle = rest(f"bundles?select=id,media&sku=eq.{ll_sku}")[0]
    media = [m for m in (bundle.get("media") or []) if m.get("type") == "image"]
    media.append({"type": "turntable", "mp4": murl, "webm": wurl, "poster": purl})
    req = urllib.request.Request(
        f"{URL}/rest/v1/bundles?sku=eq.{ll_sku}", method="PATCH",
        data=json.dumps({"media": media}).encode(),
        headers={"Authorization": "Bearer " + KEY, "apikey": KEY,
                 "Content-Type": "application/json", "Prefer": "return=representation"})
    urllib.request.urlopen(req, timeout=60)
    print(f"   film uploaded + attached — {ll_sku} is in motion")


if __name__ == "__main__":
    args = sys.argv[1:]
    stage = args[args.index("--stage") + 1] if "--stage" in args else "compose"
    sku = args[args.index("--sku") + 1] if "--sku" in args else None
    if stage == "compose":
        stage_compose(sku)
    elif stage == "animate":
        if not sku:
            print("--stage animate needs --sku")
        else:
            stage_animate(sku)
