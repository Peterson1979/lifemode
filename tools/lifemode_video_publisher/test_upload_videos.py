import tempfile
import unittest
from pathlib import Path

import upload_videos
from r2_storage import R2Error


class FakeR2:
    def __init__(self, existing=None, put_error=None, verify_status=200):
        self.existing = set(existing or ())
        self.put_error = put_error
        self.verify_status = verify_status
        self.puts = []
        self.head_calls = 0

    def head(self, key):
        self.head_calls += 1
        if key in self.existing:
            return 200
        return 404 if self.head_calls == 1 else self.verify_status

    def put(self, key, content, content_type):
        if self.put_error:
            raise self.put_error
        self.puts.append((key, content, content_type))


class UploadVideosTests(unittest.TestCase):
    def test_digest_based_naming_and_post_upload_verification(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            path = Path(directory) / "life-hack.MP4"
            content = b"test video bytes"
            path.write_bytes(content)
            client = FakeR2()

            result = upload_videos.upload_video(path, client)

            expected_digest = upload_videos.file_sha256(path)
            self.assertEqual(result["digest"], expected_digest)
            self.assertEqual(client.puts[0][0], f"lifemode-life-hacks/videos/{expected_digest}-life-hack.MP4")
            self.assertEqual(client.puts[0][1], content)
            self.assertEqual(client.head_calls, 2)

    def test_invalid_files_are_rejected(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            root = Path(directory)
            client = FakeR2()
            with self.assertRaisesRegex(upload_videos.UploadError, "does not exist"):
                upload_videos.upload_video(root / "missing.mp4", client)
            unsupported = root / "notes.txt"
            unsupported.write_text("not a video", encoding="utf-8")
            with self.assertRaisesRegex(upload_videos.UploadError, "Unsupported video extension"):
                upload_videos.upload_video(unsupported, client)

    def test_existing_object_and_upload_failure_do_not_overwrite(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            path = Path(directory) / "life-hack.mp4"
            path.write_bytes(b"test video bytes")
            digest = upload_videos.file_sha256(path)
            key = f"lifemode-life-hacks/videos/{digest}-life-hack.mp4"
            with self.assertRaisesRegex(upload_videos.UploadError, "refusing to overwrite"):
                upload_videos.upload_video(path, FakeR2(existing={key}))

            with self.assertRaisesRegex(upload_videos.UploadError, "R2 upload failed"):
                upload_videos.upload_video(path, FakeR2(put_error=R2Error("permission denied")))


if __name__ == "__main__":
    unittest.main()
