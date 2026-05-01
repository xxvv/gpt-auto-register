import unittest
from unittest.mock import patch

from app import browser


class FakeElement:
    def __init__(self, displayed=True):
        self.displayed = displayed

    def is_displayed(self):
        return self.displayed


class FakeBodyElement:
    def __init__(self, text):
        self.text = text


class RetryingInputElement:
    def __init__(self):
        self.attempt = 0
        self.buffer = ""

    def click(self):
        return None

    def clear(self):
        self.attempt += 1
        self.buffer = ""

    def send_keys(self, text):
        self.buffer += text

    def get_attribute(self, name):
        if name != "value":
            return ""
        if self.attempt == 1:
            return self.buffer[:-1]
        return self.buffer


class StaticDriver:
    def __init__(self, mapping=None, current_url="", body_text=""):
        self.mapping = mapping or {}
        self.current_url = current_url
        self.body_text = body_text

    def find_elements(self, by, selector):
        return self.mapping.get((by, selector), [])

    def find_element(self, by, selector):
        if (by, selector) == (browser.By.TAG_NAME, "body"):
            return FakeBodyElement(self.body_text)
        raise LookupError((by, selector))


class SequenceDriver:
    def __init__(self, states):
        self.states = list(states)
        self.index = 0

    @property
    def current_url(self):
        return self.states[self.index].get("current_url", "")

    def advance(self):
        if self.index < len(self.states) - 1:
            self.index += 1

    def find_elements(self, by, selector):
        mapping = self.states[self.index].get("mapping", {})
        return mapping.get((by, selector), [])

    def find_element(self, by, selector):
        if (by, selector) == (browser.By.TAG_NAME, "body"):
            return FakeBodyElement(self.states[self.index].get("body_text", ""))
        raise LookupError((by, selector))


class RefreshingEmailDriver:
    def __init__(self, element, fail_times=2):
        self.element = element
        self.fail_times = fail_times
        self.refresh_calls = 0
        self.wait_calls = 0
        self.entry_click_calls = 0
        self.sleep_calls = []
        self.current_url = "https://auth.openai.com/u/signup"

    def find_elements(self, by, selector):
        self.wait_calls += 1
        if by == browser.By.XPATH and ("Sign up" in selector or "Log in" in selector):
            self.entry_click_calls += 1
            return [FakeElement()]
        if self.wait_calls <= self.fail_times:
            return []
        return [self.element]

    def find_element(self, by, selector):
        if (by, selector) == (browser.By.TAG_NAME, "body"):
            return FakeBodyElement("loading")
        raise LookupError((by, selector))

    def refresh(self):
        self.refresh_calls += 1


class BrowserSignupFlowTests(unittest.TestCase):
    def test_fill_input_with_verification_retries_until_value_matches(self):
        element = RetryingInputElement()

        with patch.object(browser.time, "sleep", return_value=None):
            ok = browser._fill_input_with_verification(
                element, "Secret123!", "密码", mask=True
            )

        self.assertTrue(ok)
        self.assertEqual(element.buffer, "Secret123!")
        self.assertEqual(element.attempt, 2)

    def test_is_email_verification_page_ignores_generic_text_without_element(self):
        driver = StaticDriver(
            current_url="https://auth.openai.com/u/signup",
            body_text="请输入邮箱验证码后继续",
        )

        self.assertFalse(browser._is_email_verification_page(driver))
        self.assertFalse(
            browser._is_email_verification_page(driver, require_visible_input=True)
        )

    def test_wait_for_post_email_step_prefers_password_on_slow_page(self):
        password_input = FakeElement()
        driver = SequenceDriver(
            [
                {
                    "current_url": "https://auth.openai.com/u/signup",
                    "body_text": "Loading...",
                },
                {
                    "current_url": "https://auth.openai.com/u/signup/password",
                    "body_text": "Create your password",
                    "mapping": {
                        (
                            browser.By.CSS_SELECTOR,
                            'input[autocomplete="new-password"]',
                        ): [password_input]
                    },
                },
            ]
        )

        with patch.object(
            browser,
            "_sleep_with_heartbeat",
            side_effect=lambda *args, **kwargs: driver.advance(),
        ):
            step = browser._wait_for_post_email_step(driver, timeout=3)

        self.assertEqual(step, "password")

    def test_wait_for_post_email_step_accepts_stable_verification_page(self):
        driver = SequenceDriver(
            [
                {
                    "current_url": "https://auth.openai.com/u/email-verification",
                    "body_text": "Check your inbox",
                },
                {
                    "current_url": "https://auth.openai.com/u/email-verification",
                    "body_text": "Check your inbox",
                },
                {
                    "current_url": "https://auth.openai.com/u/email-verification",
                    "body_text": "Check your inbox",
                },
            ]
        )

        with patch.object(
            browser,
            "_sleep_with_heartbeat",
            side_effect=lambda *args, **kwargs: driver.advance(),
        ):
            step = browser._wait_for_post_email_step(driver, timeout=3)

        self.assertEqual(step, "verification")

    def test_wait_for_password_input_or_verification_accepts_verification_page(self):
        driver = SequenceDriver(
            [
                {
                    "current_url": "https://auth.openai.com/u/email-verification",
                    "body_text": "Check your inbox",
                },
                {
                    "current_url": "https://auth.openai.com/u/email-verification",
                    "body_text": "Check your inbox",
                },
            ]
        )

        with patch.object(
            browser,
            "_sleep_with_heartbeat",
            side_effect=lambda *args, **kwargs: driver.advance(),
        ):
            step, element = browser._wait_for_password_input_or_verification(
                driver, timeout=3
            )

        self.assertEqual(step, "verification")
        self.assertIsNone(element)

    def test_password_submit_result_retries_password_after_error(self):
        driver = StaticDriver()

        with patch.object(
            browser, "check_and_handle_error", return_value=True
        ), patch.object(browser, "_is_email_verification_page") as is_verification:
            result = browser._wait_for_password_submit_result(driver, timeout=3)

        self.assertEqual(result, "retry_password")
        is_verification.assert_not_called()

    def test_password_submit_result_retries_when_password_input_returns(self):
        password_input = FakeElement()
        driver = StaticDriver(
            mapping={
                (browser.By.CSS_SELECTOR, 'input[autocomplete="new-password"]'): [
                    password_input
                ]
            }
        )

        with patch.object(
            browser, "check_and_handle_error", return_value=False
        ), patch.object(browser, "_sleep_with_heartbeat", return_value=None):
            result = browser._wait_for_password_submit_result(driver, timeout=3)

        self.assertEqual(result, "retry_password")

    def test_password_submit_result_accepts_stable_verification_page(self):
        driver = SequenceDriver(
            [
                {
                    "current_url": "https://auth.openai.com/u/email-verification",
                    "body_text": "Check your inbox",
                },
                {
                    "current_url": "https://auth.openai.com/u/email-verification",
                    "body_text": "Check your inbox",
                },
            ]
        )

        with patch.object(
            browser, "check_and_handle_error", return_value=False
        ), patch.object(
            browser,
            "_sleep_with_heartbeat",
            side_effect=lambda *args, **kwargs: driver.advance(),
        ):
            result = browser._wait_for_password_submit_result(driver, timeout=3)

        self.assertEqual(result, "verification")

    def test_wait_for_signup_email_input_refreshes_after_two_timeouts(self):
        email_input = FakeElement()
        driver = RefreshingEmailDriver(email_input, fail_times=2)

        def fake_sleep(*args, **kwargs):
            driver.sleep_calls.append(args[1] if len(args) > 1 else kwargs.get("seconds"))
            return None

        with patch.object(browser, "SHORT_WAIT_TIME", 0), patch.object(
            browser.random, "randint", return_value=6
        ), patch.object(browser, "_sleep_with_heartbeat", side_effect=fake_sleep):
            result = browser._wait_for_signup_email_input(
                driver, timeout=1, refresh_after_attempts=2
            )

        self.assertIs(result, email_input)
        self.assertEqual(driver.refresh_calls, 1)
        self.assertGreaterEqual(driver.entry_click_calls, 2)
        self.assertIn(6, driver.sleep_calls)


if __name__ == "__main__":
    unittest.main()
