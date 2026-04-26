import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from app import us_proxy_pool


SAMPLE_HTML = """
<html>
  <body>
    <section id="list">
      <div class="table-responsive fpl-list">
        <table class="table table-striped table-bordered">
          <thead>
            <tr>
              <th>IP Address</th>
              <th>Port</th>
              <th>Code</th>
              <th>Country</th>
              <th>Anonymity</th>
              <th>Google</th>
              <th>Https</th>
              <th>Last Checked</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1.1.1.1</td>
              <td>80</td>
              <td>US</td>
              <td>United States</td>
              <td>elite proxy</td>
              <td>no</td>
              <td>yes</td>
              <td>1 min ago</td>
            </tr>
            <tr>
              <td>2.2.2.2</td>
              <td>8080</td>
              <td>CA</td>
              <td>Canada</td>
              <td>anonymous</td>
              <td>no</td>
              <td>no</td>
              <td>2 mins ago</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </body>
</html>
"""


class UsProxyPoolTests(unittest.TestCase):
    def test_proxy_rotation_starts_from_current_proxy_and_wraps(self):
        rotation = us_proxy_pool.ProxyRotation(
            [
                {"host": "1.1.1.1", "port": 80},
                {"host": "2.2.2.2", "port": 81},
                {"host": "3.3.3.3", "port": 82},
            ],
            start_proxy={
                "enabled": True,
                "type": "http",
                "host": "2.2.2.2",
                "port": 81,
                "use_auth": False,
                "username": "",
                "password": "",
            },
        )

        self.assertTrue(rotation.enabled)
        self.assertEqual(rotation.available_count, 3)
        self.assertEqual(rotation.starting_proxy["host"], "2.2.2.2")
        self.assertEqual(
            [rotation.next_proxy()["host"] for _ in range(4)],
            ["2.2.2.2", "3.3.3.3", "1.1.1.1", "2.2.2.2"],
        )

    def test_proxy_rotation_is_disabled_when_start_proxy_not_in_pool(self):
        rotation = us_proxy_pool.ProxyRotation(
            [
                {"host": "1.1.1.1", "port": 80},
                {"host": "2.2.2.2", "port": 81},
            ],
            start_proxy={
                "enabled": True,
                "type": "http",
                "host": "9.9.9.9",
                "port": 90,
                "use_auth": False,
                "username": "",
                "password": "",
            },
        )

        self.assertFalse(rotation.enabled)
        self.assertEqual(rotation.available_count, 2)
        self.assertIsNone(rotation.next_proxy())

    def test_parse_us_proxy_table_reads_first_list_table(self):
        rows = us_proxy_pool.parse_us_proxy_table(SAMPLE_HTML)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["IP Address"], "1.1.1.1")
        self.assertEqual(rows[0]["Port"], "80")
        self.assertEqual(rows[0]["Code"], "US")

    def test_fetch_us_proxy_rows_reads_manual_webshare_file(self):
        with TemporaryDirectory() as tmpdir:
            manual_path = Path(tmpdir) / "Webshare 10 proxies.txt"
            manual_path.write_text(
                "31.59.20.176:6754:dozklkdu:1up90849fjp9\n",
                encoding="utf-8",
            )

            with mock.patch.object(
                us_proxy_pool,
                "MANUAL_PROXY_SOURCES",
                (
                    {
                        "path": manual_path,
                        "type": "socks5",
                        "label": "Webshare 10 proxies",
                    },
                ),
            ):
                rows = us_proxy_pool.fetch_us_proxy_rows()

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["IP Address"], "31.59.20.176")
        self.assertEqual(rows[0]["Port"], "6754")
        self.assertEqual(rows[0]["Type"], "socks5")
        self.assertEqual(rows[0]["Use Auth"], "yes")
        self.assertEqual(rows[0]["Username"], "dozklkdu")
        self.assertEqual(rows[0]["Password"], "1up90849fjp9")

    @mock.patch("app.us_proxy_pool.save_us_proxy_pool")
    @mock.patch("app.us_proxy_pool._test_proxy_candidate")
    @mock.patch("app.us_proxy_pool.fetch_us_proxy_rows")
    def test_refresh_us_proxy_pool_keeps_only_working_candidates(
        self,
        fetch_rows,
        test_candidate,
        save_pool,
    ):
        fetch_rows.return_value = [
            {
                "IP Address": "1.1.1.1",
                "Port": "80",
                "Code": "US",
                "Country": "United States",
                "Anonymity": "elite proxy",
                "Google": "no",
                "Https": "yes",
                "Last Checked": "1 min ago",
            },
            {
                "IP Address": "3.3.3.3",
                "Port": "8080",
                "Code": "US",
                "Country": "United States",
                "Anonymity": "transparent",
                "Google": "no",
                "Https": "no",
                "Last Checked": "2 mins ago",
            },
        ]
        test_candidate.side_effect = [
            {
                "host": "1.1.1.1",
                "port": 80,
                "https": "yes",
                "anonymity": "elite proxy",
                "ok": True,
                "detected_ip": "1.1.1.1",
                "latency_ms": 120,
            },
            {
                "host": "3.3.3.3",
                "port": 8080,
                "https": "no",
                "anonymity": "transparent",
                "ok": False,
                "reason": "proxy failed",
            },
        ]

        payload = us_proxy_pool.refresh_us_proxy_pool(workers=1, timeout=1)

        self.assertEqual(payload["raw_row_count"], 2)
        self.assertEqual(payload["working_count"], 1)
        self.assertEqual(len(payload["proxies"]), 1)
        self.assertEqual(payload["proxies"][0]["host"], "1.1.1.1")
        save_pool.assert_called_once()

    def test_load_us_proxy_pool_keeps_matching_manual_webshare_socks_entries(self):
        with TemporaryDirectory() as tmpdir:
            cache_path = Path(tmpdir) / "us_proxy_pool.json"
            manual_path = Path(tmpdir) / "Webshare 10 proxies.txt"
            manual_path.write_text(
                "31.59.20.176:6754:dozklkdu:1up90849fjp9\n",
                encoding="utf-8",
            )

            with mock.patch.object(us_proxy_pool, "US_PROXY_CACHE_PATH", cache_path), mock.patch.object(
                us_proxy_pool,
                "MANUAL_PROXY_SOURCES",
                (
                    {
                        "path": manual_path,
                        "type": "socks5",
                        "label": "Webshare 10 proxies",
                    },
                ),
            ):
                cache_path.write_text(
                    json.dumps(
                        {
                            "source_url": us_proxy_pool._manual_source_url(),
                            "proxies": [
                                {
                                    "host": "31.59.20.176",
                                    "port": 6754,
                                    "type": "socks5",
                                    "use_auth": True,
                                    "username": "dozklkdu",
                                    "password": "1up90849fjp9",
                                    "detected_ip": "31.59.20.176",
                                }
                            ],
                        }
                    ),
                    encoding="utf-8",
                )
                payload = us_proxy_pool.load_us_proxy_pool()

        self.assertEqual(payload["working_count"], 1)
        self.assertEqual(payload["proxies"][0]["type"], "socks5")
        self.assertTrue(payload["proxies"][0]["use_auth"])
        self.assertEqual(payload["proxies"][0]["username"], "dozklkdu")
        self.assertEqual(payload["proxies"][0]["password"], "1up90849fjp9")
        self.assertEqual(payload["proxies"][0]["detected_ip"], "31.59.20.176")

    def test_load_us_proxy_pool_ignores_legacy_remote_cache_entries(self):
        with TemporaryDirectory() as tmpdir:
            cache_path = Path(tmpdir) / "us_proxy_pool.json"
            cache_path.write_text(
                '{"source_url":"https://free-proxy-list.net/zh-cn/us-proxy.html","fetched_at":"2026-04-19T00:00:00+00:00","proxies":[{"host":"1.1.1.1","port":80}]}',
                encoding="utf-8",
            )
            manual_path = Path(tmpdir) / "Webshare 10 proxies.txt"
            manual_path.write_text(
                "31.59.20.176:6754:dozklkdu:1up90849fjp9\n",
                encoding="utf-8",
            )

            with mock.patch.object(us_proxy_pool, "US_PROXY_CACHE_PATH", cache_path), mock.patch.object(
                us_proxy_pool,
                "MANUAL_PROXY_SOURCES",
                (
                    {
                        "path": manual_path,
                        "type": "socks5",
                        "label": "Webshare 10 proxies",
                    },
                ),
            ):
                payload = us_proxy_pool.load_us_proxy_pool()

        self.assertEqual(payload["working_count"], 1)
        self.assertEqual(len(payload["proxies"]), 1)
        self.assertEqual(payload["proxies"][0]["host"], "31.59.20.176")
        self.assertEqual(payload["proxies"][0]["type"], "socks5")


if __name__ == "__main__":
    unittest.main()
