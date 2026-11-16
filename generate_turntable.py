#!/usr/bin/env python3
"""Lady Luxe — 360° turntable generator.

Transforms static model photographs into seamless, web-ready 360° interactive
turntable videos for the storefront: a slow, controlled pirouette that settles
into an editorial pose at every quarter turn (0° front → 90° right profile →
180° back → 270° left profile → seamless return to 0°).

Pipeline (async state machine):

    Stage 0  preflight + image normalization (Pillow; free, local)
    Stage A  background conditioning  (--bg-mode generate; Krea identity edit)
    Stage B  quarter-turn keyframes   (90° / 180° / 270°; identity edit)
    Stage C  keyframe-guided video    (MiniMax H3 first/last-frame + keyframes)
    Stage D  ffmpeg packaging         (seam-enforced loop, mp4 + webm + manifest)

Usage:

    python3 generate_turntable.py --input photo.jpg --bg-mode generate
    python3 generate_turntable.py --input ./photos --resume --duration 8
    python3 generate_turntable.py --input photo.jpg --dry-run

Credentials: SOGNI_API_KEY (environment or .env). The socket ``app_id`` is a
UUID persisted at ~/.config/sogni_turntable/app_id and reused across runs, as
Sogni socket clients require. Renders are never abandoned on a client timeout:
SIGINT/SIGTERM cancel active projects through ``project.cancel()`` and exit 130.

Exit codes: 0 success · 1 runtime failure · 2 usage · 130 cancelled.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import dataclasses
import hashlib
import json
import math
import os
import random
import re
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Awaitable, Callable, Sequence

import aiohttp
from PIL import Image, ImageChops, ImageOps, ImageStat
from pydantic import BaseModel, Field, field_validator
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from sogni_client import SogniClient
from sogni_client.errors import (
    ApiError,
    ProjectError,
    SogniError,
    is_model_consent_required_error,
)
from sogni_client.utils import (
    MINIMAX_H3_FPS,
    MINIMAX_H3_MAX_FRAMES,
    MINIMAX_H3_MAX_DIMENSION,
    MINIMAX_H3_MAX_PIXELS,
    MINIMAX_H3_MIN_FRAMES,
    MINIMAX_H3_DIMENSION_STEP,
    MINIMAX_H3_FRAME_STEP,
    calculate_video_frames,
)

SCRIPT_DIR = Path(__file__).resolve().parent
APP_ID_PATH = Path.home() / ".config" / "sogni_turntable" / "app_id"
FPS = MINIMAX_H3_FPS                     # 24 — fixed for MiniMax H3
H3_MIN_DURATION = MINIMAX_H3_MIN_FRAMES / FPS   # ≈5.1667 s
H3_MAX_DURATION = MINIMAX_H3_MAX_FRAMES / FPS   # ≈15.0833 s
MIN_DIMENSION = 512                      # Krea identity-edit custom-size floor
MAX_DIMENSION = 2048                     # Krea identity-edit custom-size ceiling

DEFAULT_VIDEO_MODEL = "minimax-h3-fastvideo-int8_flf2v_turbo"  # FastH3 Turbo, 4 steps
VIDEO_MODEL_CHOICES = (
    "minimax-h3-fl2va-fp8_flf2v",
    "minimax-h3-fl2va-fp8_flf2v_balanced",
    "minimax-h3-fl2va-fp8_flf2v_turbo",
    "minimax-h3-fastvideo-int8_flf2v_turbo",
    "minimax-h3-fastvideo-int8_flf2v_turbo_2stage",
)
# Catalog LoRAs verified against the user's account (compatible with every
# FastH3 flf2v id). Mystic X v5: keep ≤ 0.6 — users report artifacts above 0.8.
# VBVR Video Reasoning: prompt-adherence LoRA; wants literal, stepwise prompts.
DEFAULT_LORAS: tuple[tuple[str, float], ...] = (
    ("h3-mystic-xxx-v5", 0.5),
    ("h3-vbvr-video-reasoning", 0.8),
)
DEFAULT_EDIT_MODEL = "krea2_identity_edit_v1_2"
EDIT_MODEL_FALLBACK = "dark_beast_krea2_identity_edit_v1_2"
DEFAULT_NETWORK = "fast"
DEFAULT_SEED = 42197
DEFAULT_HOLD_FRAMES = 12                 # 0.5 s editorial hold at each pose
DEFAULT_SEAM_FRAMES = 4                  # blend tail into frame 0 for a hard loop
DEFAULT_MAX_COST_USD = 5.0               # per-asset preflight guard
DEFAULT_EDIT_STEPS = 10
DEFAULT_EDIT_GUIDANCE = 2.5
DEFAULT_DURATION = 8.0                   # 8.000 s → exactly 192 H3 frames
PORTRAIT_WIDTH = 768                     # 32-px grid, exact 3:4 portrait
PORTRAIT_HEIGHT = 1024
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

BACKGROUND_PRESETS: dict[str, str] = {
    "limestone": (
        "the model standing in a minimalist limestone gallery studio, warm travertine "
        "walls, soft diffused window light from camera left, gentle contact shadow "
        "under her feet, shallow depth of field, muted warm editorial palette"
    ),
    "cyclorama": (
        "the model on a seamless warm ivory studio cyclorama, large softbox key light "
        "camera left, soft fill, a soft grounding shadow at her feet, clean high-end "
        "editorial studio look"
    ),
    "velvet": (
        "a moody luxury boudoir suite, deep charcoal velvet drapery, single warm "
        "tungsten key with soft falloff, rim light tracing the silhouette, rich "
        "shadows, cinematic editorial atmosphere"
    ),
}

IDENTITY_KEEP = (
    "same woman, identical face, identical body proportions, identical hairstyle, "
    "identical makeup, identical jewelry"
)
GARMENT_KEEP = (
    "identical outfit: same garment design, same fabric, same color, same cut, "
    "same fit, same straps and details, nothing added or removed"
)

BACKGROUND_EDIT_PROMPT = (
    "high-fashion editorial photograph of {subject}, {environment}. {identity}. "
    "{garment}. Locked full-body framing, head-to-heel in frame, natural elegant "
    "posture, photorealistic, sharp, professional lighting"
)

ANGLE_PROMPTS: dict[int, str] = {
    90: (
        "rotate the subject to a full 90-degree right profile view: body facing "
        "screen right, head in profile, editorial posture, arms relaxed"
    ),
    180: (
        "rotate the subject to a full 180-degree back view: her back to camera, "
        "showing the rear design of the garment, straps, closures and back "
        "details clearly, head turned slightly over her shoulder"
    ),
    270: (
        "rotate the subject to a full 270-degree left profile view: body facing "
        "screen left, head in profile, editorial posture, arms relaxed"
    ),
}
ANGLE_EDIT_PROMPT = (
    "{identity}. {garment}. {angle}. {environment_keep}. Same locked full-body "
    "framing, same distance from camera, same lens, same lighting and shadows, "
    "photorealistic, sharp"
)

VIDEO_PROMPT = (
    "luxury fashion editorial video. Starting state: the model stands still, "
    "facing the camera, full body head-to-heel in frame, holding an editorial "
    "pose. Action, in order: she rotates 90 degrees right and holds still in a "
    "profile pose; continues rotating to show her back and holds still showing "
    "the rear of the garment; continues rotating 90 degrees to the left profile "
    "and holds; completes the final quarter turn and stops exactly on the "
    "starting front pose, motionless. End state: identical to the first frame, "
    "so the clip loops seamlessly. The camera is tripod-locked: no zoom, no "
    "pan, no cuts, no shake. Fabric moves naturally only while she turns; "
    "garment design, color, fit and silhouette stay identical through the full "
    "rotation; her face, identity and body proportions never change; studio "
    "lighting, floor and contact shadows stay constant. Photorealistic, high "
    "detail, no morphing, no flicker, no warping{extra}"
)

NEGATIVE_EDIT_PROMPT = (
    "different face, altered facial features, changed body proportions, distorted "
    "anatomy, extra limbs, missing limbs, deformed hands, mutated fingers, warped "
    "garment, changed outfit, removed clothing, added clothing, morphing fabric, "
    "changed hair color, changed hairstyle, different person, blurry, low quality, "
    "jpeg artifacts, watermark, text, logo, cropped head, cropped feet"
)


# --------------------------------------------------------------------------- #
# Console + structured logging
# --------------------------------------------------------------------------- #


class Logger:
    """Rich console output plus an append-only JSONL event file.

    Warnings and errors are always visible on the console (rich mode renders a
    tagged line; JSON mode emits the record); info events go to the JSONL file
    and, in JSON mode, to stdout as well.
    """

    STYLE = {"info": "dim", "warn": "yellow", "error": "bold red"}

    def __init__(
        self,
        console: Console,
        json_format: bool = False,
        jsonl_path: Path | None = None,
    ) -> None:
        self.console = console
        self.json_format = json_format
        self.jsonl_path = jsonl_path
        if jsonl_path is not None:
            jsonl_path.parent.mkdir(parents=True, exist_ok=True)
            if not jsonl_path.exists():
                jsonl_path.touch()

    def _emit(self, level: str, stage: str, event: str, **data: Any) -> None:
        record = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "level": level,
            "stage": stage,
            "event": event,
            **data,
        }
        if self.jsonl_path is not None:
            with self.jsonl_path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
        if self.json_format:
            # Raw stdout write, never rich: rich would wrap long lines at the
            # 80-column pipe default, splitting each JSON record and breaking
            # every line-oriented consumer (the GUI pump included).
            sys.stdout.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")
            sys.stdout.flush()
        elif level in ("warn", "error"):
            flat = " ".join(f"{k}={v}" for k, v in data.items())
            self.console.print(
                f"[{self.STYLE[level]}]{level}[/{self.STYLE[level]}] "
                f"[dim]{stage}[/dim] {event} {flat}"
            )

    def event(self, stage: str, event: str, **data: Any) -> None:
        self._emit("info", stage, event, **data)

    def warn(self, stage: str, event: str, **data: Any) -> None:
        self._emit("warn", stage, event, **data)

    def error(self, stage: str, event: str, **data: Any) -> None:
        self._emit("error", stage, event, **data)

    def say(self, message: str) -> None:
        if not self.json_format:
            self.console.print(message)

    def rule(self, title: str) -> None:
        if not self.json_format:
            self.console.print(Panel(title, style="magenta"))


# --------------------------------------------------------------------------- #
# Environment + app_id
# --------------------------------------------------------------------------- #


def load_dotenv(paths: Sequence[Path]) -> dict[str, str]:
    """Merge KEY=VALUE lines into os.environ without clobbering real env vars."""
    loaded: dict[str, str] = {}
    for path in paths:
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if not key:
                continue
            loaded.setdefault(key, value)
            os.environ.setdefault(key, value)
    return loaded


def load_api_key() -> str:
    """The Sogni API key, or a raising error with the dashboard pointer."""
    key = os.environ.get("SOGNI_API_KEY", "").strip()
    if not key:
        raise PipelineUsageError(
            "SOGNI_API_KEY is not set. Add it to .env or the environment "
            "(https://dashboard.sogni.ai/api-key)."
        )
    return key


def load_or_create_app_id(path: Path = APP_ID_PATH) -> str:
    """Persisted socket app_id — Sogni socket clients must keep one per install."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.is_file():
            existing = path.read_text(encoding="utf-8").strip()
            if existing:
                return existing
        app_id = str(uuid.uuid4())
        path.write_text(app_id + "\n", encoding="utf-8")
        return app_id
    except OSError as exc:
        raise PipelineError(f"Cannot persist app_id at {path}: {exc}") from exc


# --------------------------------------------------------------------------- #
# Errors
# --------------------------------------------------------------------------- #


class PipelineError(Exception):
    """Fatal pipeline failure with an operator-readable message."""


class PipelineUsageError(PipelineError):
    """Bad invocation — maps to exit code 2."""


class OperationCancelled(Exception):
    """SIGINT/SIGTERM received; active renders were cancelled server-side."""


class FfmpegError(PipelineError):
    """An ffmpeg/ffprobe invocation failed."""

    def __init__(self, binary: str, args: list[str], returncode: int, stderr: str) -> None:
        tail = "\n".join(stderr.strip().splitlines()[-12:])
        super().__init__(f"{binary} exited {returncode}\n  cmd: {_shlex(args)}\n  stderr: {tail}")
        self.returncode = returncode


def _shlex(args: Sequence[str]) -> str:
    import shlex

    return " ".join(shlex.quote(a) for a in args)


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="generate_turntable.py",
        description="Static model photo → seamless 360° pose-hold turntable video "
        "(Sogni MiniMax H3 first/last-frame + keyframes, ffmpeg packaging).",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--input",
        "-i",
        required=True,
        type=Path,
        help="Image file (.png/.jpg/.webp) or directory of images to batch",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("./output"),
        help="Directory for final mp4/webm/manifest bundles",
    )
    parser.add_argument(
        "--build-dir",
        type=Path,
        default=Path("./build"),
        help="Working directory for keyframes, intermediates and resume state",
    )
    parser.add_argument(
        "--bg-mode",
        choices=("keep", "generate"),
        default="keep",
        help="keep: preserve the photo's own environment; generate: outpaint a "
        "luxury studio environment around the subject first (Stage A)",
    )
    parser.add_argument(
        "--bg-prompt",
        default=None,
        help="Custom environment description for --bg-mode generate "
        "(overrides --bg-preset)",
    )
    parser.add_argument(
        "--bg-preset",
        choices=sorted(BACKGROUND_PRESETS),
        default="limestone",
        help="Preset environment for --bg-mode generate",
    )
    parser.add_argument(
        "--garment-prompt",
        default=None,
        help="Text anchoring the exact outfit (e.g. 'black lace balconette set "
        "with garter belt'); strengthens keyframe garment consistency",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=DEFAULT_DURATION,
        help="Target video length in seconds; snapped to the MiniMax H3 frame "
        f"grid ({MINIMAX_H3_MIN_FRAMES}+n×{MINIMAX_H3_FRAME_STEP} frames, "
        f"{H3_MIN_DURATION:.2f}–{H3_MAX_DURATION:.2f} s)",
    )
    parser.add_argument(
        "--width", type=int, default=PORTRAIT_WIDTH, help="Canvas width (32-px grid)"
    )
    parser.add_argument(
        "--height", type=int, default=PORTRAIT_HEIGHT, help="Canvas height (32-px grid)"
    )
    parser.add_argument(
        "--fps",
        type=int,
        default=FPS,
        help="Output frame rate — MiniMax H3 renders at 24; kept for the manifest",
    )
    parser.add_argument("--seed", type=int, default=None,
        help=f"Generation seed (default: SOGNI_TURNTABLE_SEED or {DEFAULT_SEED})")
    parser.add_argument(
        "--network", choices=("fast", "relaxed"), default=DEFAULT_NETWORK, help="Supernet queue"
    )
    parser.add_argument("--video-model", default=DEFAULT_VIDEO_MODEL, choices=VIDEO_MODEL_CHOICES)
    parser.add_argument("--lora", action="append", default=None, metavar="SLUG[:STRENGTH]",
        help="Video LoRA to attach (repeatable). Defaults: "
        + " ".join(f"{slug}:{strength}" for slug, strength in DEFAULT_LORAS))
    parser.add_argument("--edit-model", default=None, help="Identity edit model "
        f"(default {DEFAULT_EDIT_MODEL})")
    parser.add_argument("--edit-steps", type=int, default=DEFAULT_EDIT_STEPS)
    parser.add_argument("--edit-guidance", type=float, default=DEFAULT_EDIT_GUIDANCE)
    parser.add_argument(
        "--hold-frames",
        type=int,
        default=DEFAULT_HOLD_FRAMES,
        help="Frames the model should dwell on each quarter-turn pose",
    )
    parser.add_argument(
        "--seam-frames",
        type=int,
        default=DEFAULT_SEAM_FRAMES,
        help="Blend the first frame over the final N frames so the loop closes "
        "pixel-exactly (0 disables)",
    )
    parser.add_argument(
        "--max-cost",
        type=float,
        default=DEFAULT_MAX_COST_USD,
        help="Abort an asset if its summed estimate exceeds this many USD",
    )
    parser.add_argument(
        "--video-prompt-extra",
        default="",
        help="Appended to the cinematography prompt (mood, garment specifics)",
    )
    parser.add_argument(
        "--ffmpeg",
        default=os.environ.get("FFMPEG_PATH", "ffmpeg"),
        help="ffmpeg binary (ffprobe is derived from it)",
    )
    parser.add_argument(
        "--no-edit-fallback",
        action="store_true",
        help="Do not retry refused edit stages on the uncensored edit model",
    )
    parser.add_argument(
        "--keep-build",
        action="store_true",
        help="Keep build intermediates after success (default: keep only on failure)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Normalize, plan and quote — never submit")
    parser.add_argument("--resume", action="store_true", help="Skip stages already completed in build/")
    parser.add_argument(
        "--log-format",
        choices=("rich", "json"),
        default="rich",
        help="rich: human console · json: one JSON event per line on stdout",
    )
    parser.add_argument("--yes", action="store_true", help="Assume yes; reserved for CI")
    return parser


# --------------------------------------------------------------------------- #
# Settings (validated configuration)
# --------------------------------------------------------------------------- #


class Settings(BaseModel):
    input_path: Path
    output_dir: Path
    build_dir: Path
    bg_mode: str = "keep"
    bg_prompt: str | None = None
    bg_preset: str = "limestone"
    garment_prompt: str | None = None
    duration: float = DEFAULT_DURATION
    width: int = PORTRAIT_WIDTH
    height: int = PORTRAIT_HEIGHT
    fps: int = FPS
    seed: int = DEFAULT_SEED
    network: str = DEFAULT_NETWORK
    video_model: str = DEFAULT_VIDEO_MODEL
    loras: tuple[tuple[str, float], ...] = DEFAULT_LORAS
    edit_model: str = DEFAULT_EDIT_MODEL
    edit_steps: int = DEFAULT_EDIT_STEPS
    edit_guidance: float = DEFAULT_EDIT_GUIDANCE
    hold_frames: int = DEFAULT_HOLD_FRAMES
    seam_frames: int = DEFAULT_SEAM_FRAMES
    max_cost_usd: float = DEFAULT_MAX_COST_USD
    video_prompt_extra: str = ""
    ffmpeg: str = "ffmpeg"
    no_edit_fallback: bool = False
    keep_build: bool = False
    dry_run: bool = False
    resume: bool = False
    log_format: str = "rich"
    api_key: str = ""
    app_id: str = ""

    @field_validator("bg_mode")
    @classmethod
    def _bg_mode(cls, value: str) -> str:
        if value not in ("keep", "generate"):
            raise ValueError("bg_mode must be 'keep' or 'generate'")
        return value

    @field_validator("network")
    @classmethod
    def _network(cls, value: str) -> str:
        if value not in ("fast", "relaxed"):
            raise ValueError("network must be 'fast' or 'relaxed'")
        return value

    @field_validator("width", "height")
    @classmethod
    def _grid(cls, value: int) -> int:
        if value < MIN_DIMENSION or value > MAX_DIMENSION:
            raise ValueError(f"dimensions must be within {MIN_DIMENSION}–{MAX_DIMENSION} px")
        return value

    @field_validator("fps")
    @classmethod
    def _fps_fixed(cls, value: int) -> int:
        if value != MINIMAX_H3_FPS:
            raise ValueError(f"MiniMax H3 renders at {MINIMAX_H3_FPS} fps only")
        return value

    @field_validator("duration")
    @classmethod
    def _duration(cls, value: float) -> float:
        if not (H3_MIN_DURATION <= value <= H3_MAX_DURATION):
            raise ValueError(
                f"duration must be between {H3_MIN_DURATION:.3f} and "
                f"{H3_MAX_DURATION:.3f} seconds for MiniMax H3"
            )
        return value

    @field_validator("hold_frames", "seam_frames")
    @classmethod
    def _non_negative(cls, value: int) -> int:
        if value < 0:
            raise ValueError("hold_frames/seam_frames must be >= 0")
        return value

    @field_validator("edit_steps")
    @classmethod
    def _edit_steps(cls, value: int) -> int:
        if not 1 <= value <= 50:
            raise ValueError("edit_steps must be 1–50")
        return value

    @field_validator("edit_guidance")
    @classmethod
    def _edit_guidance(cls, value: float) -> float:
        if not 1.0 <= value <= 12.0:
            raise ValueError("edit_guidance must be 1.0–12.0")
        return value

    @field_validator("max_cost_usd")
    @classmethod
    def _max_cost(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("max_cost must be positive")
        return value

    @property
    def canvas(self) -> tuple[int, int]:
        """(width, height) snapped to the MiniMax H3 canvas rules.

        32-px grid on both axes, each axis ≤ MINIMAX_H3_MAX_DIMENSION, total
        pixels ≤ MINIMAX_H3_MAX_PIXELS (aspect ratio roughly preserved while
        shedding area).
        """
        step = MINIMAX_H3_DIMENSION_STEP
        grid_max = (MINIMAX_H3_MAX_DIMENSION // step) * step  # 1344
        width = max(step, min((self.width // step) * step, grid_max))
        height = max(step, min((self.height // step) * step, grid_max))
        while width * height > MINIMAX_H3_MAX_PIXELS and width > step and height > step:
            width = max(step, width - step)
            height = max(step, height - step)
        return width, height

    def total_frames(self) -> int:
        """Exact MiniMax H3 frame count for the requested duration (SDK-snapped)."""
        return calculate_video_frames(self.video_model, self.duration, self.fps)

    def background_prompt(self, subject: str = "the model") -> str:
        environment = self.bg_prompt or BACKGROUND_PRESETS.get(self.bg_preset, BACKGROUND_PRESETS["limestone"])
        garment = self.garment_prompt or "the outfit exactly as worn in the reference"
        return BACKGROUND_EDIT_PROMPT.format(
            subject=subject,
            environment=environment,
            identity=IDENTITY_KEEP,
            garment=garment,
        )

    def angle_prompt(self, angle: int, environment_keep: str) -> str:
        garment = self.garment_prompt or "the outfit exactly as worn in the reference"
        return ANGLE_EDIT_PROMPT.format(
            identity=IDENTITY_KEEP,
            garment=garment,
            angle=ANGLE_PROMPTS[angle],
            environment_keep=environment_keep,
        )

    def video_prompt(self) -> str:
        return VIDEO_PROMPT.format(extra=f". {self.video_prompt_extra}" if self.video_prompt_extra else "")


def build_settings(args: argparse.Namespace) -> Settings:
    """CLI + environment → validated Settings."""
    env_defaults = {
        "video_model": os.environ.get("SOGNI_TURNTABLE_VIDEO_MODEL", DEFAULT_VIDEO_MODEL),
        "edit_model": os.environ.get("SOGNI_TURNTABLE_EDIT_MODEL", DEFAULT_EDIT_MODEL),
        "network": os.environ.get("SOGNI_TURNTABLE_NETWORK", DEFAULT_NETWORK),
    }
    seed_env = os.environ.get("SOGNI_TURNTABLE_SEED")
    lora_env = os.environ.get("SOGNI_TURNTABLE_LORAS", "").strip()
    loras = DEFAULT_LORAS
    if lora_env:
        try:
            loras = tuple(
                (p, float(s)) for p, s in (
                    (lambda part: (part.split(":")[0].strip(), float(part.split(":")[1]) if ":" in part else 0.8))(part)
                    for part in lora_env.split(",") if part.strip()
                )
            )
        except (ValueError, IndexError):
            raise PipelineUsageError(f"SOGNI_TURNTABLE_LORAS must be slug:strength pairs, got {lora_env!r}") from None
    if args.lora:
        parsed: list[tuple[str, float]] = []
        for spec in args.lora:
            slug, _, strength = spec.partition(":")
            slug = slug.strip()
            if not slug:
                raise PipelineUsageError(f"--lora needs a slug, got {spec!r}")
            try:
                parsed.append((slug, float(strength) if strength else 0.8))
            except ValueError:
                raise PipelineUsageError(f"--lora strength must be a number, got {spec!r}") from None
        loras = tuple(parsed)
    payload: dict[str, Any] = {
        "input_path": args.input,
        "output_dir": args.output_dir,
        "build_dir": args.build_dir,
        "bg_mode": args.bg_mode,
        "bg_prompt": args.bg_prompt,
        "bg_preset": args.bg_preset,
        "garment_prompt": args.garment_prompt,
        "duration": args.duration,
        "width": args.width,
        "height": args.height,
        "fps": args.fps,
        "seed": args.seed if args.seed is not None else (
            int(seed_env) if (seed_env or "").strip().lstrip("-").isdigit() else DEFAULT_SEED
        ),
        "network": args.network if args.network != DEFAULT_NETWORK else env_defaults["network"],
        "video_model": args.video_model if args.video_model != DEFAULT_VIDEO_MODEL else env_defaults["video_model"],
        "loras": loras,
        "edit_model": args.edit_model or env_defaults["edit_model"],
        "edit_steps": args.edit_steps,
        "edit_guidance": args.edit_guidance,
        "hold_frames": args.hold_frames,
        "seam_frames": args.seam_frames,
        "max_cost_usd": args.max_cost,
        "video_prompt_extra": args.video_prompt_extra,
        "ffmpeg": args.ffmpeg,
        "no_edit_fallback": args.no_edit_fallback,
        "keep_build": args.keep_build,
        "dry_run": args.dry_run,
        "resume": args.resume,
        "log_format": args.log_format,
        "api_key": os.environ.get("SOGNI_API_KEY", "").strip(),
        "app_id": load_or_create_app_id(),
    }
    settings = Settings(**payload)
    if settings.video_model not in VIDEO_MODEL_CHOICES and not settings.video_model.startswith("minimax-h3-"):
        raise PipelineUsageError(
            f"--video-model must be a MiniMax H3 flf2v id, got {settings.video_model!r}"
        )
    width, height = settings.canvas
    if (width, height) != (settings.width, settings.height):
        # Re-validated silently: the canvas snap keeps H3 admission happy.
        settings = settings.model_copy(update={"width": width, "height": height})
    return settings


# --------------------------------------------------------------------------- #
# Pose planning — pure math, exact at 24 fps
# --------------------------------------------------------------------------- #

POSE_LABELS: dict[int, str] = {
    0: "front",
    90: "right_profile",
    180: "back",
    270: "left_profile",
    360: "front_return",
}


@dataclasses.dataclass(frozen=True)
class PoseMark:
    angle: int          # 0 / 90 / 180 / 270 / 360 (360 == loop-closed return)
    label: str
    frame: int          # first frame of the pose hold
    hold_frames: int    # frames dwelling on the pose (rotation resumes after)


@dataclasses.dataclass(frozen=True)
class PosePlan:
    total_frames: int
    fps: int
    marks: tuple[PoseMark, ...]

    @property
    def keyframe_marks(self) -> tuple[PoseMark, ...]:
        """The three intermediate poses (90/180/270) injected into the video job."""
        return tuple(mark for mark in self.marks if mark.angle in (90, 180, 270))

    def hold_window(self, mark: PoseMark) -> tuple[int, int]:
        """Inclusive-exclusive [start, end) of the pose hold ending before the next mark."""
        index = self.marks.index(mark)
        nxt = self.marks[index + 1] if index + 1 < len(self.marks) else None
        end = nxt.frame if nxt is not None else self.total_frames
        return mark.frame, min(end, mark.frame + mark.hold_frames)


def js_round(value: float) -> int:
    """JavaScript Math.round (half-up) — matches the SDK's wire math exactly."""
    return math.floor(value + 0.5)


def plan_poses(total_frames: int, fps: int = FPS, hold_frames: int = DEFAULT_HOLD_FRAMES) -> PosePlan:
    """Distribute 0/90/180/270 pose anchors across ``total_frames`` at 24 fps.

    MiniMax H3 pins keyframe indices in ``1 .. total_frames-2`` (frame 0 and the
    final frame belong to referenceImage/referenceImageEnd), all distinct. The
    anchors sit at the quarter points; hold windows are capped so neighbouring
    holds can never overlap.
    """
    if total_frames < MINIMAX_H3_MIN_FRAMES:
        raise PipelineError(f"total_frames {total_frames} is below the H3 minimum")
    last_index = total_frames - 1

    def clamp_anchor(raw: float, floor: int) -> int:
        return max(floor + 1, min(last_index - 1, js_round(raw)))

    quarter = total_frames / 4.0
    f90 = clamp_anchor(quarter, 0)
    f180 = clamp_anchor(2 * quarter, f90)
    f270 = clamp_anchor(3 * quarter, f180)
    # De-dupe defensively (never expected with N ≥ 124, but never send a dup).
    if not (f90 < f180 < f270):
        f90, f180, f270 = sorted({f90, f180, f270, max(1, f90), min(last_index - 1, f270 + 1)})[:3]
        f90, f180, f270 = sorted({f90, f180, f270})

    gaps = (f90 - 0, f180 - f90, f270 - f180, last_index - f270)
    effective_hold = max(0, min(hold_frames, min(gaps) - 2))
    marks = (
        PoseMark(0, POSE_LABELS[0], 0, effective_hold),
        PoseMark(90, POSE_LABELS[90], f90, effective_hold),
        PoseMark(180, POSE_LABELS[180], f180, effective_hold),
        PoseMark(270, POSE_LABELS[270], f270, effective_hold),
        PoseMark(360, POSE_LABELS[360], last_index, 0),
    )
    return PosePlan(total_frames=total_frames, fps=fps, marks=marks)


def keyframes_for_api(plan: PosePlan, keyframe_paths: dict[int, Path]) -> list[dict[str, Any]]:
    """MiniMax H3 ``keyframes`` entries — camelCase inside each entry (the SDK
    normalizes only top-level parameter keys)."""
    entries: list[dict[str, Any]] = []
    for mark in plan.keyframe_marks:
        path = keyframe_paths.get(mark.angle)
        if path is None:
            raise PipelineError(f"missing keyframe image for {mark.angle}°")
        entries.append({"image": str(path), "frameIndex": mark.frame})
    return entries


def timecode(seconds: float) -> str:
    total_ms = int(round(seconds * 1000))
    hours, rem = divmod(total_ms, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{ms:03d}"


def manifest_poses(plan: PosePlan) -> list[dict[str, Any]]:
    """Exact pose markers for the storefront hover UI (seconds + frame numbers)."""
    out: list[dict[str, Any]] = []
    for mark in plan.marks:
        start, end = plan.hold_window(mark)
        out.append(
            {
                "angle": mark.angle,
                "label": mark.label,
                "frame": mark.frame,
                "time_s": round(mark.frame / plan.fps, 4),
                "timecode": timecode(mark.frame / plan.fps),
                "hold_frames": mark.hold_frames,
                "hold": {"start_frame": start, "end_frame": end,
                         "start_s": round(start / plan.fps, 4),
                         "end_s": round(end / plan.fps, 4)},
            }
        )
    return out


def frames_for_duration(model_id: str, duration: float, fps: int = FPS) -> int:
    """Frame count the SDK will submit for ``duration`` (H3 snaps to 124+n·17)."""
    duration = min(max(duration, H3_MIN_DURATION), H3_MAX_DURATION)
    return calculate_video_frames(model_id, duration, fps)


# --------------------------------------------------------------------------- #
# Image normalization (Pillow)
# --------------------------------------------------------------------------- #


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_image(src: Path, dst: Path, width: int, height: int) -> dict[str, Any]:
    """EXIF-rotate, flatten, cover-crop and resize to the exact generation canvas.

    Writes a PNG whose pixel grid matches the video canvas so Sogni's first/last
    frame and keyframe references align 1:1 with rendered output.
    """
    dst.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(src) as opened:
        image = ImageOps.exif_transpose(opened)
        if image.mode in ("RGBA", "LA", "P"):
            image = image.convert("RGBA")
            flattened = Image.new("RGB", image.size, (17, 14, 16))
            flattened.paste(image, mask=image.split()[-1])
            image = flattened
        else:
            image = image.convert("RGB")
        scale = max(width / image.width, height / image.height)
        resized = image.resize(
            (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
            Image.LANCZOS,
        )
        left = (resized.width - width) // 2
        top = (resized.height - height) // 2
        cropped = resized.crop((left, top, left + width, top + height))
        cropped.save(dst, format="PNG", compress_level=6)
    return {
        "source": str(src),
        "file": str(dst),
        "width": width,
        "height": height,
        "bytes": dst.stat().st_size,
        "sha256": sha256_file(dst),
    }


# --------------------------------------------------------------------------- #
# ffmpeg / ffprobe
# --------------------------------------------------------------------------- #


@dataclasses.dataclass(frozen=True)
class VideoProbe:
    width: int
    height: int
    frames: int | None
    fps: float
    duration: float | None


def parse_probe_json(text: str, path: Path) -> VideoProbe:
    """Parse ffprobe JSON — pure function so tests can exercise it directly."""
    try:
        payload = json.loads(text or "{}")
    except json.JSONDecodeError as exc:
        raise FfmpegError("ffprobe", [], 1, f"unparseable probe output for {path}: {exc}") from exc
    streams = payload.get("streams") or []
    if not streams:
        raise FfmpegError("ffprobe", [], 1, f"no video stream found in {path}")

    def rate(value: Any) -> float:
        if not value or value == "0/0":
            return 0.0
        num, _, den = str(value).partition("/")
        try:
            denominator = float(den) if den else 1.0
            return float(num) / denominator if denominator else 0.0
        except (ValueError, ZeroDivisionError):
            return 0.0

    stream = streams[0]
    frames: int | None
    raw_frames = stream.get("nb_frames")
    if raw_frames and str(raw_frames).isdigit():
        frames = int(raw_frames)
    else:
        frames = None
    fps = rate(stream.get("avg_frame_rate")) or rate(stream.get("r_frame_rate"))
    duration: float | None = None
    if stream.get("duration"):
        with contextlib.suppress(ValueError):
            duration = float(stream["duration"])
    if frames is None and duration is not None and fps > 0:
        frames = js_round(duration * fps)
    if frames is None:
        raise FfmpegError("ffprobe", [], 1, f"cannot determine frame count for {path}")
    return VideoProbe(
        width=int(stream.get("width") or 0),
        height=int(stream.get("height") or 0),
        frames=frames,
        fps=fps,
        duration=duration,
    )


def build_normalize_args(src: Path, dst: Path, frames: int, fps: int,
                         width: int, height: int, pad_frames: int) -> list[str]:
    """ CFR 24 fps → canvas scale → clone-pad if short → trim to exactly ``frames``."""
    chain = [f"fps={fps}", f"scale={width}:{height}:flags=lanczos", "setsar=1"]
    if pad_frames > 0:
        chain.append(f"tpad=stop_mode=clone:stop_duration={pad_frames / fps:.6f}")
    return [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(src),
        "-vf", ",".join(chain),
        "-frames:v", str(frames),
        "-c:v", "libx264", "-preset", "medium", "-crf", "10",
        "-pix_fmt", "yuv420p", "-an",
        str(dst),
    ]


def build_seam_args(src: Path, first_frame: Path, dst: Path, frames: int,
                    fps: int, seam_frames: int) -> list[str]:
    """Blend the first frame over the tail so frame N-1 equals frame 0 exactly."""
    start = (frames - seam_frames) / fps
    span = seam_frames / fps
    return [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(src),
        "-loop", "1", "-i", str(first_frame),
        "-filter_complex",
        f"[1:v]format=rgba,fade=t=in:st={start:.6f}:d={span:.6f}:alpha=1[fg];"
        f"[0:v][fg]overlay=0:0:format=auto[out]",
        "-map", "[out]",
        "-frames:v", str(frames),
        "-c:v", "libx264", "-preset", "medium", "-crf", "10",
        "-pix_fmt", "yuv420p", "-an",
        str(dst),
    ]


def build_encode_mp4_args(src: Path, dst: Path) -> list[str]:
    return [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(src),
        "-c:v", "libx264", "-preset", "slow", "-crf", "20",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
        str(dst),
    ]


def build_encode_webm_args(src: Path, dst: Path) -> list[str]:
    return [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(src),
        "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32",
        "-row-mt", "1", "-deadline", "good", "-cpu-used", "2",
        "-pix_fmt", "yuv420p", "-an",
        str(dst),
    ]


def build_still_args(src: Path, dst: Path, frame: int) -> list[str]:
    return [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(src),
        "-vf", f"select=eq(n\\,{frame})",
        "-frames:v", "1",
        str(dst),
    ]


def seam_rms(first: Path, last: Path) -> float:
    """Root-mean-square pixel difference between the loop's first and last frame.

    0.0 means the loop closes pixel-exactly — the number the manifest reports
    and the web hover player can trust.
    """
    with Image.open(first) as a, Image.open(last) as b:
        if a.size != b.size:
            return 255.0
        diff = ImageChops.difference(a.convert("RGB"), b.convert("RGB"))
        channels = ImageStat.Stat(diff).rms
        return round(math.sqrt(sum(c * c for c in channels) / len(channels)), 4)


class FfmpegTool:
    """Subprocess wrapper — strict error checking, no shell, no stubs."""

    def __init__(self, binary: str = "ffmpeg", log: Logger | None = None) -> None:
        self.binary = binary
        self.log = log
        probe: Path = Path("ffprobe")
        binary_path = Path(binary)
        if binary_path.name not in ("ffmpeg", ".") and binary_path.parent != Path("."):
            candidate = binary_path.parent / "ffprobe"
            if candidate.exists():
                probe = candidate
        self.probe_binary = str(probe)

    def available(self) -> tuple[bool, str]:
        for name in (self.binary, self.probe_binary):
            found = shutil.which(name) if Path(name).stem == Path(name).name else Path(name).exists()
            if not found:
                return False, f"{name} not found (install ffmpeg or set --ffmpeg / FFMPEG_PATH)"
        return True, "ok"

    def _run(self, args: list[str]) -> None:
        try:
            completed = subprocess.run(
                args,
                check=True,
                capture_output=True,
                text=True,
                timeout=900,
            )
        except subprocess.CalledProcessError as exc:
            raise FfmpegError(args[0], args, exc.returncode, exc.stderr or "") from exc
        except subprocess.TimeoutExpired as exc:
            raise FfmpegError(args[0], args, 124, f"timed out after 900s: {exc}") from exc
        if self.log is not None:
            self.log.event("ffmpeg", "run", cmd=_shlex(args[1:]), ok=True)
        return completed

    def probe(self, path: Path) -> VideoProbe:
        args = [
            self.probe_binary, "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,nb_frames,avg_frame_rate,r_frame_rate,duration",
            "-of", "json", str(path),
        ]
        try:
            completed = subprocess.run(args, check=True, capture_output=True, text=True, timeout=120)
        except subprocess.CalledProcessError as exc:
            raise FfmpegError(self.probe_binary, args, exc.returncode, exc.stderr or "") from exc
        return parse_probe_json(completed.stdout, path)

    def normalize(self, src: Path, dst: Path, frames: int, width: int, height: int) -> VideoProbe:
        source = self.probe(src)
        src_frames = source.frames or js_round((source.duration or 0.0) * FPS)
        pad = max(0, frames - src_frames)
        self._run(build_normalize_args(src, dst, frames, FPS, width, height, pad))
        return self.probe(dst)

    def seam_blend(self, src: Path, first_frame: Path, dst: Path, frames: int, seam_frames: int) -> None:
        if seam_frames <= 0:
            shutil.copyfile(src, dst)
            return
        self._run(build_seam_args(src, first_frame, dst, frames, FPS, seam_frames))

    def encode_pair(self, src: Path, mp4: Path, webm: Path) -> None:
        self._run(build_encode_mp4_args(src, mp4))
        self._run(build_encode_webm_args(src, webm))

    def still(self, src: Path, dst: Path, frame: int) -> None:
        self._run(build_still_args(src, dst, frame))


import shutil  # noqa: E402  (kept late so the module header stays import-light)


# --------------------------------------------------------------------------- #
# Resilient HTTP + retry machinery
# --------------------------------------------------------------------------- #

RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504}


def is_retryable(err: BaseException) -> bool:
    """Transient-only classification — validation/refusal errors never retry."""
    if isinstance(err, ApiError):
        if err.retry_after is not None:
            return True
        status = getattr(err, "status", None)
        return status in RETRYABLE_STATUS
    if isinstance(err, ProjectError):
        return False  # a settled render failure is a fact, not a hiccup
    return isinstance(
        err,
        (
            asyncio.TimeoutError,
            ConnectionError,
            TimeoutError,
            OSError,
            aiohttp.ClientError,
        ),
    )


async def backoff_call(
    fn: Callable[[], Awaitable[Any]],
    *,
    what: str,
    log: Logger,
    attempts: int = 4,
    base_delay: float = 2.0,
    max_delay: float = 30.0,
) -> Any:
    """Exponential backoff with jitter for transient failures only.

    Server-provided ``ApiError.retry_after`` always wins over the computed delay.
    """
    last_error: BaseException | None = None
    for attempt in range(1, attempts + 1):
        try:
            return await fn()
        except Exception as exc:  # noqa: BLE001 — classified below
            if not is_retryable(exc) or attempt == attempts:
                raise
            last_error = exc
            retry_after = getattr(exc, "retry_after", None)
            if retry_after:
                # The server said exactly how long to wait — no jitter, no cap.
                delay = float(retry_after)
            else:
                delay = min(max_delay, base_delay * (2 ** (attempt - 1)))
                delay *= 0.5 + random.random()  # jitter on computed delays only
            log.warn(
                "retry", "transient-error",
                what=what, attempt=attempt, delay_s=round(delay, 2),
                error=f"{type(exc).__name__}: {exc}",
            )
            await asyncio.sleep(delay)
    raise RuntimeError(f"unreachable: {what}")  # pragma: no cover


class HttpClient:
    """aiohttp downloader with streaming writes + the same transient retry policy."""

    def __init__(self, log: Logger) -> None:
        self.log = log
        self._session: aiohttp.ClientSession | None = None

    async def __aenter__(self) -> "HttpClient":
        self._session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=600, connect=30),
            headers={"User-Agent": "LadyLuxe-Turntable/1.0"},
        )
        return self

    async def __aexit__(self, *exc: Any) -> None:
        if self._session is not None:
            await self._session.close()
            self._session = None

    async def download(self, url: str, dest: Path, attempts: int = 4) -> Path:
        if self._session is None:
            raise PipelineError("HttpClient used outside its context")
        dest.parent.mkdir(parents=True, exist_ok=True)

        async def once() -> None:
            async with self._session.get(url) as response:  # type: ignore[union-attr]
                if response.status >= 400:
                    raise ApiError(
                        response.status,
                        {"message": f"download failed with HTTP {response.status}", "url": url},
                    )
                with dest.open("wb") as fh:
                    async for chunk in response.content.iter_chunked(1 << 20):
                        fh.write(chunk)

        await backoff_call(once, what=f"download {url[:96]}", log=self.log, attempts=attempts)
        return dest


# --------------------------------------------------------------------------- #
# Sogni gateway — the only place that talks to the SDK
# --------------------------------------------------------------------------- #


@dataclasses.dataclass(frozen=True)
class CostQuote:
    spark: float
    usd: float
    sogni: float
    token: str
    estimated_total_seconds: float | None = None

    @classmethod
    def from_cost(cls, cost: dict[str, Any]) -> "CostQuote":
        def fnum(value: Any) -> float:
            try:
                return float(value)
            except (TypeError, ValueError):
                return 0.0

        return cls(
            spark=fnum(cost.get("spark")),
            usd=fnum(cost.get("usd")),
            sogni=fnum(cost.get("sogni")),
            token=str(cost.get("token") or "spark"),
            estimated_total_seconds=(
                float(cost["estimatedTotalSeconds"])
                if cost.get("estimatedTotalSeconds") is not None
                else None
            ),
        )

    def as_manifest(self) -> dict[str, Any]:
        return {
            "spark": self.spark,
            "usd": self.usd,
            "sogni": self.sogni,
            "token": self.token,
            "estimated_total_seconds": self.estimated_total_seconds,
        }


class GenerationGateway:
    """Thin, fully-typed wrapper over sogni-client.

    Every paid project is registered on submission so a SIGINT/SIGTERM can cancel
    exactly what is still active server-side (``project.cancel()`` — never a
    client-side timeout abandonment). All remote calls run through
    :func:`backoff_call`; refusals and settled failures are never retried.
    """

    def __init__(
        self, settings: Settings, log: Logger, client: SogniClient, http: "HttpClient"
    ) -> None:
        self.settings = settings
        self.log = log
        self.client = client
        self.http = http
        self.projects = client.projects
        self._active: dict[str, Any] = {}

    @classmethod
    async def connect(
        cls, settings: Settings, log: Logger, http: "HttpClient"
    ) -> "GenerationGateway":
        client = await SogniClient.create(
            api_key=settings.api_key,
            app_id=settings.app_id,
            network=settings.network,
            app_source="lady-luxe-turntable",
        )
        gateway = cls(settings, log, client, http)
        with contextlib.suppress(Exception):
            await client.account.me()  # populate balance; non-fatal if it lags
        return gateway

    async def close(self) -> None:
        with contextlib.suppress(Exception):
            await self.client.aclose()

    # -- account ------------------------------------------------------------

    def balance_spark(self) -> float | None:
        try:
            net = self.client.current_account.balance().get("spark", {}).get("net")
            return float(net) if net is not None else None
        except (AttributeError, TypeError, ValueError):
            return None

    # -- estimates ----------------------------------------------------------

    async def estimate_edit(self, steps: int, guidance: float) -> CostQuote:
        """Quote one identity-edit image at the pipeline canvas."""

        async def call() -> CostQuote:
            cost = await self.projects.estimate_cost(
                token_type="spark",
                model=self.settings.edit_model,
                image_count=1,
                step_count=steps,
                preview_count=0,
                width=self.settings.width,
                height=self.settings.height,
                guidance=guidance,
                context_images=1,
                network=self.settings.network,
            )
            return CostQuote.from_cost(cost)

        return await backoff_call(call, what="estimate_edit", log=self.log)

    async def estimate_video(self, frames: int, keyframe_count: int) -> CostQuote:
        width, height = self.settings.width, self.settings.height

        async def call() -> CostQuote:
            cost = await self.projects.estimate_video_cost(
                token_type="spark",
                model=self.settings.video_model,
                width=width,
                height=height,
                frames=frames,
                fps=self.settings.fps,
                keyframe_count=keyframe_count,
                number_of_media=1,
                network=self.settings.network,
            )
            return CostQuote.from_cost(cost)

        return await backoff_call(call, what="estimate_video", log=self.log)

    # -- project lifecycle --------------------------------------------------

    def _register(self, project: Any) -> None:
        self._active[project.id] = project

    def _unregister(self, project_id: str) -> None:
        self._active.pop(project_id, None)

    async def cancel_all(self) -> int:
        """Cancel every still-active project. Returns how many were cancelled."""
        cancelled = 0
        for project_id, project in list(self._active.items()):
            try:
                await project.cancel()
                cancelled += 1
                self.log.warn("cancel", "project-cancelled", project_id=project_id)
            except Exception as exc:  # noqa: BLE001 — best-effort cancellation
                self.log.warn(
                    "cancel", "cancel-failed", project_id=project_id, error=str(exc)
                )
            finally:
                self._unregister(project_id)
        return cancelled

    async def _wait_with_stop(
        self, project: Any, stop: asyncio.Event | None
    ) -> list[str] | None:
        """Await a render. Returns None only when ``stop`` fired.

        No client-side timeout wraps the render: a wait() timeout does NOT stop
        the Supernet job, so the only thing that stops a project here is a real
        signal, which then cancels it server-side.
        """
        wait_task: asyncio.Task[Any] = asyncio.create_task(project.wait_for_completion())
        stop_task: asyncio.Task[Any] | None = None
        if stop is not None:
            stop_task = asyncio.create_task(stop.wait())
        try:
            if stop_task is None:
                return await wait_task
            done, _pending = await asyncio.wait(
                {wait_task, stop_task}, return_when=asyncio.FIRST_COMPLETED
            )
            if stop_task in done and wait_task not in done:
                wait_task.cancel()
                with contextlib.suppress(BaseException):
                    await wait_task
                return None
            return await wait_task
        finally:
            if stop_task is not None:
                stop_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await stop_task

    async def _download_result(self, project: Any, dest: Path) -> Path:
        """Fetch the single rendered asset — signed URL first, property fallback."""
        jobs = list(project.jobs)
        url: str | None = None
        if jobs:
            url = await jobs[0].get_result_url()
        if not url:
            urls = list(project.result_urls)
            url = urls[0] if urls else None
        if not url:
            withheld = any(
                bool(getattr(job, "is_nsfw", False))
                or bool(getattr(job, "_data", {}).get("sensitiveContentWithheld"))
                for job in jobs
            )
            if withheld:
                raise PipelineError(
                    "Sogni's account-level Sensitive Content Filter withheld the "
                    "result. Disable it in your Sogni account settings "
                    "(portal -> account -> content) and re-run this job."
                )
            raise PipelineError(
                f"project {project.id} completed without a result URL "
                f"(status={project.status}, error={project.error})"
            )
        if jobs and jobs[0].nsfw_detected:
            raise ProjectError({"code": "nsfw_detected", "message": "result withheld"})
        return await self.http.download(url, dest)

    # -- stages -------------------------------------------------------------

    async def edit_image(
        self,
        *,
        prompt: str,
        negative_prompt: str,
        context_path: Path,
        dest: Path,
        seed: int,
        steps: int,
        guidance: float,
        stop: asyncio.Event | None = None,
        model_override: str | None = None,
    ) -> Path:
        """Stage A/B: identity-preserving edit (background or angle pose)."""
        model = model_override or self.settings.edit_model
        dest.parent.mkdir(parents=True, exist_ok=True)

        async def submit() -> Project:
            project = await self.projects.create(
                type="image",
                model_id=model,
                positive_prompt=prompt,
                negative_prompt=negative_prompt,
                number_of_media=1,
                number_of_previews=0,
                steps=steps,
                guidance=guidance,
                width=self.settings.width,
                height=self.settings.height,
                output_format="png",
                seed=seed,
                context_images=[str(context_path)],
                network=self.settings.network,
            )
            self._register(project)
            return project

        project = None
        try:
            project = await backoff_call(submit, what="edit submit", log=self.log)
            urls = await self._wait_with_stop(project, stop)
            if urls is None:
                raise OperationCancelled(f"cancelled while editing ({model})")
            await self._download_result(project, dest)
        except ProjectError as exc:
            if (
                self._is_refusal(exc)
                and not self.settings.no_edit_fallback
                and model == self.settings.edit_model
                and self.settings.edit_model != EDIT_MODEL_FALLBACK
            ):
                self.log.warn(
                    "edit", "consent-refusal-fallback",
                    from_model=model, to_model=EDIT_MODEL_FALLBACK,
                    error=str(exc),
                )
                with contextlib.suppress(Exception):
                    if project is not None:
                        await project.cancel()
                    self._unregister(project.id)
                return await self.edit_image(
                    prompt=prompt,
                    negative_prompt=negative_prompt,
                    context_path=context_path,
                    dest=dest,
                    seed=seed,
                    steps=steps,
                    guidance=guidance,
                    stop=stop,
                    model_override=EDIT_MODEL_FALLBACK,
                )
            raise
        finally:
            if project is not None:
                self._unregister(project.id)
        return dest

    @staticmethod
    def _is_refusal(exc: ProjectError) -> bool:
        if is_model_consent_required_error(exc):
            return True
        text = f"{exc.code or ''} {exc}".lower()
        return any(token in text for token in ("consent", "refus", "policy", "nsfw"))

    async def generate_video(
        self,
        *,
        prompt: str,
        frames: int,
        reference_image: Path,
        reference_image_end: Path,
        keyframes: list[dict[str, Any]],
        dest: Path,
        seed: int,
        stop: asyncio.Event | None = None,
    ) -> Path:
        """Stage C: keyframe-guided H3 first/last-frame render."""
        dest.parent.mkdir(parents=True, exist_ok=True)

        async def submit() -> Project:
            project = await self.projects.create(
                type="video",
                model_id=self.settings.video_model,
                positive_prompt=prompt,
                number_of_media=1,
                number_of_previews=0,
                frames=frames,
                fps=self.settings.fps,
                width=self.settings.width,
                height=self.settings.height,
                reference_image=str(reference_image),
                reference_image_end=str(reference_image_end),
                keyframes=keyframes,
                loras=[slug for slug, _strength in self.settings.loras] or None,
                lora_strengths=[strength for _slug, strength in self.settings.loras] or None,
                seed=seed,
                network=self.settings.network,
            )
            self._register(project)
            return project

        project = await backoff_call(submit, what="video submit", log=self.log)
        try:
            urls = await self._wait_with_stop(project, stop)
            if urls is None:
                raise OperationCancelled("cancelled while rendering video")
            await self._download_result(project, dest)
        finally:
            self._unregister(project.id)
        return dest


# --------------------------------------------------------------------------- #
# Asset discovery + build bookkeeping
# --------------------------------------------------------------------------- #


def discover_inputs(input_path: Path) -> list[Path]:
    """One image → [it]; a directory → every png/jpg/webp inside (sorted)."""
    if input_path.is_file():
        if input_path.suffix.lower() not in IMAGE_EXTENSIONS:
            raise PipelineUsageError(
                f"--input must be a .png/.jpg/.jpeg/.webp file, got {input_path.name}"
            )
        return [input_path]
    if input_path.is_dir():
        found = sorted(
            child
            for child in input_path.iterdir()
            if child.is_file() and child.suffix.lower() in IMAGE_EXTENSIONS
        )
        if not found:
            raise PipelineUsageError(f"no images found in {input_path}")
        return found
    raise PipelineUsageError(f"--input does not exist: {input_path}")


def asset_id_for(source: Path) -> str:
    """Stable per-source identity: stem + 8 hex of the file digest (resume-safe)."""
    stem = re.sub(r"[^A-Za-z0-9_-]+", "_", source.stem).strip("_") or "asset"
    digest = hashlib.sha256(str(source.resolve()).encode("utf-8")).hexdigest()[:8]
    return f"{stem}_{digest}"


def sanitize_stem(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", name).strip("_") or "asset"


class BuildDir:
    """Structured per-asset workspace: normalized/, keyframes/, state, logs."""

    def __init__(self, root: Path, asset_id: str) -> None:
        self.root = root / asset_id
        self.keyframes = self.root / "keyframes"
        self.state_path = self.root / "state.json"
        self.log_path = self.root / "pipeline.log.jsonl"

    def prepare(self) -> None:
        self.keyframes.mkdir(parents=True, exist_ok=True)

    def load_state(self) -> dict[str, Any]:
        if not self.state_path.is_file():
            return {}
        try:
            return json.loads(self.state_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}

    def save_state(self, state: dict[str, Any]) -> None:
        tmp = self.state_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")
        tmp.replace(self.state_path)

    def artifact_ok(self, entry: dict[str, Any] | None) -> bool:
        """A recorded artifact counts only if the file exists and still hashes equal."""
        if not entry:
            return False
        path = Path(entry.get("file", ""))
        if not path.is_file():
            return False
        expected = entry.get("sha256")
        return expected is None or sha256_file(path) == expected


# --------------------------------------------------------------------------- #
# Pipeline
# --------------------------------------------------------------------------- #


class Pipeline:
    """The async state machine. One :meth:`run` handles every discovered asset.

    Stages persist resume state after each step; ``--resume`` skips any stage
    whose recorded artifact still exists and hashes equal. Paid stages always
    quote first and refuse to start above ``--max-cost-usd``.
    """

    def __init__(
        self,
        settings: Settings,
        log: Logger,
        gateway: GenerationGateway | None,
        ffmpeg: FfmpegTool,
        stop: asyncio.Event | None = None,
    ) -> None:
        self.settings = settings
        self.log = log
        self.gateway = gateway
        self.ffmpeg = ffmpeg
        self.stop = stop or asyncio.Event()

    # -- orchestration ------------------------------------------------------

    async def run(self, sources: list[Path]) -> int:
        exit_code = 0
        summary: list[dict[str, Any]] = []
        self.last_summary: list[dict[str, Any]] = summary
        for index, source in enumerate(sources, 1):
            if self.stop.is_set():
                raise OperationCancelled("stopped before next asset")
            self.log.rule(f"[{index}/{len(sources)}] {source.name}")
            try:
                outcome = await self.process_asset(source)
                summary.append(outcome)
            except OperationCancelled:
                raise
            except (PipelineError, SogniError, FfmpegError) as exc:
                self.log.error("asset", "asset-failed", source=str(source), error=str(exc))
                exit_code = 1
            except Exception as exc:  # noqa: BLE001 — one bad asset must not kill the batch
                self.log.error(
                    "asset", "asset-failed-unexpected",
                    source=str(source), error=f"{type(exc).__name__}: {exc}",
                )
                exit_code = 1
        self._print_summary(summary)
        return exit_code

    def _print_summary(self, summary: list[dict[str, Any]]) -> None:
        if not summary or self.log.json_format:
            for item in summary:
                self.log.event("summary", "asset-done", **item)
            return
        table = Table(title="Turntable deliverables")
        for column in ("asset", "frames", "seconds", "mp4", "webm", "loop rms", "spark"):
            table.add_column(column)
        for item in summary:
            table.add_row(
                item.get("asset", "?"),
                str(item.get("frames", "?")),
                f"{item.get('duration_s', 0):.2f}",
                item.get("mp4", "-"),
                item.get("webm", "-"),
                f"{item.get('seam_rms', 0):.2f}",
                f"{item.get('spark', 0):.2f}",
            )
        self.log.console.print(table)

    # -- stages -------------------------------------------------------------

    async def process_asset(self, source: Path) -> dict[str, Any]:
        settings = self.settings
        asset_id = asset_id_for(source)
        build = BuildDir(settings.build_dir, asset_id)
        build.prepare()
        self.log.event("asset", "begin", asset_id=asset_id, source=str(source))

        state = build.load_state() if settings.resume else {}
        stages = state.setdefault("stages", {})

        # ---- Stage 0: normalization (free, always current plan data) -------
        normalized_path = build.root / "normalized.png"
        if settings.resume and build.artifact_ok(stages.get("normalized")):
            normalized_record = stages["normalized"]
            self.log.event("normalize", "resumed", file=normalized_record["file"])
        else:
            normalized_record = normalize_image(source, normalized_path, settings.width, settings.height)
            stages["normalized"] = normalized_record
            build.save_state(state)
            self.log.event("normalize", "done", **normalized_record)

        total_frames = settings.total_frames()
        plan = self._plan_for(total_frames, build, state)

        # ---- Preflight: ffmpeg (only for real runs), gateway for paid stages
        if not settings.dry_run:
            ok, why = self.ffmpeg.available()
            if not ok:
                raise PipelineError(f"ffmpeg unavailable: {why}")
            if self.gateway is None:
                raise PipelineError("no Sogni gateway — cannot submit paid stages")

        master_path = build.keyframes / "master_000.png"
        pose_paths = {angle: build.keyframes / f"pose_{angle:03d}.png" for angle in (90, 180, 270)}

        cost_estimate = await self._quote_and_guard(build, state, plan, pose_paths)
        state["estimate"] = cost_estimate
        build.save_state(state)

        if settings.dry_run:
            self._write_plan(build, state, plan, normalized_record)
            self.log.say("[yellow]dry-run complete — nothing submitted[/yellow]")
            self.log.event("dry-run", "plan-written", asset_id=asset_id)
            return {
                "asset": asset_id,
                "dry_run": True,
                "frames": total_frames,
                "duration_s": round(total_frames / settings.fps, 3),
                "estimate_usd": cost_estimate.get("total_usd"),
                "spark": cost_estimate.get("total_spark", 0),
            }

        assert self.gateway is not None  # guarded above

        # ---- Stage A: background conditioning ------------------------------
        if settings.bg_mode == "generate":
            if settings.resume and build.artifact_ok(stages.get("master")):
                self.log.event("bg", "resumed", file=stages["master"]["file"])
            else:
                balance = self.gateway.balance_spark()
                if balance is not None:
                    self.log.event("bg", "balance", spark=balance)
                await self.gateway.edit_image(
                    prompt=settings.background_prompt(),
                    negative_prompt=NEGATIVE_EDIT_PROMPT,
                    context_path=Path(normalized_record["file"]),
                    dest=master_path,
                    seed=settings.seed,
                    steps=settings.edit_steps,
                    guidance=settings.edit_guidance,
                    stop=self.stop,
                )
                stages["master"] = {"file": str(master_path), "sha256": sha256_file(master_path)}
                build.save_state(state)
                self.log.event("bg", "done", file=str(master_path))
        else:
            master_path = Path(normalized_record["file"])
            stages["master"] = {"file": str(master_path), "sha256": normalized_record["sha256"], "kept": True}
            build.save_state(state)

        # ---- Stage B: quarter-turn keyframes -------------------------------
        environment_keep = (
            "keep the studio environment, lighting and floor exactly as in the "
            "reference image"
            if settings.bg_mode == "generate"
            else "preserve the original environment, floor, shadows and framing "
            "of the reference photo exactly; rotate only the subject"
        )
        for angle in (90, 180, 270):
            record = stages.get("keyframes", {}).get(f"{angle:03d}")
            if settings.resume and build.artifact_ok(record):
                self.log.event("keyframes", "resumed", angle=angle, file=record["file"])
                continue
            await self.gateway.edit_image(
                prompt=settings.angle_prompt(angle, environment_keep),
                negative_prompt=NEGATIVE_EDIT_PROMPT,
                context_path=master_path,
                dest=pose_paths[angle],
                seed=settings.seed,
                steps=settings.edit_steps,
                guidance=settings.edit_guidance,
                stop=self.stop,
            )
            stages.setdefault("keyframes", {})[f"{angle:03d}"] = {
                "file": str(pose_paths[angle]),
                "sha256": sha256_file(pose_paths[angle]),
                "frame": next(m.frame for m in plan.keyframe_marks if m.angle == angle),
            }
            build.save_state(state)
            self.log.event("keyframes", "done", angle=angle, file=str(pose_paths[angle]))

        # ---- Stage C: video -------------------------------------------------
        video_source = build.root / "render_source.mp4"
        video_record = stages.get("video")
        if settings.resume and build.artifact_ok(video_record):
            self.log.event("video", "resumed", file=video_record["file"])
        else:
            api_keyframes = keyframes_for_api(plan, pose_paths)
            balance = self.gateway.balance_spark()
            if balance is not None:
                self.log.event("video", "balance", spark=balance)
            await self.gateway.generate_video(
                prompt=settings.video_prompt(),
                frames=total_frames,
                reference_image=master_path,
                reference_image_end=master_path,
                keyframes=api_keyframes,
                dest=video_source,
                seed=settings.seed,
                stop=self.stop,
            )
            stages["video"] = {"file": str(video_source), "bytes": video_source.stat().st_size}
            build.save_state(state)
            self.log.event("video", "done", file=str(video_source), bytes=video_source.stat().st_size)

        # ---- Stage D: packaging --------------------------------------------
        outcome = await self._package(build, plan, state)
        if not settings.keep_build:
            self.log.event("build", "pruned", dir=str(build.root))
        return outcome

    def _plan_for(self, total_frames: int, build: BuildDir, state: dict[str, Any]) -> PosePlan:
        """Pose plan for the resolved frame count, cached into resume state."""
        plan = plan_poses(total_frames, self.settings.fps, self.settings.hold_frames)
        state["plan"] = {
            "total_frames": plan.total_frames,
            "fps": plan.fps,
            "keyframes": [
                {"angle": mark.angle, "frame": mark.frame, "hold_frames": mark.hold_frames}
                for mark in plan.keyframe_marks
            ],
        }
        return plan

    async def _quote_and_guard(
        self,
        build: BuildDir,
        state: dict[str, Any],
        plan: PosePlan,
        pose_paths: dict[int, Path],
    ) -> dict[str, Any]:
        """Sum the stage quotes; refuse to run past --max-cost. Dry-run safe."""
        if self.gateway is None:
            return {"available": False, "total_usd": 0.0, "total_spark": 0.0}
        steps, guidance = self.settings.edit_steps, self.settings.edit_guidance
        stage_a_quotes = [
            await self.gateway.estimate_edit(steps, guidance)
            for _ in range(1 if self.settings.bg_mode == "generate" else 0)
        ]
        angle_quotes = [await self.gateway.estimate_edit(steps, guidance) for _ in (90, 180, 270)]
        video_quote = await self.gateway.estimate_video(
            plan.total_frames, len(plan.keyframe_marks)
        )
        total_spark = sum(q.spark for q in stage_a_quotes + angle_quotes) + video_quote.spark
        total_usd = sum(q.usd for q in stage_a_quotes + angle_quotes) + video_quote.usd
        quote_record = {
            "available": True,
            "stage_a": [q.as_manifest() for q in stage_a_quotes],
            "angle_edits": [q.as_manifest() for q in angle_quotes],
            "video": video_quote.as_manifest(),
            "total_spark": round(total_spark, 4),
            "total_usd": round(total_usd, 4),
        }
        self.log.event(
            "quote", "estimated",
            total_spark=quote_record["total_spark"],
            total_usd=quote_record["total_usd"],
            video_est_seconds=video_quote.estimated_total_seconds,
        )
        if total_usd > self.settings.max_cost_usd:
            raise PipelineError(
                f"estimated cost ${total_usd:.2f} exceeds --max-cost "
                f"${self.settings.max_cost_usd:.2f}; raise the cap to proceed"
            )
        return quote_record

    def _write_plan(
        self, build: BuildDir, state: dict[str, Any], plan: PosePlan, normalized: dict[str, Any]
    ) -> None:
        plan_payload = {
            "asset": build.root.name,
            "settings": self.settings.model_dump(mode="json"),
            "normalized": normalized,
            "frames": plan.total_frames,
            "fps": plan.fps,
            "duration_s": round(plan.total_frames / plan.fps, 4),
            "poses": manifest_poses(plan),
            "keyframes_for_api": keyframes_for_api(
                plan, {m.angle: Path(f"keyframes/pose_{m.angle:03d}.png") for m in plan.keyframe_marks}
            ),
            "estimate": state.get("estimate"),
        }
        path = build.root / "plan.json"
        path.write_text(json.dumps(plan_payload, indent=2), encoding="utf-8")
        self.log.event("plan", "written", file=str(path))

    # -- Stage D ------------------------------------------------------------

    async def _package(self, build: BuildDir, plan: PosePlan, state: dict[str, Any]) -> dict[str, Any]:
        asset_id = build.root.name
        out_dir = self.settings.output_dir / asset_id
        out_dir.mkdir(parents=True, exist_ok=True)
        stem = sanitize_stem(asset_id)
        mp4_path = out_dir / f"{stem}.mp4"
        webm_path = out_dir / f"{stem}.webm"
        manifest_path = out_dir / "manifest.json"
        source = Path(state["stages"]["video"]["file"])

        if self.settings.resume and mp4_path.is_file() and webm_path.is_file() and manifest_path.is_file():
            self.log.event("package", "resumed", dir=str(out_dir))
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            return {
                "asset": asset_id,
                "frames": manifest.get("video", {}).get("frames"),
                "duration_s": manifest.get("video", {}).get("duration_s"),
                "mp4": str(mp4_path),
                "webm": str(webm_path),
                "seam_rms": manifest.get("loop", {}).get("seam_rms"),
                "spark": (state.get("estimate") or {}).get("total_spark", 0),
            }

        self.log.event("package", "normalize-start", source=str(source))
        mid = build.root / "normalized_cfr.mp4"
        probed_mid = self.ffmpeg.normalize(source, mid, plan.total_frames, self.settings.width, self.settings.height)

        frame0 = build.root / "frame_000.png"
        self.ffmpeg.still(mid, frame0, 0)

        loop = build.root / "loop.mp4"
        self.ffmpeg.seam_blend(mid, frame0, loop, plan.total_frames, self.settings.seam_frames)

        first_still = build.root / "loop_first.png"
        last_still = build.root / "loop_last.png"
        self.ffmpeg.still(loop, first_still, 0)
        self.ffmpeg.still(loop, last_still, plan.total_frames - 1)
        rms = seam_rms(first_still, last_still)

        self.log.event("package", "encoding", mp4=str(mp4_path), webm=str(webm_path))
        self.ffmpeg.encode_pair(loop, mp4_path, webm_path)

        final_probe = self.ffmpeg.probe(mp4_path)
        actual_frames = final_probe.frames or plan.total_frames
        manifest_plan = plan
        if actual_frames != plan.total_frames:
            self.log.warn(
                "package", "frame-count-drift",
                expected=plan.total_frames, actual=actual_frames,
            )
            manifest_plan = plan_poses(actual_frames, self.settings.fps, self.settings.hold_frames)

        manifest = self._build_manifest(
            build=build,
            plan=manifest_plan,
            mp4_path=mp4_path,
            webm_path=webm_path,
            probe=final_probe,
            rms=rms,
            state=state,
        )
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        state["stages"]["delivered"] = {
            "mp4": str(mp4_path), "webm": str(webm_path), "manifest": str(manifest_path),
        }
        build.save_state(state)
        self.log.event(
            "package", "done",
            mp4=str(mp4_path), webm=str(webm_path),
            frames=actual_frames, seam_rms=rms,
        )
        return {
            "asset": asset_id,
            "frames": actual_frames,
            "duration_s": round(actual_frames / self.settings.fps, 3),
            "mp4": str(mp4_path),
            "webm": str(webm_path),
            "seam_rms": rms,
            "spark": (state.get("estimate") or {}).get("total_spark", 0),
        }

    def _build_manifest(
        self,
        *,
        build: BuildDir,
        plan: PosePlan,
        mp4_path: Path,
        webm_path: Path,
        probe: VideoProbe,
        rms: float,
        state: dict[str, Any],
    ) -> dict[str, Any]:
        settings = self.settings
        estimate = state.get("estimate") or {}
        source_record = state.get("stages", {}).get("normalized", {})
        keyframe_records = state.get("stages", {}).get("keyframes", {})
        return {
            "asset": build.root.name,
            "created_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "source": {
                "image": source_record.get("source"),
                "normalized_sha256": source_record.get("sha256"),
            },
            "video": {
                "model": settings.video_model,
                "edit_model": settings.edit_model,
                "network": settings.network,
                "seed": settings.seed,
                "loras": [{"slug": slug, "strength": strength} for slug, strength in settings.loras],
                "fps": probe.fps or settings.fps,
                "frames": probe.frames or plan.total_frames,
                "duration_s": round((probe.frames or plan.total_frames) / settings.fps, 4),
                "width": probe.width or settings.width,
                "height": probe.height or settings.height,
            },
            "poses": manifest_poses(plan),
            "loop": {
                "seam_frames": settings.seam_frames,
                "seam_rms": rms,
                "seamless": rms <= 2.0,
                "first_frame_sha256": sha256_file(build.root / "loop_first.png"),
            },
            "keyframes": {
                str(angle): {
                    "frame": record.get("frame"),
                    "sha256": record.get("sha256"),
                }
                for angle, record in keyframe_records.items()
            },
            "files": {
                "mp4": {
                    "path": mp4_path.name,
                    "bytes": mp4_path.stat().st_size,
                    "sha256": sha256_file(mp4_path),
                },
                "webm": {
                    "path": webm_path.name,
                    "bytes": webm_path.stat().st_size,
                    "sha256": sha256_file(webm_path),
                },
            },
            "cost_estimate": estimate,
            "hover_ui": {
                "play_on": "mouseenter",
                "pause_on": "mouseleave",
                "pause_resumes_position": True,
                "snap_to_pose_ms": [round(p["time_s"] * 1000) for p in manifest_poses(plan)],
            },
        }


# --------------------------------------------------------------------------- #
# Entrypoint
# --------------------------------------------------------------------------- #


async def amain(argv: Sequence[str] | None = None) -> int:
    loop = asyncio.get_running_loop()
    stop = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        with contextlib.suppress(NotImplementedError):
            loop.add_signal_handler(sig, stop.set)

    console = Console(highlight=False)
    try:
        args = build_parser().parse_args(list(argv) if argv is not None else None)
    except SystemExit as exc:
        return int(exc.code or 0)

    load_dotenv([SCRIPT_DIR / ".env", Path.cwd() / ".env"])

    try:
        settings = build_settings(args)
    except (PipelineUsageError, ValueError) as exc:
        console.print(f"[red]usage:[/red] {exc}")
        return 2

    try:
        sources = discover_inputs(settings.input_path)
    except PipelineUsageError as exc:
        console.print(f"[red]usage:[/red] {exc}")
        return 2

    log = Logger(
        console,
        json_format=settings.log_format == "json",
        jsonl_path=settings.build_dir / "pipeline.log.jsonl",
    )
    log.rule(
        f"Lady Luxe turntable — {len(sources)} asset(s) · "
        f"{settings.bg_mode}-mode · {settings.duration:.2f}s @ {settings.fps}fps"
        f"{' · DRY RUN' if settings.dry_run else ''}"
    )

    ffmpeg = FfmpegTool(settings.ffmpeg, log)
    if not settings.dry_run:  # packaging needs ffmpeg; planning does not
        ok, why = ffmpeg.available()
        if not ok:
            console.print(f"[red]preflight failed:[/red] {why}")
            return 1

    # A gateway is created whenever credentials exist — dry-run included —
    # because estimates are free and a dry-run should still show real quotes.
    # Submission calls never fire in dry-run; Pipeline enforces that.
    gateway: GenerationGateway | None = None
    http: HttpClient | None = None
    if not settings.dry_run:
        try:
            settings.api_key = load_api_key()
        except PipelineUsageError as exc:
            console.print(f"[red]credentials:[/red] {exc}")
            return 1
    if settings.api_key:
        http = HttpClient(log)
        await http.__aenter__()
        try:
            gateway = await GenerationGateway.connect(settings, log, http)
        except Exception as exc:  # noqa: BLE001 — connect failures are fatal & explainable
            console.print(f"[red]sogni connect failed:[/red] {type(exc).__name__}: {exc}")
            await http.__aexit__(None, None, None)
            return 1
        balance = gateway.balance_spark()
        if balance is not None and not log.json_format:
            console.print(f"Sogni balance: [bold]{balance:,.2f}[/bold] SPARK")

    pipeline = Pipeline(settings, log, gateway=gateway, ffmpeg=ffmpeg, stop=stop)
    try:
        return await pipeline.run(sources)
    except OperationCancelled:
        log.warn("signal", "cancelling-active-renders")
        if gateway is not None:
            await gateway.cancel_all()
        return 130
    except PipelineUsageError as exc:
        console.print(f"[red]usage:[/red] {exc}")
        return 2
    except (PipelineError, SogniError, FfmpegError) as exc:
        console.print(f"[red]failed:[/red] {exc}")
        return 1
    finally:
        if gateway is not None:
            await gateway.close()
        if http is not None:
            await http.__aexit__(None, None, None)


def main(argv: Sequence[str] | None = None) -> int:
    if sys.platform == "win32":
        # Unix signal handlers above are skipped; a Ctrl+C still surfaces as
        # KeyboardInterrupt through asyncio.run, which amain's callers treat the
        # same as SIGINT (cancellation path).
        pass
    try:
        return asyncio.run(amain(argv))
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
