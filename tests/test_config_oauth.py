import tempfile
import textwrap
import unittest

from app.config import ConfigLoader


class ConfigOAuthTests(unittest.TestCase):
    def test_loader_parses_oauth_and_cpa_sections(self):
        yaml_content = textwrap.dedent(
            """
            oauth:
              issuer: "https://auth.example.com"
              client_id: "client_123"
              redirect_uri: "http://localhost:1455/auth/callback"
              ak_file: "tokens/ak.txt"
              rk_file: "tokens/rk.txt"
              token_json_dir: "tokens/json"

            cpa:
              upload_api_url: "https://cpa.example.com/upload"
              upload_api_token: "secret-token"

            payment:
              enabled_default: true
              webshare_api_key: "webshare-secret"
              webshare_plan_id: "plan-123"
              proxy_debug_mode: true
              debug_proxy_type: "socks5"
              debug_proxy_host: "127.0.0.1"
              debug_proxy_port: 7890
              debug_proxy_use_auth: true
              debug_proxy_username: "proxy-user"
              debug_proxy_password: "proxy-pass"
              card_debug_mode: true
              debug_card_key: "debug-card"
              card_keys_file: "keys.txt"
              phone_keys_file: "phones.txt"
              card_usage_file: "usage.json"

            cliproxy:
              enabled: true
              api_url: "http://proxy.example.com:8317/"
              api_key: "cliproxy-secret"
              auth_dir: "~/custom-cli-proxy"

            email:
              domains:
                - "nnai.website"
                - "mail.example.com"

            gaggle:
              cookie_header: "session=abc; GAGGLE_REFERER_KEY=xyz"
              csrf_token: "csrf-token-123"
            """
        )

        with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as handle:
            handle.write(yaml_content)
            config_path = handle.name

        loader = ConfigLoader(config_path=config_path)

        self.assertEqual(loader.config.oauth.issuer, "https://auth.example.com")
        self.assertEqual(loader.config.oauth.client_id, "client_123")
        self.assertEqual(
            loader.config.oauth.redirect_uri,
            "http://localhost:1455/auth/callback",
        )
        self.assertEqual(loader.config.oauth.ak_file, "tokens/ak.txt")
        self.assertEqual(loader.config.oauth.rk_file, "tokens/rk.txt")
        self.assertEqual(loader.config.oauth.token_json_dir, "tokens/json")
        self.assertEqual(
            loader.config.cpa.upload_api_url,
            "https://cpa.example.com/upload",
        )
        self.assertEqual(loader.config.cpa.upload_api_token, "secret-token")
        self.assertTrue(loader.config.payment.enabled_default)
        self.assertEqual(loader.config.payment.webshare_api_key, "webshare-secret")
        self.assertEqual(loader.config.payment.webshare_plan_id, "plan-123")
        self.assertTrue(loader.config.payment.proxy_debug_mode)
        self.assertEqual(loader.config.payment.debug_proxy_type, "socks5")
        self.assertEqual(loader.config.payment.debug_proxy_host, "127.0.0.1")
        self.assertEqual(loader.config.payment.debug_proxy_port, 7890)
        self.assertTrue(loader.config.payment.debug_proxy_use_auth)
        self.assertEqual(loader.config.payment.debug_proxy_username, "proxy-user")
        self.assertEqual(loader.config.payment.debug_proxy_password, "proxy-pass")
        self.assertTrue(loader.config.payment.card_debug_mode)
        self.assertEqual(loader.config.payment.debug_card_key, "debug-card")
        self.assertEqual(loader.config.payment.card_keys_file, "keys.txt")
        self.assertEqual(loader.config.payment.phone_keys_file, "phones.txt")
        self.assertEqual(loader.config.payment.card_usage_file, "usage.json")
        self.assertTrue(loader.config.cliproxy.enabled)
        self.assertEqual(loader.config.cliproxy.api_url, "http://proxy.example.com:8317/")
        self.assertEqual(loader.config.cliproxy.api_key, "cliproxy-secret")
        self.assertEqual(loader.config.cliproxy.auth_dir, "~/custom-cli-proxy")
        self.assertEqual(loader.config.email.domains, ["nnai.website", "mail.example.com"])
        self.assertEqual(
            loader.config.gaggle.cookie_header,
            "session=abc; GAGGLE_REFERER_KEY=xyz",
        )
        self.assertEqual(loader.config.gaggle.csrf_token, "csrf-token-123")


if __name__ == "__main__":
    unittest.main()
