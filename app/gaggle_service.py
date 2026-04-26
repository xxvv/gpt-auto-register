"""
Gaggle 邮箱服务模块 - 基于 gaggle.email 已登录 Web API

依赖:
  - 登录后的 Cookie Header
  - create-group 请求里的 token 参数（CSRF token）

API 依据: 仓库根目录 api.md
"""

from __future__ import annotations

import random
import string
import time
import uuid

import requests as _requests

from .config import EMAIL_POLL_INTERVAL, EMAIL_WAIT_TIMEOUT, HTTP_TIMEOUT, cfg
from .utils import extract_verification_code, get_user_agent

GAGGLE_BASE_URL = "https://gaggle.email"
API_CREATE_GROUP = f"{GAGGLE_BASE_URL}/create-group"
API_LIST_ACTIVITY = f"{GAGGLE_BASE_URL}/list/activity"
API_LIST_SETTINGS = f"{GAGGLE_BASE_URL}/list/settings"

_OPENAI_KEYWORDS = (
    "openai",
    "noreply@openai",
    "noreply@tm.openai.com",
    "chatgpt",
)

# 会话表：session_id -> {"email": str, "client": GaggleClient}
_sessions: dict[str, dict] = {}


def _build_group_name(length: int = 10) -> str:
    alphabet = string.ascii_lowercase
    return "".join(random.choice(alphabet) for _ in range(length))


def _get_cookie_header() -> str:
    value = str(cfg.gaggle.cookie_header or "").strip()
    if not value:
        raise RuntimeError("未配置 gaggle.cookie_header 或环境变量 GAGGLE_COOKIE_HEADER")
    return value


def _get_csrf_token() -> str:
    value = str(cfg.gaggle.csrf_token or "").strip()
    if not value:
        raise RuntimeError("未配置 gaggle.csrf_token 或环境变量 GAGGLE_CSRF_TOKEN")
    return value


def _extract_error_message(payload: dict) -> str:
    for key in ("message", "error", "reason"):
        value = payload.get(key)
        if value:
            return str(value)

    errors = payload.get("errors")
    if isinstance(errors, list) and errors:
        return "; ".join(str(item) for item in errors if item)

    return "未知错误"


def _extract_created_email(payload: dict, group_name: str) -> str | None:
    created = _extract_created_group(payload, group_name)
    if not created:
        return None
    return created["email"]


def _extract_created_group(payload: dict, group_name: str) -> dict | None:
    membership = payload.get("newMembership") or {}
    membership_email = str(membership.get("displayEmail") or membership.get("email") or "").strip()
    membership_list_id = str(membership.get("listId") or membership.get("group_id") or "").strip()
    if membership_email:
        return {
            "email": membership_email,
            "list_id": membership_list_id or None,
        }

    groups = payload.get("groups") or []
    for group in groups:
        if not isinstance(group, dict):
            continue
        name = str(group.get("name", "") or "").strip().lower()
        email = str(group.get("displayEmail") or group.get("email") or "").strip()
        if email and name == group_name.lower():
            list_id = str(group.get("listId") or group.get("group_id") or "").strip()
            return {
                "email": email,
                "list_id": list_id or None,
            }

    return None


def _event_to_text(event) -> tuple[str, str]:
    if isinstance(event, dict):
        sender = str(event.get("from") or event.get("sender") or event.get("from_email") or "")
        merged = " ".join(
            str(event.get(key, "") or "")
            for key in ("subject", "title", "content", "body", "summary", "text", "html", "from")
        ).strip()
        return sender, merged

    if isinstance(event, (list, tuple)):
        sender = str(event[3] if len(event) > 3 else "")
        merged = " ".join(str(item or "") for item in event).strip()
        return sender, merged

    merged = str(event or "").strip()
    return "", merged


def _extract_codes_from_events(events: list) -> list[str]:
    codes: list[str] = []
    seen = set()

    for event in events[:25]:
        sender, merged = _event_to_text(event)
        sender_lower = sender.lower()
        merged_lower = merged.lower()
        is_openai = any(keyword in sender_lower for keyword in _OPENAI_KEYWORDS)
        if not is_openai:
            is_openai = any(keyword in merged_lower for keyword in _OPENAI_KEYWORDS)
        if not is_openai:
            continue

        code = extract_verification_code(merged)
        if code and code not in seen:
            seen.add(code)
            codes.append(code)

    return codes


class GaggleClient:
    """Gaggle Web API 客户端。"""

    def __init__(self):
        self.session = _requests.Session()
        self.session.headers.update(
            {
                "User-Agent": get_user_agent() or "Mozilla/5.0",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                "X-Requested-With": "XMLHttpRequest",
                "Cookie": _get_cookie_header(),
            }
        )

    def create_group(self, group_name: str) -> str:
        payload = {
            "newGroupName": group_name,
            "newGroupAddress": group_name,
            "token": _get_csrf_token(),
            "firstEverGroup": "false",
            "sendWelcome": "false",
        }
        headers = {
            "Accept": "*/*",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Origin": GAGGLE_BASE_URL,
            "Referer": f"{GAGGLE_BASE_URL}/home/dashboard",
        }

        resp = self.session.post(
            API_CREATE_GROUP,
            data=payload,
            headers=headers,
            timeout=HTTP_TIMEOUT,
        )
        if resp.status_code in {401, 403}:
            raise RuntimeError("Gaggle 登录态失效，请更新 cookie_header")
        resp.raise_for_status()

        try:
            data = resp.json()
        except Exception as exc:
            raise RuntimeError("Gaggle create-group 返回的不是 JSON") from exc

        if data.get("success") is False:
            raise RuntimeError(f"Gaggle create-group 失败: {_extract_error_message(data)}")

        created = _extract_created_group(data, group_name)
        if not created:
            raise RuntimeError("Gaggle create-group 成功，但响应中未找到邮箱地址")

        email = created["email"]
        list_id = str(created.get("list_id") or "").strip()
        if not list_id:
            raise RuntimeError("Gaggle create-group 成功，但响应中未找到 listId")

        self.allow_any_sender(list_id, email)
        return email

    def allow_any_sender(self, list_id: str, email: str):
        headers = {
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Content-Type": "application/json",
            "Origin": GAGGLE_BASE_URL,
            "Referer": f"{GAGGLE_BASE_URL}/g/{email}/settings",
        }

        resp = self.session.patch(
            f"{API_LIST_SETTINGS}/{list_id}",
            json={"whoCanSend": "anyone"},
            headers=headers,
            timeout=HTTP_TIMEOUT,
        )
        if resp.status_code in {401, 403}:
            raise RuntimeError("Gaggle 登录态失效，请更新 cookie_header")
        resp.raise_for_status()

        try:
            data = resp.json()
        except Exception:
            data = None

        if isinstance(data, dict) and data.get("success") is False:
            raise RuntimeError(f"Gaggle 修改邮箱状态失败: {_extract_error_message(data)}")

    def list_activity(self, email: str, count: int = 25) -> list:
        headers = {
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Referer": f"{GAGGLE_BASE_URL}/g/{email}/activity",
        }
        params = {
            "list": email,
            "stats": "false",
            "type": "",
            "filter": "",
            "offset": 0,
            "count": count,
        }

        resp = self.session.get(
            API_LIST_ACTIVITY,
            params=params,
            headers=headers,
            timeout=HTTP_TIMEOUT,
        )
        if resp.status_code in {401, 403}:
            raise RuntimeError("Gaggle 登录态失效，请更新 cookie_header")
        resp.raise_for_status()

        try:
            data = resp.json()
        except Exception as exc:
            raise RuntimeError("Gaggle list/activity 返回的不是 JSON") from exc

        events = data.get("events")
        if isinstance(events, list):
            return events
        return []


def _store_session(email: str, client: GaggleClient) -> str:
    session_id = str(uuid.uuid4())
    _sessions[session_id] = {"email": email, "client": client}
    return session_id


def create_temp_email(proxy=None):
    """
    创建 Gaggle 邮箱。
    返回: (email, session_id, credential)
    其中 credential 直接保存邮箱地址，便于后续 token 导入阶段重新挂载收件箱。
    """
    del proxy
    last_error = None

    for _ in range(3):
        try:
            client = GaggleClient()
            local_part = _build_group_name()
            email = client.create_group(local_part)
            session_id = _store_session(email, client)
            print(f"✅ Gaggle 邮箱: {email}")
            return email, session_id, email
        except Exception as exc:
            last_error = exc
            if "未配置" in str(exc):
                break

    print(f"❌ 创建 Gaggle 邮箱失败: {last_error}")
    return None, None, None


def login_existing_email(email: str, mailbox_credential: str):
    """
    重新挂载已存在的 Gaggle 收件箱。
    mailbox_credential 缺失时回退到 email 本身。
    """
    target_email = str(mailbox_credential or email or "").strip()
    if not target_email:
        raise RuntimeError("缺少 gaggle 收件箱地址")

    client = GaggleClient()
    return _store_session(target_email, client)


def wait_for_verification_email(session_id: str, timeout: int = None):
    """
    轮询 Gaggle activity，等待 OpenAI 验证码。
    返回: 验证码字符串 或 None
    """
    if timeout is None:
        timeout = EMAIL_WAIT_TIMEOUT

    session = _sessions.get(session_id)
    if not session:
        print("❌ 未找到 Gaggle 会话")
        return None

    email = session["email"]
    client = session["client"]

    print(f"⏳ 等待 Gaggle 验证邮件（收件箱: {email}，最长 {timeout}s）...")
    start = time.time()

    while time.time() - start < timeout:
        try:
            events = client.list_activity(email)
            codes = _extract_codes_from_events(events)
            if codes:
                print(f"\n📧 发现 Gaggle OpenAI 验证码: {codes[0]}")
                return codes[0]
        except Exception as e:
            print(f"  API 请求异常: {e}")

        elapsed = int(time.time() - start)
        print(f"  等待中... ({elapsed}s / {timeout}s)  收件箱: {email}", end="\r")
        time.sleep(EMAIL_POLL_INTERVAL)

    print(f"\n⏰ 等待 Gaggle 验证邮件超时（收件箱: {email}）")
    return None


def list_verification_codes(session_id: str) -> list[str]:
    """列出 Gaggle 收件箱中的验证码候选。"""
    session = _sessions.get(session_id)
    if not session:
        return []

    email = session["email"]
    client = session["client"]

    try:
        return _extract_codes_from_events(client.list_activity(email))
    except Exception:
        return []
