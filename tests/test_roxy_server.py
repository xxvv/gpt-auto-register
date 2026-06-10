import unittest
import threading
import time
from unittest import mock

from roxy_server import automation
from roxy_server import server
from roxy_server.server import app


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.ok = status_code < 400
        self.text = str(payload)

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class FakeSession:
    def __init__(self):
        self.get_calls = []
        self.post_calls = []

    def get(self, *args, **kwargs):
        self.get_calls.append((args, kwargs))
        url = args[0]
        if url.endswith("/browser/workspace"):
            return FakeResponse({"data": {"rows": [{"id": 9}]}})
        if url.endswith("/browser/list_v3"):
            return FakeResponse({"data": {"rows": [{"dirId": "win-1"}]}})
        return FakeResponse({"ok": True})

    def post(self, *args, **kwargs):
        self.post_calls.append((args, kwargs))
        if args[0].endswith("/browser/open"):
            return FakeResponse({"data": {"http": "127.0.0.1:9222", "driver": "C:/driver.exe"}})
        return FakeResponse({"code": 0})


class FakeClickDriver:
    def __init__(self):
        self.current_url = "https://www.paypal.com/checkout"
        self.clicked = False

    def execute_script(self, _script, _element=None):
        self.clicked = True
        self.current_url = "https://www.paypal.com/checkoutweb/signup"
        raise RuntimeError("navigation timed out")


class FakeFillDriver:
    def __init__(self):
        self.script_timeout = None
        self.async_calls = []
        self.switch_to = self

    def set_script_timeout(self, timeout):
        self.script_timeout = timeout

    def default_content(self):
        return None

    def find_elements(self, *_args, **_kwargs):
        return []

    def execute_async_script(self, script, selector, value, timeout_ms, *args):
        type_text = bool(args[0]) if args else False
        self.async_calls.append((script, selector, value, timeout_ms, type_text))
        if "changed: false" in script:
            return {"ok": True, "selector": selector, "changed": False, "value": value}
        return {"ok": True, "selector": selector, "value": value}


class RoxyServerTests(unittest.TestCase):
    def setUp(self):
        self._reset_server_state()

    def tearDown(self):
        thread = server.STATE.thread
        if thread and thread.is_alive():
            server.STATE.stop_requested = True
            thread.join(timeout=2)
        self._reset_server_state()

    def _reset_server_state(self):
        with server.LOCK:
            server.STATE.running = False
            server.STATE.stop_requested = False
            server.STATE.current_url = ""
            server.STATE.total = 0
            server.STATE.completed = 0
            server.STATE.success = 0
            server.STATE.fail = 0
            server.STATE.pending_urls = []
            server.STATE.consumed_urls = []
            server.STATE.logs = []
            server.STATE.thread = None
            server.STATE.token = ""
            server.STATE.workspace_id = ""
            server.STATE.window_id = ""
            server.STATE.phone_queue_key = ()
            server.STATE.phone_task = None

    def _wait_until_idle(self, client):
        status = None
        for _ in range(100):
            status = client.get("/api/status").get_json()["status"]
            if not status["running"]:
                return status
            time.sleep(0.01)
        return status

    def _payload(self, **overrides):
        payload = {
            "roxyToken": "token",
            "workspaceId": "7",
            "windowId": "win-1",
            "urlQueueText": "https://paypal.example/one\n",
            "phoneQueueText": "+14484490908|https://sms.example/one",
        }
        payload.update(overrides)
        return payload

    def test_parse_url_queue_ignores_blank_lines(self):
        self.assertEqual(
            automation.parse_url_queue("\nhttps://one\n  \nhttps://two  \n"),
            ["https://one", "https://two"],
        )

    def test_parse_phone_tasks_supports_pipe_and_dashes(self):
        tasks = automation.parse_phone_tasks(
            "+14484490908|https://sms.example/one\n"
            "+14484490909----https://sms.example/two\n"
            "bad-line\n"
        )
        self.assertEqual([task.phone for task in tasks], ["+14484490908", "+14484490909"])
        self.assertEqual(tasks[1].sms_url, "https://sms.example/two")

    def test_generated_card_is_luhn_valid(self):
        identity = automation.generate_identity()
        self.assertTrue(automation.is_luhn_valid(identity.card_number))
        self.assertRegex(identity.cvv, r"^\d{3}$")
        self.assertRegex(identity.expiry_display, r"^\d{2}/\d{2}$")

    def test_japan_signup_identity_matches_v2_overrides(self):
        identity = automation.generate_japan_signup_identity()

        self.assertTrue(automation.is_luhn_valid(identity.card_number))
        self.assertEqual(identity.country, "JP")
        self.assertEqual(identity.postcode, "150-0002")
        self.assertEqual(identity.state, "京都府")
        self.assertEqual(identity.city, "京都市")
        self.assertEqual(identity.address, "渋谷2丁目21番1号")
        self.assertEqual(identity.first_name, "ミン")
        self.assertEqual(identity.last_name, "リー")
        self.assertEqual(identity.date_of_birth, "1991/10/28")
        self.assertEqual(identity.country_specific_first_name, "タロウ")
        self.assertEqual(identity.country_specific_last_name, "ヤマダ")

    def test_extract_sms_code_from_text_and_json(self):
        self.assertEqual(automation.extract_sms_code("Your code is 123456."), "123456")
        self.assertEqual(automation.extract_sms_code('{"message":"code: 654321"}'), "654321")
        self.assertEqual(automation.extract_sms_code("<b>112233</b>"), "112233")

    def test_paypal_agreements_url_matches_paypal_prefix(self):
        self.assertTrue(
            automation._url_matches_prefix(
                "https://www.paypal.com/agreements/approve?ba_token=BA-62K789953F814543E",
                "https://www.paypal.com",
            )
        )

    def test_roxy_client_uses_token_and_dir_id(self):
        session = FakeSession()
        client = automation.RoxyClient("secret", session=session)
        result = client.open_browser("win-1", workspace_id=7)

        self.assertEqual(result["debugger_address"], "127.0.0.1:9222")
        clear_args, clear_kwargs = session.post_calls[0]
        self.assertEqual(clear_args[0], "http://127.0.0.1:50000/browser/clear_local_cache")
        self.assertEqual(clear_kwargs["headers"]["token"], "secret")
        self.assertEqual(clear_kwargs["json"], {"dirIds": ["win-1"]})
        server_args, server_kwargs = session.post_calls[1]
        self.assertEqual(server_args[0], "http://127.0.0.1:50000/browser/clear_server_cache")
        self.assertEqual(server_kwargs["headers"]["token"], "secret")
        self.assertEqual(server_kwargs["json"], {"workspaceId": 7, "dirIds": ["win-1"]})
        args, kwargs = session.post_calls[2]
        self.assertEqual(args[0], "http://127.0.0.1:50000/browser/open")
        self.assertEqual(kwargs["headers"]["token"], "secret")
        self.assertEqual(kwargs["json"], {"dirId": "win-1"})

    def test_roxy_client_can_discover_workspace_id_for_server_cache(self):
        session = FakeSession()
        client = automation.RoxyClient("secret", session=session)
        client.clear_server_cache("win-1")

        args, kwargs = session.post_calls[0]
        self.assertEqual(args[0], "http://127.0.0.1:50000/browser/clear_server_cache")
        self.assertEqual(kwargs["json"], {"workspaceId": 9, "dirIds": ["win-1"]})

    def test_click_element_returns_true_when_click_changes_url_then_raises(self):
        logs = []
        driver = FakeClickDriver()
        runner = automation.PayPalStep4Automation(driver, log=logs.append)

        self.assertTrue(runner._click_element(object(), label="PayPal 创建账号按钮"))
        self.assertTrue(driver.clicked)
        self.assertIn("https://www.paypal.com/checkoutweb/signup", logs[-1])

    def test_fill_first_uses_page_script_setter_like_v2(self):
        driver = FakeFillDriver()
        runner = automation.PayPalStep4Automation(driver)

        self.assertTrue(runner._fill_first(["#login_email", "#onboardingFlowEmail"], "user@example.com", timeout=10, type_text=True))
        self.assertEqual(driver.script_timeout, 15)
        _script, selector, value, timeout_ms, type_text = driver.async_calls[-1]
        self.assertEqual(selector, "#login_email, #onboardingFlowEmail")
        self.assertEqual(value, "user@example.com")
        self.assertEqual(timeout_ms, 10000)
        self.assertTrue(type_text)

    def test_set_select_if_needed_returns_unchanged_when_country_already_matches(self):
        driver = FakeFillDriver()
        runner = automation.PayPalStep4Automation(driver)

        result = runner._set_select_if_needed(["#country", "#billingCountry"], "JP", timeout=60)

        self.assertTrue(result["ok"])
        self.assertFalse(result["changed"])
        _script, selector, value, timeout_ms, type_text = driver.async_calls[-1]
        self.assertEqual(selector, "#country, #billingCountry")
        self.assertEqual(value, "JP")
        self.assertEqual(timeout_ms, 60000)
        self.assertFalse(type_text)

    def test_signup_name_selectors_match_v2_fallbacks(self):
        calls = []
        identity = automation.generate_japan_signup_identity()
        runner = automation.PayPalStep4Automation(None)

        def fake_set(selector, value, **_kwargs):
            calls.append((selector, value))
            return {"ok": True, "selector": selector, "value": value}

        runner._set_select_if_needed = lambda *_args, **_kwargs: {"ok": True, "changed": False, "value": "JP"}
        runner._set_value_by_selector = fake_set
        runner._fill_signup_form("user@example.com", "7092756860", identity)

        first_name_selector = next(selector for selector, value in calls if value == "ミン")
        last_name_selector = next(selector for selector, value in calls if value == "リー")
        self.assertIn('input[name="firstName"]', first_name_selector)
        self.assertIn('input[autocomplete="given-name"]', first_name_selector)
        self.assertIn('input[name="lastName"]', last_name_selector)
        self.assertIn('input[autocomplete="family-name"]', last_name_selector)

    def test_api_run_accepts_local_storage_payload_and_reports_consumed_url(self):
        client = app.test_client()

        def fake_run_url_task(**kwargs):
            return {"ok": True, "email": "user@gmail.com"}

        with mock.patch("roxy_server.server.run_url_task", side_effect=fake_run_url_task):
            response = client.post("/api/run", json=self._payload())
            self.assertEqual(response.status_code, 200)
            status = self._wait_until_idle(client)
            self.assertEqual(status["success"], 1)
            self.assertEqual(status["consumed_urls"], ["https://paypal.example/one"])
            self.assertEqual(status["pending_urls"], [])
            self.assertEqual(status["pending_count"], 0)

    def test_api_push_starts_when_idle_and_consumes_url(self):
        client = app.test_client()

        with mock.patch("roxy_server.server.run_url_task", return_value={"ok": True, "email": "user@gmail.com"}):
            response = client.post("/api/push", json=self._payload())
            self.assertEqual(response.status_code, 200)
            status = self._wait_until_idle(client)

        self.assertEqual(status["total"], 1)
        self.assertEqual(status["completed"], 1)
        self.assertEqual(status["success"], 1)
        self.assertEqual(status["fail"], 0)
        self.assertEqual(status["consumed_urls"], ["https://paypal.example/one"])
        self.assertEqual(status["pending_urls"], [])

    def test_api_push_appends_while_running(self):
        client = app.test_client()
        first_started = threading.Event()
        release_first = threading.Event()

        def fake_run_url_task(**kwargs):
            if kwargs["url"] == "https://paypal.example/one":
                first_started.set()
                release_first.wait(timeout=2)
            return {"ok": True, "email": "user@gmail.com"}

        with mock.patch("roxy_server.server.run_url_task", side_effect=fake_run_url_task):
            response = client.post("/api/push", json=self._payload())
            self.assertEqual(response.status_code, 200)
            self.assertTrue(first_started.wait(timeout=2))

            response = client.post(
                "/api/push",
                json=self._payload(urls=["", "https://paypal.example/two"], urlQueueText=""),
            )
            self.assertEqual(response.status_code, 200)
            mid_status = response.get_json()["status"]
            self.assertEqual(mid_status["total"], 2)
            self.assertEqual(mid_status["pending_urls"], ["https://paypal.example/two"])

            release_first.set()
            status = self._wait_until_idle(client)

        self.assertEqual(status["total"], 2)
        self.assertEqual(status["completed"], 2)
        self.assertEqual(status["success"], 2)
        self.assertEqual(
            status["consumed_urls"],
            ["https://paypal.example/one", "https://paypal.example/two"],
        )
        self.assertEqual(status["pending_count"], 0)

    def test_api_push_accepts_urls_and_url_queue_text(self):
        client = app.test_client()
        seen = []

        def fake_run_url_task(**kwargs):
            seen.append(kwargs["url"])
            return {"ok": True, "email": "user@gmail.com"}

        payload = self._payload(
            urls=["https://paypal.example/from-array", "", "  "],
            urlQueueText="\nhttps://paypal.example/from-text\n",
        )
        with mock.patch("roxy_server.server.run_url_task", side_effect=fake_run_url_task):
            response = client.post("/api/push", json=payload)
            self.assertEqual(response.status_code, 200)
            status = self._wait_until_idle(client)

        self.assertEqual(seen, ["https://paypal.example/from-array", "https://paypal.example/from-text"])
        self.assertEqual(status["total"], 2)
        self.assertEqual(status["consumed_urls"], seen)

    def test_api_push_rejects_missing_required_payload(self):
        client = app.test_client()

        cases = [
            self._payload(roxyToken=""),
            self._payload(windowId=""),
            self._payload(phoneQueueText=""),
            self._payload(urls=[], urlQueueText=""),
        ]
        for payload in cases:
            response = client.post("/api/push", json=payload)
            self.assertEqual(response.status_code, 400, payload)

    def test_api_push_rejects_mismatched_config_while_running(self):
        client = app.test_client()
        first_started = threading.Event()
        release_first = threading.Event()

        def fake_run_url_task(**kwargs):
            first_started.set()
            release_first.wait(timeout=2)
            return {"ok": True, "email": "user@gmail.com"}

        with mock.patch("roxy_server.server.run_url_task", side_effect=fake_run_url_task):
            response = client.post("/api/push", json=self._payload())
            self.assertEqual(response.status_code, 200)
            self.assertTrue(first_started.wait(timeout=2))

            response = client.post("/api/push", json=self._payload(windowId="win-2"))
            self.assertEqual(response.status_code, 400)

            response = client.post(
                "/api/push",
                json=self._payload(phoneQueueText="+14484490909|https://sms.example/two"),
            )
            self.assertEqual(response.status_code, 400)

            release_first.set()
            status = self._wait_until_idle(client)

        self.assertEqual(status["total"], 1)
        self.assertEqual(status["consumed_urls"], ["https://paypal.example/one"])


if __name__ == "__main__":
    unittest.main()
