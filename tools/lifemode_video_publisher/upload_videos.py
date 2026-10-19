"""Upload local source videos to the LifeMode video R2 prefix.

This command only uploads source videos to R2. It never invokes a publishing
destination or modifies publisher state.
"""
from __future__ import annotations

import argparse
import hashlib
import mimetypes
from pathlib import Path

from publisher import SUPPORTED_EXTENSIONS
from r2_storage import R2Client, R2Config, R2Error


VIDEO_PREFIX = "lifemode-life-hacks/videos"


class UploadError(RuntimeError):
    pass


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_video(path: Path) -> None:
    if not path.exists():
        raise UploadError(f"Video file does not exist: {path}")
    if not path.is_file():
        raise UploadError(f"Video path is not a file: {path}")
    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        supported = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        raise UploadError(f"Unsupported video extension for {path.name}; expected one of: {supported}")
    if path.stat().st_size <= 0:
        raise UploadError(f"Video file is empty: {path}")


def upload_video(path: Path, client: R2Client, prefix: str = VIDEO_PREFIX) -> dict:
    path = Path(path)
    validate_video(path)
    if prefix.strip("/") != VIDEO_PREFIX:
        raise UploadError(f"R2 video prefix must be {VIDEO_PREFIX!r}")

    digest = file_sha256(path)
    key = f"{VIDEO_PREFIX}/{digest}-{path.name}"
    existing_status = client.head(key)
    if existing_status == 200:
        raise UploadError(f"R2 object already exists; refusing to overwrite: {key}")
    if existing_status != 404:
        raise UploadError(f"R2 object existence check returned HTTP {existing_status}: {key}")

    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    try:
        client.put(key, path.read_bytes(), content_type)
    except R2Error as exc:
        raise UploadError(f"R2 upload failed for {path.name}: {exc}") from exc

    if client.head(key) != 200:
        raise UploadError(f"R2 upload could not be verified with HEAD: {key}")
    return {"path": path, "key": key, "digest": digest, "size": path.stat().st_size}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Upload LifeMode source videos to Cloudflare R2")
    parser.add_argument("videos", nargs="+", type=Path, help="one or more local .mp4, .mov, or .m4v files")
    args = parser.parse_args(argv)

    try:
        config = R2Config.from_env("runtime")
        if config.key_prefix != VIDEO_PREFIX:
            raise UploadError(f"R2_KEY_PREFIX must be {VIDEO_PREFIX!r} for publisher compatibility")
        client = R2Client(config)
        for path in args.videos:
            result = upload_video(path, client, config.key_prefix)
            print(f"Uploaded {result['path'].name}: {result['key']} ({result['size']} bytes)")
        return 0
    except (UploadError, R2Error, OSError, ValueError) as exc:
        print(f"Upload failed: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
