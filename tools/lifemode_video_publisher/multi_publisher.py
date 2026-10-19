"""Four-destination local video publisher.

This module is intentionally separate from publisher.py and its Everyday Ideas
state. It uses the same local source folder but has independent per-platform
history and credentials.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from publisher import (LINK, TITLE, Config as PinterestConfig,
                       PinterestClient, PinterestError, build_post_text,
                       eligible_files, validate_post_text,
                       fingerprint, load_state, run_lock, save_state,
                       setup_logging, valid_cover_url)

PLATFORMS = ("everyday_pinterest", "lifemode_facebook", "lifemode_pinterest", "lifemode_threads")
FACEBOOK_VIDEO_PUBLISH_TASKS = {"CREATE_CONTENT", "PROFILE_PLUS_CREATE_CONTENT"}


@dataclass(frozen=True)
class MultiConfig:
    source_dir: Path
    state_file: Path
    log_dir: Path
    everyday_pin_token: str
    everyday_pin_board_id: str
    everyday_cover_url: str
    lifemode_pin_token: str
    lifemode_pin_board_id: str
    lifemode_pin_section: str
    facebook_token: str
    facebook_user_token: str
    facebook_page_id: str
    facebook_api_base: str
    threads_token: str
    threads_user_id: str
    threads_api_base: str

    @classmethod
    def from_env(cls):
        root = Path(__file__).resolve().parent
        return cls(
            source_dir=Path(os.getenv("PINTEREST_SOURCE_DIR", r"C:\Users\opeti\DailyIdeasHub\Life hacks videok TikTokról")),
            state_file=Path(os.getenv("MULTI_PUBLISHER_STATE_FILE", str(root / "multiplatform_state.json"))),
            log_dir=Path(os.getenv("MULTI_PUBLISHER_LOG_DIR", str(root / "logs"))),
            # Everyday Ideas is a separate Pinterest account; never fall back
            # to LifeMode's Pinterest credential.
            everyday_pin_token=os.getenv("EVERYDAY_PINTEREST_ACCESS_TOKEN", ""),
            everyday_pin_board_id=os.getenv("EVERYDAY_PINTEREST_BOARD_ID", ""),
            everyday_cover_url="",
            # Never fall back to the Everyday token: account ownership must stay separate.
            lifemode_pin_token=os.getenv("LIFEMODE_PINTEREST_ACCESS_TOKEN", ""),
            lifemode_pin_board_id=os.getenv("LIFEMODE_PINTEREST_BOARD_ID", os.getenv("PINTEREST_BOARD_ID", os.getenv("PIN_BOARD_ID", ""))),
            lifemode_pin_section=os.getenv("LIFEMODE_PINTEREST_SECTION_NAME", ""),
            facebook_token=os.getenv("LIFEMODE_FACEBOOK_PAGE_ACCESS_TOKEN", os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN", "")),
            facebook_user_token=os.getenv("LIFEMODE_FACEBOOK_USER_ACCESS_TOKEN", os.getenv("FACEBOOK_USER_ACCESS_TOKEN", "")),
            facebook_page_id=os.getenv("LIFEMODE_FACEBOOK_PAGE_ID", os.getenv("FACEBOOK_PAGE_ID", "")),
            facebook_api_base=os.getenv("FACEBOOK_API_BASE", "https://graph.facebook.com/v20.0").rstrip("/"),
            threads_token=os.getenv("LIFEMODE_THREADS_ACCESS_TOKEN", ""),
            threads_user_id=os.getenv("LIFEMODE_THREADS_USER_ID", ""),
            threads_api_base=os.getenv("THREADS_API_BASE", "https://graph.threads.net/v1.0").rstrip("/"),
        )


class ApiError(RuntimeError):
    pass


class JsonApi:
    def __init__(self, base_url, token, opener=urllib.request.urlopen):
        self.base_url, self.token, self.opener = base_url, token, opener

    def request(self, method, path, payload=None, query=None, timeout=45):
        url = self.base_url + path
        params = dict(query or {})
        if self.token:
            params.setdefault("access_token", self.token)
        if params:
            url += "?" + urllib.parse.urlencode(params)
        body = None if payload is None else json.dumps(payload).encode()
        req = urllib.request.Request(url, data=body, method=method)
        req.add_header("Content-Type", "application/json")
        try:
            with self.opener(req, timeout=timeout) as response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")[:500]
            if self.token:
                detail = detail.replace(self.token, "[REDACTED]")
            raise ApiError(f"{method} {path} failed ({exc.code}): {detail}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ApiError(f"{method} {path} network failure: {exc}") from exc


def pinterest_config(token, cover_url, username, board, section, config: MultiConfig):
    return PinterestConfig(token, cover_url, "https://api.pinterest.com/v5", username, board, section,
                           config.source_dir, config.state_file, config.log_dir)


class PinterestDestination:
    def __init__(self, name, username, token, cover_url, board, section, config, board_id=None):
        self.name, self.token, self.cover_url, self.board, self.section, self.board_id = name, token, cover_url, board, section, board_id
        self.config = config
        self.client = PinterestClient(pinterest_config(token, cover_url, username, board, section, config))

    def preflight(self):
        if not self.token:
            raise ApiError("Pinterest access token is not configured")
        if self.board_id:
            actual, board_id, section_id = self.client.resolve_target_by_id(
                board_id=self.board_id,
                board_name=self.board,
                section_name=self.section,
            )
        else:
            if not self.board:
                raise ApiError("Pinterest board name is not configured")
            if not self.section:
                raise ApiError("Pinterest board section name is not configured")
            actual, board_id, section_id = self.client.resolve_target()
        self.client.verify_read_access()
        return {"account": actual, "board_id": board_id, "section_id": section_id}

    def publish(self, path, target, cover_image_url=None, post_text=None):
        if not cover_image_url and not self.cover_url:
            raise ApiError("Pinterest video cover image was not generated")
        registration = self.client.register_media()
        self.client.upload_file(registration, path)
        self.client.wait_for_media(registration["media_id"])
        return self.client.create_video_pin(target["board_id"], target["section_id"], registration["media_id"], cover_image_url, post_text)

    def reconcile(self, target):
        return self.client.find_existing_pin(target["board_id"])


def facebook_http_error_details(exc, access_token):
    try:
        payload = json.loads(exc.read().decode("utf-8", "replace"))
    except (AttributeError, UnicodeDecodeError, json.JSONDecodeError):
        return "API response did not contain structured error details"
    error = payload.get("error", payload) if isinstance(payload, dict) else {}
    if not isinstance(error, dict):
        return "API response did not contain structured error details"
    details = []
    for key in ("code", "error_subcode", "type", "message"):
        value = error.get(key)
        if value not in (None, ""):
            text = str(value)
            if access_token:
                text = text.replace(access_token, "[REDACTED]")
            details.append(f"{key}={text}")
    return "; ".join(details) or "API response did not contain structured error details"


class FacebookDestination:
    def __init__(self, config):
        self.config = config
        self.api = JsonApi(config.facebook_api_base, config.facebook_token)
        self.permission_api = JsonApi(config.facebook_api_base, getattr(config, "facebook_user_token", ""))

    def preflight(self):
        if not self.config.facebook_token or not self.config.facebook_page_id:
            raise ApiError("LifeMode Facebook token/page ID is not configured")
        _, page = self.api.request(
            "GET",
            f"/{urllib.parse.quote(self.config.facebook_page_id, safe='')}",
            query={"fields": "id,name,link"},
        )
        if str(page.get("id")) != self.config.facebook_page_id:
            raise ApiError("Facebook API returned a different page ID")
        user_token = getattr(self.config, "facebook_user_token", "")
        if not user_token:
            raise ApiError(
                "LIFEMODE_FACEBOOK_USER_ACCESS_TOKEN is required to verify Facebook Page tasks; "
                "provide the user token used to acquire the Page access token"
            )
        _, accounts = self.permission_api.request(
            "GET",
            "/me/accounts",
            query={"fields": "id,tasks", "limit": "100"},
        )
        matching_accounts = [account for account in accounts.get("data", []) if str(account.get("id")) == self.config.facebook_page_id]
        if len(matching_accounts) != 1:
            raise ApiError("Facebook user token did not return exactly one matching LifeMode Page")
        tasks = matching_accounts[0].get("tasks")
        if not isinstance(tasks, list):
            raise ApiError("Facebook /me/accounts response did not include Page tasks")
        normalized_tasks = {str(task).upper() for task in tasks}
        if not normalized_tasks.intersection(FACEBOOK_VIDEO_PUBLISH_TASKS):
            raise ApiError(
                "Facebook Page user lacks CREATE_CONTENT permission/task required to publish videos; "
                "re-authorize the app and issue a new Page access token"
            )
        return page

    def publish(self, path, post_text):
        # Graph Page video upload accepts a multipart source and Page access token.
        boundary = "----DailyIdeasHubFacebook"
        content = path.read_bytes()
        parts = [
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"access_token\"\r\n\r\n{self.config.facebook_token}\r\n".encode(),
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\n{post_text.title}\r\n".encode(),
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"description\"\r\n\r\n{post_text.facebook_text}\r\n".encode(),
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"source\"; filename=\"{path.name}\"\r\nContent-Type: video/mp4\r\n\r\n".encode(), content,
            f"\r\n--{boundary}--\r\n".encode(),
        ]
        req = urllib.request.Request(self.config.facebook_api_base + f"/{self.config.facebook_page_id}/videos", data=b"".join(parts), method="POST")
        req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
        try:
            with urllib.request.urlopen(req, timeout=300) as response:
                raw = response.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            raise ApiError(f"Facebook video upload failed ({exc.code}): {facebook_http_error_details(exc, self.config.facebook_token)}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise ApiError(f"Facebook video upload network failure: {exc}") from exc

    def reconcile(self, post_text=None):
        _, data = self.api.request("GET", f"/{self.config.facebook_page_id}/videos", query={"fields": "id,title,description", "limit": "50"})
        expected_title = post_text.title if post_text else TITLE
        return [v for v in data.get("data", []) if v.get("title") == expected_title and LINK in v.get("description", "")]


class ThreadsDestination:
    def __init__(self, config):
        self.config = config
        self.api = JsonApi(config.threads_api_base, config.threads_token)
        self.user_id = config.threads_user_id
        self.media_url_factory = None

    def preflight(self):
        if not self.config.threads_token:
            raise ApiError("LifeMode Threads access token is not configured")
        if not self.user_id:
            _, user = self.api.request("GET", "/me", query={"fields": "id,username"})
            self.user_id = user.get("id", "")
        else:
            _, user = self.api.request("GET", f"/{self.user_id}", query={"fields": "id,username"})
        if user.get("username") != "lifemodehq":
            raise ApiError(f"Threads API returned @{user.get('username')}, expected @lifemodehq")
        if not self.user_id:
            raise ApiError("Threads API did not return a user ID")
        return user

    def media_url(self, path):
        if self.media_url_factory:
            return self.media_url_factory(path)
        return self.config.threads_public_base_url + "/" + urllib.parse.quote(path.name)

    def publish(self, path, post_text):
        text = post_text.threads_text
        if not self.user_id:
            raise ApiError("Threads user ID has not been resolved")
        _, container = self.api.request("POST", f"/{self.user_id}/threads", query={"media_type": "VIDEO", "video_url": self.media_url(path), "text": text})
        container_id = container.get("id")
        if not container_id:
            raise ApiError("Threads did not return a media container ID")
        deadline = time.time() + 900
        while time.time() < deadline:
            _, status = self.api.request("GET", f"/{container_id}", query={"fields": "id,status,error_message"})
            if status.get("status") == "FINISHED":
                break
            if status.get("status") in {"ERROR", "EXPIRED"}:
                raise ApiError(f"Threads media container failed: {status.get('error_message', status.get('status'))}")
            time.sleep(5)
        else:
            raise ApiError("Threads media container timed out")
        _, published = self.api.request("POST", f"/{self.user_id}/threads_publish", query={"creation_id": container_id})
        return published


def initial_state():
    return {"version": 2, "platforms": {name: {"published": {}, "uncertain": {}, "in_progress": {}} for name in PLATFORMS}}


def load_multi_state(path):
    if not path.exists():
        return initial_state()
    state = json.loads(path.read_text(encoding="utf-8"))
    state.setdefault("platforms", {})
    for name in PLATFORMS:
        state["platforms"].setdefault(name, {"published": {}, "uncertain": {}, "in_progress": {}})
    return state


def available(files, platform_state):
    return [p for p in files if fingerprint(p) not in platform_state["published"] and fingerprint(p) not in platform_state["uncertain"]]


def build_destinations(config):
    return {
        "everyday_pinterest": PinterestDestination("everyday_pinterest", "everydayideaslife", config.everyday_pin_token, config.everyday_cover_url, "DIY and Crafts, Life Hacks", "", config, board_id=config.everyday_pin_board_id),
        "lifemode_facebook": FacebookDestination(config),
        "lifemode_pinterest": PinterestDestination("lifemode_pinterest", "LifeModeHQ", config.lifemode_pin_token, "", "", config.lifemode_pin_section, config, board_id=config.lifemode_pin_board_id),
        "lifemode_threads": ThreadsDestination(config),
    }


def run(config, mode="run"):
    setup_logging(config)
    state = load_multi_state(config.state_file)
    files = eligible_files(type("SourceConfig", (), {"source_dir": config.source_dir})())
    destinations = build_destinations(config)
    ready, errors = {}, {}
    for name, destination in destinations.items():
        try:
            ready[name] = destination.preflight()
            logging.info("Preflight OK: %s", name)
        except (ApiError, PinterestError, OSError) as exc:
            errors[name] = str(exc)
            logging.warning("Destination unavailable: %s: %s", name, exc)
    if mode == "preflight":
        if errors:
            logging.warning("Preflight completed with unavailable destinations: %s", ", ".join(errors))
        return 0 if ready else 1
    today = date.today().isoformat()
    if mode == "dry-run":
        invalid = False
        for path in files:
            post_text = build_post_text(path.name)
            for name in destinations:
                text_errors = validate_post_text(post_text, name)
                if text_errors:
                    invalid = True
                    logging.error("Dry-run invalid post text %s/%s: %s", path.name, name, "; ".join(text_errors))
                preview = post_text.threads_text if name == "lifemode_threads" else post_text.facebook_text if name == "lifemode_facebook" else post_text.caption
                logging.info("Dry-run preview %s/%s: title=%r caption=%r", path.name, name, post_text.title, preview)
        for name in ready:
            platform_state = state["platforms"][name]
            candidates = available(files, platform_state)
            logging.info("Dry-run %s: next=%s", name, candidates[0] if candidates else "none")
        return 1 if invalid else 0
    if mode == "reconcile":
        for name, target in ready.items():
            destination = destinations[name]
            try:
                matches = destination.reconcile(target) if name.startswith("everyday_") or name == "lifemode_pinterest" else destination.reconcile()
                logging.info("Reconcile %s: %d matching existing posts", name, len(matches))
            except (ApiError, PinterestError) as exc:
                logging.warning("Reconcile failed for %s: %s", name, exc)
        return 0
    for name in ready:
        candidates = available(files, state["platforms"][name])
        if candidates:
            text_errors = validate_post_text(build_post_text(candidates[0].name), name)
            if text_errors:
                logging.error("Post text validation failed for %s/%s: %s", candidates[0].name, name, "; ".join(text_errors))
                return 1
    for name, target in ready.items():
        platform_state = state["platforms"][name]
        if platform_state["published"].get(today):
            continue
        candidates = available(files, platform_state)
        if not candidates:
            logging.info("No unpublished source video remains for %s", name)
            continue
        path = candidates[0]
        digest = fingerprint(path)
        post_text = build_post_text(path.name)
        text_errors = validate_post_text(post_text, name)
        if text_errors:
            logging.error("Post text validation failed for %s/%s: %s", path.name, name, "; ".join(text_errors))
            continue
        platform_state["in_progress"][digest] = {"file": str(path), "date": today}
        save_state(config.state_file, state)
        try:
            if name.startswith("everyday_") or name == "lifemode_pinterest":
                result = destinations[name].publish(path, target, post_text=post_text)
            else:
                result = destinations[name].publish(path, post_text)
            platform_state["published"][digest] = {"file": str(path), "date": today, "post_id": result.get("id") or result.get("post_id")}
            platform_state["published"][today] = {"file": str(path), "post_id": result.get("id") or result.get("post_id")}
            platform_state["in_progress"].pop(digest, None)
            save_state(config.state_file, state)
            logging.info("Published one video for %s: %s", name, path.name)
        except (ApiError, PinterestError, OSError) as exc:
            platform_state["uncertain"][digest] = {"file": str(path), "date": today, "error": str(exc)}
            platform_state["in_progress"].pop(digest, None)
            save_state(config.state_file, state)
            logging.error("Not published for %s; retry disabled until reconciliation: %s", name, exc)
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--preflight", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--reconcile", action="store_true")
    args = parser.parse_args(argv)
    mode = "preflight" if args.preflight else "dry-run" if args.dry_run else "reconcile" if args.reconcile else "run"
    config = MultiConfig.from_env()
    try:
        with run_lock(type("LockConfig", (), {"state_file": config.state_file})()):
            return run(config, mode)
    except (ApiError, PinterestError, OSError, ValueError) as exc:
        logging.error("Multi-destination run failed: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
