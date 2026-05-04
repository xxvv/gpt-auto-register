import unittest
from urllib.error import URLError
from unittest.mock import MagicMock, patch

from selenium.common.exceptions import TimeoutException

from app import browser


class FakeDriver:
    def __init__(self, async_result="1.2.3.4", fallback_ip=""):
        self.async_result = async_result
        self.fallback_ip = fallback_ip
        self.script_timeout = None
        self.page_timeout = None
        self.get_calls = []

    def set_script_timeout(self, timeout):
        self.script_timeout = timeout

    def execute_async_script(self, script):
        del script
        if isinstance(self.async_result, Exception):
            raise self.async_result
        return self.async_result

    def set_page_load_timeout(self, timeout):
        self.page_timeout = timeout

    def get(self, url):
        self.get_calls.append(url)
        if not self.fallback_ip:
            raise RuntimeError("fallback failed")

    def execute_script(self, script):
        del script
        return self.fallback_ip


class BrowserProxyDiagnosticsTests(unittest.TestCase):
    @patch("app.browser.lookup_ip_geolocation")
    def test_log_browser_egress_ip_returns_structured_details(self, geo_lookup):
        geo_lookup.return_value = {
            "ok": True,
            "country": "United States",
            "country_code": "US",
            "city": "Ashburn",
            "source": "mock-geo",
        }
        driver = FakeDriver(async_result="1.2.3.4")

        result = browser.log_browser_egress_ip(driver, timeout=12)

        self.assertTrue(result["ok"])
        self.assertEqual(result["ip"], "1.2.3.4")
        self.assertEqual(result["country_code"], "US")
        self.assertEqual(driver.script_timeout, 12)

    @patch("app.browser.ensure_proxy_ready")
    @patch("app.browser.SafeChrome")
    @patch("app.browser._detect_chrome_major_version", return_value=None)
    @patch("app.browser.uc.ChromeOptions")
    def test_create_driver_checks_proxy_before_launch(
        self,
        chrome_options_cls,
        detect_version,
        safe_chrome_cls,
        ensure_ready,
    ):
        del detect_version
        options = MagicMock()
        chrome_options_cls.return_value = options
        safe_driver = MagicMock()
        safe_chrome_cls.return_value = safe_driver
        proxy = {
            "enabled": True,
            "type": "http",
            "host": "127.0.0.1",
            "port": 8080,
            "use_auth": False,
            "username": "",
            "password": "",
        }

        driver = browser.create_driver(headless=False, proxy=proxy)

        self.assertIs(driver, safe_driver)
        ensure_ready.assert_called_once_with(
            proxy,
            purpose="浏览器代理预检",
            timeout=10,
            target_urls=browser.OPENAI_PROXY_TARGET_URLS,
            require_target_ok=False,
            target_timeout=5,
        )

    @patch("app.browser.time.sleep", return_value=None)
    @patch("app.browser.SafeChrome")
    @patch("app.browser._detect_chrome_major_version", return_value=None)
    @patch("app.browser.uc.ChromeOptions")
    def test_create_driver_retries_transient_urlopen_ssl_failure(
        self,
        chrome_options_cls,
        detect_version,
        safe_chrome_cls,
        sleep,
    ):
        del chrome_options_cls, detect_version, sleep
        safe_driver = MagicMock()
        safe_chrome_cls.side_effect = [
            URLError(
                "[SSL: UNEXPECTED_EOF_WHILE_READING] "
                "EOF occurred in violation of protocol (_ssl.c:1028)"
            ),
            safe_driver,
        ]

        driver = browser.create_driver(headless=False, proxy=None)

        self.assertIs(driver, safe_driver)
        self.assertEqual(safe_chrome_cls.call_count, 2)

    @patch("app.browser.time.sleep", return_value=None)
    @patch("app.browser.SafeChrome")
    @patch("app.browser._detect_chrome_major_version", return_value=None)
    @patch("app.browser.uc.ChromeOptions")
    def test_create_driver_explains_persistent_urlopen_ssl_failure(
        self,
        chrome_options_cls,
        detect_version,
        safe_chrome_cls,
        sleep,
    ):
        del chrome_options_cls, detect_version, sleep
        safe_chrome_cls.side_effect = URLError(
            "[SSL: UNEXPECTED_EOF_WHILE_READING] "
            "EOF occurred in violation of protocol (_ssl.c:1028)"
        )

        with self.assertRaisesRegex(
            RuntimeError,
            "浏览器驱动下载/启动时 HTTPS 连接被提前断开",
        ):
            browser.create_driver(headless=False, proxy=None)

        self.assertEqual(safe_chrome_cls.call_count, 3)

    def test_open_chatgpt_url_uses_new_domain(self):
        driver = MagicMock()

        browser.open_chatgpt_url(driver, browser.CHATGPT_HOME_URL)

        driver.get.assert_called_once_with("https://chatgpt.com/")
        driver.set_page_load_timeout.assert_called_once_with(browser.SHORT_WAIT_TIME)

    def test_open_chatgpt_url_recovers_target_and_retries(self):
        driver = MagicMock()
        lost = RuntimeError(
            "Message: no such window: target window already closed from unknown error: web view not found"
        )
        driver.get.side_effect = [lost, None]
        driver.window_handles = ["tab-1"]

        browser.open_chatgpt_url(driver, browser.CHATGPT_HOME_URL, attempts=2)

        self.assertEqual(driver.get.call_count, 2)
        driver.switch_to.window.assert_called_once_with("tab-1")

    def test_open_chatgpt_url_raises_non_recoverable_error(self):
        driver = MagicMock()
        driver.get.side_effect = RuntimeError("navigation timeout")

        with self.assertRaisesRegex(RuntimeError, "navigation timeout"):
            browser.open_chatgpt_url(driver, browser.CHATGPT_HOME_URL, attempts=2)

    def test_open_chatgpt_url_tolerates_renderer_timeout_after_reaching_chatgpt(self):
        driver = MagicMock()
        driver.current_url = "https://chatgpt.com/"
        driver.get.side_effect = TimeoutException(
            "timeout: Timed out receiving message from renderer: 9.681"
        )

        browser.open_chatgpt_url(driver, browser.CHATGPT_HOME_URL)

        driver.get.assert_called_once_with("https://chatgpt.com/")
        driver.execute_script.assert_called_once_with("window.stop();")

    def test_open_chatgpt_url_keeps_timeout_fatal_before_reaching_chatgpt(self):
        driver = MagicMock()
        driver.current_url = "data:,"
        driver.get.side_effect = TimeoutException(
            "timeout: Timed out receiving message from renderer: 9.681"
        )

        with self.assertRaises(TimeoutException):
            browser.open_chatgpt_url(driver, browser.CHATGPT_HOME_URL)

    def test_execute_cdp_cmd_recovers_target_and_retries(self):
        driver = MagicMock()
        lost = RuntimeError(
            "Message: no such window: target window already closed from unknown error: web view not found"
        )
        driver.execute_cdp_cmd.side_effect = [lost, {"identifier": "script-1"}]
        driver.window_handles = ["tab-1"]

        result = browser._execute_cdp_cmd_with_target_recovery(
            driver,
            "Page.addScriptToEvaluateOnNewDocument",
            {"source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"},
            attempts=2,
        )

        self.assertEqual(result, {"identifier": "script-1"})
        self.assertEqual(driver.execute_cdp_cmd.call_count, 2)
        driver.switch_to.window.assert_called_once_with("tab-1")

    def test_execute_cdp_cmd_raises_non_recoverable_error(self):
        driver = MagicMock()
        driver.execute_cdp_cmd.side_effect = RuntimeError("cdp command failed")

        with self.assertRaisesRegex(RuntimeError, "cdp command failed"):
            browser._execute_cdp_cmd_with_target_recovery(
                driver,
                "Page.addScriptToEvaluateOnNewDocument",
                {"source": ""},
                attempts=2,
            )


if __name__ == "__main__":
    unittest.main()
