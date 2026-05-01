import unittest
from unittest import mock

from app import server


class ServerUsProxyApiTests(unittest.TestCase):
    def setUp(self):
        self.client = server.app.test_client()
        self.original_state = {
            "proxy": dict(server.state.proxy),
            "is_running": server.state.is_running,
            "stop_requested": server.state.stop_requested,
            "success_count": server.state.success_count,
            "fail_count": server.state.fail_count,
            "current_action": server.state.current_action,
            "selected_providers": list(server.state.selected_providers),
            "selected_email_domains": list(server.state.selected_email_domains),
            "parallel_count": server.state.parallel_count,
            "headless": server.state.headless,
            "logs": list(server.state.logs),
        }
        server.state.logs = []

    def tearDown(self):
        server.state.proxy = self.original_state["proxy"]
        server.state.is_running = self.original_state["is_running"]
        server.state.stop_requested = self.original_state["stop_requested"]
        server.state.success_count = self.original_state["success_count"]
        server.state.fail_count = self.original_state["fail_count"]
        server.state.current_action = self.original_state["current_action"]
        server.state.selected_providers = self.original_state["selected_providers"]
        server.state.selected_email_domains = self.original_state["selected_email_domains"]
        server.state.parallel_count = self.original_state["parallel_count"]
        server.state.headless = self.original_state["headless"]
        server.state.logs = self.original_state["logs"]
        try:
            delattr(server._log_context, "proxy")
        except AttributeError:
            pass

    @mock.patch("app.server.us_proxy_pool.load_us_proxy_pool")
    def test_apply_us_proxy_updates_current_proxy(self, load_pool):
        load_pool.return_value = {
            "proxies": [
                {
                    "host": "1.1.1.1",
                    "port": 80,
                    "anonymity": "elite proxy",
                    "https": "yes",
                }
            ]
        }

        response = self.client.post(
            "/api/us-proxies/apply",
            json={"host": "1.1.1.1", "port": 80},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(server.state.proxy["enabled"])
        self.assertEqual(server.state.proxy["host"], "1.1.1.1")
        self.assertEqual(server.state.proxy["port"], 80)
        self.assertEqual(server.state.proxy["type"], "http")
        self.assertFalse(server.state.proxy["use_auth"])

    @mock.patch("app.server.us_proxy_pool.load_us_proxy_pool")
    def test_apply_us_proxy_preserves_auth_and_type_from_pool_item(self, load_pool):
        load_pool.return_value = {
            "proxies": [
                {
                    "host": "31.59.20.176",
                    "port": 6754,
                    "type": "socks5",
                    "use_auth": True,
                    "username": "dozklkdu",
                    "password": "1up90849fjp9",
                    "anonymity": "authenticated",
                }
            ]
        }

        response = self.client.post(
            "/api/us-proxies/apply",
            json={"host": "31.59.20.176", "port": 6754, "type": "socks5"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(server.state.proxy["enabled"])
        self.assertEqual(server.state.proxy["type"], "socks5")
        self.assertTrue(server.state.proxy["use_auth"])
        self.assertEqual(server.state.proxy["username"], "dozklkdu")
        self.assertEqual(server.state.proxy["password"], "1up90849fjp9")

    @mock.patch("app.server.us_proxy_pool.load_us_proxy_pool")
    def test_get_us_proxies_includes_current_proxy(self, load_pool):
        server.state.proxy = {
            "enabled": True,
            "type": "http",
            "host": "9.9.9.9",
            "port": 3128,
            "use_auth": False,
            "username": "",
            "password": "",
        }
        load_pool.return_value = {
            "source_url": "https://example.com",
            "fetched_at": "2026-04-19T00:00:00+00:00",
            "raw_row_count": 1,
            "working_count": 1,
            "proxies": [],
        }

        response = self.client.get("/api/us-proxies")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["current_proxy"]["host"], "9.9.9.9")
        self.assertTrue(payload["current_proxy"]["enabled"])

    @mock.patch("app.server.nnai_service.get_configured_domains")
    def test_email_domains_api_updates_selected_domains(self, get_configured_domains):
        get_configured_domains.return_value = ["nnai.website", "mail.example.com"]

        response = self.client.post(
            "/api/email-domains",
            json={"selected": ["mail.example.com"]},
        )
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["selected"], ["mail.example.com"])
        self.assertEqual(server.state.selected_email_domains, ["mail.example.com"])

        response = self.client.get("/api/email-domains")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            payload,
            [
                {"domain": "nnai.website", "selected": False},
                {"domain": "mail.example.com", "selected": True},
            ],
        )

    @mock.patch("app.server.random.choice", return_value="nnai.website")
    @mock.patch("app.server.main.register_one_account")
    @mock.patch("app.server.us_proxy_pool.load_us_proxy_pool")
    @mock.patch("app.server.ensure_proxy_ready")
    def test_worker_thread_rotates_pool_proxy_for_each_account(
        self,
        ensure_ready,
        load_pool,
        register_one_account,
        _random_choice,
    ):
        load_pool.return_value = {
            "proxies": [
                {"host": "1.1.1.1", "port": 80},
                {"host": "2.2.2.2", "port": 81},
                {"host": "3.3.3.3", "port": 82},
            ]
        }

        seen = []

        def fake_register_one_account(*, proxy=None, **kwargs):
            seen.append(f"{proxy['host']}:{proxy['port']}")
            return "user@example.com", "secret", True

        register_one_account.side_effect = fake_register_one_account

        server.worker_thread(
            count=4,
            selected_providers=["nnai"],
            parallel=1,
            headless=False,
            proxy={
                "enabled": True,
                "type": "http",
                "host": "2.2.2.2",
                "port": 81,
                "use_auth": False,
                "username": "",
                "password": "",
            },
        )

        ensure_ready.assert_called_once()
        self.assertEqual(
            seen,
            ["2.2.2.2:81", "3.3.3.3:82", "1.1.1.1:80", "2.2.2.2:81"],
        )
        self.assertEqual(server.state.success_count, 4)
        self.assertEqual(server.state.fail_count, 0)

    @mock.patch("app.server.random.choice", return_value="nnai.website")
    @mock.patch("app.server.main.register_one_account")
    @mock.patch("app.server.us_proxy_pool.load_us_proxy_pool")
    @mock.patch("app.server.ensure_proxy_ready")
    def test_worker_thread_auto_selects_first_pool_proxy_when_no_current_proxy(
        self,
        ensure_ready,
        load_pool,
        register_one_account,
        _random_choice,
    ):
        load_pool.return_value = {
            "proxies": [
                {
                    "host": "31.59.20.176",
                    "port": 6754,
                    "type": "socks5",
                    "use_auth": True,
                    "username": "dozklkdu",
                    "password": "1up90849fjp9",
                },
                {"host": "2.2.2.2", "port": 81, "type": "http"},
            ]
        }

        seen = []

        def fake_register_one_account(*, proxy=None, **kwargs):
            seen.append(
                (
                    proxy["type"],
                    proxy["host"],
                    proxy["port"],
                    proxy["username"],
                )
            )
            return "user@example.com", "secret", True

        register_one_account.side_effect = fake_register_one_account

        server.worker_thread(
            count=3,
            selected_providers=["nnai"],
            parallel=1,
            headless=False,
            proxy={
                "enabled": False,
                "type": "http",
                "host": "",
                "port": 8080,
                "use_auth": False,
                "username": "",
                "password": "",
            },
        )

        ensure_ready.assert_called_once_with(
            {
                "enabled": True,
                "type": "socks5",
                "host": "31.59.20.176",
                "port": 6754,
                "use_auth": True,
                "username": "dozklkdu",
                "password": "1up90849fjp9",
            },
            purpose="批量注册任务启动前代理预检",
            timeout=10,
        )
        self.assertEqual(
            seen,
            [
                ("socks5", "31.59.20.176", 6754, "dozklkdu"),
                ("http", "2.2.2.2", 81, ""),
                ("socks5", "31.59.20.176", 6754, "dozklkdu"),
            ],
        )
        self.assertTrue(
            any("未手动选择代理" in line for line in server.state.logs),
            server.state.logs,
        )

    @mock.patch("app.server.original_print")
    def test_hooked_print_prefixes_logs_with_thread_proxy(self, original_print):
        proxy = {
            "enabled": True,
            "type": "http",
            "host": "8.8.8.8",
            "port": 8080,
            "use_auth": False,
            "username": "",
            "password": "",
        }

        with server._log_proxy_context(proxy):
            server.hooked_print("测试日志")

        self.assertTrue(server.state.logs)
        self.assertIn("[代理 http://8.8.8.8:8080] 测试日志", server.state.logs[-1])
        original_print.assert_called_once_with("[代理 http://8.8.8.8:8080] 测试日志")

    @mock.patch("app.server.random.choice", return_value="nnai.website")
    @mock.patch("app.server.main.register_one_account")
    @mock.patch("app.server.ensure_proxy_ready")
    def test_worker_thread_account_logs_include_current_proxy(
        self,
        ensure_ready,
        register_one_account,
        _random_choice,
    ):
        def fake_register_one_account(*, proxy=None, **kwargs):
            del proxy, kwargs
            server.main.print("账号流程测试日志")
            return "user@example.com", "secret", True

        register_one_account.side_effect = fake_register_one_account

        server.worker_thread(
            count=1,
            selected_providers=["nnai"],
            parallel=1,
            headless=False,
            proxy={
                "enabled": True,
                "type": "http",
                "host": "4.4.4.4",
                "port": 80,
                "use_auth": False,
                "username": "",
                "password": "",
            },
        )

        ensure_ready.assert_called_once()
        matching_logs = [line for line in server.state.logs if "账号流程测试日志" in line]
        self.assertEqual(len(matching_logs), 1)
        self.assertIn("[代理 http://4.4.4.4:80] 账号流程测试日志", matching_logs[0])


if __name__ == "__main__":
    unittest.main()
