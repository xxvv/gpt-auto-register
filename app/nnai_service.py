"""
NNAI.website 邮箱服务模块 - 基于 catch-all 域名和 Cloudflare Email Inbox Worker。

工作方式：
  - 注册时随机生成 xxxxx@nnai.website 邮箱地址
  - 通过 Worker API 按邮箱地址查询最新验证码
"""

from __future__ import annotations

import random
import re
import string
import threading
import time
import uuid
from typing import Any

import requests as _requests

from .config import EMAIL_POLL_INTERVAL, EMAIL_WAIT_TIMEOUT, HTTP_TIMEOUT
from .utils import extract_verification_code, get_user_agent

DOMAIN = "nnai.website"
API_CODE_URL = "https://cloudflare-email-inbox.111pengwei.workers.dev/api/code"
LOCAL_PART_LENGTH = 12
_FRESH_LOOKBACK_MS = 30_000

_sessions: dict[str, dict[str, Any]] = {}
_sessions_lock = threading.Lock()


class NNAIClient:
    """NNAI Cloudflare 邮箱验证码 API 客户端。"""

    def __init__(self, session=None):
        self.session = session or _requests.Session()
        self.session.headers.update({
            "User-Agent": get_user_agent(),
            "Accept": "application/json",
        })

    def get_code_payload(self, email: str) -> dict[str, Any]:
        resp = self.session.get(
            API_CODE_URL,
            params={"email": email, "format": "json"},
            timeout=HTTP_TIMEOUT,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"NNAI API 返回 HTTP {resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        if not isinstance(data, dict):
            raise RuntimeError("NNAI API 响应格式异常")
        return data


def _generate_local_part(length: int = LOCAL_PART_LENGTH) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(random.choices(alphabet, k=length))


def _generate_email() -> str:
    return f"{_generate_local_part()}@{DOMAIN}"


def _is_valid_nnai_email(email: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9._%+-]+@nnai\.website", str(email or "").strip()))


def _extract_code_from_payload(payload: dict[str, Any]) -> str | None:
    direct_code = str(payload.get("code") or "").strip()
    if re.fullmatch(r"\d{6}", direct_code):
        return direct_code

    parts = [
        payload.get("subject"),
        payload.get("text"),
        payload.get("body"),
        payload.get("html"),
    ]
    for value in parts:
        code = extract_verification_code(str(value or ""))
        if code:
            return code
    return None


def _payload_is_fresh(payload: dict[str, Any], created_at_ms: int) -> bool:
    raw_received_at = payload.get("received_at")
    if raw_received_at is None:
        return True
    try:
        received_at = int(raw_received_at)
    except (TypeError, ValueError):
        return True
    return received_at >= created_at_ms - _FRESH_LOOKBACK_MS


def _create_session(email: str, client: NNAIClient | None = None) -> str:
    session_id = str(uuid.uuid4())
    with _sessions_lock:
        _sessions[session_id] = {
            "email": email,
            "client": client or NNAIClient(),
            "created_at_ms": int(time.time() * 1000),
        }
    return session_id


def create_temp_email(proxy=None):
    """
    创建 NNAI 临时邮箱。

    返回: (email, session_id, credential)
    credential 保存邮箱地址，便于已有账号补取 Token 时重新挂载收件箱。
    """
    del proxy
    try:
        email = _generate_email()
        session_id = _create_session(email)
        print(f"✅ NNAI 邮箱: {email}")
        return email, session_id, email
    except Exception as e:
        print(f"❌ 创建 NNAI 邮箱失败: {e}")
        return None, None, None


def login_existing_email(email: str, mailbox_credential: str | None = None):
    target_email = str(mailbox_credential or email or "").strip().lower()
    if not _is_valid_nnai_email(target_email):
        raise RuntimeError("NNAI 收件邮箱必须以 @nnai.website 结尾")
    session_id = _create_session(target_email)
    print(f"✅ 已为 NNAI 邮箱创建收信会话: {target_email}")
    return session_id


def _get_session(session_id: str) -> dict[str, Any] | None:
    with _sessions_lock:
        session = _sessions.get(session_id)
    return session


def _list_codes_for_session(session: dict[str, Any], *, require_fresh: bool) -> list[str]:
    payload = session["client"].get_code_payload(session["email"])
    if require_fresh and not _payload_is_fresh(payload, int(session.get("created_at_ms") or 0)):
        return []

    code = _extract_code_from_payload(payload)
    return [code] if code else []


def wait_for_verification_email(session_id: str, timeout: int = None) -> str | None:
    """
    轮询 NNAI Worker API，等待验证码。
    """
    if timeout is None:
        timeout = EMAIL_WAIT_TIMEOUT

    session = _get_session(session_id)
    if not session:
        print("❌ 未找到 NNAI 会话")
        return None

    email = session["email"]
    print(f"⏳ 等待 NNAI 验证邮件（收件箱: {email}，最长 {timeout}s）...")
    start = time.time()

    while time.time() - start < timeout:
        try:
            codes = _list_codes_for_session(session, require_fresh=True)
            if codes:
                print(f"\n📧 收到 NNAI 验证邮件，验证码: {codes[0]}")
                return codes[0]
        except Exception as e:
            print(f"  查询 NNAI 验证码错误: {e}")

        elapsed = int(time.time() - start)
        print(f"  等待中... ({elapsed}s / {timeout}s)  收件箱: {email}", end="\r")
        time.sleep(EMAIL_POLL_INTERVAL)

    print(f"\n⏰ 等待 NNAI 验证邮件超时（收件箱: {email}）")
    return None


def list_verification_codes(session_id: str) -> list[str]:
    """列出 NNAI 收件箱中的验证码候选。"""
    session = _get_session(session_id)
    if not session:
        return []

    try:
        return _list_codes_for_session(session, require_fresh=True)
    except Exception as e:
        print(f"  列出 NNAI 验证码失败: {e}")
        return []
