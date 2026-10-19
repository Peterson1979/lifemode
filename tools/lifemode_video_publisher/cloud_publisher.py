"""GitHub Actions/R2 runner for the four-destination publisher.

The runner downloads only the selected object into a temporary file. R2 remains
private; Threads receives a time-limited presigned GET URL for that object.
State is kept in a controlled R2 JSON object because Actions workspaces are
ephemeral.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import tempfile
from pathlib import Path

import multi_publisher
from cover_images import upload_cover
from publisher import build_post_text, fingerprint, validate_post_text
from r2_storage import R2Client, R2Config, R2Error


STATE_KEY = os.getenv("R2_STATE_KEY", "lifemode-life-hacks/state/multiplatform_state.json")


def load_remote_state(r2):
    try:
        return json.loads(r2.get(STATE_KEY))
    except R2Error:
        return multi_publisher.initial_state()


def save_remote_state(r2, state):
    r2.put(STATE_KEY, (json.dumps(state, indent=2, sort_keys=True) + "\n").encode(), "application/json")


def select_objects(objects, platform_state):
    return [obj for obj in sorted(objects, key=lambda item: item["key"].lower()) if obj["digest"] not in platform_state["published"] and obj["digest"] not in platform_state["uncertain"]]


def object_digest(key):
    name = key.rsplit("/", 1)[-1]
    return name.split("-", 1)[0] if len(name.split("-", 1)[0]) == 64 else ""


def object_filename(key):
    name = key.rsplit("/", 1)[-1]
    parts = name.split("-", 1)
    if len(parts) != 2 or not parts[1]:
        raise ValueError(f"R2 video key has no source filename: {key}")
    return parts[1]


def report_preflight(r2_object_count, destinations):
    ready, errors = {}, {}
    for name in multi_publisher.PLATFORMS:
        destination = destinations.get(name)
        if destination is None:
            errors[name] = "destination is not configured"
            print(f"Preflight unavailable: {name}: {errors[name]}", flush=True)
            continue
        try:
            result = destination.preflight()
            if result is None:
                raise RuntimeError("preflight returned no result")
            ready[name] = result
            print(f"Preflight OK: {name}", flush=True)
        except Exception as exc:
            errors[name] = str(exc)
            print(f"Preflight unavailable: {name}: {exc}", flush=True)
    print(
        f"Cloud preflight: r2_objects={r2_object_count}, "
        f"ready={len(ready)}, unavailable={len(errors)}",
        flush=True,
    )
    return ready, errors


def run(mode="run"):
    r2 = R2Client(R2Config.from_env("runtime"))
    objects = [{**obj, "digest": object_digest(obj["key"])} for obj in r2.list_video_objects()]
    objects = [obj for obj in objects if obj["digest"]]
    config = multi_publisher.MultiConfig.from_env()
    destinations = multi_publisher.build_destinations(config)
    state = load_remote_state(r2)
    ready, errors = report_preflight(len(objects), destinations)
    if mode == "preflight":
        return 0 if set(ready) == set(multi_publisher.PLATFORMS) and not errors else 1
    if mode == "dry-run":
        invalid = False
        for obj in objects:
            filename = object_filename(obj["key"])
            post_text = build_post_text(filename)
            for name in destinations:
                text_errors = validate_post_text(post_text, name)
                if text_errors:
                    invalid = True
                    logging.error("Dry-run invalid post text %s/%s: %s", filename, name, "; ".join(text_errors))
                preview = post_text.threads_text if name == "lifemode_threads" else post_text.facebook_text if name == "lifemode_facebook" else post_text.caption
                logging.info("Dry-run preview %s/%s: title=%r caption=%r", filename, name, post_text.title, preview)
        for name in ready:
            logging.info("Cloud dry-run %s: next=%s", name, (select_objects(objects, state["platforms"][name])[0]["key"] if select_objects(objects, state["platforms"][name]) else "none"))
        return 1 if invalid else 0
    for name in ready:
        candidates = select_objects(objects, state["platforms"][name])
        if candidates:
            filename = object_filename(candidates[0]["key"])
            text_errors = validate_post_text(build_post_text(filename), name)
            if text_errors:
                logging.error("Post text validation failed for %s/%s: %s", filename, name, "; ".join(text_errors))
                return 1
    for name, target in ready.items():
        platform_state = state["platforms"][name]
        candidates = select_objects(objects, platform_state)
        if not candidates:
            continue
        obj = candidates[0]
        digest = obj["digest"]
        filename = object_filename(obj["key"])
        post_text = build_post_text(filename)
        text_errors = validate_post_text(post_text, name)
        if text_errors:
            raise ValueError(f"Invalid post text for {filename}/{name}: {'; '.join(text_errors)}")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / filename
            path.write_bytes(r2.get(obj["key"]))
            if fingerprint(path) != digest:
                raise R2Error("Downloaded R2 object failed hash verification")
            if name == "lifemode_threads":
                destinations[name].media_url_factory = lambda _path, key=obj["key"]: r2.presign_get(key)
            platform_state["in_progress"][digest] = {"file": filename, "r2_key": obj["key"]}
            save_remote_state(r2, state)
            try:
                cover_url = None
                if name.startswith("everyday_") or name == "lifemode_pinterest":
                    cover_url = upload_cover(path, obj["key"])
                if name.startswith("everyday_") or name == "lifemode_pinterest":
                    result = destinations[name].publish(path, target, cover_url, post_text)
                else:
                    result = destinations[name].publish(path, post_text)
                platform_state["published"][digest] = {"file": filename, "r2_key": obj["key"], "post_id": result.get("id") or result.get("post_id")}
                platform_state["in_progress"].pop(digest, None)
                save_remote_state(r2, state)
            except (multi_publisher.ApiError, multi_publisher.PinterestError, OSError) as exc:
                platform_state["uncertain"][digest] = {"file": filename, "r2_key": obj["key"], "error": str(exc)}
                platform_state["in_progress"].pop(digest, None)
                save_remote_state(r2, state)
                logging.error("Cloud destination uncertain; retry disabled: %s", name)
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--preflight", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    mode = "preflight" if args.preflight else "dry-run" if args.dry_run else "run"
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        return run(mode)
    except (R2Error, multi_publisher.ApiError, multi_publisher.PinterestError, OSError, ValueError) as exc:
        if mode == "preflight":
            print(f"Cloud preflight failed: {exc}", flush=True)
        logging.error("Cloud publisher not completed: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
