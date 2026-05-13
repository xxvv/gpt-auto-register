import json
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
    def test_clear_paypal_cookies_and_cache_only_targets_paypal_domains(self):
        driver = mock.MagicMock()
        commands = []

        def fake_cdp(_driver, command, params, attempts=2):
            del attempts
            commands.append((command, params))
            if command == "Network.getCookies":
                return {
                    "cookies": [
                        {
                            "name": "session",
                            "domain": ".paypal.com",
                            "path": "/",
                        },
                        {
                            "name": "l7_az",
                            "domain": "www.paypal.com",
                            "path": "/checkoutweb",
                        },
                        {
                            "name": "sid",
                            "domain": ".stripe.com",
                            "path": "/",
                        },
                    ]
                }
            return {}

        with mock.patch(
            "app.payment_service._execute_cdp_cmd_with_target_recovery",
            side_effect=fake_cdp,
        ):
            payment_service.clear_paypal_cookies_and_cache(driver)

        delete_calls = [
            params for command, params in commands if command == "Network.deleteCookies"
        ]
        storage_calls = [
            params
            for command, params in commands
            if command == "Storage.clearDataForOrigin"
        ]

        self.assertEqual(
            delete_calls,
            [
                {"name": "session", "domain": ".paypal.com", "path": "/"},
                {
                    "name": "l7_az",
                    "domain": "www.paypal.com",
                    "path": "/checkoutweb",
                },
            ],
        )
        self.assertEqual(
            storage_calls,
            [
                {
                    "origin": "https://www.paypal.com",
                    "storageTypes": payment_service._PAYPAL_STORAGE_TYPES,
                },
                {
                    "origin": "https://paypal.com",
                    "storageTypes": payment_service._PAYPAL_STORAGE_TYPES,
                },
            ],
        )

    @mock.patch("app.payment_service.time.sleep", return_value=None)
    def test_with_window_target_recovery_recovers_and_retries(self, _sleep):
        driver = mock.MagicMock()
        lost = RuntimeError(
            "Message: no such window: target window already closed from unknown error: web view not found"
        )
        callback = mock.MagicMock(side_effect=[lost, "ok"])

        with mock.patch(
            "app.payment_service._recover_window_target", return_value=True
        ) as recover_target:
            result = payment_service._with_window_target_recovery(
                driver,
                "测试动作",
                callback,
                attempts=2,
            )

        self.assertEqual(result, "ok")
        self.assertEqual(callback.call_count, 2)
        recover_target.assert_called_once_with(driver)

    @mock.patch("app.payment_service.time.sleep", return_value=None)
    def test_open_stripe_payment_page_recovers_lost_window(self, _sleep):
        driver = mock.MagicMock()
        lost = RuntimeError(
            "Message: no such window: target window already closed from unknown error: web view not found"
        )
        driver.get.side_effect = [lost, None]

        with (
            mock.patch(
                "app.payment_service._recover_window_target", return_value=True
            ) as recover_target,
            mock.patch(
                "app.payment_service.verify_stripe_zero_amount", return_value="€0.00"
            ) as verify_amount,
        ):
            result = payment_service.open_stripe_payment_page(
                driver, "https://stripe.example/pay"
            )

        self.assertEqual(result, "€0.00")
        self.assertEqual(driver.get.call_count, 2)
        verify_amount.assert_called_once_with(driver)
        recover_target.assert_called_once_with(driver)

    def test_open_stripe_payment_page_clears_paypal_state_before_navigation(self):
        driver = mock.MagicMock()
        events = []

        def fake_clear(_driver):
            events.append("clear")

        def fake_get(url):
            events.append(("get", url))

        driver.get.side_effect = fake_get

        with (
            mock.patch(
                "app.payment_service.clear_paypal_cookies_and_cache",
                side_effect=fake_clear,
            ) as clear_paypal,
            mock.patch(
                "app.payment_service.verify_stripe_zero_amount", return_value="€0.00"
            ) as verify_amount,
        ):
            result = payment_service.open_stripe_payment_page(
                driver, "https://stripe.example/pay"
            )

        self.assertEqual(result, "€0.00")
        self.assertEqual(events, ["clear", ("get", "https://stripe.example/pay")])
        clear_paypal.assert_called_once_with(driver)
        verify_amount.assert_called_once_with(driver)

    @mock.patch("app.payment_service.time.sleep", return_value=None)
    def test_current_url_with_recovery_recovers_lost_window(self, _sleep):
        driver = mock.PropertyMock()
        lost = RuntimeError(
            "Message: no such window: target window already closed from unknown error: web view not found"
        )

        class Driver:
            pass

        instance = Driver()
        type(instance).current_url = driver
        driver.side_effect = [lost, "https://www.paypal.com/checkoutweb/signup"]

        with mock.patch(
            "app.payment_service._recover_window_target", return_value=True
        ) as recover_target:
            result = payment_service._current_url_with_recovery(instance)

        self.assertEqual(result, "https://www.paypal.com/checkoutweb/signup")
        recover_target.assert_called_once_with(instance)

    def test_fill_stripe_billing_details_fills_required_fields_and_checks_terms(self):
        card = payment_service.PaymentCard(
            card="4111111111111111",
            year="2030",
            month="02",
            cvv="123",
            phone="+15555550123",
            url="https://example.test",
            name="Jane Doe",
            address="123 Main St",
            city="Austin",
            state="TX",
            postcode="73301",
            country="US",
        )
        events = []

        class FakeField:
            def __init__(self, selector, selected=False):
                self.selector = selector
                self._selected = selected

            def is_selected(self):
                return self._selected

            def click(self):
                events.append(("click", self.selector))
                self._selected = True

        elements = {
            "#billingName": FakeField("#billingName"),
            "#billingAddressLine1": FakeField("#billingAddressLine1"),
            "#billingLocality": FakeField("#billingLocality"),
            "#billingPostalCode": FakeField("#billingPostalCode"),
            "#termsOfServiceConsentCheckbox": FakeField(
                "#termsOfServiceConsentCheckbox"
            ),
        }

        def fake_wait_visible(_driver, _by, selector, timeout=30):
            self.assertEqual(timeout, 30)
            return elements[selector]

        def fake_clear_and_type(element, value):
            events.append(("fill", element.selector, value))

        class FakeDriver:
            def execute_script(self, script, element):
                del script
                element.click()

        with (
            mock.patch(
                "app.payment_service._wait_visible", side_effect=fake_wait_visible
            ),
            mock.patch(
                "app.payment_service._clear_and_type", side_effect=fake_clear_and_type
            ),
            mock.patch(
                "app.payment_service._find_element_with_recovery",
                side_effect=lambda _driver, _by, selector, attempts=2: elements[
                    selector
                ],
            ),
        ):
            payment_service._fill_stripe_billing_details(
                FakeDriver(), card, timeout=30
            )

        self.assertEqual(
            events,
            [
                ("fill", "#billingName", "Jane Doe"),
                ("fill", "#billingAddressLine1", "123 Main St"),
                ("fill", "#billingLocality", "Austin"),
                ("fill", "#billingPostalCode", "73301"),
                ("click", "#termsOfServiceConsentCheckbox"),
            ],
        )

    def test_execute_payurl_payment_flow_uses_card_flow_by_default(self):
        card = payment_service.PaymentCard(
            card="4111111111111111",
            year="2030",
            month="02",
            cvv="123",
            phone="+15555550123",
            url="https://example.test",
            name="Jane Doe",
            address="123 Main St",
            city="Austin",
            state="TX",
            postcode="73301",
            country="US",
        )

        with (
            mock.patch("app.payment_service.open_stripe_payment_page") as open_page,
            mock.patch("app.payment_service.redeem_next_card", return_value=card) as redeem,
            mock.patch("app.payment_service.fill_and_submit_stripe_payment") as submit_card,
            mock.patch("app.payment_service.fill_and_submit_paypal_payment") as submit_paypal,
        ):
            result = payment_service.execute_payurl_payment_flow(
                object(),
                "https://stripe.example/pay",
            )

        self.assertIs(result, card)
        open_page.assert_called_once()
        redeem.assert_called_once()
        submit_card.assert_called_once()
        submit_paypal.assert_not_called()

    def test_execute_payurl_payment_flow_requires_email_for_paypal(self):
        with self.assertRaisesRegex(ValueError, "email"):
            payment_service.execute_payurl_payment_flow(
                object(),
                "https://stripe.example/pay",
                payment_method="paypal",
            )

    def test_execute_payurl_payment_flow_marks_card_used_after_submit(self):
        card = payment_service.PaymentCard(
            card="4111111111111111",
            year="2030",
            month="02",
            cvv="123",
            phone="+15555550123",
            url="https://example.test",
            name="Jane Doe",
            address="123 Main St",
            city="Austin",
            state="TX",
            postcode="73301",
            country="US",
            redeem_code="fresh-code",
        )

        with (
            mock.patch("app.payment_service.open_stripe_payment_page"),
            mock.patch("app.payment_service.redeem_next_card", return_value=card),
            mock.patch("app.payment_service.fill_and_submit_stripe_payment"),
            mock.patch("app.payment_service.mark_card_payment_success") as mark_used,
            mock.patch(
                "app.payment_service.recycle_card_after_payment_failure"
            ) as recycle_card,
        ):
            payment_service.execute_payurl_payment_flow(
                object(),
                "https://stripe.example/pay",
                email="user@example.com",
            )

        mark_used.assert_called_once_with(
            card,
            email="user@example.com",
            detail="card_payment_submitted",
            payment_cfg=mock.ANY,
        )
        recycle_card.assert_not_called()

    def test_execute_payurl_payment_flow_recycles_card_when_submit_fails(self):
        card = payment_service.PaymentCard(
            card="4111111111111111",
            year="2030",
            month="02",
            cvv="123",
            phone="+15555550123",
            url="https://example.test",
            name="Jane Doe",
            address="123 Main St",
            city="Austin",
            state="TX",
            postcode="73301",
            country="US",
            redeem_code="fresh-code",
        )

        with (
            mock.patch("app.payment_service.open_stripe_payment_page"),
            mock.patch("app.payment_service.redeem_next_card", return_value=card),
            mock.patch(
                "app.payment_service.fill_and_submit_stripe_payment",
                side_effect=RuntimeError("submit failed"),
            ),
            mock.patch("app.payment_service.mark_card_payment_success") as mark_used,
            mock.patch(
                "app.payment_service.recycle_card_after_payment_failure"
            ) as recycle_card,
        ):
            with self.assertRaisesRegex(RuntimeError, "submit failed"):
                payment_service.execute_payurl_payment_flow(
                    object(),
                    "https://stripe.example/pay",
                    email="user@example.com",
                )

        mark_used.assert_not_called()
        recycle_card.assert_called_once()

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

    def test_paste_input_value_returns_true_when_paste_sets_value(self):
        class FakeElement:
            def __init__(self):
                self.value = ""

            def click(self):
                return None

            def get_attribute(self, name):
                if name == "value":
                    return self.value
                return ""

        class FakeDriver:
            def execute_script(self, script, *args):
                del script
                del args
                return None

        action_events = []
        element = FakeElement()

        class FakeActionChains:
            def __init__(self, _driver):
                self._modifier = None

            def key_down(self, modifier):
                self._modifier = modifier
                action_events.append(("key_down", modifier))
                return self

            def send_keys(self, value):
                action_events.append(("send_keys", value))
                if value == "v":
                    element.value = "654321"
                return self

            def key_up(self, modifier):
                action_events.append(("key_up", modifier))
                self._modifier = None
                return self

            def perform(self):
                action_events.append(("perform", self._modifier))
                return None

        with mock.patch(
            "selenium.webdriver.common.action_chains.ActionChains",
            FakeActionChains,
        ):
            result = payment_service._paste_input_value(
                FakeDriver(), element, "654321"
            )

        self.assertTrue(result)
        self.assertEqual(element.value, "654321")
        self.assertIn(("send_keys", "v"), action_events)

    def test_paste_input_value_falls_back_to_input_event_when_paste_does_not_set_value(self):
        class FakeElement:
            def click(self):
                return None

            def get_attribute(self, name):
                del name
                return ""

        class FakeDriver:
            def execute_script(self, script, *args):
                del script
                del args
                raise RuntimeError("script failed")

        class FakeActionChains:
            def __init__(self, _driver):
                return None

            def key_down(self, modifier):
                del modifier
                return self

            def send_keys(self, value):
                del value
                return self

            def key_up(self, modifier):
                del modifier
                return self

            def perform(self):
                return None

        with (
            mock.patch(
                "selenium.webdriver.common.action_chains.ActionChains",
                FakeActionChains,
            ),
            mock.patch(
                "app.payment_service._set_input_value_with_input_event"
            ) as fallback,
        ):
            result = payment_service._paste_input_value(
                FakeDriver(), FakeElement(), "654321"
            )

        self.assertFalse(result)
        fallback.assert_called_once()

    def test_reserve_next_paypal_phone_skips_used_and_failed_numbers(self):
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

            self.assertEqual(phone_key.phone, "+15550000002")

            payment_service.mark_paypal_phone_used(
                phone_key,
                email="user@example.com",
                payment_cfg=payment_cfg(
                    phone_keys_file=str(keys_path),
                    card_usage_file=str(Path(tmpdir) / "card_usage.json"),
                ),
            )

    def test_mark_paypal_phone_failed_blocks_future_reuse(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            keys_path = Path(tmpdir) / "phone-keys.txt"
            keys_path.write_text(
                "+15550000001|https://sms.example/1\n"
                "+15550000002|https://sms.example/2\n",
                encoding="utf-8",
            )
            cfg_obj = payment_cfg(
                phone_keys_file=str(keys_path),
                card_usage_file=str(Path(tmpdir) / "card_usage.json"),
            )

            first_phone_key = payment_service.reserve_next_paypal_phone(
                email="user@example.com",
                payment_cfg=cfg_obj,
            )
            payment_service.mark_paypal_phone_failed(
                first_phone_key,
                email="user@example.com",
                detail="paypal_phone_exceeded",
                payment_cfg=cfg_obj,
            )

            next_phone_key = payment_service.reserve_next_paypal_phone(
                email="user2@example.com",
                payment_cfg=cfg_obj,
            )

            self.assertEqual(first_phone_key.phone, "+15550000001")
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

    def test_get_current_webshare_static_proxy_can_prefer_http_for_firefox(self):
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
            prefer_http=True,
        )

        self.assertEqual(proxy["host"], "3.3.3.3")
        self.assertEqual(proxy["type"], "http")
        self.assertEqual(proxy["port"], 8080)
        self.assertTrue(proxy["use_auth"])
        self.assertEqual(proxy["username"], "user")

    def test_with_webshare_api_key_overrides_config_key(self):
        cfg_obj = payment_cfg(webshare_api_key="old-key", webshare_plan_id="plan-1")

        overridden = payment_service.with_webshare_api_key(cfg_obj, "new-key")

        self.assertEqual(overridden.webshare_api_key, "new-key")
        self.assertEqual(overridden.webshare_plan_id, "plan-1")

    def test_with_webshare_api_key_keeps_original_when_input_empty(self):
        cfg_obj = payment_cfg(webshare_api_key="old-key")

        overridden = payment_service.with_webshare_api_key(cfg_obj, "")

        self.assertIs(overridden, cfg_obj)

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

    @mock.patch("app.payment_service.time.sleep", return_value=None)
    def test_replace_webshare_static_proxy_can_prefer_http_for_firefox(self, _sleep):
        session = FakeSession()
        session.get_responses = [
            FakeResponse(
                {
                    "results": [
                        {
                            "proxy_address": "1.1.1.1",
                            "port": 80,
                            "socks5_port": 1080,
                            "username": "user",
                            "password": "pass",
                        }
                    ]
                }
            ),
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
            prefer_http=True,
        )

        self.assertEqual(proxy["host"], "2.2.2.2")
        self.assertEqual(proxy["type"], "http")
        self.assertEqual(proxy["port"], 8080)
        self.assertTrue(proxy["use_auth"])
        self.assertEqual(proxy["username"], "newuser")

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

    def test_parse_delivery_content_infers_state_from_postcode_when_missing(self):
        card = payment_service.parse_delivery_content(
            "4859540175460285----2030/1----176----+19183877070----http://a.62-us.com/api/get_sms?key=c806e72adead3c2b81122a1a5bb78d6a----CHRISTOPHER SMITH----2315 TIMONEY LN,RENO 89503,US"
        )

        self.assertEqual(card.address, "2315 TIMONEY LN")
        self.assertEqual(card.city, "RENO")
        self.assertEqual(card.state, "NV")
        self.assertEqual(card.postcode, "89503")

    def test_parse_delivery_content_rejects_unknown_postcode_when_state_missing(self):
        with self.assertRaisesRegex(ValueError, "无法根据美国邮编匹配州"):
            payment_service.parse_delivery_content(
                "4242424242424242----2028/7----123----15555555555----https://u.example----Jane Doe----123 Main St,NewYork 00000,US"
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
            self.assertEqual(card.redeem_code, "fresh-code")
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
            self.assertEqual(card.redeem_code, "debug-code")
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
            self.assertEqual(card.redeem_code, delivery_content)
            self.assertEqual(session.post_calls, [])
            usage_text = usage_path.read_text(encoding="utf-8")
            self.assertIn('"debug_mode": true', usage_text)
            self.assertIn('"debug_delivery_content"', usage_text)

    def test_recycle_card_usage_removes_reserved_card_from_usage_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            usage_path = Path(tmpdir) / "usage.json"
            usage_path.write_text(
                json.dumps(
                    {
                        "cards": {
                            "fresh-code": {
                                "called_at": "2026-01-01T00:00:00+00:00",
                                "status": "redeemed",
                                "email": "user@example.com",
                            }
                        }
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            payment_service.recycle_card_usage(
                "fresh-code",
                email="user@example.com",
                detail="submit failed",
                payment_cfg=payment_cfg(card_usage_file=str(usage_path)),
            )

            payload = json.loads(usage_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["cards"], {})

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

    def test_fill_and_submit_paypal_payment_fills_billing_before_submit(self):
        card = payment_service.PaymentCard(
            card="4111111111111111",
            year="2030",
            month="02",
            cvv="123",
            phone="+15555550123",
            url="https://example.test",
            name="Jane Doe",
            address="123 Main St",
            city="Austin",
            state="TX",
            postcode="73301",
            country="US",
        )
        phone_key = payment_service.PayPalPhoneKey(
            phone="+15555550123",
            sms_url="https://sms.example/code",
            raw="+15555550123|https://sms.example/code",
        )
        events = []

        class FakeDriver:
            def execute_script(self, script):
                events.append(("execute_script", script))

        def fake_wait_visible(_driver, _by, selector, timeout=30):
            events.append(("wait_visible", selector, timeout))
            return selector

        def fake_clear_and_type(element, value):
            events.append(("clear_and_type", element, value))

        def fake_click_when_clickable(_driver, _by, selector, timeout=30):
            events.append(("click_when_clickable", selector, timeout))

        def fake_wait_clickable(_driver, _by, selector, timeout=30):
            events.append(("wait_clickable", selector, timeout))
            return selector

        def fake_wait_url_startswith_any(_driver, prefixes, timeout=60):
            events.append(("wait_url_any", tuple(prefixes), timeout))
            return prefixes[0]

        def fake_fill_stripe_billing_details(_driver, passed_card, timeout=30):
            self.assertIs(passed_card, card)
            events.append(("fill_stripe_billing_details", timeout))

        def fake_wait_for_sms(_sms_url, timeout=180, poll_interval=5, payment_cfg=None):
            del payment_cfg
            events.append(("wait_for_paypal_sms_code", _sms_url, timeout, poll_interval))
            return "654321"

        def fake_fill_sms_code(_driver, code):
            events.append(("try_fill_paypal_sms_code", code))
            return True

        with (
            mock.patch(
                "app.payment_service.reserve_next_paypal_phone", return_value=phone_key
            ),
            mock.patch(
                "app.payment_service._wait_visible", side_effect=fake_wait_visible
            ),
            mock.patch(
                "app.payment_service._clear_and_type", side_effect=fake_clear_and_type
            ),
            mock.patch(
                "app.payment_service._click_when_clickable",
                side_effect=fake_click_when_clickable,
            ),
            mock.patch(
                "app.payment_service._wait_clickable",
                side_effect=fake_wait_clickable,
            ),
            mock.patch(
                "app.payment_service._wait_url_startswith_any",
                side_effect=fake_wait_url_startswith_any,
            ),
            mock.patch(
                "app.payment_service._fill_stripe_billing_details",
                side_effect=fake_fill_stripe_billing_details,
            ),
            mock.patch(
                "app.payment_service.time.sleep",
                side_effect=lambda s: events.append(("sleep", s)),
            ),
            mock.patch(
                "app.payment_service.wait_for_paypal_sms_code",
                side_effect=fake_wait_for_sms,
            ) as wait_sms,
            mock.patch(
                "app.payment_service._try_fill_paypal_sms_code",
                side_effect=fake_fill_sms_code,
            ),
            mock.patch("app.payment_service.mark_paypal_phone_used"),
        ):
            result = payment_service.fill_and_submit_paypal_payment(
                FakeDriver(),
                card,
                email="user@example.com",
                payment_cfg=payment_cfg(),
            )

        self.assertTrue(result)
        submit_click_index = events.index(
            ("click_when_clickable", 'button[type="submit"]', 30)
        )
        self.assertLess(
            events.index(("fill_stripe_billing_details", 45)),
            submit_click_index,
        )
        country_fill_index = events.index(("clear_and_type", "#country", "US"))
        phone_wait_index = events.index(("wait_visible", "#phone", 45))
        phone_fill_index = events.index(("clear_and_type", "#phone", "+15555550123"))
        self.assertLess(country_fill_index, phone_wait_index)
        self.assertLess(phone_wait_index, phone_fill_index)
        self.assertLess(country_fill_index, phone_fill_index)
        approve_start_index = events.index(
            ("click_when_clickable", "#startOnboardingFlow", 30)
        )
        approve_submit_wait_index = events.index(
            ("wait_clickable", "button[type='submit']", 45)
        )
        approve_email_fill_index = events.index(
            ("clear_and_type", "[type='email']", "user@example.com")
        )
        approve_submit_click_index = next(
            idx
            for idx, event in enumerate(events)
            if idx > approve_email_fill_index
            and event == ("click_when_clickable", "button[type='submit']", 30)
        )
        self.assertLess(approve_start_index, approve_submit_wait_index)
        self.assertLess(approve_submit_wait_index, approve_email_fill_index)
        self.assertLess(approve_email_fill_index, approve_submit_click_index)
        self.assertIn(("clear_and_type", "#billingState", "TX"), events)
        self.assertIn(("clear_and_type", "#country", "US"), events)
        submit_45_indexes = [
            idx
            for idx, event in enumerate(events)
            if event == ("click_when_clickable", 'button[type="submit"]', 45)
        ]
        sms_trigger_submit_index = submit_45_indexes[0]
        otp_input_wait_index = events.index(("wait_visible", "#ci-ciBasic-0", 45))
        wait_sms_index = events.index(
            ("wait_for_paypal_sms_code", "https://sms.example/code", 180, 5)
        )
        fill_sms_index = events.index(("try_fill_paypal_sms_code", "654321"))
        final_submit_index = submit_45_indexes[-1]
        self.assertLess(sms_trigger_submit_index, wait_sms_index)
        self.assertLess(sms_trigger_submit_index, otp_input_wait_index)
        self.assertLess(otp_input_wait_index, wait_sms_index)
        self.assertLess(wait_sms_index, fill_sms_index)
        self.assertLess(fill_sms_index, final_submit_index)
        wait_sms.assert_called_once_with(
            "https://sms.example/code",
            timeout=180,
            poll_interval=5,
            payment_cfg=mock.ANY,
        )

    def test_fill_and_submit_paypal_payment_supports_direct_signup_branch(self):
        card = payment_service.PaymentCard(
            card="4111111111111111",
            year="2030",
            month="02",
            cvv="123",
            phone="+15555550123",
            url="https://example.test",
            name="Jane Doe",
            address="123 Main St",
            city="Austin",
            state="TX",
            postcode="73301",
            country="US",
        )
        phone_key = payment_service.PayPalPhoneKey(
            phone="+15555550123",
            sms_url="https://sms.example/code",
            raw="+15555550123|https://sms.example/code",
        )

        class FakeDriver:
            def execute_script(self, script):
                del script

        with (
            mock.patch("app.payment_service.reserve_next_paypal_phone", return_value=phone_key),
            mock.patch("app.payment_service._wait_visible", side_effect=lambda _driver, _by, selector, timeout=30: selector),
            mock.patch("app.payment_service._clear_and_type") as clear_and_type,
            mock.patch("app.payment_service._click_when_clickable"),
            mock.patch(
                "app.payment_service._wait_url_startswith_any",
                return_value="https://www.paypal.com/checkoutweb/signup",
            ),
            mock.patch("app.payment_service._fill_stripe_billing_details"),
            mock.patch("app.payment_service.time.sleep", return_value=None),
            mock.patch("app.payment_service.wait_for_paypal_sms_code", return_value="654321"),
            mock.patch("app.payment_service._try_fill_paypal_sms_code", return_value=True),
            mock.patch("app.payment_service.mark_paypal_phone_used"),
        ):
            result = payment_service.fill_and_submit_paypal_payment(
                FakeDriver(),
                card,
                email="user@example.com",
                payment_cfg=payment_cfg(),
            )

        self.assertTrue(result)
        create_account_fills = [
            call for call in clear_and_type.call_args_list if call.args[0] == "#email"
        ]
        self.assertEqual(len(create_account_fills), 1)
        self.assertEqual(create_account_fills[0].args[1], "user@example.com")

    def test_fill_and_submit_paypal_payment_pay_page_clicks_submit_waits_and_uses_continue(self):
        card = payment_service.PaymentCard(
            card="4111111111111111",
            year="2030",
            month="02",
            cvv="123",
            phone="+15555550123",
            url="https://example.test",
            name="Jane Doe",
            address="123 Main St",
            city="Austin",
            state="TX",
            postcode="73301",
            country="US",
        )
        phone_key = payment_service.PayPalPhoneKey(
            phone="+15555550123",
            sms_url="https://sms.example/code",
            raw="+15555550123|https://sms.example/code",
        )
        events = []

        class FakeDriver:
            def execute_script(self, script):
                events.append(("execute_script", script))

        def fake_wait_visible(_driver, _by, selector, timeout=30):
            events.append(("wait_visible", selector, timeout))
            return selector

        def fake_clear_and_type(element, value):
            events.append(("clear_and_type", element, value))

        def fake_click_when_clickable(_driver, _by, selector, timeout=30):
            events.append(("click_when_clickable", selector, timeout))

        def fake_wait_until_no_clickable_element(_driver, _by, selector, timeout=30):
            events.append(("wait_until_no_clickable_element", selector, timeout))

        def fake_wait_url_startswith_any(_driver, prefixes, timeout=60):
            events.append(("wait_url_any", tuple(prefixes), timeout))
            if "https://www.paypal.com/pay" in prefixes:
                return "https://www.paypal.com/pay"
            if "https://www.paypal.com/checkoutweb/signup" in prefixes:
                if sum(
                    1
                    for event in events
                    if event
                    == ("click_when_clickable", 'button[data-testid="continueButton"]', 45)
                ):
                    return "https://www.paypal.com/checkoutweb/signup"
                raise RuntimeError("not signup yet")
            raise RuntimeError("no matching url")

        with (
            mock.patch(
                "app.payment_service.reserve_next_paypal_phone", return_value=phone_key
            ),
            mock.patch(
                "app.payment_service._wait_visible", side_effect=fake_wait_visible
            ),
            mock.patch(
                "app.payment_service._clear_and_type", side_effect=fake_clear_and_type
            ),
            mock.patch(
                "app.payment_service._click_when_clickable",
                side_effect=fake_click_when_clickable,
            ),
            mock.patch(
                "app.payment_service._wait_until_no_clickable_element",
                side_effect=fake_wait_until_no_clickable_element,
            ),
            mock.patch(
                "app.payment_service._wait_url_startswith_any",
                side_effect=fake_wait_url_startswith_any,
            ),
            mock.patch(
                "app.payment_service._wait_url_startswith",
                return_value="https://www.paypal.com/checkoutweb/signup",
            ),
            mock.patch("app.payment_service._fill_stripe_billing_details"),
            mock.patch(
                "app.payment_service.time.sleep",
                side_effect=lambda s: events.append(("sleep", s)),
            ),
            mock.patch(
                "app.payment_service.wait_for_paypal_sms_code", return_value="654321"
            ),
            mock.patch("app.payment_service._try_fill_paypal_sms_code", return_value=True),
            mock.patch("app.payment_service.mark_paypal_phone_used"),
        ):
            result = payment_service.fill_and_submit_paypal_payment(
                FakeDriver(),
                card,
                email="user@example.com",
                payment_cfg=payment_cfg(),
            )

        self.assertTrue(result)
        pay_submit_index = events.index(
            ("click_when_clickable", 'button[type="submit"]', 45)
        )
        pay_wait_index = events.index(
            ("wait_until_no_clickable_element", 'button[type="submit"]', 45)
        )
        email_fill_index = events.index(
            ("clear_and_type", 'input[type="email"]', "user@example.com")
        )
        continue_click_index = events.index(
            ("click_when_clickable", 'button[data-testid="continueButton"]', 45)
        )
        self.assertLess(pay_submit_index, pay_wait_index)
        self.assertLess(pay_wait_index, email_fill_index)
        self.assertLess(email_fill_index, continue_click_index)

    def test_fill_and_submit_paypal_payment_uses_selector_fallbacks(self):
        card = payment_service.PaymentCard(
            card="4111111111111111",
            year="2030",
            month="02",
            cvv="123",
            phone="+15555550123",
            url="https://example.test",
            name="Jane Doe",
            address="123 Main St",
            city="Austin",
            state="TX",
            postcode="73301",
            country="US",
        )
        phone_key = payment_service.PayPalPhoneKey(
            phone="+15555550123",
            sms_url="https://sms.example/code",
            raw="+15555550123|https://sms.example/code",
        )
        seen = []

        class FakeDriver:
            def execute_script(self, script):
                del script

        fallback_targets = {
            "#phone",
            "#cardNumber",
            "#cardExpiry",
            "#cardCvv",
            "#password",
            "#billingState",
            "#country",
        }

        def fake_wait_visible(_driver, _by, selector, timeout=30):
            seen.append(selector)
            if selector in fallback_targets:
                raise RuntimeError("primary selector missing")
            return selector

        with (
            mock.patch("app.payment_service.reserve_next_paypal_phone", return_value=phone_key),
            mock.patch("app.payment_service._wait_visible", side_effect=fake_wait_visible),
            mock.patch("app.payment_service._clear_and_type"),
            mock.patch("app.payment_service._click_when_clickable"),
            mock.patch(
                "app.payment_service._wait_url_startswith_any",
                return_value="https://www.paypal.com/checkoutweb/signup",
            ),
            mock.patch("app.payment_service._fill_stripe_billing_details"),
            mock.patch("app.payment_service.time.sleep", return_value=None),
            mock.patch("app.payment_service.wait_for_paypal_sms_code", return_value="654321"),
            mock.patch("app.payment_service._try_fill_paypal_sms_code", return_value=True),
            mock.patch("app.payment_service.mark_paypal_phone_used"),
        ):
            result = payment_service.fill_and_submit_paypal_payment(
                FakeDriver(),
                card,
                email="user@example.com",
                payment_cfg=payment_cfg(),
            )

        self.assertTrue(result)
        self.assertIn('input[name="phone"]', seen)
        self.assertIn('input[name="cardNumber"]', seen)
        self.assertIn('input[name="cardExpiry"]', seen)
        self.assertIn('input[name="cardCvv"]', seen)
        self.assertIn('input[name="password"]', seen)
        self.assertIn('select[name="billingState"]', seen)
        self.assertIn('select[name="country"]', seen)

    def test_fill_and_submit_paypal_payment_submit_failure_does_not_mark_phone_used(self):
        card = payment_service.PaymentCard(
            card="4111111111111111",
            year="2030",
            month="02",
            cvv="123",
            phone="+15555550123",
            url="https://example.test",
            name="Jane Doe",
            address="123 Main St",
            city="Austin",
            state="TX",
            postcode="73301",
            country="US",
        )
        phone_key = payment_service.PayPalPhoneKey(
            phone="+15555550123",
            sms_url="https://sms.example/code",
            raw="+15555550123|https://sms.example/code",
        )

        class FakeDriver:
            def execute_script(self, script):
                del script

        submit_calls = {"count": 0}

        def fake_click(_driver, _by, selector, timeout=30):
            del _driver, _by, timeout
            if selector == 'button[type="submit"]':
                submit_calls["count"] += 1
                if submit_calls["count"] == 3:
                    raise RuntimeError("submit failed")

        with (
            mock.patch("app.payment_service.reserve_next_paypal_phone", return_value=phone_key),
            mock.patch("app.payment_service._wait_visible", side_effect=lambda _driver, _by, selector, timeout=30: selector),
            mock.patch("app.payment_service._clear_and_type"),
            mock.patch("app.payment_service._click_when_clickable", side_effect=fake_click),
            mock.patch(
                "app.payment_service._wait_url_startswith_any",
                return_value="https://www.paypal.com/checkoutweb/signup",
            ),
            mock.patch("app.payment_service._fill_stripe_billing_details"),
            mock.patch("app.payment_service.time.sleep", return_value=None),
            mock.patch("app.payment_service.wait_for_paypal_sms_code", return_value="654321"),
            mock.patch("app.payment_service._try_fill_paypal_sms_code", return_value=True),
            mock.patch("app.payment_service.mark_paypal_phone_used") as mark_used,
        ):
            with self.assertRaisesRegex(RuntimeError, "PayPal 最终提交失败"):
                payment_service.fill_and_submit_paypal_payment(
                    FakeDriver(),
                    card,
                    email="user@example.com",
                    payment_cfg=payment_cfg(),
                )

        mark_used.assert_not_called()

    def test_fill_and_submit_paypal_payment_retries_with_new_phone_after_exceed(self):
        card = payment_service.PaymentCard(
            card="4111111111111111",
            year="2030",
            month="02",
            cvv="123",
            phone="+15555550123",
            url="https://example.test",
            name="Jane Doe",
            address="123 Main St",
            city="Austin",
            state="TX",
            postcode="73301",
            country="US",
        )
        first_phone_key = payment_service.PayPalPhoneKey(
            phone="+15550000001",
            sms_url="https://sms.example/1",
            raw="+15550000001|https://sms.example/1",
        )
        second_phone_key = payment_service.PayPalPhoneKey(
            phone="+15550000002",
            sms_url="https://sms.example/2",
            raw="+15550000002|https://sms.example/2",
        )
        events = []
        phone_values = []
        phone_submit_attempts = {"count": 0}

        class FakeDriver:
            def execute_script(self, script):
                del script

        def fake_wait_visible(_driver, _by, selector, timeout=30):
            events.append(("wait_visible", selector, timeout))
            return selector

        def fake_clear_and_type(element, value):
            events.append(("clear_and_type", element, value))
            if element in ("#phone", 'input[name="phone"]', 'input[name="phoneNumber"]'):
                phone_values.append(value)

        def fake_click_when_clickable(_driver, _by, selector, timeout=30):
            events.append(("click_when_clickable", selector, timeout))

        def fake_detect_exceeded(_driver):
            phone_submit_attempts["count"] += 1
            events.append(("detect_exceeded", phone_submit_attempts["count"]))
            return phone_submit_attempts["count"] == 1

        with (
            mock.patch(
                "app.payment_service.reserve_next_paypal_phone",
                side_effect=[first_phone_key, second_phone_key],
            ) as reserve_phone,
            mock.patch(
                "app.payment_service._wait_visible", side_effect=fake_wait_visible
            ),
            mock.patch(
                "app.payment_service._clear_and_type", side_effect=fake_clear_and_type
            ),
            mock.patch(
                "app.payment_service._click_when_clickable",
                side_effect=fake_click_when_clickable,
            ),
            mock.patch(
                "app.payment_service._wait_clickable",
                return_value="button[type='submit']",
            ),
            mock.patch(
                "app.payment_service._wait_url_startswith_any",
                return_value="https://www.paypal.com/checkoutweb/signup",
            ),
            mock.patch("app.payment_service._fill_stripe_billing_details"),
            mock.patch("app.payment_service.time.sleep", return_value=None),
            mock.patch(
                "app.payment_service._detect_paypal_phone_exceeded",
                side_effect=fake_detect_exceeded,
            ),
            mock.patch(
                "app.payment_service._dismiss_paypal_phone_exceeded_dialog"
            ) as dismiss_dialog,
            mock.patch(
                "app.payment_service.wait_for_paypal_sms_code", return_value="654321"
            ) as wait_sms,
            mock.patch("app.payment_service._try_fill_paypal_sms_code", return_value=True),
            mock.patch("app.payment_service.mark_paypal_phone_failed") as mark_failed,
            mock.patch("app.payment_service.mark_paypal_phone_used") as mark_used,
        ):
            result = payment_service.fill_and_submit_paypal_payment(
                FakeDriver(),
                card,
                email="user@example.com",
                payment_cfg=payment_cfg(),
            )

        self.assertTrue(result)
        self.assertEqual(phone_values[:2], ["+15550000001", "+15550000002"])
        self.assertEqual(reserve_phone.call_count, 2)
        mark_failed.assert_called_once_with(
            first_phone_key,
            email="user@example.com",
            detail="paypal_phone_exceeded",
            payment_cfg=mock.ANY,
        )
        dismiss_dialog.assert_called_once()
        wait_sms.assert_called_once_with(
            "https://sms.example/2",
            timeout=180,
            poll_interval=5,
            payment_cfg=mock.ANY,
        )
        mark_used.assert_called_once_with(
            second_phone_key,
            email="user@example.com",
            detail="paypal_signup_submitted",
            payment_cfg=mock.ANY,
        )


if __name__ == "__main__":
    unittest.main()
