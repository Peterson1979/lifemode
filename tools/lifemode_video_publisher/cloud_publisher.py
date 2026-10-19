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
FIRST_VIDEO_KEY = "lifemode-life-hacks/videos/0165ec40ae9ee03b1074fac6c122a73d5e1ee059a0394ed32f946b49c05d7302-@sidneyraz-2026-10-07_1805-i-tried-#cozy-#lifehack-7693957734345002270.mp4"
FIRST_VIDEO_DIGEST = "0165ec40ae9ee03b1074fac6c122a73d5e1ee059a0394ed32f946b49c05d7302"


def load_remote_state(r2):
    return json.loads(r2.get(STATE_KEY))


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


def recover_pre_publish_state(name, digest, filename, r2_key, platform_state):
    record = platform_state.get("in_progress", {}).get(digest)
    if record is None:
        return False
    if (
        record.get("publish_started") is False
        and record.get("file") == filename
        and record.get("r2_key") == r2_key
    ):
        platform_state["in_progress"].pop(digest, None)
        return True
    legacy_record = {"file": filename, "r2_key": r2_key}
    if name == "everyday_pinterest" and digest == FIRST_VIDEO_DIGEST and record == legacy_record:
        logging.warning("Recovering known pre-call first-video state for %s", name)
        platform_state["in_progress"].pop(digest, None)
        return True
    return False


def publish_first_video(r2, objects, destinations, ready, state):
    if set(ready) != set(multi_publisher.PLATFORMS):
        logging.error("First-video publish requires all four destinations to pass preflight")
        return 1
    matches = [obj for obj in objects if obj["key"] == FIRST_VIDEO_KEY]
    if len(matches) != 1:
        logging.error("First-video publish target is missing or duplicated: %s", FIRST_VIDEO_KEY)
        return 1
    obj = matches[0]
    if obj["digest"] != FIRST_VIDEO_DIGEST:
        logging.error("First-video publish target digest does not match its key")
        return 1
    filename = object_filename(obj["key"])
    digest = obj["digest"]
    recovered = False
    for name in multi_publisher.PLATFORMS:
        platform_state = state.get("platforms", {}).get(name)
        if not platform_state:
            logging.error("First-video publish state is missing for %s", name)
            return 1
        if digest in platform_state.get("uncertain", {}):
            logging.error("First-video publish has unresolved state for %s; refusing retry", name)
            return 1
        if digest in platform_state.get("in_progress", {}):
            if recover_pre_publish_state(name, digest, filename, obj["key"], platform_state):
                recovered = True
            else:
                logging.error("First-video publish has unresolved state for %s; refusing retry", name)
                return 1
        text_errors = validate_post_text(build_post_text(filename), name)
        if text_errors:
            logging.error("Post text validation failed for %s/%s: %s", filename, name, "; ".join(text_errors))
            return 1
    if recovered:
        save_remote_state(r2, state)
    failed = False
    for name in multi_publisher.PLATFORMS:
        platform_state = state["platforms"][name]
        if digest in platform_state.get("published", {}):
            logging.info("First video already confirmed for %s; skipping duplicate", name)
            continue
        post_text = build_post_text(filename)
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            path = Path(directory) / filename
            path.write_bytes(r2.get(obj["key"]))
            if fingerprint(path) != digest:
                raise R2Error("Downloaded first-video object failed hash verification")
            if name == "lifemode_threads":
                destinations[name].media_url_factory = lambda _path, key=obj["key"]: r2.presign_get(key)
            attempt = {"file": filename, "r2_key": obj["key"], "publish_started": False}
            platform_state["in_progress"][digest] = attempt
            save_remote_state(r2, state)
            try:
                cover_url = None
                if name.startswith("everyday_") or name == "lifemode_pinterest":
                    cover_url = upload_cover(path, obj["key"])
                attempt["publish_started"] = True
                save_remote_state(r2, state)
                if name.startswith("everyday_") or name == "lifemode_pinterest":
                    result = destinations[name].publish(path, ready[name], cover_url, post_text)
                else:
                    result = destinations[name].publish(path, post_text)
                post_id = result.get("id") or result.get("post_id")
                if not post_id:
                    raise ValueError("destination returned no publication ID")
                platform_state["published"][digest] = {"file": filename, "r2_key": obj["key"], "post_id": post_id}
                platform_state["in_progress"].pop(digest, None)
                save_remote_state(r2, state)
                logging.info("First video published for %s: %s", name, filename)
            except Exception as exc:
                platform_state["uncertain"][digest] = {"file": filename, "r2_key": obj["key"], "error": str(exc)}
                platform_state["in_progress"].pop(digest, None)
                save_remote_state(r2, state)
                logging.error("First-video publication uncertain for %s; retry disabled: %s", name, exc)
                failed = True
    return 1 if failed else 0


def resume_facebook_first_video(r2, objects, destination, state):
    """Reconcile or publish only the known first video to LifeMode Facebook."""
    matches = [obj for obj in objects if obj["key"] == FIRST_VIDEO_KEY]
    if len(matches) != 1:
        logging.error("Facebook resume target is missing or duplicated: %s", FIRST_VIDEO_KEY)
        return 1
    obj = matches[0]
    if obj["digest"] != FIRST_VIDEO_DIGEST:
        logging.error("Facebook resume target digest does not match its key")
        return 1

    platform_state = state.get("platforms", {}).get("lifemode_facebook")
    if not platform_state:
        logging.error("Facebook resume state is missing")
        return 1
    digest = obj["digest"]
    filename = object_filename(obj["key"])
    if digest in platform_state.get("published", {}):
        logging.info("First video already confirmed for lifemode_facebook; skipping duplicate")
        return 0
    if digest in platform_state.get("in_progress", {}):
        logging.error("Facebook resume has unresolved in-progress state; refusing retry")
        return 1
    if digest not in platform_state.get("uncertain", {}):
        logging.error("Facebook resume requires the existing unresolved state; refusing untracked upload")
        return 1

    post_text = build_post_text(filename)
    text_errors = validate_post_text(post_text, "lifemode_facebook")
    if text_errors:
        logging.error("Post text validation failed for %s/lifemode_facebook: %s", filename, "; ".join(text_errors))
        return 1

    existing = destination.reconcile(post_text)
    if len(existing) > 1:
        logging.error("Facebook resume found %d matching posts; refusing to choose or republish", len(existing))
        return 1
    if existing:
        post_id = existing[0].get("id") or existing[0].get("post_id")
        if not post_id:
            logging.error("Facebook resume found a matching post without a publication ID; refusing state update")
            return 1
        platform_state["published"][digest] = {"file": filename, "r2_key": obj["key"], "post_id": post_id}
        platform_state["uncertain"].pop(digest, None)
        save_remote_state(r2, state)
        logging.info("Reconciled existing Facebook publication for %s: %s", filename, post_id)
        return 0

    with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
        path = Path(directory) / filename
        path.write_bytes(r2.get(obj["key"]))
        if fingerprint(path) != digest:
            raise R2Error("Downloaded first-video object failed hash verification")
        attempt = {"file": filename, "r2_key": obj["key"], "publish_started": False}
        platform_state["in_progress"][digest] = attempt
        save_remote_state(r2, state)
        try:
            attempt["publish_started"] = True
            save_remote_state(r2, state)
            result = destination.publish(path, post_text)
            post_id = result.get("id") or result.get("post_id")
            if not post_id:
                raise ValueError("Facebook destination returned no publication ID")
            platform_state["published"][digest] = {"file": filename, "r2_key": obj["key"], "post_id": post_id}
            platform_state["uncertain"].pop(digest, None)
            platform_state["in_progress"].pop(digest, None)
            save_remote_state(r2, state)
            logging.info("Resumed Facebook publication for %s: %s", filename, post_id)
            return 0
        except Exception as exc:
            platform_state["uncertain"][digest] = {"file": filename, "r2_key": obj["key"], "error": str(exc)}
            platform_state["in_progress"].pop(digest, None)
            save_remote_state(r2, state)
            logging.error("Facebook publication remains uncertain; retry disabled: %s", exc)
            return 1


def run(mode="run"):
    r2 = R2Client(R2Config.from_env("runtime"))
    objects = [{**obj, "digest": object_digest(obj["key"])} for obj in r2.list_video_objects()]
    objects = [obj for obj in objects if obj["digest"]]
    config = multi_publisher.MultiConfig.from_env()
    state = load_remote_state(r2)
    if mode == "resume-facebook-first-video":
        destination = multi_publisher.FacebookDestination(config)
        try:
            destination.preflight()
        except (multi_publisher.ApiError, OSError) as exc:
            logging.error("Facebook resume preflight failed: %s", exc)
            return 1
        return resume_facebook_first_video(r2, objects, destination, state)

    destinations = multi_publisher.build_destinations(config)
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
    if mode == "publish-first-video":
        return publish_first_video(r2, objects, destinations, ready, state)
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
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
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
    parser.add_argument("--publish-first-video", action="store_true")
    parser.add_argument("--resume-facebook-first-video", action="store_true")
    args = parser.parse_args(argv)
    mode = "preflight" if args.preflight else "dry-run" if args.dry_run else "publish-first-video" if args.publish_first_video else "resume-facebook-first-video" if args.resume_facebook_first_video else "run"
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s", force=True)
    try:
        return run(mode)
    except (R2Error, multi_publisher.ApiError, multi_publisher.PinterestError, OSError, ValueError) as exc:
        if mode == "preflight":
            print(f"Cloud preflight failed: {exc}", flush=True)
        logging.error("Cloud publisher not completed: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
