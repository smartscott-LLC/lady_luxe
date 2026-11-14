"""Tests for generate_turntable.py.

Requires: pytest (plus the module's own requirements). Everything network-bound
is faked: the Sogni gateway is a stub implementing the same interface the
Pipeline consumes, and ffmpeg/ffprobe subprocess calls are monkeypatched.

    pip install -r requirements.txt pytest
    python3 -m pytest tests/ -v
"""

from __future__ import annotations

import asyncio
import json
import math
import subprocess
import sys
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import generate_turntable as gt  # noqa: E402


# --------------------------------------------------------------------------- #
# Frame math at 24 fps
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("n", [124, 141, 158, 175, 192, 209, 226, 243, 260, 277, 294, 311, 328, 345, 362])
def test_plan_poses_valid_h3_keyframe_indices(n: int) -> None:
    plan = gt.plan_poses(n, fps=24, hold_frames=12)
    marks = plan.keyframe_marks
    assert [m.angle for m in marks] == [90, 180, 270]
    frames = [m.frame for m in marks]
    # H3 contract: strictly increasing, inside 1..N-2, all distinct
    assert all(1 <= f <= n - 2 for f in frames)
    assert len(set(frames)) == 3
    assert frames == sorted(frames)
    # quarter-point spacing (±2 rounding tolerance at the clamp edges)
    assert abs(frames[0] - n * 0.25) <= 2
    assert abs(frames[1] - n * 0.50) <= 2
    assert abs(frames[2] - n * 0.75) <= 2


def test_plan_poses_hold_windows_never_overlap() -> None:
    for n in (124, 141, 158, 192, 362):
        plan = gt.plan_poses(n, fps=24, hold_frames=12)
        windows = [plan.hold_window(m) for m in plan.marks[:-1]]
        for (start_a, end_a), (start_b, _end_b) in zip(windows, windows[1:]):
            assert end_a <= start_b, f"overlapping holds at n={n}: {windows}"


def test_plan_poses_hold_cap_shrinks_instead_of_overlapping() -> None:
    plan = gt.plan_poses(124, fps=24, hold_frames=10_000)
    holds = [m.hold_frames for m in plan.marks]
    assert all(h < 31 for h in holds)  # quarter spacing bounds the hold


def test_duration_snapping_matches_sdk_calculate_video_frames() -> None:
    from sogni_client.utils import calculate_video_frames

    for duration, expected in (
        (8.0, 192),          # 8.000 s → exactly 192 = 124 + 4·17
        (6.58, 158),         # SDK docstring example value
        (5.17, 124),         # floor of the grid
        (15.08, 362),        # ceiling of the grid
    ):
        assert gt.frames_for_duration(gt.DEFAULT_VIDEO_MODEL, duration) == expected
        assert calculate_video_frames(gt.DEFAULT_VIDEO_MODEL, duration, 24) == expected


def test_keyframes_for_api_shape_is_camelcase_and_sdk_valid() -> None:
    plan = gt.plan_poses(192, fps=24, hold_frames=12)
    paths = {m.angle: Path(f"/tmp/pose_{m.angle}.png") for m in plan.keyframe_marks}
    entries = gt.keyframes_for_api(plan, paths)
    assert [e["frameIndex"] for e in entries] == [48, 96, 144]
    assert all(set(e) == {"image", "frameIndex"} for e in entries)
    assert all(isinstance(e["frameIndex"], int) for e in entries)
    # edges reserved for referenceImage/referenceImageEnd
    assert all(1 <= e["frameIndex"] <= 190 for e in entries)


def test_keyframes_for_api_requires_every_angle() -> None:
    plan = gt.plan_poses(192)
    with pytest.raises(gt.PipelineError):
        gt.keyframes_for_api(plan, {90: Path("/tmp/a.png")})


# --------------------------------------------------------------------------- #
# Manifest math
# --------------------------------------------------------------------------- #


def test_manifest_pose_timestamps_exact_at_24fps() -> None:
    plan = gt.plan_poses(192, fps=24, hold_frames=12)
    poses = gt.manifest_poses(plan)
    by_angle = {p["angle"]: p for p in poses}
    assert set(by_angle) == {0, 90, 180, 270, 360}
    assert by_angle[0]["frame"] == 0 and by_angle[0]["time_s"] == 0.0
    assert by_angle[90]["time_s"] == 48 / 24 == 2.0
    assert by_angle[180]["time_s"] == 96 / 24 == 4.0
    assert by_angle[270]["time_s"] == 144 / 24 == 6.0
    assert by_angle[360]["frame"] == 191
    assert by_angle[360]["time_s"] == round(191 / 24, 4)
    # timestamps survive a JSON round-trip (they feed the hover UI directly)
    assert json.loads(json.dumps(poses)) == poses


def test_timecode_format() -> None:
    assert gt.timecode(0) == "00:00:00.000"
    assert gt.timecode(191 / 24) == "00:00:07.958"
    assert gt.timecode(3672.5) == "01:01:12.500"


# --------------------------------------------------------------------------- #
# CLI validation
# --------------------------------------------------------------------------- #


def make_args(tmp_path: Path, image: Path, **overrides: Any) -> argparse.Namespace:
    argv = ["--input", str(image)]
    for key, value in overrides.items():
        flag = "--" + key.replace("_", "-")
        if isinstance(value, bool):
            if value:
                argv.append(flag)
        elif value is not None:
            argv += [flag, str(value)]
    args = gt.build_parser().parse_args(argv)
    return args


import argparse  # noqa: E402


def test_cli_rejects_bad_bg_mode() -> None:
    with pytest.raises(SystemExit):
        gt.build_parser().parse_args(["--input", "x.jpg", "--bg-mode", "spin"])


def test_cli_rejects_out_of_range_duration(tmp_path: Path) -> None:
    image = _make_image(tmp_path / "in.jpg")
    args = make_args(tmp_path, image, duration=2.0)  # below H3 minimum ≈5.17 s
    with pytest.raises(ValueError):
        gt.build_settings(args)


def test_cli_seed_env_override(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    image = _make_image(tmp_path / "in.jpg")
    monkeypatch.setenv("SOGNI_TURNTABLE_SEED", "777")
    args = make_args(tmp_path, image)
    settings = gt.build_settings(args)
    assert settings.seed == 777
    args = make_args(tmp_path, image, seed=123)
    settings = gt.build_settings(args)
    assert settings.seed == 123  # explicit flag beats env


def test_cli_canvas_snaps_to_h3_rules(tmp_path: Path) -> None:
    image = _make_image(tmp_path / "in.jpg")
    args = make_args(tmp_path, image, width=800, height=1400)  # not on the 32 grid
    settings = gt.build_settings(args)
    width, height = settings.canvas
    assert width % 32 == 0 and height % 32 == 0
    assert width <= gt.MINIMAX_H3_MAX_DIMENSION and height <= gt.MINIMAX_H3_MAX_DIMENSION
    assert width * height <= gt.MINIMAX_H3_MAX_PIXELS
    assert (settings.width, settings.height) == (width, height)  # snapped in place


def test_discover_inputs_batch(tmp_path: Path) -> None:
    for name in ("a.jpg", "b.PNG", "c.webp", "d.txt", "e.jpeg"):
        _make_image(tmp_path / name)
    found = gt.discover_inputs(tmp_path)
    names = [p.name for p in found]
    assert names == ["a.jpg", "b.PNG", "c.webp", "e.jpeg"]  # d.txt skipped, sorted
    with pytest.raises(gt.PipelineUsageError):
        gt.discover_inputs(tmp_path / "missing-dir")


# --------------------------------------------------------------------------- #
# ffprobe parsing (pure)
# --------------------------------------------------------------------------- #


def test_parse_probe_json_frames_and_rate() -> None:
    payload = json.dumps({
        "streams": [{
            "width": 768, "height": 1024, "nb_frames": "192",
            "avg_frame_rate": "24/1", "r_frame_rate": "24/1", "duration": "8.000000",
        }]
    })
    probe = gt.parse_probe_json(payload, Path("x.mp4"))
    assert (probe.width, probe.height, probe.frames, probe.fps) == (768, 1024, 192, 24.0)


def test_parse_probe_json_derives_frames_from_duration() -> None:
    payload = json.dumps({
        "streams": [{
            "width": 768, "height": 1024, "avg_frame_rate": "24/1", "duration": "6.625",
        }]
    })
    probe = gt.parse_probe_json(payload, Path("x.mp4"))
    assert probe.frames == 159  # js_round(6.625 * 24)


def test_parse_probe_json_rejects_empty() -> None:
    with pytest.raises(gt.FfmpegError):
        gt.parse_probe_json("{\"streams\": []}", Path("x.mp4"))


# --------------------------------------------------------------------------- #
# ffmpeg filter-graph construction
# --------------------------------------------------------------------------- #


def test_normalize_args_pad_and_trim() -> None:
    args = gt.build_normalize_args(Path("s.mp4"), Path("d.mp4"), 192, 24, 768, 1024, 10)
    joined = " ".join(args)
    assert "tpad=stop_mode=clone:stop_duration=0.416667" in joined
    assert "-frames:v 192" in joined
    assert "fps=24" in joined and "scale=768:1024:flags=lanczos" in joined


def test_normalize_args_no_pad_when_long_enough() -> None:
    args = gt.build_normalize_args(Path("s.mp4"), Path("d.mp4"), 192, 24, 768, 1024, 0)
    assert "tpad" not in " ".join(args)


def test_seam_args_blend_tail_into_first_frame() -> None:
    args = gt.build_seam_args(Path("mid.mp4"), Path("f0.png"), Path("loop.mp4"), 192, 24, 4)
    graph = args[args.index("-filter_complex") + 1]
    assert "fade=t=in:st=7.833333:d=0.166667:alpha=1" in graph
    assert "overlay" in graph
    assert "-frames:v 192" in " ".join(args)


def test_encode_args_web_delivery() -> None:
    mp4 = gt.build_encode_mp4_args(Path("in"), Path("out.mp4"))
    webm = gt.build_encode_webm_args(Path("in"), Path("out.webm"))
    mp4_join = " ".join(mp4)
    assert "-c:v libx264" in mp4_join and "-crf 20" in mp4_join
    assert "-pix_fmt yuv420p" in mp4_join and "-movflags +faststart" in mp4_join
    assert "-an" in mp4_join and "-an" in " ".join(webm)
    assert "-c:v libvpx-vp9" in " ".join(webm)


# --------------------------------------------------------------------------- #
# Seam RMS
# --------------------------------------------------------------------------- #


def test_seam_rms_identical_frames_is_zero(tmp_path: Path) -> None:
    a = tmp_path / "a.png"
    b = tmp_path / "b.png"
    Image.new("RGB", (64, 64), (30, 40, 50)).save(a)
    Image.new("RGB", (64, 64), (30, 40, 50)).save(b)
    assert gt.seam_rms(a, b) == 0.0


def test_seam_rms_different_frames_is_positive(tmp_path: Path) -> None:
    a = tmp_path / "a.png"
    b = tmp_path / "b.png"
    Image.new("RGB", (64, 64), (0, 0, 0)).save(a)
    Image.new("RGB", (64, 64), (255, 255, 255)).save(b)
    assert gt.seam_rms(a, b) > 200


# --------------------------------------------------------------------------- #
# Retry classification + backoff
# --------------------------------------------------------------------------- #


def test_retry_classification() -> None:
    assert gt.is_retryable(gt.ApiError(503))
    assert gt.is_retryable(gt.ApiError(429, retry_after_header="3"))
    assert gt.is_retryable(ConnectionError("reset"))
    assert not gt.is_retryable(gt.ApiError(400))
    assert not gt.is_retryable(gt.ProjectError({"code": "failed"}))
    assert not gt.is_retryable(gt.PipelineError("boom"))


def test_backoff_honors_retry_after(monkeypatch: pytest.MonkeyPatch) -> None:
    real_sleep = asyncio.sleep
    sleeps: list[float] = []
    monkeypatch.setattr(gt.asyncio, "sleep", lambda d: sleeps.append(d) or real_sleep(0))
    calls = {"n": 0}

    async def flaky() -> str:
        calls["n"] += 1
        if calls["n"] < 3:
            raise gt.ApiError(429, retry_after_header="7")
        return "ok"

    log = gt.Logger(MagicMock())
    result = asyncio.run(gt.backoff_call(flaky, what="t", log=log, attempts=4))
    assert result == "ok" and calls["n"] == 3
    assert 7.0 in sleeps  # server hint respected over computed backoff


def test_backoff_never_retries_settled_failures() -> None:
    async def doomed() -> None:
        raise gt.ProjectError({"code": "failed", "message": "render exploded"})

    log = gt.Logger(MagicMock())
    with pytest.raises(gt.ProjectError):
        asyncio.run(gt.backoff_call(doomed, what="t", log=log))


# --------------------------------------------------------------------------- #
# Fakes for the pipeline
# --------------------------------------------------------------------------- #


class FakeGateway:
    """Same interface as GenerationGateway — counts submissions, fakes renders."""

    def __init__(self, fail_first_edit: bool = False, stop_mid_render: bool = False) -> None:
        self.edit_calls: list[dict[str, Any]] = []
        self.video_calls: list[dict[str, Any]] = []
        self.cancel_count = 0
        self.closed = False
        self._fail_first_edit = fail_first_edit
        self._stop_mid_render = stop_mid_render
        self._pending: set[str] = set()

    async def connect_init(self) -> None:  # parity with GenerationGateway.connect
        return None

    def balance_spark(self) -> float | None:
        return 925.0

    async def estimate_edit(self, steps: int, guidance: float) -> gt.CostQuote:
        return gt.CostQuote(spark=0.5, usd=0.02, sogni=0.0, token="spark")

    async def estimate_video(self, frames: int, keyframe_count: int) -> gt.CostQuote:
        return gt.CostQuote(spark=2.0, usd=0.08, sogni=0.0, token="spark",
                            estimated_total_seconds=240.0)

    async def edit_image(self, *, prompt: str, negative_prompt: str, context_path: Path,
                         dest: Path, seed: int, steps: int, guidance: float,
                         stop: asyncio.Event | None = None,
                         model_override: str | None = None) -> Path:
        self.edit_calls.append({"prompt": prompt, "dest": str(dest), "seed": seed})
        self._pending.add(str(dest))
        if self._fail_first_edit and len(self.edit_calls) == 1:
            raise gt.ProjectError({"code": "content_policy_refusal", "message": "refused"})
        Image.new("RGB", (768, 1024), (120, 30, 60)).save(dest, format="PNG")
        self._pending.discard(str(dest))
        return dest

    async def generate_video(self, *, prompt: str, frames: int, reference_image: Path,
                             reference_image_end: Path, keyframes: list[dict[str, Any]],
                             dest: Path, seed: int,
                             stop: asyncio.Event | None = None) -> Path:
        self.video_calls.append({"frames": frames, "keyframes": keyframes})
        self._pending.add(str(dest))  # model: a live project sits on the Supernet
        if self._stop_mid_render and stop is not None:
            stop.set()  # simulate SIGINT arriving mid-render
        if stop is not None and stop.is_set():
            raise gt.OperationCancelled("cancelled during render")
        dest.write_bytes(b"fake-mp4-bytes" * 100)
        self._pending.discard(str(dest))
        return dest

    async def cancel_all(self) -> int:
        self.cancel_count += len(self._pending)
        return len(self._pending)

    async def close(self) -> None:
        self.closed = True


class FakeFfmpeg(gt.FfmpegTool):
    """No binaries — records invocations, fakes probes and still extraction."""

    def __init__(self) -> None:
        super().__init__("ffmpeg", log=None)
        self.ran: list[list[str]] = []
        self.force_drift: bool = False

    def available(self) -> tuple[bool, str]:
        return True, "ok"

    def probe(self, path: Path) -> gt.VideoProbe:
        return gt.VideoProbe(width=768, height=1024,
                             frames=None if self.force_drift else 192, fps=24.0,
                             duration=8.0)

    def _record(self, args: list[str]) -> None:
        self.ran.append(args)

    def normalize(self, src: Path, dst: Path, frames: int, width: int, height: int) -> gt.VideoProbe:
        self._record(gt.build_normalize_args(src, dst, frames, 24, width, height, 0))
        dst.write_bytes(b"normalized")
        return self.probe(dst)

    def seam_blend(self, src: Path, first_frame: Path, dst: Path, frames: int,
                   seam_frames: int) -> None:
        self._record(gt.build_seam_args(src, first_frame, dst, frames, 24, seam_frames))
        shutil_copy(src, dst) if seam_frames <= 0 else dst.write_bytes(b"looped")

    def encode_pair(self, src: Path, mp4: Path, webm: Path) -> None:
        self._record(gt.build_encode_mp4_args(src, mp4))
        self._record(gt.build_encode_webm_args(src, webm))
        mp4.write_bytes(b"mp4" * 50)
        webm.write_bytes(b"webm" * 50)

    def still(self, src: Path, dst: Path, frame: int) -> None:
        self._record(gt.build_still_args(src, dst, frame))
        Image.new("RGB", (768, 1024), (20, 20, 20)).save(dst, format="PNG")


import shutil as _shutil  # noqa: E402


def shutil_copy(src: Path, dst: Path) -> None:
    _shutil.copyfile(src, dst)


def _make_image(path: Path, color: tuple[int, int, int] = (180, 150, 160)) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (1200, 1600), color).save(path, format="JPEG", quality=92)
    return path


def make_settings(tmp_path: Path, image: Path, **overrides: Any) -> gt.Settings:
    payload = dict(
        input_path=image,
        output_dir=tmp_path / "output",
        build_dir=tmp_path / "build",
        api_key="test-key",
        app_id="00000000-0000-0000-0000-000000000000",
    )
    payload.update(overrides)
    return gt.Settings(**payload)


# --------------------------------------------------------------------------- #
# Pipeline end-to-end (mocked SDK + mocked ffmpeg)
# --------------------------------------------------------------------------- #


def run_pipeline(settings: gt.Settings, gateway: FakeGateway | None, ffmpeg: FakeFfmpeg,
                 stop: asyncio.Event | None = None) -> tuple[int, list[dict[str, Any]]]:
    log = gt.Logger(MagicMock())
    pipeline = gt.Pipeline(settings, log, gateway=gateway, ffmpeg=ffmpeg,
                           stop=stop or asyncio.Event())
    sources = gt.discover_inputs(settings.input_path)

    async def driven() -> int:
        try:
            return await pipeline.run(sources)
        except gt.OperationCancelled:
            # amain's contract: cancel whatever is still active, exit 130
            await gateway.cancel_all() if gateway else None
            return 130

    code = asyncio.run(driven())
    return code, list(getattr(pipeline, "last_summary", []))


def test_end_to_end_generates_mode(tmp_path: Path) -> None:
    image = _make_image(tmp_path / "garnet_set.jpg")
    settings = make_settings(tmp_path, image, bg_mode="generate", duration=8.0)
    gateway, ffmpeg = FakeGateway(), FakeFfmpeg()
    code, summary = run_pipeline(settings, gateway, ffmpeg)

    assert code == 0
    # Stage A + 3 angle keyframes + 1 video
    assert len(gateway.edit_calls) == 4
    assert len(gateway.video_calls) == 1
    video_call = gateway.video_calls[0]
    assert video_call["frames"] == 192
    assert [k["frameIndex"] for k in video_call["keyframes"]] == [48, 96, 144]

    asset_id = gt.asset_id_for(image)
    out_dir = tmp_path / "output" / asset_id
    stem = gt.sanitize_stem(asset_id)
    assert (out_dir / f"{stem}.mp4").is_file()
    assert (out_dir / f"{stem}.webm").is_file()
    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert manifest["video"]["frames"] == 192
    assert manifest["video"]["fps"] == 24
    poses = {p["angle"]: p for p in manifest["poses"]}
    assert poses[90]["time_s"] == 2.0 and poses[180]["time_s"] == 4.0
    assert poses[270]["time_s"] == 6.0 and poses[360]["frame"] == 191
    assert manifest["hover_ui"]["pause_resumes_position"] is True
    assert manifest["cost_estimate"]["total_usd"] == pytest.approx(4 * 0.02 + 0.08)
    assert summary[0]["frames"] == 192


def test_end_to_end_keep_mode_skips_stage_a(tmp_path: Path) -> None:
    image = _make_image(tmp_path / "keep.jpg")
    settings = make_settings(tmp_path, image, bg_mode="keep")
    gateway, ffmpeg = FakeGateway(), FakeFfmpeg()
    code, _summary = run_pipeline(settings, gateway, ffmpeg)
    assert code == 0
    assert len(gateway.edit_calls) == 3  # angles only; no background edit


def test_cost_guard_aborts_before_submission(tmp_path: Path) -> None:
    image = _make_image(tmp_path / "expensive.jpg")
    settings = make_settings(tmp_path, image, bg_mode="generate", max_cost_usd=0.01)
    gateway, ffmpeg = FakeGateway(), FakeFfmpeg()
    code, _summary = run_pipeline(settings, gateway, ffmpeg)
    assert code == 1
    assert gateway.video_calls == []  # never submitted anything paid


def test_resume_skips_completed_stages(tmp_path: Path) -> None:
    image = _make_image(tmp_path / "resume.jpg")
    settings = make_settings(tmp_path, image, bg_mode="generate")
    gateway, ffmpeg = FakeGateway(), FakeFfmpeg()
    assert run_pipeline(settings, gateway, ffmpeg)[0] == 0
    first_edits = len(gateway.edit_calls)
    first_videos = len(gateway.video_calls)

    resumed = make_settings(tmp_path, image, bg_mode="generate", resume=True)
    code, _summary = run_pipeline(resumed, gateway, FakeFfmpeg())
    assert code == 0
    assert len(gateway.edit_calls) == first_edits      # all keyframes cached
    assert len(gateway.video_calls) == first_videos    # render cached


def test_cancellation_cancels_active_renders(tmp_path: Path) -> None:
    image = _make_image(tmp_path / "cancel.jpg")
    settings = make_settings(tmp_path, image)
    gateway = FakeGateway(stop_mid_render=True)
    ffmpeg = FakeFfmpeg()
    code, _summary = run_pipeline(settings, gateway, ffmpeg)
    assert code == 130  # amain contract: cancelled renders → exit 130
    assert gateway.cancel_count >= 1
    assert len(gateway.video_calls) == 1  # the render started, then was cancelled


def test_asset_failure_does_not_kill_batch(tmp_path: Path) -> None:
    good = _make_image(tmp_path / "good.jpg")
    bad = _make_image(tmp_path / "bad.jpg")
    settings = make_settings(tmp_path, tmp_path)  # directory batch
    gateway = FakeGateway(fail_first_edit=True)   # bad.jpg's first edit refuses
    ffmpeg = FakeFfmpeg()
    code, summary = run_pipeline(settings, gateway, ffmpeg)
    assert code == 1
    assert len(summary) == 1  # good.jpg delivered, bad.jpg logged as failed


def test_dry_run_never_submits(tmp_path: Path) -> None:
    image = _make_image(tmp_path / "dry.jpg")
    settings = make_settings(tmp_path, image, bg_mode="generate", dry_run=True)
    gateway, ffmpeg = FakeGateway(), FakeFfmpeg()
    code, summary = run_pipeline(settings, gateway, ffmpeg)
    assert code == 0
    assert gateway.edit_calls == [] and gateway.video_calls == []
    assert summary[0]["dry_run"] is True
    plan = json.loads(
        (settings.build_dir / gt.asset_id_for(image) / "plan.json").read_text()
    )
    assert plan["frames"] == 192
    assert [p["angle"] for p in plan["poses"]] == [0, 90, 180, 270, 360]


# --------------------------------------------------------------------------- #
# app_id persistence
# --------------------------------------------------------------------------- #


def test_app_id_persisted_and_reused(tmp_path: Path) -> None:
    target = tmp_path / "app_id"
    first = gt.load_or_create_app_id(target)
    assert len(first) == 36 and first.count("-") == 4  # UUID shape
    assert gt.load_or_create_app_id(target) == first
