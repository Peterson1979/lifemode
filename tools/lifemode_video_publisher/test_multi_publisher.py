import unittest
import json
import tempfile
from types import SimpleNamespace
from pathlib import Path
from urllib.error import HTTPError
from unittest.mock import patch

import multi_publisher
from publisher import PostText


class FakeFacebookApi:
    def __init__(self, page, accounts=None):
        self.page = page
        self.accounts = accounts or [{"id": "226949230493910", "tasks": ["CREATE_CONTENT"]}]
        self.calls = []

    def request(self, method, path, query=None):
        self.calls.append((method, path, query))
        if path == "/me/accounts":
            return 200, {"data": self.accounts}
        return 200, self.page


def make_destination(page):
    config = SimpleNamespace(
        facebook_api_base="https://graph.facebook.com/v20.0",
        facebook_token="test-page-token",
        facebook_user_token="test-user-token",
        facebook_page_id="226949230493910",
    )
    destination = multi_publisher.FacebookDestination(config)
    destination.api = FakeFacebookApi(page)
    destination.permission_api = FakeFacebookApi(page)
    return destination


class FacebookPreflightTests(unittest.TestCase):
    def test_matching_page_id_passes_without_relying_on_link(self):
        for page in (
            {"id": "226949230493910", "name": "LifeMode", "link": ""},
            {"id": "226949230493910", "name": "LifeMode", "link": "https://www.facebook.com/another-public-url"},
        ):
            with self.subTest(link=page["link"]):
                destination = make_destination(page)
                self.assertEqual(destination.preflight(), page)
                self.assertEqual(destination.api.calls[0][2]["fields"], "id,name,link")
                self.assertEqual(destination.permission_api.calls[0][2]["fields"], "id,tasks")

    def test_mismatched_page_id_fails(self):
        destination = make_destination({"id": "999999999999999", "name": "Other Page", "link": ""})

        with self.assertRaisesRegex(multi_publisher.ApiError, "different page ID"):
            destination.preflight()

    def test_missing_create_content_task_fails_before_upload(self):
        destination = make_destination({"id": "226949230493910", "name": "LifeMode", "link": ""})
        destination.permission_api = FakeFacebookApi(
            destination.api.page,
            accounts=[{"id": "226949230493910", "tasks": ["MODERATE"]}],
        )

        with self.assertRaisesRegex(multi_publisher.ApiError, "CREATE_CONTENT"):
            destination.preflight()

    def test_page_endpoint_does_not_request_unsupported_tasks_field(self):
        destination = make_destination({"id": "226949230493910", "name": "LifeMode", "link": ""})

        class UnsupportedPageTasksApi(FakeFacebookApi):
            def request(self, method, path, query=None):
                if path != "/me/accounts" and "tasks" in query.get("fields", ""):
                    raise AssertionError("Page endpoint must not request tasks")
                return super().request(method, path, query)

        destination.api = UnsupportedPageTasksApi(destination.api.page)

        self.assertEqual(destination.preflight()["id"], "226949230493910")

    def test_page_token_permission_failure_is_reported_without_token(self):
        destination = make_destination({"id": "226949230493910", "name": "LifeMode", "link": "", "tasks": ["CREATE_CONTENT"]})
        token = destination.config.facebook_token
        body = json.dumps({
            "error": {
                "message": "(#100) No permission to publish the video",
                "type": "OAuthException",
                "code": 100,
            }
        }).encode()
        error = HTTPError("https://graph.facebook.com", 400, "Bad Request", {}, None)
        error.read = lambda: body

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            path = Path(directory) / "video.mp4"
            path.write_bytes(b"video-bytes")
            with patch.object(multi_publisher.urllib.request, "urlopen", side_effect=error):
                with self.assertRaisesRegex(multi_publisher.ApiError, r"400.*code=100.*No permission to publish the video") as raised:
                    destination.publish(path, PostText("Title", "Description", "@creator"))
        self.assertNotIn(token, str(raised.exception))


class FacebookPublishTests(unittest.TestCase):
    def test_http_error_reports_graph_code_and_message_without_token(self):
        token = "test-page-token"
        body = json.dumps({"error": {"message": f"Permission denied for {token}", "type": "OAuthException", "code": 200, "error_subcode": 10}}).encode()
        error = HTTPError("https://graph.facebook.com", 400, "Bad Request", {}, None)
        error.read = lambda: body

        details = multi_publisher.facebook_http_error_details(error, token)

        self.assertIn("code=200", details)
        self.assertIn("error_subcode=10", details)
        self.assertIn("message=Permission denied for [REDACTED]", details)
        self.assertNotIn(token, details)

    def test_upload_request_contains_required_multipart_fields(self):
        destination = make_destination({"id": "226949230493910"})

        class Response:
            status = 200

            def read(self):
                return b'{"id":"video-1"}'

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        response = Response()

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            path = Path(directory) / "video.mp4"
            path.write_bytes(b"video-bytes")
            with patch.object(multi_publisher.urllib.request, "urlopen", return_value=response) as urlopen:
                result = destination.publish(path, PostText("Title", "Description", "@creator"))

        request = urlopen.call_args.args[0]
        body = request.data
        self.assertEqual(result, {"id": "video-1"})
        self.assertEqual(request.method, "POST")
        self.assertIn(b'name="source"', body)
        self.assertIn(b'name="title"', body)
        self.assertIn(b'name="description"', body)
        self.assertIn(b"\r\n\r\nTitle\r\n", body)
        self.assertIn(b"\r\n\r\nTitle\n\nDescription\n@creator\nhttps://lifemode.bio.link/\r\n", body)
        self.assertIn(b"video-bytes", body)

    def test_http_error_from_upload_includes_sanitized_details(self):
        destination = make_destination({"id": "226949230493910"})
        body = json.dumps({"error": {"message": "Invalid upload", "code": 324}}).encode()
        error = HTTPError("https://graph.facebook.com", 400, "Bad Request", {}, None)
        error.read = lambda: body

        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            path = Path(directory) / "video.mp4"
            path.write_bytes(b"video-bytes")
            with patch.object(multi_publisher.urllib.request, "urlopen", side_effect=error):
                with self.assertRaisesRegex(multi_publisher.ApiError, r"400.*code=324.*message=Invalid upload"):
                    destination.publish(path, PostText("Title", "Description", "@creator"))


if __name__ == "__main__":
    unittest.main()
