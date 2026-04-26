import unittest
from unittest.mock import patch

from app.oauth_service import perform_codex_oauth_login


class OAuthProxyPrecheckTests(unittest.TestCase):
    @patch("app.oauth_service.CodexOAuthClient")
    @patch("app.oauth_service.ensure_proxy_ready")
    def test_perform_codex_oauth_login_checks_proxy_before_login(
        self,
        ensure_ready,
        client_cls,
    ):
        proxy = {
            "enabled": True,
            "type": "http",
            "host": "127.0.0.1",
            "port": 8080,
            "use_auth": False,
            "username": "",
            "password": "",
        }
        client = client_cls.return_value
        client.perform_login.return_value = {"access_token": "access-token"}

        result = perform_codex_oauth_login(
            email="user@example.com",
            password="secret",
            email_provider="mailtm",
            mail_token="mail-token",
            proxy=proxy,
        )

        self.assertEqual(result["access_token"], "access-token")
        ensure_ready.assert_called_once_with(proxy, purpose="OAuth 代理预检", timeout=10)
        client_cls.assert_called_once_with(proxy=proxy)
        client.perform_login.assert_called_once_with(
            email="user@example.com",
            password="secret",
            email_provider="mailtm",
            mail_token="mail-token",
        )


if __name__ == "__main__":
    unittest.main()
