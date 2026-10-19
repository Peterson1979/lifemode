import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from types import SimpleNamespace
from unittest.mock import patch

import cloud_publisher
import multi_publisher
from publisher import PostText


class FakeR2:
    def list_video_objects(self):
        return [{"key": "a" * 64 + "-@crafty_fixer_2026-04-16_1710-550-Genius-Household-Hacks.mp4"}]


class NoPublishDestination:
    def __init__(self, name):
        self.name = name

    def preflight(self):
        return {"account": self.name}

    def publish(self, *args, **kwargs):
        raise AssertionError("dry-run must not publish")


class FailedPreflightDestination(NoPublishDestination):
    def preflight(self):
        raise RuntimeError("simulated preflight failure")


class PinterestLiveDestination(NoPublishDestination):
    def __init__(self, name, calls, failure=None):
        super().__init__(name)
        self.calls = calls
        self.failure = failure

    def publish(self, path, target, cover_image_url=None, post_text=None):
        self.calls.append(self.name)
        if self.failure:
            raise self.failure
        return {"id": self.name + "-post"}


class FacebookLiveDestination(NoPublishDestination):
    def __init__(self, name, calls, failure=None):
        super().__init__(name)
        self.calls = calls
        self.failure = failure

    def publish(self, path, post_text=None):
        self.calls.append(self.name)
        if self.failure:
            raise self.failure
        return {"id": self.name + "-post"}


class ThreadsLiveDestination(FacebookLiveDestination):
    pass


def live_destinations(calls, failure_name=None):
    destinations = {}
    for name in multi_publisher.PLATFORMS:
        failure = multi_publisher.ApiError("failed") if name == failure_name else None
        if name.startswith("everyday_") or name == "lifemode_pinterest":
            destination = PinterestLiveDestination(name, calls, failure)
        elif name == "lifemode_threads":
            destination = ThreadsLiveDestination(name, calls, failure)
        else:
            destination = FacebookLiveDestination(name, calls, failure)
        destinations[name] = destination
    return destinations


FIRST_VIDEO_KEY = cloud_publisher.FIRST_VIDEO_KEY
FIRST_VIDEO_DIGEST = cloud_publisher.FIRST_VIDEO_DIGEST


class FirstVideoR2:
    def __init__(self, extra=False):
        self.saved = []
        self.objects = [{"key": FIRST_VIDEO_KEY}]
        if extra:
            self.objects.append({"key": "lifemode-life-hacks/videos/" + "b" * 64 + "-other.mp4"})

    def list_video_objects(self):
        return self.objects

    def get(self, key):
        return b"video"

    def put(self, key, content, content_type):
        self.saved.append((key, content, content_type))

    def presign_get(self, key):
        return "https://example.test/video"


class FacebookResumeDestination:
    def __init__(self, existing=None, failure=None):
        self.existing = existing or []
        self.failure = failure
        self.reconcile_calls = 0
        self.publish_calls = 0

    def reconcile(self, post_text):
        self.reconcile_calls += 1
        return self.existing

    def publish(self, path, post_text):
        self.publish_calls += 1
        if self.failure:
            raise self.failure
        return {"id": "facebook-resumed"}


def unresolved_facebook_state():
    state = multi_publisher.initial_state()
    state["platforms"]["lifemode_facebook"]["uncertain"][FIRST_VIDEO_DIGEST] = {
        "file": "@sidneyraz-2026-10-07_1805-i-tried-#cozy-#lifehack-7693957734345002270.mp4",
        "r2_key": FIRST_VIDEO_KEY,
        "error": "Facebook video upload failed (400): code=324; message=Invalid upload",
    }
    return state


class CloudDryRunTests(unittest.TestCase):
    def test_load_remote_state_fails_closed_when_state_is_unavailable(self):
        class StateUnavailableR2:
            def get(self, key):
                raise cloud_publisher.R2Error("state unavailable")

        with self.assertRaisesRegex(cloud_publisher.R2Error, "state unavailable"):
            cloud_publisher.load_remote_state(StateUnavailableR2())

    def test_select_objects_skips_completed_and_uncertain_videos(self):
        objects = [
            {"key": "a" * 64 + "-first.mp4", "digest": "a" * 64},
            {"key": "b" * 64 + "-next.mp4", "digest": "b" * 64},
            {"key": "c" * 64 + "-uncertain.mp4", "digest": "c" * 64},
        ]
        platform_state = {
            "published": {"a" * 64: {"post_id": "done"}},
            "uncertain": {"c" * 64: {"error": "unknown"}},
        }

        self.assertEqual(cloud_publisher.select_objects(objects, platform_state), [objects[1]])

    def test_completed_first_video_is_excluded_for_every_destination(self):
        first_video = {"key": cloud_publisher.FIRST_VIDEO_KEY, "digest": cloud_publisher.FIRST_VIDEO_DIGEST}
        state = multi_publisher.initial_state()
        for platform_state in state["platforms"].values():
            platform_state["published"][cloud_publisher.FIRST_VIDEO_DIGEST] = {"post_id": "confirmed"}

        for name in multi_publisher.PLATFORMS:
            self.assertEqual(cloud_publisher.select_objects([first_video], state["platforms"][name]), [])

    def test_scheduled_state_requires_first_video_confirmation_for_all_destinations(self):
        state = multi_publisher.initial_state()
        for platform_state in state["platforms"].values():
            platform_state["published"][cloud_publisher.FIRST_VIDEO_DIGEST] = {"post_id": "confirmed"}

        cloud_publisher.require_completed_first_video_state(state)
        del state["platforms"]["lifemode_facebook"]["published"][cloud_publisher.FIRST_VIDEO_DIGEST]
        with self.assertRaisesRegex(cloud_publisher.R2Error, "lifemode_facebook"):
            cloud_publisher.require_completed_first_video_state(state)

    def test_publish_first_video_publishes_only_target_to_all_destinations_and_updates_state(self):
        r2 = FirstVideoR2(extra=True)
        calls = []
        destinations = live_destinations(calls)
        state = multi_publisher.initial_state()

        with patch.object(cloud_publisher, "R2Client", return_value=r2), \
             patch.object(cloud_publisher.multi_publisher, "build_destinations", return_value=destinations), \
             patch.object(cloud_publisher, "load_remote_state", return_value=state), \
             patch.object(cloud_publisher, "save_remote_state"), \
             patch.object(cloud_publisher, "upload_cover", return_value="https://example.test/cover"), \
             patch.object(cloud_publisher, "fingerprint", return_value=FIRST_VIDEO_DIGEST):
            result = cloud_publisher.run("publish-first-video")

        self.assertEqual(result, 0)
        self.assertEqual(calls, list(multi_publisher.PLATFORMS))
        for name in multi_publisher.PLATFORMS:
            platform_state = state["platforms"][name]
            self.assertIn(FIRST_VIDEO_DIGEST, platform_state["published"])
            self.assertNotIn(FIRST_VIDEO_DIGEST, platform_state["uncertain"])

    def test_publish_first_video_records_failure_and_refuses_uncertain_retry(self):
        calls = []
        destinations = live_destinations(calls, failure_name="lifemode_facebook")
        state = multi_publisher.initial_state()
        r2 = FirstVideoR2()
        patches = [
            patch.object(cloud_publisher, "R2Client", return_value=r2),
            patch.object(cloud_publisher.multi_publisher, "build_destinations", return_value=destinations),
            patch.object(cloud_publisher, "load_remote_state", return_value=state),
            patch.object(cloud_publisher, "save_remote_state"),
            patch.object(cloud_publisher, "upload_cover", return_value="https://example.test/cover"),
            patch.object(cloud_publisher, "fingerprint", return_value=FIRST_VIDEO_DIGEST),
        ]
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
            result = cloud_publisher.run("publish-first-video")
        self.assertEqual(result, 1)
        self.assertIn(FIRST_VIDEO_DIGEST, state["platforms"]["lifemode_facebook"]["uncertain"])
        first_call_count = len(calls)
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
            retry_result = cloud_publisher.run("publish-first-video")
        self.assertEqual(retry_result, 1)
        self.assertEqual(len(calls), first_call_count)

    def test_publish_first_video_records_unexpected_adapter_failure_as_uncertain(self):
        calls = []
        destinations = live_destinations(calls)
        destinations["everyday_pinterest"] = PinterestLiveDestination(
            "everyday_pinterest", calls, TypeError("unexpected adapter contract")
        )
        state = multi_publisher.initial_state()
        r2 = FirstVideoR2()

        with patch.object(cloud_publisher, "R2Client", return_value=r2), \
             patch.object(cloud_publisher.multi_publisher, "build_destinations", return_value=destinations), \
             patch.object(cloud_publisher, "load_remote_state", return_value=state), \
             patch.object(cloud_publisher, "save_remote_state"), \
             patch.object(cloud_publisher, "upload_cover", return_value="https://example.test/cover"), \
             patch.object(cloud_publisher, "fingerprint", return_value=FIRST_VIDEO_DIGEST):
            result = cloud_publisher.run("publish-first-video")

        self.assertEqual(result, 1)
        platform_state = state["platforms"]["everyday_pinterest"]
        self.assertNotIn(FIRST_VIDEO_DIGEST, platform_state["in_progress"])
        self.assertEqual(
            platform_state["uncertain"][FIRST_VIDEO_DIGEST]["error"],
            "unexpected adapter contract",
        )

    def test_publish_first_video_recovers_known_legacy_pre_call_state(self):
        calls = []
        destinations = live_destinations(calls)
        state = multi_publisher.initial_state()
        state["platforms"]["everyday_pinterest"]["in_progress"][FIRST_VIDEO_DIGEST] = {
            "file": "@sidneyraz-2026-10-07_1805-i-tried-#cozy-#lifehack-7693957734345002270.mp4",
            "r2_key": FIRST_VIDEO_KEY,
        }

        with patch.object(cloud_publisher, "R2Client", return_value=FirstVideoR2()), \
             patch.object(cloud_publisher.multi_publisher, "build_destinations", return_value=destinations), \
             patch.object(cloud_publisher, "load_remote_state", return_value=state), \
             patch.object(cloud_publisher, "save_remote_state"), \
             patch.object(cloud_publisher, "upload_cover", return_value="https://example.test/cover"), \
             patch.object(cloud_publisher, "fingerprint", return_value=FIRST_VIDEO_DIGEST):
            result = cloud_publisher.run("publish-first-video")

        self.assertEqual(result, 0)
        self.assertEqual(calls, list(multi_publisher.PLATFORMS))
        self.assertNotIn(FIRST_VIDEO_DIGEST, state["platforms"]["everyday_pinterest"]["in_progress"])

    def test_publish_first_video_refuses_attempted_in_progress_state(self):
        calls = []
        destinations = live_destinations(calls)
        state = multi_publisher.initial_state()
        state["platforms"]["everyday_pinterest"]["in_progress"][FIRST_VIDEO_DIGEST] = {
            "file": "target.mp4",
            "r2_key": FIRST_VIDEO_KEY,
            "publish_started": True,
        }

        with patch.object(cloud_publisher, "R2Client", return_value=FirstVideoR2()), \
             patch.object(cloud_publisher.multi_publisher, "build_destinations", return_value=destinations), \
             patch.object(cloud_publisher, "load_remote_state", return_value=state), \
             patch.object(cloud_publisher, "save_remote_state"), \
             patch.object(cloud_publisher, "fingerprint", return_value=FIRST_VIDEO_DIGEST):
            result = cloud_publisher.run("publish-first-video")

        self.assertEqual(result, 1)
        self.assertEqual(calls, [])

    def test_publish_first_video_skips_already_published_destination(self):
        calls = []
        destinations = live_destinations(calls)
        state = multi_publisher.initial_state()
        state["platforms"]["everyday_pinterest"]["published"][FIRST_VIDEO_DIGEST] = {
            "file": "target.mp4",
            "r2_key": FIRST_VIDEO_KEY,
            "post_id": "existing-pin",
        }

        with patch.object(cloud_publisher, "R2Client", return_value=FirstVideoR2()), \
             patch.object(cloud_publisher.multi_publisher, "build_destinations", return_value=destinations), \
             patch.object(cloud_publisher, "load_remote_state", return_value=state), \
             patch.object(cloud_publisher, "save_remote_state"), \
             patch.object(cloud_publisher, "upload_cover", return_value="https://example.test/cover"), \
             patch.object(cloud_publisher, "fingerprint", return_value=FIRST_VIDEO_DIGEST):
            result = cloud_publisher.run("publish-first-video")

        self.assertEqual(result, 0)
        self.assertEqual(calls, list(multi_publisher.PLATFORMS)[1:])

    def test_publish_first_video_fails_closed_when_target_is_missing(self):
        calls = []
        destinations = live_destinations(calls)
        state = multi_publisher.initial_state()
        r2 = FirstVideoR2()
        r2.objects = [{"key": "lifemode-life-hacks/videos/" + "b" * 64 + "-other.mp4"}]

        with patch.object(cloud_publisher, "R2Client", return_value=r2), \
             patch.object(cloud_publisher.multi_publisher, "build_destinations", return_value=destinations), \
             patch.object(cloud_publisher, "load_remote_state", return_value=state), \
             patch.object(cloud_publisher, "save_remote_state"), \
             patch.object(cloud_publisher, "fingerprint", return_value="b" * 64):
            result = cloud_publisher.run("publish-first-video")

        self.assertEqual(result, 1)
        self.assertEqual(calls, [])

    def test_facebook_resume_reconciles_existing_post_without_republishing(self):
        r2 = FirstVideoR2()
        objects = [{**obj, "digest": FIRST_VIDEO_DIGEST} for obj in r2.objects]
        destination = FacebookResumeDestination(existing=[{"id": "facebook-existing"}])
        state = unresolved_facebook_state()

        with patch.object(cloud_publisher, "save_remote_state"):
            result = cloud_publisher.resume_facebook_first_video(r2, objects, destination, state)

        self.assertEqual(result, 0)
        self.assertEqual(destination.reconcile_calls, 1)
        self.assertEqual(destination.publish_calls, 0)
        platform_state = state["platforms"]["lifemode_facebook"]
        self.assertEqual(platform_state["published"][FIRST_VIDEO_DIGEST]["post_id"], "facebook-existing")
        self.assertNotIn(FIRST_VIDEO_DIGEST, platform_state["uncertain"])

    def test_facebook_resume_uploads_only_after_no_matching_post(self):
        r2 = FirstVideoR2()
        objects = [{**obj, "digest": FIRST_VIDEO_DIGEST} for obj in r2.objects]
        destination = FacebookResumeDestination()
        state = unresolved_facebook_state()

        with patch.object(cloud_publisher, "save_remote_state"), \
             patch.object(cloud_publisher, "fingerprint", return_value=FIRST_VIDEO_DIGEST):
            result = cloud_publisher.resume_facebook_first_video(r2, objects, destination, state)

        self.assertEqual(result, 0)
        self.assertEqual(destination.reconcile_calls, 1)
        self.assertEqual(destination.publish_calls, 1)
        platform_state = state["platforms"]["lifemode_facebook"]
        self.assertEqual(platform_state["published"][FIRST_VIDEO_DIGEST]["post_id"], "facebook-resumed")
        self.assertNotIn(FIRST_VIDEO_DIGEST, platform_state["uncertain"])

    def test_facebook_resume_refuses_ambiguous_duplicate_matches(self):
        r2 = FirstVideoR2()
        objects = [{**obj, "digest": FIRST_VIDEO_DIGEST} for obj in r2.objects]
        destination = FacebookResumeDestination(existing=[{"id": "facebook-1"}, {"id": "facebook-2"}])
        state = unresolved_facebook_state()

        with patch.object(cloud_publisher, "save_remote_state"):
            result = cloud_publisher.resume_facebook_first_video(r2, objects, destination, state)

        self.assertEqual(result, 1)
        self.assertEqual(destination.publish_calls, 0)
        self.assertIn(FIRST_VIDEO_DIGEST, state["platforms"]["lifemode_facebook"]["uncertain"])

    def test_preflight_reports_all_destinations_and_succeeds_only_when_all_ready(self):
        destinations = {name: NoPublishDestination(name) for name in multi_publisher.PLATFORMS}

        with patch.object(cloud_publisher, "R2Client", return_value=FakeR2()), \
             patch.object(cloud_publisher.multi_publisher, "build_destinations", return_value=destinations), \
             patch.object(cloud_publisher, "load_remote_state", return_value=multi_publisher.initial_state()):
            output = StringIO()
            with redirect_stdout(output):
                result = cloud_publisher.run("preflight")

        self.assertEqual(result, 0)
        text = output.getvalue()
        for name in multi_publisher.PLATFORMS:
            self.assertIn(f"Preflight OK: {name}", text)
        self.assertIn("Cloud preflight: r2_objects=1, ready=4, unavailable=0", text)

    def test_preflight_fails_and_reports_unavailable_destination(self):
        destinations = {name: NoPublishDestination(name) for name in multi_publisher.PLATFORMS}
        destinations["lifemode_threads"] = FailedPreflightDestination("lifemode_threads")

        with patch.object(cloud_publisher, "R2Client", return_value=FakeR2()), \
             patch.object(cloud_publisher.multi_publisher, "build_destinations", return_value=destinations), \
             patch.object(cloud_publisher, "load_remote_state", return_value=multi_publisher.initial_state()):
            output = StringIO()
            with redirect_stdout(output):
                result = cloud_publisher.run("preflight")

        self.assertEqual(result, 1)
        text = output.getvalue()
        self.assertIn("Preflight unavailable: lifemode_threads: simulated preflight failure", text)
        self.assertIn("Cloud preflight: r2_objects=1, ready=3, unavailable=1", text)

    def test_preflight_returns_nonzero_when_r2_listing_fails(self):
        with patch.object(cloud_publisher, "R2Client", side_effect=cloud_publisher.R2Error("R2 GET failed")):
            output = StringIO()
            with redirect_stdout(output):
                result = cloud_publisher.main(["--preflight"])

        self.assertEqual(result, 1)
        self.assertIn("Cloud preflight failed: R2 GET failed", output.getvalue())

    def test_dry_run_previews_all_destinations_without_publish_or_state_write(self):
        destinations = {name: NoPublishDestination(name) for name in multi_publisher.PLATFORMS}
        state = multi_publisher.initial_state()

        with patch.object(cloud_publisher, "R2Client", return_value=FakeR2()), \
             patch.object(cloud_publisher.multi_publisher, "build_destinations", return_value=destinations), \
             patch.object(cloud_publisher, "load_remote_state", return_value=state), \
             patch.object(cloud_publisher, "save_remote_state", side_effect=AssertionError("dry-run must not write state")):
            result = cloud_publisher.run("dry-run")

        self.assertEqual(result, 0)

    def test_main_dry_run_emits_preview_log(self):
        destinations = {name: NoPublishDestination(name) for name in multi_publisher.PLATFORMS}
        state = multi_publisher.initial_state()

        with patch.object(cloud_publisher, "R2Client", return_value=FakeR2()), \
             patch.object(cloud_publisher.multi_publisher, "build_destinations", return_value=destinations), \
             patch.object(cloud_publisher, "load_remote_state", return_value=state), \
             patch.object(cloud_publisher, "save_remote_state", side_effect=AssertionError("dry-run must not write state")):
            output = StringIO()
            with redirect_stderr(output):
                result = cloud_publisher.main(["--dry-run"])

        self.assertEqual(result, 0)
        self.assertIn("Dry-run preview", output.getvalue())

    def test_dry_run_fails_for_invalid_post_text_without_publishing(self):
        destinations = {name: NoPublishDestination(name) for name in multi_publisher.PLATFORMS}
        state = multi_publisher.initial_state()
        objects = [{"key": "a" * 64 + "-2026-04-16_1710-550.mp4"}]

        with patch.object(cloud_publisher, "R2Client", return_value=SimpleNamespace(list_video_objects=lambda: objects)), \
             patch.object(cloud_publisher.multi_publisher, "build_destinations", return_value=destinations), \
             patch.object(cloud_publisher, "build_post_text", return_value=PostText("", "description", "@creator")), \
             patch.object(cloud_publisher, "load_remote_state", return_value=state), \
             patch.object(cloud_publisher, "save_remote_state", side_effect=AssertionError("dry-run must not write state")):
            result = cloud_publisher.run("dry-run")

        self.assertEqual(result, 1)


if __name__ == "__main__":
    unittest.main()
