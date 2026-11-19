# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com); dates in UTC-6.

## [Unreleased]

### In progress
- BN6673 Burgundy Peignoir turntable rendering (~58 SPARK)
- Storefront product pages with hover-film playback (manifest-driven pose
  snapping, hover play / pause-not-resume via the brand engine)

### Added (2026-11-19)
- Turntables #2 and #3 verified: YX880 Leopard Robe (seam 2.21) and YX882
  Mesh Bra Set (2.35) — each 10.125s / 243 frames, ~58 SPARK quoted
- BN6673 Burgundy Peignoir: two failed renders (subject duplicated in the
  180° frame — ambiguous "over her shoulder" prompt clause); **root cause
  fixed permanently in the angle prompts** (commit 9ab763a) and v3 verified
  clean (single subject). Finished film: seam 2.91
- `docs/sogni-api-endpoints.md`: full Sogni REST surface (86 endpoints,
  saved from docs.sogni.ai)
- Fixed docs mix-up: master context file had been renamed to
  `api_reference.md`; restored to `docs/PROJECT-CONTEXT.md`

## [2026-11-16]

### Added
- `disableNSFWFilter=True` on every Sogni generation request — required for
  lingerie content; the account-level filter was silently withholding results
  (job completes with `sensitiveContentWithheld=true`, no media to download)
- Actionable pipeline error when a job result is withheld (`job.is_nsfw`)
- First verified end-to-end turntable: Sasha-set-1 (BN6715), 10.125s / 243
  frames / 768×1024, mp4+webm+manifest, seam RMS 2.31, cost $0.29 / 58.1 SPARK
- Project docs: `README.md`, `docs/PROJECT-CONTEXT.md`, this `CHANGELOG.md`

### Fixed
- Pipeline JSON logging no longer routed through rich (rich wrapped lines at
  the 80-column pipe default, splitting every JSON record and breaking all
  line-oriented consumers, including the Studio's event pump)

## [2026-11-14]

### Added
- **Turntable Studio** (`turntable_gui.py` + `turntable_gui.html`): local web
  GUI on 127.0.0.1:3002 — drag-and-drop upload, job queue with live stage and
  cost progress, cancel support, results gallery with hover-play previews and
  downloads, saved defaults, and an inbox watcher (`~/turntable-inbox/`) that
  auto-processes dropped files
- **Turntable pipeline** (`generate_turntable.py`, 50 pytest cases): async
  state machine — preflight/normalize → background conditioning (Krea identity
  edit) → quarter-turn keyframes (90/180/270) → keyframe-guided H3 video →
  ffmpeg packaging (seam blend, mp4 faststart + webm + manifest with pose
  timestamps). Per-asset resume, cost guard, exponential backoff honoring
  Retry-After, consent-refusal model fallback, graceful SIGINT → project
  cancellation
- Video engine per owner spec: `minimax-h3-fastvideo-int8_flf2v_turbo`
  (FastH3 Turbo) with catalog LoRAs `h3-mystic-xxx-v5` and
  `h3-vbvr-video-reasoning`; VBVR-style literal stepwise cinematography prompt
- `.env.example` documenting all pipeline configuration

### Changed
- Default LoRA pair and video model configurable via `--lora` / env

## [2026-11-14] — storefront fixes

### Fixed
- Marquee hydration warning: engine performs a zero-write no-op on
  React-rendered tracks and binds only after the `data-ll-armed` sentinel set
  by `<LuxeMarquee />` inside its Suspense boundary

## [2026-11-12]

### Added
- Intake pipeline for hand-curated new arrivals: `intake-new-arrivals.py`,
  `upload-intake.mjs`, `intake-template.md` (MD + media → Supabase)

## [2026-11-12] — earlier

### Added
- Hydration-safe hover engine wiring (`LuxeRuntime`, `LuxeMarquee`,
  `useLuxeBind`), single owned `<Script>` for `lady-luxe.js`
- Launch catalog loaded: 17 products + 5 ensembles with real economics;
  22 images mirrored to Supabase CDN
- AlterEgo feed integration and frozen-catalog snapshot
