"""
批量登录已有 ChatGPT 账号。
"""

from __future__ import annotations

from pathlib import Path

from .config import PROJECT_ROOT
from . import main

DEFAULT_LOGIN_ACCOUNTS_FILE = PROJECT_ROOT / "data/accounts/accounts-login.txt"


def load_login_accounts_from_file(file_path: str | Path) -> tuple[list[dict], int]:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"登录账号文件不存在: {file_path}")

    records: list[dict] = []
    invalid_count = 0

    for line_no, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue

        parts = [part.strip() for part in line.split("|")]
        if len(parts) != 2 or "@" not in parts[0] or not parts[0] or not parts[1]:
            invalid_count += 1
            print(f"⚠️ 跳过格式错误的登录账号行 {line_no}: {raw_line}")
            continue

        records.append(
            {
                "email": parts[0],
                "password": parts[1],
                "line_no": line_no,
            }
        )

    return records, invalid_count


def process_login_accounts_from_file(
    accounts_file: str | Path = DEFAULT_LOGIN_ACCOUNTS_FILE,
    headless: bool = False,
    proxy: dict | None = None,
    monitor_callback=None,
    stop_requested=None,
    progress_callback=None,
    login_func=main.login_one_account,
):
    records, invalid_count = load_login_accounts_from_file(accounts_file)
    success = 0
    fail = invalid_count
    processed = 0
    skipped = invalid_count
    total = len(records) + invalid_count

    def report_progress(current_email: str = "", status: str = ""):
        completed = success + fail
        if progress_callback:
            progress_callback(
                {
                    "task_type": "account_login",
                    "total": total,
                    "processed": processed,
                    "completed": completed,
                    "success": success,
                    "fail": fail,
                    "skipped": skipped,
                    "remaining": max(total - completed, 0),
                    "current_email": current_email,
                    "status": status,
                }
            )

    report_progress(status="starting")

    for record in records:
        if stop_requested and stop_requested():
            break

        email = record["email"]
        print(f"📄 处理登录账号: {email}")
        report_progress(current_email=email, status="processing")

        try:
            _, ok = login_func(
                email=email,
                password=record["password"],
                monitor_callback=monitor_callback,
                headless=headless,
                proxy=proxy,
            )
            processed += 1
            if ok:
                success += 1
                print(f"✅ 登录完成: {email}")
                report_progress(current_email=email, status="success")
            else:
                fail += 1
                print(f"❌ 登录失败: {email}")
                report_progress(current_email=email, status="failed")
        except InterruptedError:
            print("🛑 登录批量任务已中断")
            break
        except Exception as exc:
            processed += 1
            fail += 1
            print(f"❌ 登录异常 {email}: {exc}")
            report_progress(current_email=email, status="failed")

    completed = success + fail
    return {
        "total": total,
        "processed": processed,
        "completed": completed,
        "success": success,
        "fail": fail,
        "skipped": skipped,
        "remaining": max(total - completed, 0),
        "accounts_file": str(accounts_file),
    }
