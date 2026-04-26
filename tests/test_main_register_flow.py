import unittest
from unittest import mock

from app import main


class RegisterOneAccountFlowTests(unittest.TestCase):
    @mock.patch("app.main.save_to_txt")
    @mock.patch("app.main.fill_signup_form", return_value=(True, False))
    @mock.patch("app.main.open_chatgpt_url")
    @mock.patch("app.main.create_driver")
    @mock.patch("app.main.generate_random_password", return_value="Secret123!")
    @mock.patch(
        "app.main.email_providers.create_temp_email",
        return_value=("user@example.com", "mail-token", "mail-pass"),
    )
    @mock.patch(
        "app.main.email_providers.get_provider_info",
        return_value={"name": "mail.tm"},
    )
    def test_register_one_account_stops_when_password_not_entered(
        self,
        get_provider_info,
        create_temp_email,
        generate_random_password,
        create_driver,
        open_chatgpt_url,
        fill_signup_form,
        save_to_txt,
    ):
        driver = mock.Mock()
        create_driver.return_value = driver

        with mock.patch("app.main.time.sleep", return_value=None), mock.patch(
            "app.main.email_providers.wait_for_verification_email"
        ) as wait_for_verification_email, mock.patch(
            "app.main.perform_codex_oauth_login"
        ) as perform_oauth:
            email, password, success = main.register_one_account(
                email_provider="mailtm"
            )

        self.assertEqual(email, "user@example.com")
        self.assertEqual(password, "Secret123!")
        self.assertFalse(success)
        wait_for_verification_email.assert_not_called()
        perform_oauth.assert_not_called()
        driver.quit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
