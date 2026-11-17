# Lady Luxe

High-end lingerie boutique — couture storefront, real wholesale products.
Dropship-first (no warehouse), curated ensembles as the house line, and
AI-generated **360° turntable films** as the signature product experience.

**Store:** ladyluxeclub.com · ladyluxe.club (DNS pending)
**Stack:** Next.js 16 (App Router) + Supabase + Square + Sogni AI · AlterEgo wholesale

> Internal project memory lives in [`docs/PROJECT-CONTEXT.md`](docs/PROJECT-CONTEXT.md) —
> read that first if you are an agent or a new contributor resuming work.

## Repository layout

| Path | Purpose |
|---|---|
| `web/` | The storefront (Next.js 16, App Router, cacheComponents, React Compiler). Vercel Root Directory = `web` |
| `brand/` | Source of truth for the design kit: CSS/JS, fonts, videos, stills, emblem |
| `supabase/` | Schema, RLS, intake pipeline, curation sheets, inventory JSON |
| `generate_turntable.py` | Photo → seamless 360° pose-hold turntable video (Sogni AI) |
| `tests/` | Pytest suite for the turntable pipeline (50 cases) |
| `turntable_gui.py` / `turntable_gui.html` | Local Turntable Studio web GUI + inbox watcher |
| `.env.example` | Environment template (never commit the real `.env`) |

## Quick start

### Storefront

```bash
cd web && npm install && npm run dev   # http://localhost:3000
```

### Turntable pipeline (single image)

```bash
pip install -r requirements.txt
cp .env.example .env   # add SOGNI_API_KEY
python3 generate_turntable.py --input photo.jpg --bg-mode keep --duration 10
# outputs: output/<asset>/<asset>.mp4|.webm + manifest.json
```

Useful flags: `--bg-mode generate` (outpaint a luxury studio set),
`--dry-run` (plan + quote only), `--resume`, `--max-cost 5`, `--lora slug:strength`.

Tests:

```bash
python3 -m pytest tests/ -q
```

### Turntable Studio (local GUI)

```bash
python3 turntable_gui.py   # http://localhost:3002
```

Drag & drop photos, watch progress live, download mp4/webm/manifest.
Dropping files into `~/turntable-inbox/` processes them automatically with the
saved defaults.

## Conventions

- Ports: **3000** storefront dev · **3002** Turntable Studio (localhost only)
- The real `.env` is never committed; `.env.example` documents every var
- Product media is mirrored into Supabase Storage — no third-party hotlinking
- Keep `web/public/js/lady-luxe.js` byte-identical to `brand/lady-luxe.js`
- Docs stay current: update `docs/PROJECT-CONTEXT.md` and `CHANGELOG.md` at the
  end of any session that changes state
