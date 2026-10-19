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


class LiveDestination(NoPublishDestination):
    def __init__(self, name, calls, failure=None):
        super().__init__(name)
        self.calls = calls
        self.failure = failure

    def publish(self, *args, **kwargs):
        self.calls.append(self.name)
        if self.failure:
            raise self.failure
        return {"id": self.name + "-post"}


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


class CloudDryRunTests(unittest.TestCase):
    def test_publish_first_video_publishes_only_target_to_all_destinations_and_updates_state(self):
        r2 = FirstVideoR2(extra=True)
        calls = []
        destinations = {name: LiveDestination(name, calls) for name in multi_publisher.PLATFORMS}
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
        destinations = {name: LiveDestination(name, calls) for name in multi_publisher.PLATFORMS}
        destinations["lifemode_facebook"] = LiveDestination("lifemode_facebook", calls, multi_publisher.ApiError("failed"))
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

    def test_publish_first_video_fails_closed_when_target_is_missing(self):
        calls = []
        destinations = {name: LiveDestination(name, calls) for name in multi_publisher.PLATFORMS}
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
