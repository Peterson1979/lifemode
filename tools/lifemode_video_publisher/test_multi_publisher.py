import unittest
from types import SimpleNamespace

import multi_publisher


class FakeFacebookApi:
    def __init__(self, page):
        self.page = page

    def request(self, method, path, query=None):
        return 200, self.page


def make_destination(page):
    config = SimpleNamespace(
        facebook_api_base="https://graph.facebook.com/v20.0",
        facebook_token="test-page-token",
        facebook_page_id="226949230493910",
    )
    destination = multi_publisher.FacebookDestination(config)
    destination.api = FakeFacebookApi(page)
    return destination


class FacebookPreflightTests(unittest.TestCase):
    def test_matching_page_id_passes_without_relying_on_link(self):
        for page in (
            {"id": "226949230493910", "name": "LifeMode", "link": ""},
            {"id": "226949230493910", "name": "LifeMode", "link": "https://www.facebook.com/another-public-url"},
        ):
            with self.subTest(link=page["link"]):
                self.assertEqual(make_destination(page).preflight(), page)

    def test_mismatched_page_id_fails(self):
        destination = make_destination({"id": "999999999999999", "name": "Other Page", "link": ""})

        with self.assertRaisesRegex(multi_publisher.ApiError, "different page ID"):
            destination.preflight()


if __name__ == "__main__":
    unittest.main()
