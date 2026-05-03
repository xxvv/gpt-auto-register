import os
import tempfile
import unittest

from app.account_login_service import (
    load_login_accounts_from_file,
    process_login_accounts_from_file,
)


class AccountLoginServiceTests(unittest.TestCase):
    def test_load_login_accounts_from_file_reads_email_password_records(self):
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as handle:
            handle.write("user1@nnai.website|pass-1\n")
            handle.write("user2@nnai.website|pass-2\n")
            path = handle.name

        records, invalid_count = load_login_accounts_from_file(path)

        self.assertEqual(invalid_count, 0)
        self.assertEqual(
            records,
            [
                {"email": "user1@nnai.website", "password": "pass-1", "line_no": 1},
                {"email": "user2@nnai.website", "password": "pass-2", "line_no": 2},
            ],
        )

    def test_load_login_accounts_from_file_skips_invalid_lines(self):
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as handle:
            handle.write("\n")
            handle.write("not-an-email|pass\n")
            handle.write("user@nnai.website|\n")
            handle.write("user@nnai.website|pass|extra\n")
            handle.write("ok@nnai.website|secret\n")
            path = handle.name

        records, invalid_count = load_login_accounts_from_file(path)

        self.assertEqual(invalid_count, 3)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["email"], "ok@nnai.website")

    def test_process_login_accounts_from_file_reports_progress(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            accounts_path = os.path.join(tmpdir, "accounts-login.txt")
            with open(accounts_path, "w", encoding="utf-8") as handle:
                handle.write("bad-line\n")
                handle.write("user1@nnai.website|pass-1\n")
                handle.write("user2@nnai.website|pass-2\n")

            progress_events = []
            seen = []

            def fake_login(email, password, monitor_callback, headless, proxy):
                seen.append((email, password, monitor_callback, headless, proxy))
                return email, email.endswith("user1@nnai.website")

            result = process_login_accounts_from_file(
                accounts_file=accounts_path,
                headless=True,
                proxy={"enabled": False},
                monitor_callback="monitor",
                progress_callback=progress_events.append,
                login_func=fake_login,
            )

            self.assertEqual(result["total"], 3)
            self.assertEqual(result["success"], 1)
            self.assertEqual(result["fail"], 2)
            self.assertEqual(result["skipped"], 1)
            self.assertEqual(result["completed"], 3)
            self.assertEqual(
                seen,
                [
                    ("user1@nnai.website", "pass-1", "monitor", True, {"enabled": False}),
                    ("user2@nnai.website", "pass-2", "monitor", True, {"enabled": False}),
                ],
            )
            self.assertEqual(progress_events[0]["status"], "starting")
            self.assertEqual(progress_events[-1]["status"], "failed")


if __name__ == "__main__":
    unittest.main()
