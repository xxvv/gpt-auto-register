import tempfile
import unittest
from pathlib import Path
from unittest import mock

from app import outlookemail_service


class OutlookEmailServiceTests(unittest.TestCase):
    def test_candidates_skip_registered_marker_and_accounts_file(self):
        accounts = [
            {"email": "primary@example.com", "aliases": ["used@example.com", "fresh@example.com"], "status": "active"},
            {"email": "done@example.com", "aliases": [], "status": "active"},
        ]

        with tempfile.TemporaryDirectory() as tmpdir:
            marker = Path(tmpdir) / "registered.json"
            accounts_file = Path(tmpdir) / "accounts.txt"
            marker.write_text('{"registered":["used@example.com"]}', encoding="utf-8")
            accounts_file.write_text(
                "done@example.com|pwd|20260425|已注册/OAuth成功|done@example.com|outlookemail\n",
                encoding="utf-8",
            )

            fake_cfg = mock.Mock()
            fake_cfg.outlookemail.registered_file = str(marker)
            fake_cfg.outlookemail.account_email = ""
            fake_cfg.outlookemail.use_aliases = True
            fake_cfg.outlookemail.allow_reuse = False
            fake_cfg.files.accounts_file = str(accounts_file)

            with mock.patch.object(outlookemail_service, "cfg", fake_cfg):
                candidates = outlookemail_service._address_candidates(accounts)

        self.assertEqual(candidates, ["fresh@example.com", "primary@example.com"])

    def test_mark_registered_email_persists_address(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            marker = Path(tmpdir) / "registered.json"
            accounts_file = Path(tmpdir) / "accounts.txt"

            fake_cfg = mock.Mock()
            fake_cfg.outlookemail.registered_file = str(marker)
            fake_cfg.files.accounts_file = str(accounts_file)

            with mock.patch.object(outlookemail_service, "cfg", fake_cfg):
                self.assertTrue(outlookemail_service.mark_registered_email("User@Example.com"))
                self.assertIn("user@example.com", outlookemail_service._load_registered_addresses())

    def test_release_reserved_email_allows_retry_when_not_registered(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            marker = Path(tmpdir) / "registered.json"
            accounts_file = Path(tmpdir) / "accounts.txt"

            fake_cfg = mock.Mock()
            fake_cfg.outlookemail.registered_file = str(marker)
            fake_cfg.files.accounts_file = str(accounts_file)

            with mock.patch.object(outlookemail_service, "cfg", fake_cfg):
                outlookemail_service._used_addresses.add("retry@example.com")
                outlookemail_service._sessions["session-1"] = {"email": "retry@example.com"}

                self.assertTrue(outlookemail_service.release_reserved_email("Retry@Example.com"))
                self.assertNotIn("retry@example.com", outlookemail_service._used_addresses)
                self.assertNotIn("session-1", outlookemail_service._sessions)


if __name__ == "__main__":
    unittest.main()
