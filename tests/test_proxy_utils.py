import unittest

import requests

from app.utils import (
    format_probe_location,
    probe_proxy_connectivity,
    probe_proxy_target_urls,
)


class FakeResponse:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []
        self.proxies = {}
        self.headers = {}
        self.trust_env = True

    def get(self, url, timeout=None, headers=None, **kwargs):
        self.calls.append(
            {
                "url": url,
                "timeout": timeout,
                "headers": headers,
                **kwargs,
            }
        )
        response = self.responses[url]
        if isinstance(response, list):
            response = response.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class ProxyUtilsTests(unittest.TestCase):
    def test_probe_proxy_connectivity_returns_ip_country_and_latency(self):
        proxy = {
            "enabled": True,
            "type": "http",
            "host": "127.0.0.1",
            "port": 8080,
            "use_auth": False,
            "username": "",
            "password": "",
        }
        session = FakeSession(
            {
                "https://api.ipify.org?format=json": FakeResponse(
                    200,
                    payload={"ip": "1.2.3.4"},
                ),
            }
        )

        result = probe_proxy_connectivity(
            proxy,
            session_factory=lambda: session,
            geo_lookup=lambda ip, timeout: {
                "ok": True,
                "country": "United States",
                "country_code": "US",
                "city": "Ashburn",
                "source": "mock-geo",
                "latency_ms": 18,
            },
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["ip"], "1.2.3.4")
        self.assertEqual(result["country_code"], "US")
        self.assertEqual(result["city"], "Ashburn")
        self.assertEqual(
            session.proxies,
            {
                "http": "http://127.0.0.1:8080",
                "https": "http://127.0.0.1:8080",
            },
        )
        self.assertEqual(
            session.calls[0]["url"],
            "https://api.ipify.org?format=json",
        )
        self.assertEqual(
            format_probe_location(result),
            "United States (US) / Ashburn",
        )

    def test_probe_proxy_connectivity_returns_proxy_error_reason(self):
        proxy = {
            "enabled": True,
            "type": "http",
            "host": "127.0.0.1",
            "port": 8080,
            "use_auth": False,
            "username": "",
            "password": "",
        }
        session = FakeSession(
            {
                "https://api.ipify.org?format=json": requests.exceptions.ProxyError(
                    "proxy boom"
                ),
                "https://api64.ipify.org?format=json": requests.exceptions.ProxyError(
                    "proxy boom"
                ),
                "https://ifconfig.me/all.json": requests.exceptions.ProxyError(
                    "proxy boom"
                ),
                "https://icanhazip.com": requests.exceptions.ProxyError("proxy boom"),
            }
        )

        result = probe_proxy_connectivity(
            proxy,
            session_factory=lambda: session,
        )

        self.assertFalse(result["ok"])
        self.assertIn("代理握手失败", result["reason"])

    def test_probe_proxy_connectivity_retries_transient_timeout(self):
        proxy = {
            "enabled": True,
            "type": "socks5",
            "host": "127.0.0.1",
            "port": 1080,
            "use_auth": True,
            "username": "user",
            "password": "pass",
        }
        session = FakeSession(
            {
                "https://api.ipify.org?format=json": [
                    requests.exceptions.ConnectTimeout("timed out"),
                    FakeResponse(200, payload={"ip": "5.6.7.8"}),
                ],
            }
        )

        result = probe_proxy_connectivity(
            proxy,
            session_factory=lambda: session,
            geo_lookup=lambda ip, timeout: {"ok": False, "reason": "skip"},
            endpoints=(
                {
                    "url": "https://api.ipify.org?format=json",
                    "kind": "json",
                    "fields": ("ip",),
                },
            ),
            attempts=2,
            retry_delay=0,
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["ip"], "5.6.7.8")
        self.assertEqual(result["attempt"], 2)
        self.assertEqual(len(session.calls), 2)

    def test_probe_proxy_target_urls_reports_target_block(self):
        proxy = {
            "enabled": True,
            "type": "http",
            "host": "127.0.0.1",
            "port": 8080,
            "use_auth": False,
            "username": "",
            "password": "",
        }
        session = FakeSession(
            {
                "https://chatgpt.com/": FakeResponse(403, text="blocked"),
                "https://auth.openai.com/": requests.exceptions.ConnectionError(
                    "reset"
                ),
            }
        )

        result = probe_proxy_target_urls(
            proxy,
            target_urls=("https://chatgpt.com/", "https://auth.openai.com/"),
            session_factory=lambda: session,
            timeout=5,
        )

        self.assertFalse(result["ok"])
        self.assertIn("HTTP 403", result["errors"][0])
        self.assertTrue(result["targets"][0]["blocked"])
        self.assertFalse(result["targets"][1]["ok"])


if __name__ == "__main__":
    unittest.main()
