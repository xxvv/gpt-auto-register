import unittest
from unittest import mock

from app import main


class RegisterOneAccountFlowTests(unittest.TestCase):
    def test_payment_flow_verifies_amount_before_redeeming_card(self):
        driver = mock.Mock()
        card = mock.Mock()
        events = []

        def request_payurl(access_token):
            events.append("request_payurl")
            return "https://stripe.example/pay"

        def open_stripe(driver_arg, stripe_payurl, monitor_callback=None):
            del driver_arg, stripe_payurl, monitor_callback
            events.append("open_stripe")

        def redeem_card(email=""):
            del email
            events.append("redeem_card")
            return card

        def submit_payment(driver_arg, card_arg, monitor_callback=None):
            del driver_arg, card_arg, monitor_callback
            events.append("submit_payment")

        def fetch_json(**kwargs):
            del kwargs
            events.append("fetch_json")
            return "/tmp/codex-user.json"

        with (
            mock.patch(
                "app.main.payment_service.is_payment_simulation_enabled",
                return_value=False,
            ),
            mock.patch(
                "app.main.payment_service.request_stripe_payurl",
                side_effect=request_payurl,
            ) as request_stripe_payurl,
            mock.patch(
                "app.main.payment_service.open_stripe_payment_page",
                side_effect=open_stripe,
            ) as open_stripe_payment_page,
            mock.patch(
                "app.main.payment_service.redeem_next_card",
                side_effect=redeem_card,
            ) as redeem_next_card,
            mock.patch(
                "app.main.payment_service.fill_and_submit_stripe_payment",
                side_effect=submit_payment,
            ) as fill_and_submit_stripe_payment,
            mock.patch(
                "app.main.payment_service.fill_and_submit_paypal_payment"
            ) as fill_and_submit_paypal_payment,
            mock.patch(
                "app.main.payment_service.fetch_and_save_browser_json_for_registered_account",
                side_effect=fetch_json,
            ),
        ):
            result = main._run_post_registration_payment_flow(
                driver=driver,
                email="user@example.com",
                password="Secret123!",
                access_token="session-access-token",
                email_provider="nnai",
                mailbox_credential="mail-pass",
            )

        self.assertEqual(result, "/tmp/codex-user.json")
        self.assertEqual(
            events,
            [
                "request_payurl",
                "open_stripe",
                "redeem_card",
                "submit_payment",
                "fetch_json",
            ],
        )
        request_stripe_payurl.assert_called_once_with("session-access-token")
        open_stripe_payment_page.assert_called_once_with(
            driver,
            "https://stripe.example/pay",
            monitor_callback=None,
        )
        redeem_next_card.assert_called_once_with(email="user@example.com")
        fill_and_submit_stripe_payment.assert_called_once_with(
            driver,
            card,
            monitor_callback=None,
        )
        fill_and_submit_paypal_payment.assert_not_called()

    def test_payment_flow_uses_paypal_method_when_selected(self):
        driver = mock.Mock()
        card = mock.Mock()
        events = []

        def fetch_json(**kwargs):
            del kwargs
            events.append("fetch_json")
            return "/tmp/codex-user.json"

        with (
            mock.patch(
                "app.main.payment_service.is_payment_simulation_enabled",
                return_value=False,
            ),
            mock.patch(
                "app.main.payment_service.request_stripe_payurl",
                side_effect=lambda _access_token: events.append("request_payurl")
                or "https://stripe.example/pay",
            ),
            mock.patch(
                "app.main.payment_service.open_stripe_payment_page",
                side_effect=lambda *_args, **_kwargs: events.append("open_stripe"),
            ),
            mock.patch(
                "app.main.payment_service.redeem_next_card",
                side_effect=lambda email="": events.append(f"redeem:{email}") or card,
            ),
            mock.patch(
                "app.main.payment_service.fill_and_submit_stripe_payment"
            ) as fill_and_submit_stripe_payment,
            mock.patch(
                "app.main.payment_service.fill_and_submit_paypal_payment",
                side_effect=lambda *_args, **_kwargs: events.append("paypal_submit"),
            ) as fill_and_submit_paypal_payment,
            mock.patch(
                "app.main.payment_service.fetch_and_save_browser_json_for_registered_account",
                side_effect=fetch_json,
            ),
        ):
            result = main._run_post_registration_payment_flow(
                driver=driver,
                email="user@example.com",
                password="Secret123!",
                access_token="session-access-token",
                email_provider="nnai",
                mailbox_credential="mail-pass",
                payment_method="paypal",
            )

        self.assertEqual(result, "/tmp/codex-user.json")
        self.assertEqual(
            events,
            [
                "request_payurl",
                "open_stripe",
                "redeem:user@example.com",
                "paypal_submit",
                "fetch_json",
            ],
        )
        fill_and_submit_stripe_payment.assert_not_called()
        fill_and_submit_paypal_payment.assert_called_once_with(
            driver,
            card,
            email="user@example.com",
            monitor_callback=None,
        )

    def test_payment_flow_does_not_redeem_card_when_amount_check_fails(self):
        driver = mock.Mock()

        with (
            mock.patch(
                "app.main.payment_service.is_payment_simulation_enabled",
                return_value=False,
            ),
            mock.patch(
                "app.main.payment_service.request_stripe_payurl",
                return_value="https://stripe.example/pay",
            ),
            mock.patch(
                "app.main.payment_service.open_stripe_payment_page",
                side_effect=RuntimeError("Stripe 金额不是 €0.00: €20.00"),
            ),
            mock.patch("app.main.payment_service.redeem_next_card") as redeem_next_card,
            mock.patch(
                "app.main.payment_service.fill_and_submit_stripe_payment"
            ) as fill_and_submit_stripe_payment,
            mock.patch(
                "app.main.payment_service.fetch_and_save_browser_json_for_registered_account"
            ) as fetch_json,
        ):
            with self.assertRaisesRegex(RuntimeError, "Stripe 金额不是 €0.00"):
                main._run_post_registration_payment_flow(
                    driver=driver,
                    email="user@example.com",
                    password="Secret123!",
                    access_token="session-access-token",
                    email_provider="nnai",
                    mailbox_credential="mail-pass",
                )

        redeem_next_card.assert_not_called()
        fill_and_submit_stripe_payment.assert_not_called()
        fetch_json.assert_not_called()

    def test_payment_flow_simulation_skips_external_payment_steps(self):
        driver = mock.Mock()
        card = mock.Mock()
        card.card = "4859540156532730"
        card.name = "LATANYA DAVIS"
        card.city = "PLYMOUTH"

        with (
            mock.patch(
                "app.main.payment_service.is_payment_simulation_enabled",
                return_value=True,
            ),
            mock.patch(
                "app.main.payment_service.redeem_next_card",
                return_value=card,
            ) as redeem_next_card,
            mock.patch(
                "app.main.payment_service.request_stripe_payurl"
            ) as request_stripe_payurl,
            mock.patch(
                "app.main.payment_service.open_stripe_payment_page"
            ) as open_stripe_payment_page,
            mock.patch(
                "app.main.payment_service.fill_and_submit_stripe_payment"
            ) as fill_and_submit_stripe_payment,
            mock.patch(
                "app.main.payment_service.fill_and_submit_paypal_payment"
            ) as fill_and_submit_paypal_payment,
            mock.patch(
                "app.main.payment_service.fetch_and_save_browser_json_for_registered_account"
            ) as fetch_json,
        ):
            result = main._run_post_registration_payment_flow(
                driver=driver,
                email="user@example.com",
                password="Secret123!",
                access_token="session-access-token",
                email_provider="nnai",
                mailbox_credential="mail-pass",
            )

        self.assertEqual(result, "payment-simulation")
        redeem_next_card.assert_called_once_with(email="user@example.com")
        request_stripe_payurl.assert_not_called()
        open_stripe_payment_page.assert_not_called()
        fill_and_submit_stripe_payment.assert_not_called()
        fill_and_submit_paypal_payment.assert_not_called()
        fetch_json.assert_not_called()

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

        with mock.patch("app.main.time.sleep", return_value=None) as sleep:
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
        self.assertNotIn(
            mock.call(10),
            sleep.call_args_list,
        )
        build_account_info.assert_called_once_with(driver, proxy=None)
        driver.quit.assert_called_once()

    @mock.patch("app.main.save_to_txt")
    @mock.patch(
        "app.main._run_post_registration_payment_flow",
        return_value="/tmp/codex-user.json",
    )
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
    def test_register_one_account_runs_payment_flow_when_enabled(
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
        payment_flow,
        save_to_txt,
    ):
        driver = mock.Mock()
        create_driver.return_value = driver

        with mock.patch("app.main.time.sleep", return_value=None):
            email, password, success = main.register_one_account(
                email_provider="nnai",
                complete_payment_flow=True,
            )

        self.assertEqual(email, "user@example.com")
        self.assertEqual(password, "Secret123!")
        self.assertTrue(success)
        payment_flow.assert_called_once_with(
            driver=driver,
            email="user@example.com",
            password="Secret123!",
            access_token="session-access-token",
            email_provider="nnai",
            mailbox_credential="mail-pass",
            proxy=None,
            headless=False,
            payment_method="card",
            monitor_callback=None,
        )
        self.assertEqual(
            save_to_txt.call_args_list[-1].args[2],
            "已注册/支付成功",
        )
        driver.quit.assert_called_once()

    @mock.patch("app.main.time.sleep", return_value=None)
    @mock.patch("app.main.verify_logged_in", return_value=True)
    @mock.patch("app.main.click_getting_started_button", return_value=True)
    @mock.patch("app.main.enter_verification_code", return_value=True)
    @mock.patch(
        "app.main.email_providers.wait_for_verification_email",
        return_value="123456",
    )
    @mock.patch("app.main.fill_login_form", return_value=(True, False))
    @mock.patch("app.main.open_chatgpt_url")
    @mock.patch("app.main.create_driver")
    @mock.patch(
        "app.main.email_providers.get_provider_info",
        return_value={
            "name": "NNAI.website",
            "module": mock.Mock(login_existing_email=mock.Mock(return_value="mail-token")),
        },
    )
    def test_login_one_account_uses_nnai_otp_and_getting_started_button(
        self,
        get_provider_info,
        create_driver,
        open_chatgpt_url,
        fill_login_form,
        wait_for_verification_email,
        enter_verification_code,
        click_getting_started_button,
        verify_logged_in,
        _sleep,
    ):
        driver = mock.Mock()
        create_driver.return_value = driver

        email, success = main.login_one_account(
            "user@nnai.website",
            "Secret123!",
            monitor_callback=mock.Mock(),
            headless=True,
            proxy=None,
        )

        provider_module = get_provider_info.return_value["module"]
        self.assertEqual(email, "user@nnai.website")
        self.assertTrue(success)
        provider_module.login_existing_email.assert_called_once_with(
            "user@nnai.website",
            "user@nnai.website",
        )
        fill_login_form.assert_called_once_with(
            driver,
            "user@nnai.website",
            "Secret123!",
            monitor_callback=mock.ANY,
        )
        wait_for_verification_email.assert_called_once_with("nnai", "mail-token")
        enter_verification_code.assert_called_once_with(
            driver,
            "123456",
            monitor_callback=mock.ANY,
        )
        click_getting_started_button.assert_called_once_with(
            driver,
            monitor_callback=mock.ANY,
        )
        verify_logged_in.assert_called_once_with(driver)
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

        with mock.patch("app.main.time.sleep", return_value=None) as sleep:
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
        self.assertNotIn(mock.call(10), sleep.call_args_list)
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

    @mock.patch("app.main.time.sleep", return_value=None)
    @mock.patch("app.main.verify_logged_in", return_value=True)
    @mock.patch("app.main.fill_profile_info", return_value=True)
    @mock.patch(
        "app.main.enter_verification_code",
        side_effect=["retry_auth", True],
    )
    @mock.patch(
        "app.main.email_providers.wait_for_verification_email",
        return_value="123456",
    )
    @mock.patch(
        "app.main.fill_signup_form",
        side_effect=[(True, False), (True, True)],
    )
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
    @mock.patch(
        "app.main._build_registered_account_info",
        return_value="session-access-token",
    )
    @mock.patch("app.main.save_to_txt")
    def test_register_one_account_restarts_email_flow_after_code_retry_returns_to_email_page(
        self,
        save_to_txt,
        build_account_info,
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
        _sleep,
    ):
        driver = mock.Mock()
        create_driver.return_value = driver

        email, password, success = main.register_one_account(email_provider="nnai")

        self.assertEqual(email, "user@example.com")
        self.assertEqual(password, "Secret123!")
        self.assertTrue(success)
        self.assertEqual(fill_signup_form.call_count, 2)
        self.assertEqual(wait_for_verification_email.call_count, 2)
        self.assertEqual(enter_verification_code.call_count, 2)
        driver.quit.assert_called_once()

    @mock.patch("app.main.time.sleep", return_value=None)
    @mock.patch("app.main.verify_logged_in", return_value=True)
    @mock.patch("app.main.click_getting_started_button", return_value=True)
    @mock.patch(
        "app.main.enter_verification_code",
        side_effect=["retry_auth", True],
    )
    @mock.patch(
        "app.main.email_providers.wait_for_verification_email",
        return_value="123456",
    )
    @mock.patch(
        "app.main.fill_login_form",
        side_effect=[(True, False), (True, True)],
    )
    @mock.patch("app.main.open_chatgpt_url")
    @mock.patch("app.main.create_driver")
    @mock.patch(
        "app.main.email_providers.get_provider_info",
        return_value={
            "name": "NNAI.website",
            "module": mock.Mock(login_existing_email=mock.Mock(return_value="mail-token")),
        },
    )
    def test_login_one_account_restarts_email_flow_after_code_retry_returns_to_email_page(
        self,
        get_provider_info,
        create_driver,
        open_chatgpt_url,
        fill_login_form,
        wait_for_verification_email,
        enter_verification_code,
        click_getting_started_button,
        verify_logged_in,
        _sleep,
    ):
        driver = mock.Mock()
        create_driver.return_value = driver

        email, success = main.login_one_account("user@nnai.website", "Secret123!")

        self.assertEqual(email, "user@nnai.website")
        self.assertTrue(success)
        self.assertEqual(fill_login_form.call_count, 2)
        self.assertEqual(wait_for_verification_email.call_count, 2)
        self.assertEqual(enter_verification_code.call_count, 2)
        driver.quit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
