"""Safe, isolated Pinterest video publisher for Everyday Ideas.

Only the normal run mutates Pinterest. Preflight, dry-run, and tests never do.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import mimetypes
import os
import re
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date
from pathlib import Path

SUPPORTED_EXTENSIONS = {".mp4", ".mov", ".m4v"}
TITLE = "Smart Life Hacks for Everyday Living"
DESCRIPTION = ("Discover clever life hacks, simple DIY ideas, and practical tips to make everyday life easier. "
               "Save these useful ideas for later! Explore more everyday inspiration: https://lifemode.bio.link/")
LINK = "https://lifemode.bio.link/"


@dataclass(frozen=True)
class Config:
    token: str
    cover_image_url: str
    api_base: str
    username: str
    board_name: str
    section_name: str
    source_dir: Path
    state_file: Path
    log_dir: Path

    @classmethod
    def from_env(cls) -> "Config":
        root = Path(__file__).resolve().parent
        return cls(
            token=os.getenv("PINTEREST_ACCESS_TOKEN", ""),
            cover_image_url=os.getenv("PINTEREST_VIDEO_COVER_IMAGE_URL", ""),
            api_base=os.getenv("PINTEREST_API_BASE", "https://api.pinterest.com/v5").rstrip("/"),
            username=os.getenv("PINTEREST_TARGET_USERNAME", "everydayideaslife"),
            board_name=os.getenv("PINTEREST_BOARD_NAME", "DIY and Crafts"),
            section_name=os.getenv("PINTEREST_SECTION_NAME", "Life Hacks"),
            source_dir=Path(os.getenv("PINTEREST_SOURCE_DIR", r"C:\Users\opeti\DailyIdeasHub\Life hacks videok TikTokról")),
            state_file=Path(os.getenv("PINTEREST_STATE_FILE", str(root / "state.json"))),
            log_dir=Path(os.getenv("PINTEREST_LOG_DIR", str(root / "logs"))),
        )


class PinterestError(RuntimeError):
    pass


class PinterestClient:
    def __init__(self, config: Config, opener=urllib.request.urlopen):
        self.config = config
        self.opener = opener

    def request(self, method: str, path: str, payload=None, *, headers=None, timeout=45):
        body = None if payload is None else json.dumps(payload).encode()
        request = urllib.request.Request(self.config.api_base + path, data=body, method=method)
        request.add_header("Authorization", "Bearer " + self.config.token)
        request.add_header("Content-Type", "application/json")
        for key, value in (headers or {}).items():
            request.add_header(key, value)
        try:
            with self.opener(request, timeout=timeout) as response:
                raw = response.read()
                return response.status, (json.loads(raw) if raw else {})
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")[:500]
            raise PinterestError(f"Pinterest {method} {path} failed ({exc.code}): {detail}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise PinterestError(f"Pinterest {method} {path} network failure: {exc}") from exc

    def get_paginated(self, path: str):
        items, bookmark = [], None
        while True:
            suffix = "?page_size=250" + (("&bookmark=" + urllib.parse.quote(bookmark)) if bookmark else "")
            _, result = self.request("GET", path + suffix)
            items.extend(result.get("items", []))
            bookmark = result.get("bookmark")
            if not bookmark:
                return items

    def resolve_target(self):
        _, user = self.request("GET", "/user_account")
        actual = user.get("username")
        if (actual or "").casefold() != self.config.username.casefold():
            raise PinterestError(f"Authenticated account is @{actual!s}, expected @{self.config.username}")
        boards = self.get_paginated("/boards")
        board = next((b for b in boards if b.get("name") == self.config.board_name), None)
        if not board:
            raise PinterestError(f"Board not found exactly: {self.config.board_name!r}")
        sections = self.get_paginated(f"/boards/{urllib.parse.quote(board['id'], safe='')}/sections")
        section = next((s for s in sections if s.get("name") == self.config.section_name), None)
        if not section:
            raise PinterestError(f"Board section not found exactly: {self.config.section_name!r}")
        return actual, board["id"], section["id"]

    def resolve_target_by_id(self, board_id, board_name="", section_name=""):
        """Resolve an existing board without requiring a board-name setting.

        A section is optional for the Pinterest video Pin API. When supplied,
        preserve the existing exact-name section targeting behavior.
        """
        _, user = self.request("GET", "/user_account")
        actual = user.get("username")
        if (actual or "").casefold() != self.config.username.casefold():
            raise PinterestError(f"Authenticated account is @{actual!s}, expected @{self.config.username}")
        _, board = self.request("GET", f"/boards/{urllib.parse.quote(board_id, safe='')}")
        if board_name and board.get("name") != board_name:
            raise PinterestError(f"Board ID {board_id!r} is not the expected board {board_name!r}")
        section_id = None
        if section_name:
            sections = self.get_paginated(f"/boards/{urllib.parse.quote(board_id, safe='')}/sections")
            section = next((s for s in sections if s.get("name") == section_name), None)
            if not section:
                raise PinterestError(f"Board section not found exactly: {section_name!r}")
            section_id = section["id"]
        return actual, board_id, section_id

    def verify_read_access(self):
        # Pinterest does not expose token scopes through a normal API response;
        # successful calls prove the account/boards/pins read permissions. Exact
        # scope inspection remains available in Pinterest's Token Debugger.
        self.request("GET", "/pins?page_size=1")

    def register_media(self):
        _, response = self.request("POST", "/media", {"media_type": "video"})
        return response

    def upload_file(self, registration, path: Path):
        fields = registration.get("upload_parameters", {})
        boundary = "----DailyIdeasHub" + uuid.uuid4().hex
        chunks = []
        for key, value in fields.items():
            chunks += [f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n".encode()]
        mime = mimetypes.guess_type(path.name)[0] or "video/mp4"
        chunks += [f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{path.name}\"\r\nContent-Type: {mime}\r\n\r\n".encode(), path.read_bytes(), f"\r\n--{boundary}--\r\n".encode()]
        request = urllib.request.Request(registration["upload_url"], data=b"".join(chunks), method="POST")
        request.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
        try:
            with self.opener(request, timeout=180) as response:
                if response.status not in (200, 201, 204):
                    raise PinterestError(f"Media upload failed ({response.status})")
        except urllib.error.HTTPError as exc:
            raise PinterestError(f"Media upload failed ({exc.code})") from exc

    def wait_for_media(self, media_id: str, timeout_seconds=900):
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            _, result = self.request("GET", f"/media/{urllib.parse.quote(media_id, safe='')}")
            status = result.get("status")
            if status == "succeeded":
                return result
            if status == "failed":
                raise PinterestError(f"Pinterest rejected media {media_id}")
            time.sleep(5)
        raise PinterestError(f"Timed out waiting for media {media_id}")

    def create_video_pin(self, board_id, section_id, media_id, cover_image_url=None):
        payload = {"title": TITLE, "description": DESCRIPTION, "link": LINK, "board_id": board_id,
                   "media_source": {"source_type": "video_id",
                   "cover_image_url": cover_image_url or self.config.cover_image_url, "media_id": media_id}}
        if section_id:
            payload["board_section_id"] = section_id
        return self.request("POST", "/pins", payload)[1]

    def find_existing_pin(self, board_id):
        return [p for p in self.get_paginated(f"/boards/{urllib.parse.quote(board_id, safe='')}/pins")
                if p.get("title") == TITLE and p.get("link") == LINK]


def valid_cover_url(value):
    parsed = urllib.parse.urlparse(value)
    return parsed.scheme == "https" and bool(parsed.netloc)


def fingerprint(path: Path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def eligible_files(config):
    if not config.source_dir.exists():
        raise PinterestError(f"Source folder does not exist: {config.source_dir}")
    return sorted((p for p in config.source_dir.rglob("*") if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS and p.stat().st_size > 0), key=lambda p: (p.name.lower(), str(p).lower()))


def load_state(path):
    if not path.exists():
        return {"version": 1, "published": {}, "uncertain": {}}
    return json.loads(path.read_text(encoding="utf-8"))


def save_state(path, state):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix="state-", suffix=".json", dir=path.parent)
    os.close(fd)
    temp = Path(temp_name)
    try:
        temp.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        os.replace(temp, path)
    finally:
        if temp.exists():
            temp.unlink()


def setup_logging(config):
    config.log_dir.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", handlers=[logging.StreamHandler(), logging.FileHandler(config.log_dir / "publisher.log", encoding="utf-8")])


@contextmanager
def run_lock(config):
    """Cross-process Windows/Python lock using exclusive file creation."""
    lock_path = config.state_file.with_suffix(config.state_file.suffix + ".lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        handle = lock_path.open("x", encoding="ascii")
    except FileExistsError as exc:
        raise PinterestError("Another publisher run is already in progress") from exc
    try:
        handle.write(str(os.getpid()))
        handle.close()
        yield
    finally:
        try:
            lock_path.unlink()
        except FileNotFoundError:
            pass


def preflight(config, client):
    if not config.token:
        raise PinterestError("PINTEREST_ACCESS_TOKEN is not configured")
    if not valid_cover_url(config.cover_image_url):
        raise PinterestError("PINTEREST_VIDEO_COVER_IMAGE_URL must be an HTTPS URL")
    target = client.resolve_target()
    if hasattr(client, "verify_read_access"):
        client.verify_read_access()
    files = eligible_files(config)
    state = load_state(config.state_file)
    available = [p for p in files if fingerprint(p) not in state.get("published", {}) and fingerprint(p) not in state.get("uncertain", {})]
    logging.info("Preflight OK: @%s, board_id=%s, section_id=%s, eligible=%d, available=%d", target[0], target[1], target[2], len(files), len(available))
    return target, files, state


def run(config, mode="run"):
    setup_logging(config)
    client = PinterestClient(config)
    target, files, state = preflight(config, client)
    today = date.today().isoformat()
    if mode == "preflight":
        return 0
    if mode == "dry-run":
        if state.get("published", {}).get(today):
            logging.info("Dry-run: daily limit already completed for %s", today)
            return 0
        candidates = [p for p in files if fingerprint(p) not in state.get("published", {}) and fingerprint(p) not in state.get("uncertain", {})]
        logging.info("Dry-run: next file would be %s", candidates[0] if candidates else "none")
        return 0
    if mode == "reconcile":
        existing = client.find_existing_pin(target[1])
        matched = {(pin.get("title"), pin.get("link")): pin for pin in existing}
        for digest, record in list(state.get("uncertain", {}).items()):
            pin = matched.get((TITLE, LINK))
            if pin:
                state.setdefault("published", {})[digest] = {"file": record.get("file"), "pin_id": pin.get("id"), "date": record.get("date"), "reconciled": True}
                state["uncertain"].pop(digest, None)
                logging.info("Reconciled uncertain file %s to existing Pin id=%s", record.get("file"), pin.get("id"))
        save_state(config.state_file, state)
        for pin in existing:
            logging.info("Matching target Pin present: id=%s", pin.get("id"))
        return 0
    if state.get("published", {}).get(today):
        logging.info("Daily limit already completed for %s", today)
        return 0
    candidates = [p for p in files if fingerprint(p) not in state.get("published", {}) and fingerprint(p) not in state.get("uncertain", {})]
    if not candidates:
        logging.info("No eligible unpublished videos remain")
        return 0
    path = candidates[0]
    digest = fingerprint(path)
    registration = client.register_media()
    state.setdefault("in_progress", {})[digest] = {"file": str(path), "media_id": registration.get("media_id"), "started_at": time.time()}
    save_state(config.state_file, state)
    client.upload_file(registration, path)
    client.wait_for_media(registration["media_id"])
    try:
        result = client.create_video_pin(target[1], target[2], registration["media_id"])
    except PinterestError as exc:
        state.setdefault("uncertain", {})[digest] = {"file": str(path), "media_id": registration["media_id"], "error": str(exc), "date": today}
        state.get("in_progress", {}).pop(digest, None)
        save_state(config.state_file, state)
        raise PinterestError("Pin creation is uncertain; automatic retry is disabled to prevent duplicates") from exc
    state.setdefault("published", {})[digest] = {"file": str(path), "pin_id": result.get("id"), "date": today, "media_id": registration["media_id"]}
    state["published"][today] = {"file": str(path), "pin_id": result.get("id")}
    state.get("in_progress", {}).pop(digest, None)
    save_state(config.state_file, state)
    logging.info("Published one video Pin id=%s for %s", result.get("id"), path.name)
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--preflight", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--reconcile", action="store_true")
    args = parser.parse_args(argv)
    mode = "preflight" if args.preflight else "dry-run" if args.dry_run else "reconcile" if args.reconcile else "run"
    try:
        config = Config.from_env()
        with run_lock(config):
            return run(config, mode)
    except (PinterestError, OSError, ValueError) as exc:
        logging.error("Not published: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
