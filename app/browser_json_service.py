"""
从账号管理列表中勾选账号，唤起浏览器登录并获取 Codex token JSON。
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from types import SimpleNamespace
from urllib.parse import quote

from .config import PROJECT_ROOT, cfg
from .oauth_service import perform_browser_codex_oauth_login, save_codex_tokens
from .stored_accounts import (
    OAUTH_SUCCESS_STATUS,
    load_accounts_from_file,
    update_account_status_in_file,
)


def _build_output_oauth_cfg(output_dir: str):
    return SimpleNamespace(
        ak_file=cfg.oauth.ak_file,
        rk_file=cfg.oauth.rk_file,
        token_json_dir=output_dir,
    )


def _compact_token_json(token_path: str, tokens: dict) -> str:
    try:
        with open(token_path, "r", encoding="utf-8") as handle:
            raw = handle.read()
        return raw.strip().replace("\n", "").replace("\r", "")
    except Exception:
        return json.dumps(tokens, ensure_ascii=False, separators=(",", ":"))


def _append_browser_json_exports(
    *,
    email: str,
    password: str,
    token_path: str,
    tokens: dict,
):
    data_dir = os.path.join(PROJECT_ROOT, "data")
    os.makedirs(data_dir, exist_ok=True)

    date_str = datetime.now().strftime("%Y%m%d")
    cpa_path = os.path.join(data_dir, f"accounts-cpa-{date_str}.txt")
    sub2api_path = os.path.join(data_dir, f"accounts-sub2api-{date_str}.txt")

    token_json = _compact_token_json(token_path, tokens)
    inbox_url = f"https://getemail.nnai.website/?email={quote(email, safe='')}"
    with open(cpa_path, "a", encoding="utf-8") as handle:
        handle.write(f"{email}|{password}|{inbox_url}|{token_json}\n")
    print(f"  📝 已追加 CPA 账号数据: {cpa_path}")

    refresh_token = str(tokens.get("refresh_token") or "").strip()
    if not refresh_token and token_json:
        try:
            refresh_token = str(json.loads(token_json).get("refresh_token") or "").strip()
        except Exception:
            refresh_token = ""

    if refresh_token:
        with open(sub2api_path, "a", encoding="utf-8") as handle:
            handle.write(f"{refresh_token}\n")
        print(f"  📝 已追加 sub2api refresh_token: {sub2api_path}")
    else:
        print("  ⚠️ token JSON 缺少 refresh_token，已跳过 sub2api 写入")


def process_selected_accounts(
    accounts_file: str,
    emails: list[str],
    output_dir: str,
    proxy: dict | None = None,
    headless: bool = False,
    monitor_callback=None,
    stop_requested=None,
    progress_callback=None,
    oauth_login_func=perform_browser_codex_oauth_login,
    save_tokens_func=save_codex_tokens,
):
    selected = {str(email).strip().lower() for email in emails if str(email).strip()}
    records = [
        record
        for record in load_accounts_from_file(accounts_file)
        if record["email"].strip().lower() in selected
    ]
    oauth_cfg = _build_output_oauth_cfg(output_dir)
    success = 0
    fail = 0
    processed = 0
    skipped = 0
    total = len(records)

    def report_progress(current_email: str = "", status: str = ""):
        completed = success + fail + skipped
        if progress_callback:
            progress_callback(
                {
                    "task_type": "browser_json",
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

    missing = selected - {record["email"].strip().lower() for record in records}
    for email in sorted(missing):
        print(f"⚠️ 未在账号文件中找到勾选账号: {email}")

    for record in records:
        if stop_requested and stop_requested():
            break

        email = record["email"]
        password = record["password"]
        print(f"🌐 浏览器获取 JSON: {email}")

        if not password or password.strip().upper() == "N/A":
            fail += 1
            print(f"⚠️ 跳过 {email}: 缺少账号密码")
            report_progress(current_email=email, status="missing_password")
            continue

        try:
            tokens = oauth_login_func(
                email=email,
                password=password,
                email_provider=record["provider"] or "nnai",
                mail_token=record["mailbox_credential"] or email,
                proxy=proxy,
                headless=headless,
                monitor_callback=monitor_callback,
            )
            saved_token_path = save_tokens_func(
                email=email,
                tokens=tokens,
                oauth_cfg=oauth_cfg,
                proxy=proxy,
            )
            _append_browser_json_exports(
                email=email,
                password=password,
                token_path=saved_token_path,
                tokens=tokens,
            )
            update_account_status_in_file(accounts_file, email, OAUTH_SUCCESS_STATUS)
            success += 1
            processed += 1
            print(f"✅ JSON 已保存: {saved_token_path}")
            report_progress(current_email=email, status="success")
        except Exception as exc:
            fail += 1
            print(f"❌ 浏览器获取 JSON 失败 {email}: {exc}")
            report_progress(current_email=email, status="failed")

    completed = success + fail + skipped
    return {
        "total": total,
        "processed": processed,
        "completed": completed,
        "success": success,
        "fail": fail,
        "skipped": skipped,
        "remaining": max(total - completed, 0),
        "output_dir": output_dir,
    }
