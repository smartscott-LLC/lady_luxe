# Lady Luxe — Master Project Context

> **Purpose:** the authoritative memory for this project. If a session's context
> is compressed or restarted, this file plus `CHANGELOG.md` plus `git log` is the
> ground truth. Keep it current — update it whenever state materially changes.

---

## What this project is

**Lady Luxe** (ladyluxeclub.com / ladyluxe.club) — a high-end lingerie boutique:
a couture storefront wrapper around real wholesale products. Business model:
dropship-first, no warehouse; curated ensembles are the "house line". Key
differentiator on the storefront: **hover-to-play 360° turntable films** of
products, generated from static photos via Sogni AI.

**Owner:** S. Slater (s.slater@smartscott.com; Sogni account **Prophet1128**,
Sogni Unlimited plan). Revenue model: markup ~2.4× on wholesale trade price;
ensembles additionally ×0.94 set_factor. **Feed prices are GBP (£)**; convert
at ~1.27 for USD floor checks.

## Brand rules (owner-set, non-negotiable)

- Retail RRP floors (USD): Provocative >$80 · Irall >$60 · Irall Erotic >$70 ·
  Beauty Night >$70 · Gracya >$70 · SOH >$70 · **YesX $47 (confirmed Nov 16)**
- Ensembles/sets are **exempt** from floors
- Duties collected at checkout; shipping line is honest "Shipping & Handling"
  (never a fake "Quality Assurance Fee"); "duties prepaid" badge on products
- No false claims (no fake Paris atelier, no "hand-finished")
- Fonts: Monsieur La Doulaise (script gold headings), Felipa (accents),
  Montserrat (body). Neumorphism design kit in `brand/`

## Architecture

```
Static web (Next.js 16 App Router, Vercel)  ──reads──▶  Supabase (Postgres + Storage)
        │                                                     ▲
        │ hover engine: brand/lady-luxe.js                    │
        ▼                                                     │
Turntable Studio (localhost:3002) ──spawns──▶ generate_turntable.py ──▶ Sogni AI
```

- **Supabase project ref:** `mszrciomhatnmjsqfdij`. Schema: 11 tables + RLS.
  Products/ensembles carry real economics (trade, RRP, markup). Images bucket
  holds mirrored product media (22 images mirrored at last count).
- **Cloudflare/ivy contact form (LIVE Nov 21):** `formserver.ladyluxeclub.com`
  → Cloudflare tunnel (systemd cloudflared on ivy) → traefik :80 → ingress
  `forms` host rule → `forms/formsapp` (smartforms engine, port 5000) +
  `forms/formspg` Postgres. Form file delivered as ConfigMap
  `lady-luxe-form` mounted at `/app/lady_luxe.html` (survives pod restarts;
  the image `clubcheeky/smartforms:latest` only bakes cheeky/index).
  Engine discovers `lady_luxe → [client_type, name, contact,
  preferred_contact, service, vision]`. Smoke-test POST returned
  `{"success":true}`. To update the form: edit
  `smartforms_server/form-backend/lady_luxe.html`, re-create the configmap,
  restart the deployment.
- **Form-server hardening (Nov 21) — answer to owner's daily fake emails:**
  the engine emailed the owner on EVERY submission with raw HTML from the
  form, and offered a "customer receipt" to an attacker-controlled address
  (open relay). Bots had been auto-submitting for weeks = the daily fake
  emails. Fixed in server.js (delivered via the same ConfigMap): root `/` no
  longer lists forms, 404s no longer leak form IDs, per-IP rate limit
  5/10min using CF-Connecting-IP (real visitor IPs through the tunnel),
  honeypot field silently drops bots, all email interpolation HTML-escaped,
  customer receipt removed (relay vector). All verified live. **server.js +
  lady_luxe.html now deploy via the `lady-luxe-form` ConfigMap**, not the
  image.
- **Club Cheeky on hold:** `club/club-*` pods 0/1 Running (25d) — parked.
- **Member sessions:** Supabase Auth free signup, `members.tier = 'club'`
  (schema CHECK allows only club/posh_circle), optional marketing_consent.

- **AlterEgo** is the wholesale supplier: feeds at `ALTEREGO_FULL_CATALOG_URL`
  (full catalog CSV, **frozen at 2026-09-03**) and `ALTEREGO_STOCK_URL` (stock
  + prices, live; variant rows keyed `BRAND+SKU+SIZE`, prices in £).
  New lines since Sept are portal-only; per-brand portal curation is the
  standing system for new arrivals.

## Top-level file map

| Path | What it is |
|---|---|
| `docs/sogni-api-endpoints.md` | Full Sogni REST API surface (86 endpoints, saved from docs.sogni.ai — generation, project status, media utils, personal LoRAs, chat, balances, analytics) |
| `docs/PROJECT-CONTEXT.md` | This file — the master memory |
|---|---|
| `web/` | Next.js 16 storefront (Vercel Root Directory = `web`). Single page so far: hero video, marquee, Maison, newsletter |
| `web/components/` | `HeroVideo`, `LuxeMarquee` (hydration sentinel), `LuxeRuntime` (owns engine script), `useLuxeBind` |
| `web/public/js/lady-luxe.js` | Hover-video/marquee engine. **Keep in sync with `brand/lady-luxe.js`** (brand/ is source of truth) |
| `generate_turntable.py` | Photo → 360° turntable pipeline (see below). 50 pytest cases in `tests/test_pipeline.py` |
| `turntable_gui.py` + `turntable_gui.html` | Turntable Studio: local web GUI on `127.0.0.1:3002` + inbox watcher (`~/turntable-inbox/`) |
| `supabase/` | Schema SQL, intake pipeline (`intake-new-arrivals.py`, `upload-intake.mjs`, `intake-template.md`), frontline inventory + curation sheet |
| `brand/` | Source of truth: kit CSS/JS, fonts, videos, stills, emblem |
| `site/index.html` | Salvaged original static page (reference) |
| `output/`, `build/`, `gui_data/` | Turntable outputs / working dirs / GUI state (gitignored) |
| `.env` | Secrets: `SUPABASE_URL`+keys, `SQUARE_*`, `ALTEREGO_*` URLs, `SOGNI_API_KEY` (key format `sogni_…`, 53 chars) |

## Turntable pipeline (generate_turntable.py) — what to know

- **Stages:** normalize (Pillow, exact canvas 768×1024) → [Stage A: background
  conditioning if `--bg-mode generate`] → Stage B: three quarter-turn keyframes
  (90°/180°/270° via Krea identity edit) → Stage C: video render → Stage D:
  ffmpeg packaging (seam blend, mp4+webm+manifest.json).
- **Model (owner-specified):** `minimax-h3-fastvideo-int8_flf2v_turbo`
  (FastH3 Turbo, 4-step). First/last frame = master 0° photo. LoRAs:
  `h3-mystic-xxx-v5:0.5` + `h3-vbvr-video-reasoning:0.8` (VBVR wants literal,
  stepwise prompts — the prompt is structured that way).
- **H3 contract:** frames must be `124 + n·17` (min 124, max 362) at 24 fps;
  `--duration 10` → 243 frames. Keyframe indices live in `1..N-2` at quarter
  points. Keyframe entries are camelCase `{"image", "frameIndex"}`.
- **CRITICAL:** every create call sends `disableNSFWFilter=True`. Without it
  the account-level Sensitive Content Filter silently withholds results of
  lingerie content (`job.is_nsfw`, server field `triggeredNSFWFilter`) and you
  get "result image not found". Do not remove this.
- **Cost:** ~$0.29 / ~58 SPARK per 10s asset (keep-mode; generate-mode adds
  ~$0.02). Quote comes free via estimate helpers before any spend.
- **manifest.json** carries pose timestamps + hold windows + seam RMS — the
  storefront hover player consumes this.
- Tests: `python3 -m pytest tests/test_pipeline.py` (50 passing).

## Turntable Studio GUI

- Start: `python3 turntable_gui.py` → `http://localhost:3002` (binds 127.0.0.1)
- Upload panel (bg-mode/duration/LoRA override + Dry-run button), live queue
  (tails pipeline JSON events), results gallery (hover-play cards, downloads,
  pose chips, seam badge). Saved defaults in `gui_data/settings.json`.
- Inbox watcher: files dropped in `~/turntable-inbox/` auto-process with saved
  defaults, then move to `inbox/processed/`.
- Port etiquette: **3000 = storefront dev server, 3002 = Studio.**

## Hard-won gotchas (do not relearn these)

1. **Sogni JSON logging must not go through rich** — rich wraps lines at 80
   columns when piped, splitting JSON records. JSON mode writes raw stdout
   lines. Any new pipeline output must stay line-delimited.
2. **Never `pkill -f <script>` from a compound shell command** — the pattern
   matches the invoking shell and kills it. Use `fuser -k <port>/tcp`.
3. **Occluded/background browser tabs never paint** → `requestAnimationFrame`
   never fires → React streamed-boundary reveal freezes silently. Test-harness
   artifact, not an app bug. Force with `window.$RV(window.$RB)`.
4. Hydration architecture: engine stamps only when cloning; marquee marked
   `data-ll-sentinel`; binds only after `<html data-ll-armed>` set by
   `LuxeMarquee`. Don't reintroduce timer retries.
5. PostgREST schema cache lags seconds after DDL — a 401 "violates RLS" right
   after a migration is usually cache lag; retest before debugging.
6. AlterEgo CSV quirks: parent SKU rows carry no prices; real Trade/RRP live on
   **variant rows** in stock.csv keyed by brand-prefixed SKU
   (`BEAUTYNIGHTBN6596S/M`). Brand match is case-insensitive.
7. Sogni API keys are **model-permission scoped**. A denied model fails at job
   level with "This API key does not allow this model" — check that before
   debugging code. Probing denials is free (rejection is pre-render).
8. ffmpeg on this box: apt is broken (libavutil conflict) — use the static
   build already installed at `/usr/local/bin/{ffmpeg,ffprobe}` (7.0.2).
9. Sogni balance endpoint's `net` fields are period ledgers (can read 0); the
   subscription SPARK pool is separate. `sogni-agent doctor --json` shows it.
10. **Subject duplication in turntables:** the video model can duplicate the
    model (two copies side-by-side). **Root cause found Nov 19:** the 180°
    prompt's "head turned slightly over her shoulder" clause was ambiguous;
    the edit model rendered both interpretations side by side. Fixed
    permanently in `generate_turntable.py` (v3, commit 9ab763a): all angle
    prompts say "exactly one woman in frame, standing alone", the 180° prompt
    drops the over-shoulder clause (face partially visible in profile), and
    the negative prompt gained the duplication family. Diagnose by inspecting
    `build/<asset>/keyframes/` — if the keyframe is duplicated, the video
    faithfully replicates it. A seed change does NOT fix it.

## Product/backlog state

- **Turntable production (Nov 19):** FOUR films delivered, verified, and live
  on the storefront with product pages — Sasha Set BN6715 (`/product/LL-BEAUTYNIGHTBN6715-G`),
  YX880 Leopard Robe (`LL-YESYX880LEOPARD-G`), YX882 Mesh Bra Set
  (`LL-YESYX882BLACK-G`), BN6673 Peignoir Burgundy (`LL-BEAUTYNIGHTBN6673-G`).
  All mirrored to Supabase (`products/` + `turntables/` in the images bucket)
  and inserted as live product rows. BN6673 took 3 renders (duplication root
  cause fixed permanently in prompts — see gotcha 10).
- **SPARK accounting (owner-corrected Nov 19):** the plan is generous — today
  ~290 SPARK for 20 renders used only 7% of the daily allowance (resets every
  24h) and 24% of the monthly. The 925 portal number is the instantaneous
  pool, NOT a budget ceiling. Mint freely.
- **Frontline batch** (from `/home/server/Downloads/catalog/frontline`, 167
  shots): 59 items fully identified + priced — see
  `supabase/frontline-curation.md` (keep/kill sheet) and
  `supabase/frontline-inventory.json`. 13 items flagged below floor. Owner has
  not yet marked keepers.
- YesX staged picks: YX895/YX896/YX882 now have photos in the frontline batch;
  YX735Q, YX807 still lack photos.
- **Launch-critical remaining:** Square checkout Edge Function (cart → pay →
  orders → manual forward to AlterEgo); point ladyluxeclub.com +
  ladyluxe.club DNS at Vercel; confirm Vercel deploy green; newsletter
  re-verify on live deploy.
- **Product pages + hover-film wiring** (the active build): first product
  route, turntable attached to product record, manifest-driven pose chips,
  hover-play/pause via the brand engine.

## Decision log (append-only)

- 2026-11-11: AlterEgo approved as primary supplier ($13/mo); Matterhorn
  rejected; Allure dropship pending for Premium Posh.
- 2026-11-13: Ensembles modeled as `bundles` (set_factor 0.94, markup 2.4×).
- 2026-11-14: Video model family locked to MiniMax H3 first/last-frame; owner
  specified FastH3 + Mystic X v5 + VBVR LoRAs (Nov 16 wiring).
- 2026-11-14: Turntable Studio = local web GUI + inbox watcher (option A).
- 2026-11-16: Feed currency confirmed **GBP**; YesX floor confirmed **$47**.
- 2026-11-16: `disableNSFWFilter=True` on all generations (filter was
  withholding lingerie results).
- 2026-11-19: **No Plasmic/Framer runtime for the storefront** — owner tried
  Plasmic (first time), decided visual builders don't fit a custom luxury
  store; Plasmic stripped from the app (project kept in-owner as reference).
  Design direction from the owner's mockups lives on: Holiday Collection
  hero, featured 5-image carousel, brand-logo marquee, LL Club header,
  Lifestyle/Support/Company footer.
- 2026-11-19: **No fittings — ecommerce only.** "Book a Fitting" replaced by
  "Concierge" (smartform link); contact form offers Client Care.
- 2026-11-20: Social commercial delivered by owner (FastH3 output
  1344×768/243 frames — our pipeline); branded platform derivatives cut.
- 2026-11-23: **Brand commercial v2 finalized by owner** (`/home/server/Videos/comm2_good.mp4`,
  supersedes the Nov 20 cut): 768×768 square, 24fps, 15.1s, AAC stereo,
  assembled in kdenlive with ElevenLabs VO. Structure: gold Lady Luxe
  logo open on plum → white lace / chandelier bedroom → black lace
  bustier → red corset finale. Owner verdict: "clearly the best" —
  smoothest voice timing and graphics; this is the canonical ad asset.
- 2026-11-23: **Platform cuts of v2** (`Videos/social/lady_luxe_comm2_{1x1,4x5,9x16}.mp4`):
  1080-wide, blur-fill extension for verticals (full composition preserved),
  Nov 20 gold wordmark+URL overlays, h264 yuv420p faststart CRF 18.
  **Audio is FINAL in the master** — owner auditioned ~100 ElevenLabs voices
  and selected this one (distinguished, breathy-not-overly, tempo fits);
  no kdenlive VO swap planned. Cuts ship with master audio.
- 2026-11-21: **Final brand floors (owner):** Beauty Night $45 · YesX $45 ·
  Gracya $49 · Irall $45 · Irall Erotic $43 · Provocative $47 · SOH $54 ·
  Roza $35. Frontline batch fully decidable; Irall/Irall Erotic clean.
- 2026-11-21: **Two-tier merchandising:** retail < $65 → "Private Reserve"
  (own area, brand-agnostic, not featured anywhere); retail ≥ $65 → featured
  surfaces. Implemented as a generated column (`retail_price` =
  wholesale_cost × 2.4) on products; homepage carousel and brand grids
  filter ≥ 65; /private-reserve lists the rest. Naming: **"Private Reserve"
  is permanent** (owner, Nov 21) — not a placeholder, no future rename.
- 2026-11-21: **Advisor cleanup migration** (`advisor_cleanup_rls_functions`,
  `fk_indexes_fn_hardening`, `fk_index_finish`): subscribers read-own policy
  uses scalar `(select auth.email())`, orders/members policies consolidated +
  optimized, public INSERT policies on orders/order_items/code_redemptions
  dropped (checkout Edge Function writes via service role), handle_new_member
  + rls_auto_enable locked (search_path '', EXECUTE revoked from
  anon/authenticated), citext moved to `extensions` schema, 9 FK indexes
  added, 2 duplicate indexes dropped. Remaining advisor items are by-design
  INFOs only.
  (own area, brand-agnostic, not featured anywhere); retail ≥ $65 → featured
  surfaces. Implemented as a generated column (`retail_price` =
  wholesale_cost × 2.4) on products; homepage carousel and brand grids
  filter ≥ 65; /private-reserve lists the rest. Naming: **"Private Reserve"
  is permanent** (owner, Nov 21) — not a placeholder, no future rename.

- 2026-11-23: **Brand imagery integrated + carousel cooldown** (`ed429c8`).
  Owner's image drop (`Downloads/catalog/images_4_site/`) converted to webp
  (PIL, q88) into `web/public/brand/imagery/` — 14 unique assets (the
  `logo-black-corset-line (1).png` duplicate skipped). Placements: atelier
  still-life full-bleed band between the collection marquee and Maison
  (homepage), discipline line-art medallions on both maison card grids,
  corsetry banner on /maison, Club crest on /club (join + dashboard),
  `seal-no001` archive note on ensemble detail, ivory crest in the footer,
  cover art on all 4 journal posts (frontmatter `cover:` → blog list, post
  page, homepage teaser). **Reserved, not yet placed**: `seal-stamp`,
  `portrait-archived`, `square-ensemble`. Journal frontmatter was carrying
  `**Title:**` junk in category/metaDescription — cleaned; blog.module.css
  had a duplicate `.title` class that crushed the page h1 (renamed to
  `.cardTitle`). FeaturedCarousel: hover is stage-level (per-card unhover
  no longer advances — that was the warp-speed bug), and unhovering starts
  a **2s cooldown** before the 3s cadence resumes (owner, Nov 23). All
  timing verified via real Chromium pointer events: cadence advances while
  unhovered, freezes with pointer inside the stage, resumes ~5s after
  leave. Carousel pausing during dev-server background-tab tests is
  throttled timers, not a bug.

- 2026-11-23 (later): **Drawer navigation + campaign imagery + prod fixes.**
  SiteHeader restructured: Intimates / Brands / The LL Club are trigger
  buttons opening a slide-out drawer (backdrop, Esc/X close, scroll lock);
  Maison, Journal, Contact, Bag stay links; nav is 7 items + Concierge.
  Drawer content: Intimates → Featured / Private Reserve / Custom
  Combinations / The Autumn Edit lookbook (→ Concierge form); Brands →
  9 houses; The Circle → Join free / Log in / Your membership (the Login +
  account access entry point). Places reserved imagery: square-ensemble,
  seal-stamp, portrait-archived. Fixes along the way: header
  CLIENT_HOOK_DYNAMIC prerender failure (Suspense fallback pattern),
  reveal-on-scroll race on cold connections (LuxeStreamBind per island +
  engine MutationObserver + lady-luxe.js ?v=2), luxe-all.css bumped to
  **v8** (cache-bust each brand edit — stale v4 read as "no hamburger"),
  kit mobile-menu block widened to 1199.98px (navbar-expand-xl deadzone),
  navbar z-index 1050 (headroom will-change trapped it under the hero),
  carousel stage clipped (phantom 1714px horizontal scroll), desktop nav
  padding 0.5rem (row was exactly full — brand script touched FEATURED).
  TikTok Pixel live (DC2EGKJC77U6OQMIG9SG, base + AddToCart /
  InitiateCheckout / PlaceAnOrder / CompletePayment via web/lib/tiktok.ts).
  Campaign imagery placed: homepage band → campaign-chaise; Maison banner
  → campaign-robe; ensemble archive note → certificate-ensemble (No.
  014/100); Maison gains The House Experience (packaging duo) +
  Correspondence card (stationery). **Still unplaced for marketing:**
  poster-gown, portrait-back-corset, story-robe. Deploys: Vercel
  (smartscott-LLC, auto on push); production = www.ladyluxeclub.com.

- 2026-11-26: **Square webhook receiver live + verified** (`web/app/api/
  square-webhook/route.ts`, commits 7944fc8→ba21b62). Verifies Square's
  HMAC-SHA256 (body + notification URL, SQUARE_WEBHOOK_SIGNATURE_KEY from
  Vercel production env) against four URL forms (both domains ± trailing
  slash). `payment.updated` syncs the order status via `square_payment_id`
  (COMPLETED→paid, FAILED/CANCELED→failed); every other event
  (payout.*, bank_account.*, customer.*, online_checkout.*, refund.*)
  is acknowledged 200 — a receiver never 500s an accepted event, or the
  retry storm loops. ladyluxe.club now also serves the site (owner wired
  Cloudflare+Vercel; it 308-redirects to www.ladyluxeclub.com). The old
  504s were events firing at the bare domain; the 500s were the route's
  unconfigured-key guard firing before the env landed on a deploy.
  Verified end-to-end 2026-11-26 with self-signed Square-format events
  against production: all 200. Subscription event trim to
  `payment.updated` remains an owner dashboard step. Point of Sale API:
  not used (online + drop-ship only); OAuth redirect URL: not needed
  (direct access token).

## AlterEgo drop-ship & fulfilment (supplier facts, Nov 25)

The full AlterEgo feed + stock file live at alterego-lingerie.com/resource/
{full-xml,stock-xml}/DDWdFw9Y7Ozd8OJDsFJJHL3NkudyWe (12.6MB / 2.1MB).
**Drop-shipping is confirmed**: AlterEgo dispatches direct to the customer
in plain discreet boxes with NO AlterEgo reference — and uploads the
seller's own invoice/note into the parcel (uploaded at order time).
Standard orders therefore never route through the owner; only the custom
gift-wrap option (future) is hand-packed.

Key facts: same-day dispatch for orders before 1pm UK Mon–Fri · 40k SKUs
in stock, no minimum order · delivery £5 UK / £11.99 EU / £14.99 RoW ·
Royal Mail (24h/48h tracked, 1st class signed, Special Delivery), DPD
(UK next day, EU), FedEx (Intl Economy/Priority) · tracking email per
dispatch · pay GBP/EUR/USD, PayPal, bank, cards · CSV + XML feeds for
stock/product automation · free use of their images and video media for
the seller's own site · fault rate < 0.001% · contact
customerservices@alterego-lingerie.com, +44 1482 623934, Mon–Fri 9–17 BST.

**Order engine (future)**: the checkout already records everything it
needs — product lines carry the size-encoded supplier SKU (`variant`),
ensemble lines carry the `bundle_id` (pieces derive from bundle_items).
The engine's job: take paid orders → emit the AlterEgo cart-upload CSV
(template: `alterego_cart_upload_template.csv` — "Item SKU,Item
quantity", size-encoded SKUs) → generate the Lady Luxe invoice for the
parcel upload. Size charts per brand: `alterego-size-guides.zip` (JPGs).

**The Gift Presentation (owner's two-tier fulfilment, on hold until the
store's revenue funds it — stock ~$2,000)**: standard orders drop-ship
direct from AlterEgo (above). GIFT-SET orders route through the owner:
AlterEgo ships to the OWNER's address (the engine flags gift orders and
sets the upload's ship-to), the owner prepares the presentation and
re-ships, adding ~1 week to delivery. The presentation kit (offered at
a premium price):
- Matte Black Rigid Gift Boxes — two-piece lift-off lid, gold foil
  stamping, burgundy satin ribbon closures
- Luxury Euro Tote Shopping Bags — heavyweight black paper, gold foil
  logo, burgundy grosgrain/satin ribbon handles
- Custom Monogram Tissue Paper — white/cream tissue, repeating gold
  metallic LL monogram
- Foil-Stamped Stationery Suite — burgundy textured cards, gold foil
  logos, black envelopes, gold-foiled letterhead
- Embossed Gold Wax Seal Stickers — self-adhesive metallic gold faux-wax
  seals with the LL monogram (500-count; faster and more consistent
  than hand-poured wax)
Checkout implications when launched: a gift-presentation add-on with
the ~1-week handling note, the gift flag on the order, and the
AlterEgo ship-to pointed at the owner.



1. Read this file + `git log --oneline -20`.
2. Check what's running: `ss -tlnp | grep -E '3000|3002'` (3000 storefront dev,
   3002 Studio). Restart Studio: `python3 turntable_gui.py` (background).
3. Check GUI jobs state: `gui_data/jobs.json`; turntable outputs: `output/`.
4. For any Sogni issue, probe first (free): connect → estimate → check job-level
   errors via `list_recent`.
5. Update this file + CHANGELOG at the end of any material session.
