import unittest
from unittest.mock import MagicMock, patch

from app.gaggle_service import (
    GaggleClient,
    _extract_codes_from_events,
    _extract_created_email,
    _extract_created_group,
)


class GaggleServiceTests(unittest.TestCase):
    def test_extract_created_email_prefers_new_membership(self):
        payload = {
            "success": True,
            "newMembership": {
                "displayEmail": "freshbox@gaggle.email",
                "listId": "list-freshbox",
            },
            "groups": [
                {"name": "freshbox", "displayEmail": "stale@gaggle.email"},
            ],
        }

        self.assertEqual(
            _extract_created_email(payload, "freshbox"),
            "freshbox@gaggle.email",
        )

        self.assertEqual(
            _extract_created_group(payload, "freshbox"),
            {
                "email": "freshbox@gaggle.email",
                "list_id": "list-freshbox",
            },
        )

    def test_extract_codes_from_events_filters_to_openai_messages(self):
        events = [
            [
                "2026-04-17T09:08:52.032552",
                "38",
                "Your ChatGPT code is 013646",
                "noreply@tm.openai.com",
                "",
                "Sender does not have permission to send to group",
            ],
            [
                "2026-04-17T09:06:54.947574",
                "38",
                "你的 ChatGPT 代码为 642496",
                "noreply@tm.openai.com",
                "",
                "Sender does not have permission to send to group",
            ],
            [
                "2026-04-17T09:05:34.745854",
                "0",
                "newsletter",
                "someone@example.com",
                "",
                "Here is a random code 999999",
            ],
        ]

        self.assertEqual(
            _extract_codes_from_events(events),
            ["013646", "642496"],
        )

    @patch("app.gaggle_service._get_csrf_token", return_value="csrf-token")
    @patch("app.gaggle_service._get_cookie_header", return_value="session=test")
    def test_create_group_updates_who_can_send(self, _get_cookie_header, _get_csrf_token):
        client = GaggleClient()

        create_resp = MagicMock()
        create_resp.status_code = 200
        create_resp.json.return_value = {
            "success": True,
            "newMembership": {
                "displayEmail": "freshbox@gaggle.email",
                "listId": "list-freshbox",
            },
        }
        create_resp.raise_for_status.return_value = None

        patch_resp = MagicMock()
        patch_resp.status_code = 200
        patch_resp.json.return_value = {"success": True}
        patch_resp.raise_for_status.return_value = None

        client.session.post = MagicMock(return_value=create_resp)
        client.session.patch = MagicMock(return_value=patch_resp)

        email = client.create_group("freshbox")

        self.assertEqual(email, "freshbox@gaggle.email")
        client.session.patch.assert_called_once()
        patch_url = client.session.patch.call_args.args[0]
        self.assertEqual(
            patch_url,
            "https://gaggle.email/list/settings/list-freshbox",
        )
        self.assertEqual(
            client.session.patch.call_args.kwargs["json"],
            {"whoCanSend": "anyone"},
        )


if __name__ == "__main__":
    unittest.main()
