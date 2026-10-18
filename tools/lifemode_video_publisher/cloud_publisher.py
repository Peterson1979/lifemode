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
from publisher import fingerprint
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


def run(mode="run"):
    r2 = R2Client(R2Config.from_env("runtime"))
    objects = [{**obj, "digest": object_digest(obj["key"])} for obj in r2.list_video_objects()]
    objects = [obj for obj in objects if obj["digest"]]
    config = multi_publisher.MultiConfig.from_env()
    destinations = multi_publisher.build_destinations(config)
    state = load_remote_state(r2)
    ready, errors = {}, {}
    for name, destination in destinations.items():
        try:
            ready[name] = destination.preflight()
        except (multi_publisher.ApiError, multi_publisher.PinterestError, OSError) as exc:
            errors[name] = str(exc)
            logging.warning("Cloud preflight unavailable: %s", name)
    if mode == "preflight":
        logging.info("Cloud preflight: r2_objects=%d, ready=%d, unavailable=%d", len(objects), len(ready), len(errors))
        return 0 if ready else 1
    if mode == "dry-run":
        for name in ready:
            logging.info("Cloud dry-run %s: next=%s", name, (select_objects(objects, state["platforms"][name])[0]["key"] if select_objects(objects, state["platforms"][name]) else "none"))
        return 0
    for name, target in ready.items():
        platform_state = state["platforms"][name]
        candidates = select_objects(objects, platform_state)
        if not candidates:
            continue
        obj = candidates[0]
        digest = obj["digest"]
        with tempfile.TemporaryDirectory() as directory:
            filename = obj["key"].rsplit("/", 1)[-1].split("-", 1)[1]
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
                result = destinations[name].publish(path, target, cover_url) if name.startswith("everyday_") or name == "lifemode_pinterest" else destinations[name].publish(path)
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
    try:
        return run(mode)
    except (R2Error, multi_publisher.ApiError, multi_publisher.PinterestError, OSError, ValueError) as exc:
        logging.error("Cloud publisher not completed: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
