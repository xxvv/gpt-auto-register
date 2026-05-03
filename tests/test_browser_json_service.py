import tempfile
import unittest
from pathlib import Path
from unittest import mock

from app import browser_json_service
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
            with mock.patch.object(browser_json_service, "PROJECT_ROOT", Path(tmpdir)):
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

            cpa_files = list((Path(tmpdir) / "data").glob("accounts-cpa-*.txt"))
            self.assertEqual(len(cpa_files), 1)
            self.assertEqual(
                cpa_files[0].read_text(encoding="utf-8"),
                'user@nnai.website|Secret123!|https://getemail.nnai.website/?email=user%40nnai.website|{  "access_token": "header.payload.signature",  "refresh_token": "refresh-token"}\n',
            )
            self.assertEqual(
                next((Path(tmpdir) / "data").glob("accounts-sub2api-*.txt")).read_text(encoding="utf-8"),
                "refresh-token\n",
            )


if __name__ == "__main__":
    unittest.main()
