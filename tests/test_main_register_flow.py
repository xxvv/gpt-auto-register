import unittest
from unittest import mock

from app import main


class RegisterOneAccountFlowTests(unittest.TestCase):
    @mock.patch(
        "app.main.fetch_current_access_token",
        return_value="session-access-token",
    )
    def test_build_registered_account_info_returns_access_token(
        self,
        fetch_current_access_token,
    ):
        result = main._build_registered_account_info(mock.Mock(), proxy=None)

        self.assertEqual(result, "session-access-token")
        fetch_current_access_token.assert_called_once()

    @mock.patch("app.main.save_to_txt")
    @mock.patch(
        "app.main._build_registered_account_info",
        return_value="session-access-token",
    )
    @mock.patch("app.main.verify_logged_in", return_value=True)
    @mock.patch("app.main.fill_profile_info", return_value=True)
    @mock.patch("app.main.enter_verification_code", return_value=True)
    @mock.patch(
        "app.main.email_providers.wait_for_verification_email",
        return_value="123456",
    )
    @mock.patch("app.main.fill_signup_form", return_value=(True, True))
    @mock.patch("app.main.open_chatgpt_url")
    @mock.patch("app.main.create_driver")
    @mock.patch("app.main.generate_random_password", return_value="Secret123!")
    @mock.patch(
        "app.main.email_providers.create_temp_email",
        return_value=("user@example.com", "mail-token", "mail-pass"),
    )
    @mock.patch(
        "app.main.email_providers.get_provider_info",
        return_value={"name": "NNAI.website", "module": mock.Mock()},
    )
    def test_register_one_account_saves_access_token_after_login(
        self,
        get_provider_info,
        create_temp_email,
        generate_random_password,
        create_driver,
        open_chatgpt_url,
        fill_signup_form,
        wait_for_verification_email,
        enter_verification_code,
        fill_profile_info,
        verify_logged_in,
        build_account_info,
        save_to_txt,
    ):
        driver = mock.Mock()
        create_driver.return_value = driver

        with mock.patch("app.main.time.sleep", return_value=None):
            email, password, success = main.register_one_account(
                email_provider="nnai"
            )

        self.assertEqual(email, "user@example.com")
        self.assertEqual(password, "Secret123!")
        self.assertTrue(success)
        self.assertEqual(
            save_to_txt.call_args_list[-1].args[2],
            "session-access-token",
        )
        build_account_info.assert_called_once_with(driver, proxy=None)
        driver.quit.assert_called_once()

    @mock.patch("app.main.save_to_txt")
    @mock.patch(
        "app.main._build_registered_account_info",
        return_value="session-access-token",
    )
    @mock.patch("app.main.verify_logged_in", return_value=True)
    @mock.patch("app.main.fill_profile_info", return_value=True)
    @mock.patch("app.main.enter_verification_code", return_value=True)
    @mock.patch(
        "app.main.email_providers.wait_for_verification_email",
        return_value="123456",
    )
    @mock.patch("app.main.fill_signup_form", return_value=(True, True))
    @mock.patch("app.main.open_chatgpt_url")
    @mock.patch("app.main.create_driver")
    @mock.patch("app.main.generate_random_password", return_value="Secret123!")
    @mock.patch(
        "app.main.email_providers.create_temp_email",
        return_value=("user@example.com", "mail-token", "mail-pass"),
    )
    @mock.patch(
        "app.main.email_providers.get_provider_info",
        return_value={"name": "NNAI.website", "module": mock.Mock()},
    )
    def test_register_one_account_notifies_success_after_access_token_is_saved(
        self,
        get_provider_info,
        create_temp_email,
        generate_random_password,
        create_driver,
        open_chatgpt_url,
        fill_signup_form,
        wait_for_verification_email,
        enter_verification_code,
        fill_profile_info,
        verify_logged_in,
        build_account_info,
        save_to_txt,
    ):
        driver = mock.Mock()
        create_driver.return_value = driver
        events = []

        def fake_save_to_txt(*args, **kwargs):
            events.append(("save", args[0], args[2]))

        def fake_success_callback(email, password, account_record_info):
            events.append(("callback", email, password, account_record_info))

        save_to_txt.side_effect = fake_save_to_txt

        with mock.patch("app.main.time.sleep", return_value=None):
            email, password, success = main.register_one_account(
                email_provider="nnai",
                success_callback=fake_success_callback,
            )

        self.assertEqual(email, "user@example.com")
        self.assertEqual(password, "Secret123!")
        self.assertTrue(success)
        self.assertEqual(
            events[-2:],
            [
                ("save", "user@example.com", "session-access-token"),
                (
                    "callback",
                    "user@example.com",
                    "Secret123!",
                    "session-access-token",
                ),
            ],
        )
        driver.quit.assert_called_once()

    @mock.patch("app.main.save_to_txt")
    @mock.patch(
        "app.main._build_registered_account_info",
        return_value="session-access-token",
    )
    @mock.patch("app.main.verify_logged_in", return_value=True)
    @mock.patch("app.main.fill_profile_info", return_value=True)
    @mock.patch("app.main.enter_verification_code", return_value=True)
    @mock.patch(
        "app.main.email_providers.wait_for_verification_email",
        return_value="123456",
    )
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
        return_value={"name": "NNAI.website", "module": mock.Mock()},
    )
    def test_register_one_account_continues_when_password_page_is_skipped(
        self,
        get_provider_info,
        create_temp_email,
        generate_random_password,
        create_driver,
        open_chatgpt_url,
        fill_signup_form,
        wait_for_verification_email,
        enter_verification_code,
        fill_profile_info,
        verify_logged_in,
        build_account_info,
        save_to_txt,
    ):
        driver = mock.Mock()
        create_driver.return_value = driver

        with mock.patch("app.main.time.sleep", return_value=None):
            email, password, success = main.register_one_account(
                email_provider="nnai"
            )

        self.assertEqual(email, "user@example.com")
        self.assertEqual(password, "Secret123!")
        self.assertTrue(success)
        wait_for_verification_email.assert_called_once_with("nnai", "mail-token")
        enter_verification_code.assert_called_once_with(
            driver, "123456", monitor_callback=None
        )
        driver.quit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
