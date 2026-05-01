"""
OutlookEmail 邮箱服务模块 - 接入相邻 outlookemail 项目的对外 API。

创建邮箱时从 OutlookEmail 管理的账号/别名池中取一个邮箱地址；收信时通过
/api/external/emails 轮询收件箱和垃圾邮件，提取 OpenAI/ChatGPT 验证码。
"""

from __future__ import annotations

import random
import time
import uuid
import json
import threading
from typing import Any
from datetime import datetime
from pathlib import Path
from urllib.parse import urljoin

import requests as _requests

from .config import EMAIL_WAIT_TIMEOUT, EMAIL_POLL_INTERVAL, cfg, dated_accounts_file_path
from .config import PROJECT_ROOT
from .utils import extract_verification_code

_sessions: dict[str, dict[str, Any]] = {}
_used_addresses: set[str] = set()
_reservation_lock = threading.Lock()


def _registered_file_path() -> Path:
    configured_path = Path(cfg.outlookemail.registered_file or "data/state/outlookemail_registered.json")
    if configured_path.is_absolute():
        return configured_path
    return PROJECT_ROOT / configured_path


def _accounts_file_path() -> Path:
    return dated_accounts_file_path(cfg.files.accounts_file)


def _load_registered_addresses_from_marker() -> set[str]:
    path = _registered_file_path()
    if not path.exists():
        return set()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return set()

    if isinstance(data, list):
        return {str(item).strip().lower() for item in data if str(item).strip()}
    if isinstance(data, dict):
        raw_addresses = data.get("registered") or data.get("emails") or []
        if isinstance(raw_addresses, dict):
            raw_addresses = raw_addresses.keys()
        return {str(item).strip().lower() for item in raw_addresses if str(item).strip()}
    return set()


def _load_registered_addresses_from_accounts_file() -> set[str]:
    path = _accounts_file_path()
    if not path.exists():
        return set()

    addresses: set[str] = set()
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except Exception:
        return addresses

    for line in lines:
        parts = line.strip().split("|")
        if len(parts) < 4:
            continue
        email = parts[0].strip().lower()
        status = parts[3].strip()
        provider = parts[5].strip().lower() if len(parts) > 5 else ""
        if provider == "outlookemail" and email and status.startswith("已注册"):
            addresses.add(email)
    return addresses


def _load_registered_addresses() -> set[str]:
    return _load_registered_addresses_from_marker() | _load_registered_addresses_from_accounts_file()


def mark_registered_email(email: str, password: str = "", status: str = "已注册") -> bool:
    """标记 OutlookEmail 池中的邮箱已注册，后续创建时不再重复使用。"""
    address = str(email or "").strip().lower()
    if not address:
        return False

    path = _registered_file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    registered = _load_registered_addresses()
    registered.add(address)
    payload = {
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "registered": sorted(registered),
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return True


class OutlookEmailClient:
    """OutlookEmail 对外 API 客户端。"""

    def __init__(self):
        base_url = (cfg.outlookemail.base_url or "").strip().rstrip("/")
        api_key = (cfg.outlookemail.api_key or "").strip()
        if not base_url:
            raise RuntimeError("未配置 outlookemail.base_url")
        if not api_key:
            raise RuntimeError("未配置 outlookemail.api_key 或 OUTLOOKEMAIL_API_KEY")

        self.base_url = base_url
        self.session = _requests.Session()
        self.session.headers.update({
            "Accept": "application/json",
            "X-API-Key": api_key,
        })

    def _url(self, path: str) -> str:
        return urljoin(f"{self.base_url}/", path.lstrip("/"))

    def list_accounts(self) -> list[dict[str, Any]]:
        params = {}
        if cfg.outlookemail.group_id:
            params["group_id"] = cfg.outlookemail.group_id
        resp = self.session.get(self._url("/api/external/accounts"), params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if not data.get("success"):
            raise RuntimeError(data.get("error") or "OutlookEmail 获取账号列表失败")
        return data.get("accounts") or []

    def list_emails(
        self,
        email: str,
        folder: str = "all",
        top: int = 10,
        subject_contains: str = "",
        from_contains: str = "",
        keyword: str = "",
    ) -> list[dict[str, Any]]:
        params = {
            "email": email,
            "folder": folder,
            "top": top,
            "skip": 0,
        }
        if subject_contains:
            params["subject_contains"] = subject_contains
        if from_contains:
            params["from_contains"] = from_contains
        if keyword:
            params["keyword"] = keyword

        resp = self.session.get(self._url("/api/external/emails"), params=params, timeout=45)
        resp.raise_for_status()
        data = resp.json()
        if not data.get("success"):
            raise RuntimeError(data.get("error") or "OutlookEmail 获取邮件失败")
        return data.get("emails") or []


def _account_status_allows_use(account: dict[str, Any]) -> bool:
    status = str(account.get("status") or "").strip().lower()
    return not status or status in {"active", "normal", "enabled", "success"}


def _address_candidates(accounts: list[dict[str, Any]]) -> list[str]:
    configured_email = (cfg.outlookemail.account_email or "").strip().lower()
    use_aliases = bool(cfg.outlookemail.use_aliases)
    registered = _load_registered_addresses()
    candidates: list[str] = []

    for account in accounts:
        if not _account_status_allows_use(account):
            continue

        primary = str(account.get("email") or "").strip()
        aliases = [str(alias or "").strip() for alias in account.get("aliases") or []]
        aliases = [alias for alias in aliases if "@" in alias]
        addresses = aliases + [primary] if use_aliases else [primary]

        for address in addresses:
            if "@" not in address:
                continue
            if configured_email and address.lower() != configured_email:
                continue
            if not cfg.outlookemail.allow_reuse and address.lower() in registered:
                continue
            if not cfg.outlookemail.allow_reuse and address.lower() in _used_addresses:
                continue
            if address not in candidates:
                candidates.append(address)

    return candidates


def _extract_code_from_mail(mail: dict[str, Any]) -> str | None:
    values = [
        mail.get("subject"),
        mail.get("body_preview"),
        mail.get("body"),
        mail.get("text"),
        mail.get("html"),
    ]
    for value in values:
        if value:
            code = extract_verification_code(str(value))
            if code:
                return code
    return None


def _looks_like_openai_mail(mail: dict[str, Any]) -> bool:
    text = "\n".join(str(mail.get(key) or "") for key in ("from", "subject", "body_preview"))
    text = text.lower()
    return any(marker in text for marker in ("openai", "chatgpt", "verification", "verify", "验证码"))


def create_temp_email(proxy=None):
    """
    从 OutlookEmail 邮箱池取一个邮箱地址。

    返回: (email, session_id, credential)
    credential 保存为邮箱地址，便于后续 token 导入阶段重新挂载收件箱。
    """
    try:
        client = OutlookEmailClient()
        accounts = client.list_accounts()
        with _reservation_lock:
            candidates = _address_candidates(accounts)
            if not candidates:
                print("❌ OutlookEmail 邮箱池为空或没有可用账号/别名")
                return None, None, None

            email = random.choice(candidates)
            _used_addresses.add(email.lower())
            session_id = str(uuid.uuid4())
            _sessions[session_id] = {"email": email, "client": client}
        print(f"✅ OutlookEmail 邮箱: {email}")
        return email, session_id, email
    except Exception as e:
        print(f"❌ 创建 OutlookEmail 邮箱失败: {e}")
        return None, None, None


def release_reserved_email(email: str) -> bool:
    """释放未完成注册的 OutlookEmail 本轮占用，允许后续任务重试。"""
    address = str(email or "").strip().lower()
    if not address:
        return False
    if address in _load_registered_addresses():
        return False

    with _reservation_lock:
        if address not in _used_addresses:
            return False
        _used_addresses.discard(address)
        stale_session_ids = [
            session_id
            for session_id, session in _sessions.items()
            if str(session.get("email") or "").strip().lower() == address
        ]
        for session_id in stale_session_ids:
            _sessions.pop(session_id, None)

    print(f"♻️ OutlookEmail 邮箱释放占用，可重试: {email}")
    return True


def login_existing_email(email: str, mailbox_credential: str):
    target_email = str(mailbox_credential or email or "").strip()
    if not target_email:
        raise RuntimeError("OutlookEmail 收件邮箱为空")

    client = OutlookEmailClient()
    session_id = str(uuid.uuid4())
    _sessions[session_id] = {"email": target_email, "client": client}
    return session_id


def wait_for_verification_email(session_id: str, timeout: int = None):
    if timeout is None:
        timeout = EMAIL_WAIT_TIMEOUT

    session = _sessions.get(session_id)
    if not session:
        print("❌ 未找到 OutlookEmail 会话")
        return None

    email = session["email"]
    client = session["client"]
    start_time = time.time()
    print(f"⏳ 等待 OutlookEmail 验证邮件（收件箱: {email}，最长 {timeout}s）...")

    while time.time() - start_time < timeout:
        try:
            mails = client.list_emails(
                email,
                folder="all",
                top=10,
                subject_contains="",
                from_contains="",
                keyword="",
            )
            for mail in mails:
                if not _looks_like_openai_mail(mail):
                    continue
                code = _extract_code_from_mail(mail)
                if code:
                    print(f"\n📧 收到 OpenAI 验证邮件，验证码: {code}")
                    return code
        except Exception as e:
            print(f"  查询 OutlookEmail 邮件错误: {e}")

        elapsed = int(time.time() - start_time)
        print(f"  等待中... ({elapsed}s / {timeout}s)  收件箱: {email}", end="\r")
        time.sleep(EMAIL_POLL_INTERVAL)

    print(f"\n⏰ 等待 OutlookEmail 验证邮件超时（收件箱: {email}）")
    return None


def list_verification_codes(session_id: str) -> list[str]:
    session = _sessions.get(session_id)
    if not session:
        return []

    try:
        mails = session["client"].list_emails(session["email"], folder="all", top=20)
    except Exception:
        return []

    codes: list[str] = []
    for mail in mails:
        code = _extract_code_from_mail(mail)
        if code and code not in codes:
            codes.append(code)
    return codes
