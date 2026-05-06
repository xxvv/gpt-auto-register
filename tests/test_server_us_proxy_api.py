import unittest
from unittest import mock
import tempfile

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
            "complete_payment_flow": server.state.complete_payment_flow,
            "payment_method": server.state.payment_method,
            "use_proxy_for_tasks": server.state.use_proxy_for_tasks,
            "proxy_switch_interval": server.state.proxy_switch_interval,
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
        server.state.complete_payment_flow = self.original_state["complete_payment_flow"]
        server.state.payment_method = self.original_state["payment_method"]
        server.state.use_proxy_for_tasks = self.original_state["use_proxy_for_tasks"]
        server.state.proxy_switch_interval = self.original_state["proxy_switch_interval"]
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

    @mock.patch("app.server.payment_service.get_current_webshare_static_proxy")
    def test_get_current_webshare_proxy_updates_state(self, get_current_proxy):
        get_current_proxy.return_value = {
            "enabled": True,
            "type": "socks5",
            "host": "3.3.3.3",
            "port": 1080,
            "use_auth": True,
            "username": "user",
            "password": "pass",
        }

        response = self.client.post("/api/webshare-proxy/current")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["proxy"]["host"], "3.3.3.3")
        self.assertEqual(server.state.proxy["host"], "3.3.3.3")
        get_current_proxy.assert_called_once()

    @mock.patch("app.server.payment_service.replace_webshare_static_proxy")
    def test_replace_webshare_proxy_updates_state(self, replace_proxy):
        replace_proxy.return_value = {
            "enabled": True,
            "type": "socks5",
            "host": "4.4.4.4",
            "port": 1080,
            "use_auth": True,
            "username": "user",
            "password": "pass",
        }

        response = self.client.post("/api/webshare-proxy/replace")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["proxy"]["host"], "4.4.4.4")
        self.assertEqual(server.state.proxy["host"], "4.4.4.4")
        replace_proxy.assert_called_once()

    @mock.patch("app.server.payment_service.get_current_webshare_static_proxy")
    @mock.patch("app.server.payment_service.replace_webshare_static_proxy")
    def test_webshare_proxy_apis_reject_when_running(self, replace_proxy, get_current_proxy):
        server.state.is_running = True

        current_response = self.client.post("/api/webshare-proxy/current")
        replace_response = self.client.post("/api/webshare-proxy/replace")

        self.assertEqual(current_response.status_code, 400)
        self.assertEqual(replace_response.status_code, 400)
        get_current_proxy.assert_not_called()
        replace_proxy.assert_not_called()

    def test_clear_proxy_disables_current_proxy(self):
        server.state.proxy = {
            "enabled": True,
            "type": "socks5",
            "host": "5.5.5.5",
            "port": 1080,
            "use_auth": True,
            "username": "user",
            "password": "pass",
        }

        response = self.client.post("/api/proxy/clear")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertFalse(payload["proxy"]["enabled"])
        self.assertFalse(server.state.proxy["enabled"])
        self.assertEqual(server.state.proxy["host"], "")

    def test_clear_proxy_rejects_when_running(self):
        server.state.is_running = True

        response = self.client.post("/api/proxy/clear")

        self.assertEqual(response.status_code, 400)

    def test_settings_api_reads_and_writes_complete_payment_flow(self):
        server.state.parallel_count = 3

        response = self.client.post(
            "/api/settings",
            json={
                "parallel": 3,
                "headless": True,
                "complete_payment_flow": True,
                "payment_method": "paypal",
                "use_proxy_for_tasks": True,
                "proxy_switch_interval": 3,
            },
        )
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(payload["complete_payment_flow"])
        self.assertEqual(payload["payment_method"], "paypal")
        self.assertEqual(payload["parallel"], 1)
        self.assertTrue(server.state.complete_payment_flow)
        self.assertEqual(server.state.payment_method, "paypal")
        self.assertTrue(payload["use_proxy_for_tasks"])
        self.assertEqual(payload["proxy_switch_interval"], 3)

        response = self.client.get("/api/settings")
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertTrue(payload["complete_payment_flow"])
        self.assertEqual(payload["payment_method"], "paypal")
        self.assertTrue(payload["use_proxy_for_tasks"])
        self.assertEqual(payload["proxy_switch_interval"], 3)

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
    @mock.patch("app.server.payment_service.replace_webshare_static_proxy")
    @mock.patch("app.server.ensure_proxy_ready")
    def test_worker_thread_uses_webshare_proxy_until_switch_interval(
        self,
        ensure_ready,
        replace_proxy,
        register_one_account,
        _random_choice,
    ):
        replace_proxy.side_effect = [
            {"enabled": True, "type": "socks5", "host": "1.1.1.1", "port": 1080, "use_auth": True, "username": "u1", "password": "p1"},
            {"enabled": True, "type": "socks5", "host": "2.2.2.2", "port": 1080, "use_auth": True, "username": "u2", "password": "p2"},
        ]

        seen = []

        def fake_register_one_account(*, proxy=None, **kwargs):
            seen.append(proxy["host"])
            return "user@example.com", "secret", True

        register_one_account.side_effect = fake_register_one_account

        server.worker_thread(
            count=4,
            selected_providers=["nnai"],
            parallel=1,
            headless=False,
            proxy={"enabled": False},
            use_proxy=True,
            proxy_switch_interval=2,
        )

        ensure_ready.assert_called_once()
        self.assertEqual(seen, ["1.1.1.1", "1.1.1.1", "2.2.2.2", "2.2.2.2"])
        self.assertEqual(replace_proxy.call_count, 2)
        self.assertEqual(server.state.success_count, 4)
        self.assertEqual(server.state.fail_count, 0)

    @mock.patch("app.server.random.choice", return_value="nnai.website")
    @mock.patch("app.server.main.register_one_account")
    @mock.patch("app.server.payment_service.replace_webshare_static_proxy")
    def test_worker_thread_does_not_use_proxy_when_proxy_switch_off(
        self,
        replace_proxy,
        register_one_account,
        _random_choice,
    ):
        seen = []

        def fake_register_one_account(*, proxy=None, **kwargs):
            seen.append(proxy)
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
            use_proxy=False,
        )

        replace_proxy.assert_not_called()
        self.assertEqual(seen, [None, None, None])

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
    @mock.patch("app.server.payment_service.replace_webshare_static_proxy")
    def test_worker_thread_account_logs_include_current_proxy(
        self,
        replace_proxy,
        ensure_ready,
        register_one_account,
        _random_choice,
    ):
        replace_proxy.return_value = {
            "enabled": True,
            "type": "socks5",
            "host": "4.4.4.4",
            "port": 80,
            "use_auth": True,
            "username": "u",
            "password": "p",
        }

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
            use_proxy=True,
        )

        ensure_ready.assert_called_once()
        matching_logs = [line for line in server.state.logs if "账号流程测试日志" in line]
        self.assertEqual(len(matching_logs), 1)
        self.assertIn("[代理 socks5://4.4.4.4:80 (auth)] 账号流程测试日志", matching_logs[0])

    @mock.patch("app.server.random.choice", return_value="nnai.website")
    @mock.patch("app.server.main.register_one_account")
    @mock.patch("app.server.ensure_proxy_ready")
    @mock.patch("app.server.payment_service.replace_webshare_static_proxy")
    def test_worker_thread_payment_flow_replaces_webshare_proxy_per_account(
        self,
        replace_proxy,
        ensure_ready,
        register_one_account,
        _random_choice,
    ):
        replace_proxy.side_effect = [
            {"enabled": True, "type": "socks5", "host": "10.0.0.1", "port": 8080, "use_auth": True, "username": "u1", "password": "p1"},
            {"enabled": True, "type": "socks5", "host": "10.0.0.2", "port": 8080, "use_auth": True, "username": "u2", "password": "p2"},
        ]
        seen = []

        def fake_register_one_account(
            *, proxy=None, complete_payment_flow=False, payment_method="card", **kwargs
        ):
            del kwargs
            seen.append((proxy["host"], complete_payment_flow, payment_method))
            return "user@example.com", "secret", True

        register_one_account.side_effect = fake_register_one_account

        server.worker_thread(
            count=2,
            selected_providers=["nnai"],
            parallel=3,
            headless=False,
            proxy={"enabled": False},
            complete_payment_flow=True,
            payment_method="paypal",
            use_proxy=True,
            proxy_switch_interval=1,
        )

        self.assertEqual(
            seen,
            [("10.0.0.1", True, "paypal"), ("10.0.0.2", True, "paypal")],
        )
        self.assertEqual(replace_proxy.call_count, 2)
        ensure_ready.assert_not_called()
        self.assertEqual(server.state.success_count, 2)

    @mock.patch("app.server.threading.Thread")
    def test_start_task_passes_proxy_options_to_worker(self, thread_cls):
        thread = mock.Mock()
        thread_cls.return_value = thread

        response = self.client.post(
            "/api/start",
            json={
                "count": 2,
                "complete_payment_flow": True,
                "payment_method": "paypal",
                "use_proxy": True,
                "proxy_switch_interval": 5,
            },
        )
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["status"], "started")
        kwargs = thread_cls.call_args.kwargs
        self.assertIs(kwargs["target"], server.worker_thread)
        self.assertTrue(kwargs["daemon"])
        self.assertTrue(kwargs["args"][7])
        self.assertEqual(kwargs["args"][8], 5)
        self.assertEqual(kwargs["args"][9], "paypal")
        self.assertEqual(server.state.payment_method, "paypal")
        self.assertTrue(server.state.use_proxy_for_tasks)
        self.assertEqual(server.state.proxy_switch_interval, 5)
        thread.start.assert_called_once()

    @mock.patch("app.server.threading.Thread")
    def test_start_accounts_browser_json_passes_proxy_options_to_worker(self, thread_cls):
        thread = mock.Mock()
        thread_cls.return_value = thread

        response = self.client.post(
            "/api/accounts/browser-json/start",
            json={
                "emails": ["user@nnai.website"],
                "use_proxy": True,
                "proxy_switch_interval": 4,
            },
        )
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["status"], "started")
        kwargs = thread_cls.call_args.kwargs
        self.assertIs(kwargs["target"], server.browser_json_worker_thread)
        self.assertTrue(kwargs["args"][4])
        self.assertEqual(kwargs["args"][5], 4)
        thread.start.assert_called_once()

    @mock.patch("app.server.random.choice", return_value="nnai.website")
    @mock.patch("app.server.main.register_one_account")
    def test_worker_thread_continues_after_every_four_completed_accounts(
        self,
        register_one_account,
        _random_choice,
    ):
        def fake_register_one_account(**kwargs):
            del kwargs
            return "user@example.com", "secret", True

        register_one_account.side_effect = fake_register_one_account

        server.worker_thread(
            count=5,
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

        self.assertEqual(server.state.success_count, 5)
        self.assertFalse(
            any("休息 120 秒" in line for line in server.state.logs),
            server.state.logs,
        )

    def test_start_login_task_returns_400_when_file_missing(self):
        response = self.client.post(
            "/api/login/start",
            json={"accounts_file": "/tmp/definitely-missing-accounts-login.txt"},
        )
        payload = response.get_json()

        self.assertEqual(response.status_code, 400)
        self.assertIn("登录账号 TXT 文件不存在", payload["error"])

    def test_start_login_task_rejects_when_already_running(self):
        server.state.is_running = True

        response = self.client.post("/api/login/start", json={})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"], "Already running")

    @mock.patch("app.server.threading.Thread")
    def test_start_login_task_starts_background_worker(self, thread_cls):
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as handle:
            handle.write("user@nnai.website|secret\n")
            accounts_path = handle.name

        thread = mock.Mock()
        thread_cls.return_value = thread

        response = self.client.post(
            "/api/login/start",
            json={"accounts_file": accounts_path},
        )
        payload = response.get_json()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["status"], "started")
        self.assertEqual(payload["accounts_file"], accounts_path)
        thread_cls.assert_called_once()
        kwargs = thread_cls.call_args.kwargs
        self.assertTrue(kwargs["daemon"])
        self.assertIs(kwargs["target"], server.login_worker_thread)
        self.assertEqual(kwargs["args"][0], accounts_path)
        thread.start.assert_called_once()

    @mock.patch("app.server.account_login_service.process_login_accounts_from_file")
    def test_login_worker_thread_updates_progress_counts(self, process_login_accounts):
        def fake_process(*, progress_callback, **kwargs):
            progress_callback(
                {
                    "task_type": "account_login",
                    "total": 2,
                    "processed": 1,
                    "completed": 1,
                    "success": 1,
                    "fail": 0,
                    "skipped": 0,
                    "remaining": 1,
                    "current_email": "user1@nnai.website",
                    "status": "success",
                }
            )
            return {
                "total": 2,
                "processed": 2,
                "completed": 2,
                "success": 1,
                "fail": 1,
                "skipped": 0,
                "remaining": 0,
            }

        process_login_accounts.side_effect = fake_process

        server.login_worker_thread(
            accounts_file="/tmp/accounts-login.txt",
            headless=True,
            proxy={"enabled": False},
        )

        self.assertFalse(server.state.is_running)
        self.assertEqual(server.state.success_count, 1)
        self.assertEqual(server.state.fail_count, 1)
        progress = server.state.get_progress()
        self.assertEqual(progress["task_type"], "account_login")
        self.assertEqual(progress["total"], 2)
        self.assertEqual(progress["completed"], 2)


if __name__ == "__main__":
    unittest.main()
