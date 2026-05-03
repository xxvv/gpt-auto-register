"""
读取和查询已保存账号记录。
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

OAUTH_SUCCESS_STATUS = "已注册/OAuth成功"
NEED_PHONE_STATUS = "need-phone"


def load_accounts_from_file(file_path: str) -> list[dict]:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"账号文件不存在: {file_path}")

    records = []
    for line in path.read_text(encoding="utf-8").splitlines():
        parts = line.strip().split("|")
        if len(parts) < 2 or "@" not in parts[0]:
            continue
        records.append(
            {
                "email": parts[0].strip(),
                "password": parts[1].strip(),
                "timestamp": parts[2].strip() if len(parts) > 2 else "",
                "status": parts[3].strip() if len(parts) > 3 else "",
                "mailbox_credential": parts[4].strip() if len(parts) > 4 else "",
                "provider": parts[5].strip() if len(parts) > 5 else "nnai",
            }
        )
    return records


def load_account_from_file(file_path: str, email: str) -> dict:
    for record in load_accounts_from_file(file_path):
        if record["email"] == email:
            return record

    raise ValueError(f"未在账号文件中找到邮箱: {email}")


def is_oauth_success_status(status: str) -> bool:
    return (status or "").strip() == OAUTH_SUCCESS_STATUS


def is_need_phone_status(status: str) -> bool:
    return (status or "").strip().lower() == NEED_PHONE_STATUS


def update_account_status_in_file(file_path: str, email: str, new_status: str) -> None:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"账号文件不存在: {file_path}")

    current_date = datetime.now().strftime("%Y%m%d_%H%M%S")
    lines = path.read_text(encoding="utf-8").splitlines()
    updated_lines = []
    found = False

    for line in lines:
        parts = line.strip().split("|")
        if len(parts) < 2 or "@" not in parts[0]:
            updated_lines.append(line)
            continue

        if parts[0].strip() != email:
            updated_lines.append(line)
            continue

        password = parts[1].strip() if len(parts) > 1 else "N/A"
        mailbox_credential = parts[4].strip() if len(parts) > 4 else ""
        provider = parts[5].strip() if len(parts) > 5 else "nnai"
        updated_lines.append(
            f"{email}|{password}|{current_date}|{new_status}|{mailbox_credential}|{provider}"
        )
        found = True

    if not found:
        raise ValueError(f"未在账号文件中找到邮箱: {email}")

    path.write_text("".join(f"{line}\n" for line in updated_lines), encoding="utf-8")
