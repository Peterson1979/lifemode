"""Generate and publish per-video Pinterest cover images.

This module is only called by the live publisher path. It never runs during
preflight or dry-run, and failures are returned as a normal publisher error.
"""
from __future__ import annotations

import hashlib
import os
import subprocess
from pathlib import Path

from r2_storage import R2Client, R2Config, R2Error


def generate_cover(path: Path) -> bytes:
    """Extract a representative JPEG frame using the runner's ffmpeg binary."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", "0.5", "-i", str(path),
             "-frames:v", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "-"],
            check=False,
            capture_output=True,
            timeout=60,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise R2Error(f"Pinterest cover generation unavailable: {exc}") from exc
    if result.returncode != 0 or not result.stdout:
        raise R2Error("Pinterest cover generation failed")
    return result.stdout


def upload_cover(path: Path, video_key: str) -> str:
    """Upload a unique cover object and return its public HTTPS URL."""
    public_base = os.getenv("R2_PUBLIC_BASE_URL", "").rstrip("/")
    if not public_base:
        raise R2Error("R2_PUBLIC_BASE_URL is required for Pinterest cover publication")
    content = generate_cover(path)
    digest = hashlib.sha256(video_key.encode("utf-8")).hexdigest()
    key = f"lifemode-life-hacks/covers/{digest}.jpg"
    R2Client(R2Config.from_env("runtime")).put(key, content, "image/jpeg")
    return f"{public_base}/{key}"
