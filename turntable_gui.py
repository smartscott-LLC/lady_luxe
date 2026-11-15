#!/usr/bin/env python3
"""Lady Luxe — Turntable Studio (local web GUI + inbox watcher).

A thin local front-end over generate_turntable.py:

    python3 turntable_gui.py            # serves http://127.0.0.1:3002

Features
--------
* Drag-and-drop (or pick) images -> queued as turntable jobs, one at a time.
* Watched inbox (`~/turntable-inbox/`) — files dropped there are processed
  automatically with the saved defaults, then moved to inbox/processed/.
* Live stage progress per job by tailing the pipeline's JSON events.
* Results gallery: hover-to-play video preview (same behaviour as the
  storefront), mp4/webm/manifest downloads, pose timestamps and seam RMS.
* Saved defaults (bg mode, duration, preset) persist in gui_data/settings.json.

The GUI never reimplements pipeline logic — every job is a subprocess of
generate_turntable.py with --log-format json, so CLI and GUI behaviour stay
identical by construction. Bind is 127.0.0.1 only; this is a local tool.
"""

from __future__ import annotations

import asyncio
import json
import re
import shutil
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

SCRIPT_DIR = Path(__file__).resolve().parent
PIPELINE = SCRIPT_DIR / "generate_turntable.py"
GUI_DATA = SCRIPT_DIR / "gui_data"
JOBS_FILE = GUI_DATA / "jobs.json"
EVENTS_DIR = GUI_DATA / "events"
SETTINGS_FILE = GUI_DATA / "settings.json"
INBOX = Path.home() / "turntable-inbox"
INBOX_DONE = INBOX / "processed"
OUTPUT_DIR = SCRIPT_DIR / "output"
BUILD_DIR = SCRIPT_DIR / "build"
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
POLL_SECONDS = 2.0
INBOX_POLL_SECONDS = 4.0

for folder in (GUI_DATA, EVENTS_DIR, INBOX, INBOX_DONE, OUTPUT_DIR, BUILD_DIR):
    folder.mkdir(parents=True, exist_ok=True)

DEFAULT_SETTINGS: dict[str, Any] = {
    "bg_mode": "keep",
    "duration": 10,
    "bg_preset": "limestone",
    "network": "fast",
    "dry_run": False,
    "watch_inbox": True,
}


def load_settings() -> dict[str, Any]:
    if SETTINGS_FILE.is_file():
        try:
            saved = json.loads(SETTINGS_FILE.read_text())
            return {**DEFAULT_SETTINGS, **saved}
        except json.JSONDecodeError:
            pass
    return dict(DEFAULT_SETTINGS)


def save_settings(settings: dict[str, Any]) -> None:
    tmp = SETTINGS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(settings, indent=2))
    tmp.replace(SETTINGS_FILE)


def load_jobs() -> list[dict[str, Any]]:
    if not JOBS_FILE.is_file():
        return []
    try:
        return json.loads(JOBS_FILE.read_text())
    except json.JSONDecodeError:
        return []


def save_jobs(jobs: list[dict[str, Any]]) -> None:
    tmp = JOBS_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(jobs, indent=1))
    tmp.replace(JOBS_FILE)


def unique_path(directory: Path, name: str) -> Path:
    target = directory / name
    if not target.exists():
        return target
    stem, suffix = target.stem, target.suffix
    for n in range(1, 1000):
        candidate = directory / f"{stem}_{n}{suffix}"
        if not candidate.exists():
            return candidate
    return directory / f"{stem}_{uuid.uuid4().hex[:8]}{suffix}"


app = FastAPI(title="Lady Luxe Turntable Studio")
_state: dict[str, Any] = {"proc": None, "active_job": None, "worker": None, "watcher": None}


# --------------------------------------------------------------------------- #
# Job plumbing
# --------------------------------------------------------------------------- #


def _job_index(jobs: list[dict[str, Any]], job_id: str) -> dict[str, Any] | None:
    return next((j for j in jobs if j["id"] == job_id), None)


def create_job(source: Path, params: dict[str, Any]) -> dict[str, Any]:
    jobs = load_jobs()
    # Skip if the same source is already queued or running.
    for existing in jobs:
        if existing["source"] == str(source) and existing["status"] in ("queued", "running"):
            return existing
    job = {
        "id": uuid.uuid4().hex[:12],
        "name": source.name,
        "source": str(source),
        "status": "queued",
        "stage": "",
        "params": params,
        "cost_usd": None,
        "spark": None,
        "frames": None,
        "error": None,
        "dry_run": bool(params.get("dry_run")),
        "outputs": None,
        "seam_rms": None,
        "created": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "started": None,
        "finished": None,
    }
    jobs.insert(0, job)
    save_jobs(jobs)
    (EVENTS_DIR / f"{job['id']}.jsonl").touch()
    return job


def update_job(job_id: str, **fields: Any) -> None:
    jobs = load_jobs()
    job = _job_index(jobs, job_id)
    if job is None:
        return
    job.update(fields)
    save_jobs(jobs)


def append_event(job_id: str, record: dict[str, Any]) -> None:
    with (EVENTS_DIR / f"{job_id}.jsonl").open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, default=str) + "\n")


def job_events(job_id: str, limit: int = 30) -> list[dict[str, Any]]:
    path = EVENTS_DIR / f"{job_id}.jsonl"
    if not path.is_file():
        return []
    lines = path.read_text().strip().splitlines()
    out = []
    for line in lines[-limit:]:
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


def build_command(job: dict[str, Any]) -> list[str]:
    params = job["params"]
    cmd = [
        sys_executable(),
        str(PIPELINE),
        "--input", job["source"],
        "--bg-mode", params.get("bg_mode", "keep"),
        "--duration", str(params.get("duration", 10)),
        "--network", params.get("network", "fast"),
        "--output-dir", str(OUTPUT_DIR),
        "--build-dir", str(BUILD_DIR),
        "--log-format", "json",
        "--yes",
    ]
    if params.get("bg_mode") == "generate" and params.get("bg_preset"):
        cmd += ["--bg-preset", params["bg_preset"]]
    for lora in params.get("loras", []):
        cmd += ["--lora", lora]
    if params.get("dry_run"):
        cmd += ["--dry-run"]
    if params.get("resume"):
        cmd += ["--resume"]
    return cmd


def sys_executable() -> str:
    return shutil.which("python3") or "python3"


def dbg_write(message: str) -> None:
    (GUI_DATA / "debug.log").open("a", encoding="utf-8").write(
        f"[{time.strftime('%H:%M:%S')}] {message}\n")


def apply_event(job: dict[str, Any], record: dict[str, Any]) -> None:
    """Fold one pipeline JSON event into the job record."""
    stage, event = record.get("stage"), record.get("event")
    if stage == "quote" and event == "estimated":
        update_job(job["id"], cost_usd=record.get("total_usd"), spark=record.get("total_spark"))
    elif stage == "normalize" and event == "done":
        update_job(job["id"], stage="normalized")
    elif stage == "bg" and event in ("done", "resumed"):
        update_job(job["id"], stage="background set")
    elif stage == "keyframes" and event in ("done", "resumed"):
        update_job(job["id"], stage=f"keyframes ({record.get('angle')}° done)")
    elif stage == "video" and event == "done":
        update_job(job["id"], stage="render complete — packaging")
    elif stage == "video" and event == "balance":
        pass
    elif stage == "package" and event == "done":
        update_job(job["id"], stage="packaged")
        update_job(
            job["id"],
            outputs={
                "mp4": record.get("mp4"),
                "webm": record.get("webm"),
                "manifest": None,
            },
            seam_rms=record.get("seam_rms"),
            frames=record.get("frames"),
        )
    elif stage == "summary" and event == "asset-done":
        fields: dict[str, Any] = {}
        if record.get("dry_run"):
            fields["frames"] = record.get("frames")
            fields["spark"] = record.get("spark")
            fields["cost_usd"] = record.get("estimate_usd")
        update_job(job["id"], **fields)
    elif stage == "asset" and event in ("asset-failed", "asset-failed-unexpected"):
        update_job(job["id"], error=str(record.get("error"))[:500])
    elif stage == "fatal" and event == "pipeline-failed":
        update_job(job["id"], error=str(record.get("error"))[:500])
    append_event(job["id"], record)


async def run_job(job: dict[str, Any]) -> None:
    dbg_write(f"run_job enter {job['id']}")
    update_job(job["id"], status="running", stage="starting", started=time.strftime("%H:%M:%S"))
    proc = await asyncio.create_subprocess_exec(
        *build_command(job),
        cwd=str(SCRIPT_DIR),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    _state["proc"] = proc
    _state["active_job"] = job["id"]
    manifest_hint = BUILD_DIR / "state"  # unused; placeholder keeps linters calm

    async def pump() -> None:
        assert proc.stdout is not None
        buffer = b""
        total = 0
        while True:
            chunk = await proc.stdout.read(4096)
            if not chunk:
                break
            total += len(chunk)
            buffer += chunk
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                text = line.decode("utf-8", "replace").strip()
                if not text.startswith("{"):
                    continue
                try:
                    record = json.loads(text)
                except json.JSONDecodeError:
                    continue
                apply_event(job, record)
        dbg_write(f"  pump total={total}")

    try:
        await asyncio.gather(pump(), proc.wait())
    except asyncio.CancelledError:
        with_suppress = getattr(proc, "terminate", None)
        if with_suppress:
            with_suppress()
        raise
    finally:
        _state["proc"] = None
        _state["active_job"] = None
    # Recover manifest path from the asset build dir when packaging succeeded.
    jobs = load_jobs()
    latest = _job_index(jobs, job["id"]) or {}
    if latest.get("outputs") and latest["outputs"].get("mp4"):
        mp4 = Path(str(latest["outputs"]["mp4"]))
        if not mp4.is_absolute():
            mp4 = SCRIPT_DIR / mp4
        manifest = mp4.parent / "manifest.json"
        if manifest.is_file():
            update_job(job["id"], outputs={**latest["outputs"], "manifest": str(manifest)})
    rc = proc.returncode
    final = load_jobs()
    current = _job_index(final, job["id"]) or {}
    if current.get("status") == "running":
        if rc == 0:
            update_job(job["id"], status="done" if not job.get("dry_run") else "dry-run",
                       stage="", finished=time.strftime("%H:%M:%S"))
        else:
            update_job(
                job["id"],
                status="failed",
                stage="",
                error=current.get("error") or f"pipeline exited {rc}",
                finished=time.strftime("%H:%M:%S"),
            )


async def worker_loop() -> None:
    dbg = GUI_DATA / "debug.log"
    dbg.open("a").write(f"[{time.strftime('%H:%M:%S')}] worker started\n")
    while True:
        try:
            jobs = load_jobs()
            queued = next((j for j in reversed(jobs) if j["status"] == "queued"), None)
            if queued is None:
                await asyncio.sleep(POLL_SECONDS)
                continue
            await run_job(queued)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — the worker must never die
            dbg.open("a").write(f"[{time.strftime('%H:%M:%S')}] worker error: {exc!r}\n")
            active = _state.get("active_job")
            if active:
                update_job(active, status="failed", error=f"gui worker: {exc}")
                _state["active_job"] = None
            await asyncio.sleep(3)


async def inbox_loop() -> None:
    dbg = GUI_DATA / "debug.log"
    dbg.open("a").write(f"[{time.strftime('%H:%M:%S')}] inbox watcher started\n")
    settings = load_settings()
    if not settings.get("watch_inbox", True):
        return
    while True:
        try:
            if settings.get("watch_inbox", True):
                for path in sorted(INBOX.iterdir()):
                    if not path.is_file() or path.suffix.lower() not in IMAGE_EXTENSIONS:
                        continue
                    params = {k: v for k, v in load_settings().items()}
                    job = create_job(path, params)
                    if job["name"] == path.name and job["source"] == str(path):
                        dest = unique_path(INBOX_DONE, path.name)
                        shutil.move(str(path), dest)
                        update_job(job["id"], source=str(dest), name=dest.name)
                        # create_job dedupes by source; re-point the record
                        jobs = load_jobs()
                        for j in jobs:
                            if j["id"] == job["id"] and j["status"] == "queued":
                                j["source"] = str(dest)
                        save_jobs(jobs)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 — watcher must survive bad files
            pass
        await asyncio.sleep(INBOX_POLL_SECONDS)


@app.get("/api/debug/pump")
async def debug_pump() -> JSONResponse:
    """Raw subprocess-capture probe inside the live server loop."""
    proc = await asyncio.create_subprocess_exec(
        sys_executable(), str(PIPELINE),
        "--input", "/tmp/opencode/smoke_model.jpg",
        "--bg-mode", "keep", "--duration", "10",
        "--output-dir", str(OUTPUT_DIR), "--build-dir", str(BUILD_DIR),
        "--log-format", "json", "--yes", "--dry-run",
        cwd=str(SCRIPT_DIR),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    total, lines = 0, 0
    while True:
        chunk = await proc.stdout.read(4096)
        if not chunk:
            break
        total += len(chunk)
        lines += chunk.count(b"\n")
    rc = await proc.wait()
    return JSONResponse({"rc": rc, "bytes": total, "lines": lines})


@app.on_event("startup")
async def startup() -> None:
    (GUI_DATA / "debug.log").open("a").write(
        f"[{time.strftime('%H:%M:%S')}] startup: spawning worker + watcher\n")
    _state["worker"] = asyncio.create_task(worker_loop())
    _state["watcher"] = asyncio.create_task(inbox_loop())


@app.on_event("shutdown")
async def shutdown() -> None:
    for key in ("worker", "watcher"):
        task = _state.get(key)
        if task:
            task.cancel()
    proc = _state.get("proc")
    if proc and proc.returncode is None:
        proc.terminate()


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #


@app.get("/")
async def index() -> RedirectResponse:
    return RedirectResponse("/static/turntable_gui.html")


@app.post("/api/upload")
async def upload(
    files: list[UploadFile] = File(...),
    bg_mode: str = Form("keep"),
    duration: float = Form(10.0),
    bg_preset: str = Form("limestone"),
    dry_run: bool = Form(False),
    loras: str = Form(""),
) -> JSONResponse:
    settings = load_settings()
    lora_list = [part.strip() for part in loras.split(",") if part.strip()] if loras else None
    created = []
    for upload_file in files:
        suffix = Path(upload_file.filename or "upload").suffix.lower()
        if suffix not in IMAGE_EXTENSIONS:
            continue
        dest = unique_path(BUILD_DIR / "uploads", Path(upload_file.filename or "upload").name)
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("wb") as fh:
            while chunk := await upload_file.read(1 << 20):
                fh.write(chunk)
        params: dict[str, Any] = {
            "bg_mode": bg_mode if bg_mode in ("keep", "generate") else settings["bg_mode"],
            "duration": min(max(float(duration), 5.17), 15.08),
            "bg_preset": bg_preset,
            "network": settings["network"],
            "dry_run": bool(dry_run),
        }
        if lora_list:
            params["loras"] = lora_list
        created.append(create_job(dest, params))
    if not created:
        raise HTTPException(400, "no supported images (.png/.jpg/.webp) in upload")
    return JSONResponse({"jobs": created})


@app.get("/api/jobs")
async def list_jobs() -> JSONResponse:
    jobs = load_jobs()
    for job in jobs:
        job["events"] = job_events(job["id"], limit=6)
    return JSONResponse({"jobs": jobs, "settings": load_settings()})


@app.get("/api/job/{job_id}")
async def job_detail(job_id: str) -> JSONResponse:
    jobs = load_jobs()
    job = _job_index(jobs, job_id)
    if job is None:
        raise HTTPException(404, "unknown job")
    job["events"] = job_events(job_id)
    return JSONResponse(job)


@app.post("/api/job/{job_id}/cancel")
async def cancel_job(job_id: str) -> JSONResponse:
    jobs = load_jobs()
    job = _job_index(jobs, job_id)
    if job is None:
        raise HTTPException(404, "unknown job")
    if job["status"] == "queued":
        update_job(job_id, status="cancelled", finished=time.strftime("%H:%M:%S"))
        return JSONResponse({"ok": True, "cancelled": "queued"})
    if job["status"] == "running" and _state.get("active_job") == job_id and _state.get("proc"):
        _state["proc"].terminate()
        update_job(job_id, status="cancelled", stage="",
                   error="cancelled by user", finished=time.strftime("%H:%M:%S"))
        return JSONResponse({"ok": True, "cancelled": "running"})
    raise HTTPException(409, f"job is {job['status']}; nothing to cancel")


@app.post("/api/settings")
async def update_settings(payload: dict[str, Any]) -> JSONResponse:
    settings = load_settings()
    for key in DEFAULT_SETTINGS:
        if key in payload:
            settings[key] = payload[key]
    save_settings(settings)
    return JSONResponse(settings)


@app.get("/api/results")
async def results() -> JSONResponse:
    found = []
    for manifest_path in sorted(OUTPUT_DIR.glob("*/manifest.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            manifest = json.loads(manifest_path.read_text())
        except json.JSONDecodeError:
            continue
        stem = manifest_path.parent / (manifest.get("asset", manifest_path.parent.name) + ".mp4")
        stem_alt = manifest_path.parent / (manifest_path.parent.name + ".mp4")
        mp4 = stem if stem.is_file() else stem_alt
        webm = mp4.with_suffix(".webm") if mp4.exists() else None
        poses = manifest.get("poses", [])
        found.append({
            "asset": manifest.get("asset", manifest_path.parent.name),
            "mp4": str(mp4) if mp4.exists() else None,
            "webm": str(webm) if webm and webm.is_file() else None,
            "manifest": str(manifest_path),
            "frames": manifest.get("video", {}).get("frames"),
            "duration_s": manifest.get("video", {}).get("duration_s"),
            "seam_rms": manifest.get("loop", {}).get("seam_rms"),
            "poses": [
                {"angle": p.get("angle"), "time_s": p.get("time_s"), "label": p.get("label")}
                for p in poses
            ],
        })
    return JSONResponse({"results": found})


SAFE_ROOTS = (OUTPUT_DIR.resolve(), BUILD_DIR.resolve(), INBOX.resolve(), (GUI_DATA / "uploads").resolve())


def _safe(path: Path) -> Path:
    resolved = path.resolve()
    if not any(resolved == root or root in resolved.parents for root in SAFE_ROOTS):
        raise HTTPException(403, "path outside served roots")
    return resolved


@app.get("/files/{path:path}")
async def files(path: str) -> FileResponse:
    target = _safe(SCRIPT_DIR / path)
    if not target.is_file():
        raise HTTPException(404, "not found")
    return FileResponse(target)


@app.get("/app.html")
async def app_html() -> FileResponse:
    return FileResponse(SCRIPT_DIR / "turntable_gui.html")


def main() -> None:
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=3002, log_level="warning")


if __name__ == "__main__":
    main()
