import json
import os
import tempfile
import types
import unittest
from unittest import mock

from app.oauth_service import save_codex_tokens


def find_single_file(root_dir: str, filename: str) -> str:
    matches = []
    for root, _, files in os.walk(root_dir):
        if filename in files:
            matches.append(os.path.join(root, filename))
    if len(matches) != 1:
        raise AssertionError(f"expected exactly one {filename}, found {matches}")
    return matches[0]


class FakeResponse:
    def __init__(self, status_code=200, text="ok"):
        self.status_code = status_code
        self.text = text


class FakeSession:
    def __init__(self):
        self.proxies = {}
        self.post_calls = []

    def post(self, url, files=None, headers=None, timeout=None, verify=None):
        self.post_calls.append(
            {
                "url": url,
                "files": files,
                "headers": headers,
                "timeout": timeout,
                "verify": verify,
            }
        )
        return FakeResponse()


class OAuthTokenPersistenceTests(unittest.TestCase):
    def test_save_codex_tokens_writes_ak_rk_under_timestamp_directory(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            oauth_cfg = types.SimpleNamespace(
                ak_file=os.path.join(tmpdir, "token_exports", "ak.txt"),
                rk_file=os.path.join(tmpdir, "token_exports", "rk.txt"),
                token_json_dir=os.path.join(tmpdir, "tokens"),
            )
            cpa_cfg = types.SimpleNamespace(
                upload_api_url="",
                upload_api_token="",
            )
            cliproxy_cfg = types.SimpleNamespace(
                enabled=False,
                api_url="http://localhost:8317",
                api_key="",
                auth_dir=os.path.join(tmpdir, "cli-proxy"),
            )

            token_path = save_codex_tokens(
                email="user@example.com",
                tokens={
                    "access_token": "header.payload.signature",
                    "refresh_token": "refresh-123",
                },
                oauth_cfg=oauth_cfg,
                cpa_cfg=cpa_cfg,
                cliproxy_cfg=cliproxy_cfg,
            )

            ak_files = []
            rk_files = []
            for root, _, files in os.walk(os.path.join(tmpdir, "token_exports")):
                for name in files:
                    path = os.path.join(root, name)
                    if name == "ak.txt":
                        ak_files.append(path)
                    if name == "rk.txt":
                        rk_files.append(path)

            self.assertEqual(len(ak_files), 1)
            self.assertEqual(len(rk_files), 1)
            self.assertEqual(
                token_path,
                os.path.join(tmpdir, "tokens", "codex-user@example.com.json"),
            )

    def test_save_codex_tokens_writes_files_and_uploads(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            oauth_cfg = types.SimpleNamespace(
                ak_file=os.path.join(tmpdir, "token_exports", "ak.txt"),
                rk_file=os.path.join(tmpdir, "token_exports", "rk.txt"),
                token_json_dir=os.path.join(tmpdir, "tokens"),
            )
            cpa_cfg = types.SimpleNamespace(
                upload_api_url="https://cpa.example.com/upload",
                upload_api_token="upload-secret",
            )
            cliproxy_cfg = types.SimpleNamespace(
                enabled=False,
                api_url="http://localhost:8317",
                api_key="",
                auth_dir=os.path.join(tmpdir, "cli-proxy"),
            )
            proxy = {
                "enabled": True,
                "type": "http",
                "host": "127.0.0.1",
                "port": 8080,
                "use_auth": False,
                "username": "",
                "password": "",
            }
            fake_session = FakeSession()

            token_path = save_codex_tokens(
                email="user@example.com",
                tokens={
                    "access_token": "header.payload.signature",
                    "refresh_token": "refresh-123",
                    "id_token": "id-123",
                },
                oauth_cfg=oauth_cfg,
                cpa_cfg=cpa_cfg,
                cliproxy_cfg=cliproxy_cfg,
                proxy=proxy,
                session_factory=lambda: fake_session,
            )

            ak_path = find_single_file(os.path.join(tmpdir, "token_exports"), "ak.txt")
            rk_path = find_single_file(os.path.join(tmpdir, "token_exports"), "rk.txt")

            with open(ak_path, "r", encoding="utf-8") as handle:
                self.assertEqual(handle.read().strip(), "header.payload.signature")

            with open(rk_path, "r", encoding="utf-8") as handle:
                self.assertEqual(handle.read().strip(), "refresh-123")

            with open(token_path, "r", encoding="utf-8") as handle:
                token_json = json.load(handle)

            self.assertEqual(token_json["type"], "codex")
            self.assertEqual(token_json["email"], "user@example.com")
            self.assertEqual(token_json["access_token"], "header.payload.signature")
            self.assertEqual(token_json["refresh_token"], "refresh-123")
            self.assertEqual(len(fake_session.post_calls), 1)
            self.assertEqual(
                fake_session.post_calls[0]["headers"]["Authorization"],
                "Bearer upload-secret",
            )
            self.assertEqual(
                fake_session.proxies,
                {
                    "http": "http://127.0.0.1:8080",
                    "https": "http://127.0.0.1:8080",
                },
            )

    def test_save_codex_tokens_skips_upload_without_management_key(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            oauth_cfg = types.SimpleNamespace(
                ak_file=os.path.join(tmpdir, "token_exports", "ak.txt"),
                rk_file=os.path.join(tmpdir, "token_exports", "rk.txt"),
                token_json_dir=os.path.join(tmpdir, "tokens"),
            )
            cpa_cfg = types.SimpleNamespace(
                upload_api_url="http://localhost:8317/v0/management/auth-files",
                upload_api_token="",
            )
            cliproxy_cfg = types.SimpleNamespace(
                enabled=False,
                api_url="http://localhost:8317",
                api_key="",
                auth_dir=os.path.join(tmpdir, "cli-proxy"),
            )
            fake_session = FakeSession()

            token_path = save_codex_tokens(
                email="user@example.com",
                tokens={
                    "access_token": "header.payload.signature",
                    "refresh_token": "refresh-123",
                },
                oauth_cfg=oauth_cfg,
                cpa_cfg=cpa_cfg,
                cliproxy_cfg=cliproxy_cfg,
                session_factory=lambda: fake_session,
            )

            self.assertTrue(os.path.exists(token_path))
            self.assertEqual(fake_session.post_calls, [])

    def test_save_codex_tokens_uploads_to_cliproxy_http_when_enabled(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            oauth_cfg = types.SimpleNamespace(
                ak_file=os.path.join(tmpdir, "token_exports", "ak.txt"),
                rk_file=os.path.join(tmpdir, "token_exports", "rk.txt"),
                token_json_dir=os.path.join(tmpdir, "tokens"),
            )
            cpa_cfg = types.SimpleNamespace(
                upload_api_url="",
                upload_api_token="",
            )
            cliproxy_cfg = types.SimpleNamespace(
                enabled=True,
                api_url="http://proxy.example.com:8317/",
                api_key="cliproxy-secret",
                auth_dir=os.path.join(tmpdir, "cli-proxy"),
            )

            with mock.patch(
                "app.oauth_service._cliproxy_file_name",
                return_value="token_user_example_com.json",
            ), mock.patch(
                "app.oauth_service.curl_requests.post",
                return_value=FakeResponse(),
            ) as cliproxy_post:
                save_codex_tokens(
                    email="user@example.com",
                    tokens={
                        "access_token": "header.payload.signature",
                        "refresh_token": "refresh-123",
                    },
                    oauth_cfg=oauth_cfg,
                    cpa_cfg=cpa_cfg,
                    cliproxy_cfg=cliproxy_cfg,
                )

            cliproxy_post.assert_called_once()
            self.assertEqual(
                cliproxy_post.call_args.args[0],
                "http://proxy.example.com:8317/v0/management/auth-files",
            )
            self.assertEqual(
                cliproxy_post.call_args.kwargs["headers"]["Authorization"],
                "Bearer cliproxy-secret",
            )
            self.assertEqual(
                cliproxy_post.call_args.kwargs["params"],
                {"name": "token_user_example_com.json", "provider": "codex"},
            )

    def test_save_codex_tokens_skips_cliproxy_when_disabled(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            oauth_cfg = types.SimpleNamespace(
                ak_file=os.path.join(tmpdir, "token_exports", "ak.txt"),
                rk_file=os.path.join(tmpdir, "token_exports", "rk.txt"),
                token_json_dir=os.path.join(tmpdir, "tokens"),
            )
            cpa_cfg = types.SimpleNamespace(
                upload_api_url="",
                upload_api_token="",
            )
            cliproxy_cfg = types.SimpleNamespace(
                enabled=False,
                api_url="http://proxy.example.com:8317/",
                api_key="cliproxy-secret",
                auth_dir=os.path.join(tmpdir, "cli-proxy"),
            )

            with mock.patch("app.oauth_service._upload_to_cliproxy") as upload_mock:
                token_path = save_codex_tokens(
                    email="user@example.com",
                    tokens={
                        "access_token": "header.payload.signature",
                        "refresh_token": "refresh-123",
                    },
                    oauth_cfg=oauth_cfg,
                    cpa_cfg=cpa_cfg,
                    cliproxy_cfg=cliproxy_cfg,
                )

            self.assertTrue(os.path.exists(token_path))
            upload_mock.assert_not_called()


if __name__ == "__main__":
    unittest.main()
