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


class CloudDryRunTests(unittest.TestCase):
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
