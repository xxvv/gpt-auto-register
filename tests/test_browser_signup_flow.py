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


if __name__ == "__main__":
    unittest.main()
