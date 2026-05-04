import unittest
from unittest.mock import patch

from app import browser


class FakeElement:
    def __init__(self, displayed=True, enabled=True):
        self.displayed = displayed
        self.enabled = enabled

    def is_displayed(self):
        return self.displayed

    def is_enabled(self):
        return self.enabled


class FakeDriver:
    def __init__(self, mapping):
        self.mapping = mapping

    def find_elements(self, by, selector):
        return self.mapping.get((by, selector), [])


class FrozenDate(browser.date):
    @classmethod
    def today(cls):
        return cls(2026, 4, 19)


class BrowserProfileInfoTests(unittest.TestCase):
    def test_detect_profile_birth_fields_prefers_visible_age_input(self):
        age_input = FakeElement()
        driver = FakeDriver(
            {
                (browser.By.CSS_SELECTOR, 'input[name="age"]'): [age_input],
            }
        )

        fields = browser._detect_profile_birth_fields_once(driver)

        self.assertEqual(fields["mode"], "age")
        self.assertIs(fields["age_input"], age_input)

    def test_detect_profile_birth_fields_falls_back_to_birthday_inputs(self):
        hidden_age = FakeElement(displayed=False)
        year_input = FakeElement()
        month_input = FakeElement()
        day_input = FakeElement()
        driver = FakeDriver(
            {
                (browser.By.CSS_SELECTOR, 'input[name="age"]'): [hidden_age],
                (browser.By.CSS_SELECTOR, '[data-type="year"]'): [year_input],
                (browser.By.CSS_SELECTOR, '[data-type="month"]'): [month_input],
                (browser.By.CSS_SELECTOR, '[data-type="day"]'): [day_input],
            }
        )

        fields = browser._detect_profile_birth_fields_once(driver)

        self.assertEqual(fields["mode"], "birthday")
        self.assertIs(fields["year_input"], year_input)
        self.assertIs(fields["month_input"], month_input)
        self.assertIs(fields["day_input"], day_input)

    def test_detect_profile_form_fields_accepts_username_with_birthday(self):
        username_input = FakeElement()
        year_input = FakeElement()
        month_input = FakeElement()
        day_input = FakeElement()
        driver = FakeDriver(
            {
                (browser.By.CSS_SELECTOR, 'input[name="username"]'): [username_input],
                (browser.By.CSS_SELECTOR, '[data-type="year"]'): [year_input],
                (browser.By.CSS_SELECTOR, '[data-type="month"]'): [month_input],
                (browser.By.CSS_SELECTOR, '[data-type="day"]'): [day_input],
            }
        )

        fields = browser._detect_profile_form_fields_once(driver)

        self.assertIs(fields["name_input"], username_input)
        self.assertEqual(fields["birth_fields"]["mode"], "birthday")

    def test_detect_profile_form_fields_ignores_username_without_birth_fields(self):
        username_input = FakeElement()
        driver = FakeDriver(
            {
                (browser.By.CSS_SELECTOR, 'input[name="username"]'): [username_input],
            }
        )

        self.assertIsNone(browser._detect_profile_form_fields_once(driver))

    def test_calculate_age_from_birthday_uses_today_boundary(self):
        with patch.object(browser, "date", FrozenDate):
            self.assertEqual(
                browser._calculate_age_from_birthday("2000", "04", "20"),
                "25",
            )
            self.assertEqual(
                browser._calculate_age_from_birthday("2000", "04", "19"),
                "26",
            )


if __name__ == "__main__":
    unittest.main()
