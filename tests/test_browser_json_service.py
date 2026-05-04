import tempfile
import unittest
from pathlib import Path
from unittest import mock

from app import browser_json_service
from app import config
from app.oauth_service import NeedPhoneError
from app.stored_accounts import OAUTH_SUCCESS_STATUS, load_account_from_file


class BrowserJsonServiceTests(unittest.TestCase):
    def test_process_selected_accounts_uses_browser_codex_oauth_and_saves_token(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            accounts_file = Path(tmpdir) / "accounts.txt"
            output_dir = Path(tmpdir) / "tokens"
            accounts_file.write_text(
                "user@nnai.website|Secret123!|20260503|已注册|mail-token|nnai\n",
                encoding="utf-8",
            )

            seen = {}

            def fake_oauth_login(**kwargs):
                seen["oauth"] = kwargs
                return {
                    "access_token": "header.payload.signature",
                    "refresh_token": "refresh-token",
                }

            def fake_save_tokens(**kwargs):
                seen["save"] = kwargs
                output_dir.mkdir(parents=True, exist_ok=True)
                token_path = output_dir / "codex-user@nnai.website.json"
                token_path.write_text(
                    '{\n  "access_token": "header.payload.signature",\n'
                    '  "refresh_token": "refresh-token"\n}',
                    encoding="utf-8",
                )
                return str(token_path)

            progress = []
            batch_id = "20990101_999"
            cpa_path = Path.cwd() / "data" / "cpa" / f"{batch_id}.txt"
            sub2api_path = Path.cwd() / "data" / "sub2api" / f"{batch_id}.txt"
            cpa_path.unlink(missing_ok=True)
            sub2api_path.unlink(missing_ok=True)
            with mock.patch.object(config, "output_batch_id", return_value=batch_id):
                result = browser_json_service.process_selected_accounts(
                    accounts_file=str(accounts_file),
                    emails=["user@nnai.website"],
                    output_dir=str(output_dir),
                    headless=True,
                    proxy={"enabled": False},
                    monitor_callback="monitor",
                    progress_callback=progress.append,
                    oauth_login_func=fake_oauth_login,
                    save_tokens_func=fake_save_tokens,
                )

            self.assertEqual(result["success"], 1)
            self.assertEqual(seen["oauth"]["email"], "user@nnai.website")
            self.assertEqual(seen["oauth"]["password"], "Secret123!")
            self.assertTrue(seen["oauth"]["headless"])
            self.assertEqual(seen["oauth"]["email_provider"], "nnai")
            self.assertEqual(seen["oauth"]["mail_token"], "mail-token")
            self.assertEqual(seen["save"]["tokens"]["access_token"], "header.payload.signature")
            self.assertEqual(seen["save"]["tokens"]["refresh_token"], "refresh-token")
            self.assertEqual(seen["save"]["oauth_cfg"].token_json_dir, str(output_dir))
            self.assertEqual(
                load_account_from_file(str(accounts_file), "user@nnai.website")["status"],
                OAUTH_SUCCESS_STATUS,
            )
            self.assertEqual(progress[-1]["status"], "success")

            cpa_files = list((Path.cwd() / "data" / "cpa").glob(f"{batch_id}.txt"))
            self.assertEqual(len(cpa_files), 1)
            self.assertEqual(
                cpa_files[0].read_text(encoding="utf-8"),
                'user@nnai.website|Secret123!|https://getemail.nnai.website/?email=user%40nnai.website|{  "access_token": "header.payload.signature",  "refresh_token": "refresh-token"}\n',
            )
            self.assertEqual(
                sub2api_path.read_text(encoding="utf-8"),
                "refresh-token\n",
            )
            cpa_files[0].unlink(missing_ok=True)
            sub2api_path.unlink(missing_ok=True)

    def test_process_selected_accounts_uses_proxy_selector_per_account(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            accounts_file = Path(tmpdir) / "accounts.txt"
            output_dir = Path(tmpdir) / "tokens"
            accounts_file.write_text(
                "one@nnai.website|Secret123!|20260503|已注册|token-one|nnai\n"
                "two@nnai.website|Secret456!|20260503|已注册|token-two|nnai\n",
                encoding="utf-8",
            )
            proxies = [
                {"enabled": True, "type": "socks5", "host": "1.1.1.1", "port": 1080, "use_auth": True, "username": "u1", "password": "p1"},
                {"enabled": True, "type": "socks5", "host": "2.2.2.2", "port": 1080, "use_auth": True, "username": "u2", "password": "p2"},
            ]
            seen_oauth = []
            seen_save = []

            def fake_oauth_login(**kwargs):
                seen_oauth.append(kwargs["proxy"]["host"])
                return {"access_token": "access", "refresh_token": f"refresh-{len(seen_oauth)}"}

            def fake_save_tokens(**kwargs):
                seen_save.append(kwargs["proxy"]["host"])
                token_path = output_dir / f"token-{len(seen_save)}.json"
                token_path.parent.mkdir(parents=True, exist_ok=True)
                token_path.write_text('{"refresh_token":"refresh"}', encoding="utf-8")
                return str(token_path)

            progress = []
            with mock.patch.object(config, "output_batch_id", return_value="20990101_998"):
                result = browser_json_service.process_selected_accounts(
                    accounts_file=str(accounts_file),
                    emails=["one@nnai.website", "two@nnai.website"],
                    output_dir=str(output_dir),
                    proxy_selector=lambda idx: proxies[idx - 1],
                    progress_callback=progress.append,
                    oauth_login_func=fake_oauth_login,
                    save_tokens_func=fake_save_tokens,
                )

            self.assertEqual(result["success"], 2)
            self.assertEqual(seen_oauth, ["1.1.1.1", "2.2.2.2"])
            self.assertEqual(seen_save, ["1.1.1.1", "2.2.2.2"])
            self.assertEqual(progress[-1]["proxy"]["host"], "2.2.2.2")
            (Path.cwd() / "data" / "cpa" / "20990101_998.txt").unlink(missing_ok=True)
            (Path.cwd() / "data" / "sub2api" / "20990101_998.txt").unlink(missing_ok=True)

    def test_process_selected_accounts_marks_need_phone_as_failed(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            accounts_file = Path(tmpdir) / "accounts.txt"
            output_dir = Path(tmpdir) / "tokens"
            accounts_file.write_text(
                "user@nnai.website|Secret123!|20260503|已注册|mail-token|nnai\n",
                encoding="utf-8",
            )

            def fake_oauth_login(**kwargs):
                raise NeedPhoneError("OAuth 阶段需要绑定手机号")

            progress = []
            result = browser_json_service.process_selected_accounts(
                accounts_file=str(accounts_file),
                emails=["user@nnai.website"],
                output_dir=str(output_dir),
                headless=True,
                proxy={"enabled": False},
                progress_callback=progress.append,
                oauth_login_func=fake_oauth_login,
            )

            self.assertEqual(result["success"], 0)
            self.assertEqual(result["fail"], 1)
            self.assertEqual(
                load_account_from_file(str(accounts_file), "user@nnai.website")["status"],
                browser_json_service.BROWSER_JSON_FAILED_STATUS,
            )
            self.assertEqual(progress[-1]["status"], "failed_need_phone")

    def test_process_selected_accounts_updates_original_batch_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            old_accounts = Path(tmpdir) / "20260503_001.txt"
            new_accounts = Path(tmpdir) / "20260503_002.txt"
            old_accounts.write_text(
                "old@nnai.website|OldPass123!|20260503|已注册|old-token|nnai\n",
                encoding="utf-8",
            )
            new_accounts.write_text(
                "new@nnai.website|NewPass123!|20260503|已注册|new-token|nnai\n",
                encoding="utf-8",
            )

            def fake_oauth_login(**kwargs):
                return {"access_token": "access", "refresh_token": "refresh"}

            def fake_save_tokens(**kwargs):
                token_path = Path(tmpdir) / "token.json"
                token_path.write_text('{"refresh_token":"refresh"}', encoding="utf-8")
                return str(token_path)

            with mock.patch.object(config, "output_batch_id", return_value="20260503_004"):
                browser_json_service.process_selected_accounts(
                    accounts_file=[str(old_accounts), str(new_accounts)],
                    emails=["old@nnai.website"],
                    output_dir=str(Path(tmpdir) / "tokens"),
                    oauth_login_func=fake_oauth_login,
                    save_tokens_func=fake_save_tokens,
                )

            self.assertEqual(
                load_account_from_file(str(old_accounts), "old@nnai.website")["status"],
                OAUTH_SUCCESS_STATUS,
            )
            self.assertEqual(
                load_account_from_file(str(new_accounts), "new@nnai.website")["status"],
                "已注册",
            )
            (Path.cwd() / "data" / "cpa" / "20260503_004.txt").unlink(missing_ok=True)
            (Path.cwd() / "data" / "sub2api" / "20260503_004.txt").unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
