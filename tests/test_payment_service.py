import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

from app import payment_service


class FakeResponse:
    def __init__(self, payload, status_code=200, text=None):
        self._payload = payload
        self.status_code = status_code
        self.text = text if text is not None else str(payload)

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self):
        self.get_calls = []
        self.post_calls = []
        self.get_responses = []
        self.post_responses = []

    def get(self, *args, **kwargs):
        self.get_calls.append((args, kwargs))
        if not self.get_responses:
            raise AssertionError("unexpected GET")
        return self.get_responses.pop(0)

    def post(self, *args, **kwargs):
        self.post_calls.append((args, kwargs))
        if not self.post_responses:
            raise AssertionError("unexpected POST")
        return self.post_responses.pop(0)


def payment_cfg(**overrides):
    values = {
        "webshare_api_key": "ws-key",
        "webshare_plan_id": "",
        "proxy_debug_mode": False,
        "debug_proxy_type": "http",
        "debug_proxy_host": "",
        "debug_proxy_port": 8080,
        "debug_proxy_use_auth": False,
        "debug_proxy_username": "",
        "debug_proxy_password": "",
        "card_debug_mode": False,
        "debug_card_key": "",
        "card_keys_file": "card-keys.txt",
        "phone_keys_file": "phone-keys.txt",
        "card_usage_file": "usage.json",
        "request_payurl_api": "https://payurl.example/api/request",
        "redeem_api": "https://cards.example/web-api/redeem/submit",
        "redeem_device_id": "device-123",
        "http_timeout": 30,
        "payurl_max_retries": 5,
        "webshare_poll_interval": 1,
        "webshare_poll_timeout": 30,
    }
    values.update(overrides)
    return types.SimpleNamespace(**values)


class PaymentServiceTests(unittest.TestCase):
    def test_parse_paypal_phone_key(self):
        phone_key = payment_service.parse_paypal_phone_key(
            "+15555550123|https://sms.example/code"
        )

        self.assertEqual(phone_key.phone, "+15555550123")
        self.assertEqual(phone_key.sms_url, "https://sms.example/code")
        self.assertEqual(phone_key.raw, "+15555550123|https://sms.example/code")

    def test_parse_paypal_phone_key_rejects_bad_format(self):
        with self.assertRaisesRegex(ValueError, "phone-keys.txt"):
            payment_service.parse_paypal_phone_key("+15555550123")

    def test_extract_six_digit_code(self):
        self.assertEqual(
            payment_service.extract_six_digit_code("Your code is 123456."),
            "123456",
        )
        self.assertIsNone(payment_service.extract_six_digit_code("code 12345"))

    @mock.patch("app.payment_service.time.sleep", return_value=None)
    def test_wait_for_paypal_sms_code_polls_until_code(self, _sleep):
        session = FakeSession()
        session.get_responses = [
            FakeResponse({}, text="pending"),
            FakeResponse({}, text="PayPal code 654321"),
        ]

        code = payment_service.wait_for_paypal_sms_code(
            "https://sms.example/code",
            session=session,
            timeout=20,
            poll_interval=1,
            payment_cfg=payment_cfg(),
        )

        self.assertEqual(code, "654321")
        self.assertEqual(len(session.get_calls), 2)

    def test_reserve_next_paypal_phone_skips_successfully_used_only(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            keys_path = Path(tmpdir) / "phone-keys.txt"
            usage_path = Path(tmpdir) / "paypal_phone_keys_usage.json"
            keys_path.write_text(
                "+15550000001|https://sms.example/1\n"
                "+15550000002|https://sms.example/2\n",
                encoding="utf-8",
            )
            usage_path.write_text(
                '{"phones": {"+15550000001|https://sms.example/1": {"status": "failed"}}}\n',
                encoding="utf-8",
            )

            phone_key = payment_service.reserve_next_paypal_phone(
                email="user@example.com",
                payment_cfg=payment_cfg(
                    phone_keys_file=str(keys_path),
                    card_usage_file=str(Path(tmpdir) / "card_usage.json"),
                ),
            )

            self.assertEqual(phone_key.phone, "+15550000001")

            payment_service.mark_paypal_phone_used(
                phone_key,
                email="user@example.com",
                payment_cfg=payment_cfg(
                    phone_keys_file=str(keys_path),
                    card_usage_file=str(Path(tmpdir) / "card_usage.json"),
                ),
            )
            next_phone_key = payment_service.reserve_next_paypal_phone(
                email="user2@example.com",
                payment_cfg=payment_cfg(
                    phone_keys_file=str(keys_path),
                    card_usage_file=str(Path(tmpdir) / "card_usage.json"),
                ),
            )

            self.assertEqual(next_phone_key.phone, "+15550000002")

    def test_get_current_webshare_static_proxy_returns_first_proxy(self):
        session = FakeSession()
        session.get_responses = [
            FakeResponse(
                {
                    "results": [
                        {
                            "proxy_address": "3.3.3.3",
                            "port": 8080,
                            "socks5_port": 1080,
                            "username": "user",
                            "password": "pass",
                        }
                    ]
                }
            )
        ]

        proxy = payment_service.get_current_webshare_static_proxy(
            session=session,
            payment_cfg=payment_cfg(),
        )

        self.assertEqual(proxy["host"], "3.3.3.3")
        self.assertEqual(proxy["type"], "socks5")
        self.assertEqual(proxy["port"], 1080)
        self.assertTrue(proxy["use_auth"])
        self.assertEqual(proxy["username"], "user")
        self.assertEqual(len(session.get_calls), 1)
        self.assertEqual(session.post_calls, [])

    def test_get_current_webshare_static_proxy_debug_mode_skips_api_calls(self):
        session = FakeSession()

        proxy = payment_service.get_current_webshare_static_proxy(
            session=session,
            payment_cfg=payment_cfg(
                proxy_debug_mode=True,
                debug_proxy_type="http",
                debug_proxy_host="127.0.0.2",
                debug_proxy_port=7891,
                debug_proxy_use_auth=True,
                debug_proxy_username="debug-user",
                debug_proxy_password="debug-pass",
            ),
        )

        self.assertEqual(proxy["type"], "http")
        self.assertEqual(proxy["host"], "127.0.0.2")
        self.assertEqual(proxy["port"], 7891)
        self.assertTrue(proxy["use_auth"])
        self.assertEqual(proxy["username"], "debug-user")
        self.assertEqual(proxy["password"], "debug-pass")
        self.assertEqual(session.get_calls, [])
        self.assertEqual(session.post_calls, [])

    @mock.patch("app.payment_service.time.sleep", return_value=None)
    def test_replace_webshare_static_proxy_returns_refreshed_proxy(self, _sleep):
        session = FakeSession()
        session.get_responses = [
            FakeResponse(
                {
                    "results": [
                        {
                            "proxy_address": "1.1.1.1",
                            "port": 80,
                            "username": "user",
                            "password": "pass",
                        }
                    ]
                }
            ),
            FakeResponse({"id": "replacement-1", "status": "processing"}),
            FakeResponse({"id": "replacement-1", "status": "completed"}),
            FakeResponse(
                {
                    "results": [
                        {
                            "proxy_address": "2.2.2.2",
                            "port": 8080,
                            "socks5_port": 1080,
                            "username": "newuser",
                            "password": "newpass",
                        }
                    ]
                }
            ),
        ]
        session.post_responses = [
            FakeResponse({"id": "replacement-1", "status": "validating"})
        ]

        proxy = payment_service.replace_webshare_static_proxy(
            session=session,
            payment_cfg=payment_cfg(),
        )

        self.assertEqual(proxy["host"], "2.2.2.2")
        self.assertEqual(proxy["type"], "socks5")
        self.assertEqual(proxy["port"], 1080)
        self.assertTrue(proxy["use_auth"])
        self.assertEqual(proxy["username"], "newuser")
        replace_body = session.post_calls[0][1]["json"]
        self.assertEqual(
            replace_body["replace_with"],
            [{"type": "country", "country_code": "US", "count": 1}],
        )
        self.assertEqual(replace_body["to_replace"]["type"], "ip_address")
        self.assertEqual(replace_body["to_replace"]["ip_addresses"], ["1.1.1.1"])

    def test_replace_webshare_static_proxy_debug_mode_skips_api_calls(self):
        session = FakeSession()

        proxy = payment_service.replace_webshare_static_proxy(
            session=session,
            payment_cfg=payment_cfg(
                proxy_debug_mode=True,
                debug_proxy_type="socks5",
                debug_proxy_host="127.0.0.1",
                debug_proxy_port=7890,
                debug_proxy_use_auth=True,
                debug_proxy_username="debug-user",
                debug_proxy_password="debug-pass",
            ),
        )

        self.assertEqual(proxy["type"], "socks5")
        self.assertEqual(proxy["host"], "127.0.0.1")
        self.assertEqual(proxy["port"], 7890)
        self.assertTrue(proxy["use_auth"])
        self.assertEqual(proxy["username"], "debug-user")
        self.assertEqual(proxy["password"], "debug-pass")
        self.assertEqual(session.get_calls, [])
        self.assertEqual(session.post_calls, [])

    @mock.patch("app.payment_service.time.sleep", return_value=None)
    def test_request_stripe_payurl_retries_until_success(self, _sleep):
        session = FakeSession()
        session.post_responses = [
            FakeResponse({"status": "error"}, status_code=200),
            FakeResponse({"status": "success", "Stripe_payurl": "https://stripe.example/pay"}),
        ]

        payurl = payment_service.request_stripe_payurl(
            "access-token",
            session=session,
            payment_cfg=payment_cfg(payurl_max_retries=5),
        )

        self.assertEqual(payurl, "https://stripe.example/pay")
        self.assertEqual(len(session.post_calls), 2)
        self.assertEqual(session.post_calls[0][1]["json"], {"token": "access-token", "plus": True})

    @mock.patch("app.payment_service.time.sleep", return_value=None)
    def test_request_stripe_payurl_fails_after_max_retries(self, _sleep):
        session = FakeSession()
        session.post_responses = [FakeResponse({"status": "error"}) for _ in range(5)]

        with self.assertRaisesRegex(RuntimeError, "已重试 5 次"):
            payment_service.request_stripe_payurl(
                "access-token",
                session=session,
                payment_cfg=payment_cfg(payurl_max_retries=5),
            )

    def test_parse_delivery_content_strict_format(self):
        card = payment_service.parse_delivery_content(
            "4242424242424242----2028/7----123----15555555555----https://u.example----Jane Doe----123 Main St,New York NY 10001,US"
        )

        self.assertEqual(card.card, "4242424242424242")
        self.assertEqual(card.expiry_input, "0728")
        self.assertEqual(card.name, "Jane Doe")
        self.assertEqual(card.address, "123 Main St")
        self.assertEqual(card.city, "New York")
        self.assertEqual(card.state, "NY")
        self.assertEqual(card.postcode, "10001")

    def test_parse_delivery_content_splits_city_state_postcode_from_right(self):
        card = payment_service.parse_delivery_content(
            "4859540166489798----05/30----371----+15808657390----http://a.62-us.com/api/get_sms?key=4466b42957a6823cd879a9d9aa14d748----WILLIAM SAMPSON----916 PINE ST APT 2, PORT HURON MI 48060, US"
        )

        self.assertEqual(card.address, "916 PINE ST APT 2")
        self.assertEqual(card.city, "PORT HURON")
        self.assertEqual(card.state, "MI")
        self.assertEqual(card.postcode, "48060")

    def test_parse_delivery_content_rejects_missing_state(self):
        with self.assertRaisesRegex(ValueError, "city state postcode"):
            payment_service.parse_delivery_content(
                "4242424242424242----2028/7----123----15555555555----https://u.example----Jane Doe----123 Main St,New York 10001,US"
            )

    def test_redeem_next_card_marks_usage_and_skips_used_card(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            keys_path = Path(tmpdir) / "card-keys.txt"
            usage_path = Path(tmpdir) / "usage.json"
            keys_path.write_text("used-code\nfresh-code\n", encoding="utf-8")
            usage_path.write_text(
                '{"cards":{"used-code":{"called_at":"2026-01-01T00:00:00+00:00","status":"ok"}}}',
                encoding="utf-8",
            )
            session = FakeSession()
            session.post_responses = [
                FakeResponse(
                    {
                        "message": "ok",
                        "data": {
                            "deliveryContent": "4111111111111111----2029/12----987----1----https://u.example----John Smith----1 Test Rd,Austin TX 73301,US"
                        },
                    }
                )
            ]

            card = payment_service.redeem_next_card(
                email="user@example.com",
                session=session,
                payment_cfg=payment_cfg(
                    card_keys_file=str(keys_path),
                    card_usage_file=str(usage_path),
                ),
            )

            self.assertEqual(card.card, "4111111111111111")
            self.assertEqual(card.city, "Austin")
            self.assertEqual(card.state, "TX")
            self.assertEqual(card.postcode, "73301")
            self.assertEqual(session.post_calls[0][1]["json"]["redeemCode"], "fresh-code")
            self.assertIn('"fresh-code"', usage_path.read_text(encoding="utf-8"))

    def test_redeem_next_card_debug_mode_reuses_configured_card_key(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            usage_path = Path(tmpdir) / "usage.json"
            session = FakeSession()
            session.post_responses = [
                FakeResponse(
                    {
                        "message": "ok",
                        "data": {
                            "deliveryContent": "4111111111111111----2029/12----987----1----https://u.example----John Smith----1 Test Rd,Austin TX 73301,US"
                        },
                    }
                )
            ]

            card = payment_service.redeem_next_card(
                email="user@example.com",
                session=session,
                payment_cfg=payment_cfg(
                    card_debug_mode=True,
                    debug_card_key="debug-code",
                    card_keys_file=str(Path(tmpdir) / "missing-card-keys.txt"),
                    card_usage_file=str(usage_path),
                ),
            )

            self.assertEqual(card.card, "4111111111111111")
            self.assertEqual(card.city, "Austin")
            self.assertEqual(card.state, "TX")
            self.assertEqual(card.postcode, "73301")
            self.assertEqual(session.post_calls[0][1]["json"]["redeemCode"], "debug-code")
            usage_text = usage_path.read_text(encoding="utf-8")
            self.assertIn('"debug:debug-code"', usage_text)
            self.assertIn('"debug_mode": true', usage_text)

    def test_redeem_next_card_debug_mode_with_delivery_content_skips_api(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            usage_path = Path(tmpdir) / "usage.json"
            session = FakeSession()
            delivery_content = (
                "4859540156532730----2030/2----684----+13215330841----"
                "http://a.62-us.com/api/get_sms?key=c47b56829b79e77b6eef721d937d1e86----"
                "LATANYA DAVIS----8970 N HAGGERTY RD APT 101,PLYMOUTH MI 48170,US"
            )

            card = payment_service.redeem_next_card(
                email="user@example.com",
                session=session,
                payment_cfg=payment_cfg(
                    card_debug_mode=True,
                    debug_card_key=delivery_content,
                    card_usage_file=str(usage_path),
                ),
            )

            self.assertEqual(card.card, "4859540156532730")
            self.assertEqual(card.expiry_input, "0230")
            self.assertEqual(card.name, "LATANYA DAVIS")
            self.assertEqual(card.address, "8970 N HAGGERTY RD APT 101")
            self.assertEqual(card.city, "PLYMOUTH")
            self.assertEqual(card.state, "MI")
            self.assertEqual(card.postcode, "48170")
            self.assertEqual(session.post_calls, [])
            usage_text = usage_path.read_text(encoding="utf-8")
            self.assertIn('"debug_mode": true', usage_text)
            self.assertIn('"debug_delivery_content"', usage_text)

    def test_is_payment_simulation_enabled_requires_full_delivery_content(self):
        self.assertTrue(
            payment_service.is_payment_simulation_enabled(
                payment_cfg(
                    card_debug_mode=True,
                    debug_card_key=(
                        "4859540156532730----2030/2----684----+13215330841----"
                        "http://a.62-us.com/api/get_sms?key=key----LATANYA DAVIS----"
                        "8970 N HAGGERTY RD APT 101,PLYMOUTH MI 48170,US"
                    ),
                )
            )
        )
        self.assertFalse(
            payment_service.is_payment_simulation_enabled(
                payment_cfg(card_debug_mode=True, debug_card_key="debug-code")
            )
        )
        self.assertFalse(
            payment_service.is_payment_simulation_enabled(
                payment_cfg(
                    card_debug_mode=False,
                    debug_card_key=(
                        "4859540156532730----2030/2----684----+13215330841----"
                        "http://a.62-us.com/api/get_sms?key=key----LATANYA DAVIS----"
                        "8970 N HAGGERTY RD APT 101,PLYMOUTH MI 48170,US"
                    ),
                )
            )
        )


if __name__ == "__main__":
    unittest.main()
