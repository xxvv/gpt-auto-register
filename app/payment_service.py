"""
注册后支付流程服务。
"""

from __future__ import annotations

import json
import os
import platform
import re
import threading
import time
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import requests

from .browser import (
    _execute_cdp_cmd_with_target_recovery,
    _is_window_target_lost,
    _recover_window_target,
)
from .config import PROJECT_ROOT, cfg
from .oauth_service import perform_browser_codex_oauth_login, save_codex_tokens
from .utils import describe_proxy

WEBSHARE_LIST_URL = "https://proxy.webshare.io/api/v2/proxy/list/"
WEBSHARE_REPLACE_URL = "https://proxy.webshare.io/api/v3/proxy/replace/"
PAYMENT_SUCCESS_STATUS = "已注册/支付成功"
PAYMENT_FAILED_STATUS = "支付失败"
US_ZIP3_STATE_RANGES_FILE = "data/reference/us_zip3_state_ranges.json"

_card_usage_lock = threading.Lock()
_phone_usage_lock = threading.Lock()
_TYPING_DELAY_SECONDS = 0.08
_PAYPAL_STORAGE_ORIGINS = (
    "https://www.paypal.com",
    "https://paypal.com",
)
_PAYPAL_STORAGE_TYPES = ",".join(
    [
        "appcache",
        "cache_storage",
        "cookies",
        "file_systems",
        "indexeddb",
        "local_storage",
        "service_workers",
        "websql",
    ]
)


@dataclass(frozen=True)
class PaymentCard:
    card: str
    year: str
    month: str
    cvv: str
    phone: str
    url: str
    name: str
    address: str
    city: str
    state: str
    postcode: str
    country: str
    redeem_code: str = ""

    @property
    def expiry_input(self) -> str:
        return f"{self.month.zfill(2)}{self.year[-2:]}"


@dataclass(frozen=True)
class PayPalPhoneKey:
    phone: str
    sms_url: str
    raw: str


def _resolve_project_path(path_value: str | os.PathLike) -> Path:
    path = Path(path_value)
    if path.is_absolute():
        return path
    return PROJECT_ROOT / path


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@lru_cache(maxsize=1)
def _load_us_zip3_state_ranges() -> tuple[tuple[int, int, str], ...]:
    path = _resolve_project_path(US_ZIP3_STATE_RANGES_FILE)
    with path.open("r", encoding="utf-8") as fh:
        payload = json.load(fh)
    if not isinstance(payload, list):
        raise RuntimeError("美国邮编州映射 JSON 格式错误")

    ranges: list[tuple[int, int, str]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        try:
            start = int(item["start"])
            end = int(item["end"])
        except Exception as exc:
            raise RuntimeError("美国邮编州映射范围格式错误") from exc
        state = str(item.get("state") or "").strip().upper()
        if not state:
            continue
        ranges.append((start, end, state))
    if not ranges:
        raise RuntimeError("美国邮编州映射为空")
    return tuple(ranges)


def _normalize_us_postcode(postcode: str) -> str:
    normalized = str(postcode or "").strip()
    matched = re.fullmatch(r"(\d{5})(?:-\d{4})?", normalized)
    if not matched:
        raise ValueError(f"无效的美国邮编: {postcode!r}")
    return matched.group(1)


def _lookup_us_state_from_postcode(postcode: str) -> str:
    zip5 = _normalize_us_postcode(postcode)
    prefix = int(zip5[:3])
    for start, end, state in _load_us_zip3_state_ranges():
        if start <= prefix <= end:
            return state
    raise ValueError(f"无法根据美国邮编匹配州: {postcode!r}")


def _auth_headers(api_key: str) -> dict[str, str]:
    key = str(api_key or "").strip()
    if not key:
        raise RuntimeError(
            "缺少 Webshare API Key，请配置 payment.webshare_api_key 或 WEBSHARE_API_KEY"
        )
    return {
        "Authorization": f"Token {key}",
        "Content-Type": "application/json",
    }


def _request_json(resp) -> dict[str, Any]:
    try:
        data = resp.json()
    except Exception as exc:
        raise RuntimeError(
            f"接口返回不是 JSON: HTTP {resp.status_code} {resp.text[:300]}"
        ) from exc
    if not isinstance(data, dict):
        raise RuntimeError("接口 JSON 顶层格式异常")
    return data


def _raise_for_api_error(resp, action: str) -> dict[str, Any]:
    data = _request_json(resp)
    if resp.status_code >= 400:
        raise RuntimeError(f"{action}失败: HTTP {resp.status_code}: {str(data)[:500]}")
    return data


def _extract_proxy_items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw_items = payload.get("results")
    if raw_items is None:
        raw_items = payload.get("items") or payload.get("data") or []
    if isinstance(raw_items, dict):
        raw_items = raw_items.get("results") or raw_items.get("items") or []
    if not isinstance(raw_items, list):
        return []
    return [item for item in raw_items if isinstance(item, dict)]


def _webshare_item_to_runtime_proxy(
    item: dict[str, Any],
    *,
    prefer_http: bool = False,
) -> dict[str, Any] | None:
    host = str(
        item.get("proxy_address")
        or item.get("host")
        or item.get("ip")
        or item.get("ip_address")
        or ""
    ).strip()
    if not host:
        return None

    if prefer_http:
        proxy_type = "http"
        port_value = (
            item.get("port")
            or item.get("http_port")
            or item.get("proxy_port")
            or item.get("socks5_port")
            or 0
        )
    else:
        proxy_type = "socks5"
        port_value = (
            item.get("socks5_port")
            or item.get("port")
            or item.get("proxy_port")
            or item.get("http_port")
            or 0
        )
    try:
        port = int(port_value)
    except (TypeError, ValueError):
        return None
    if port <= 0:
        return None

    username = str(item.get("username") or item.get("user") or "")
    password = str(item.get("password") or "")
    return {
        "enabled": True,
        "type": proxy_type,
        "host": host,
        "port": port,
        "use_auth": True,
        "username": username,
        "password": password,
    }


def _debug_proxy_to_runtime_proxy(payment_cfg) -> dict[str, Any]:
    host = str(getattr(payment_cfg, "debug_proxy_host", "") or "").strip()
    if not host:
        raise RuntimeError("已启用代理调试模式，但 payment.debug_proxy_host 为空")

    try:
        port = int(getattr(payment_cfg, "debug_proxy_port", 0) or 0)
    except (TypeError, ValueError) as exc:
        raise RuntimeError("代理调试模式 debug_proxy_port 无效") from exc
    if port <= 0:
        raise RuntimeError("代理调试模式 debug_proxy_port 必须大于 0")

    proxy_type = (
        str(getattr(payment_cfg, "debug_proxy_type", "http") or "http").strip().lower()
    )
    if proxy_type not in {"http", "socks5"}:
        proxy_type = "http"

    username = str(getattr(payment_cfg, "debug_proxy_username", "") or "")
    password = str(getattr(payment_cfg, "debug_proxy_password", "") or "")
    use_auth = bool(getattr(payment_cfg, "debug_proxy_use_auth", False) or username)
    return {
        "enabled": True,
        "type": proxy_type,
        "host": host,
        "port": port,
        "use_auth": use_auth,
        "username": username if use_auth else "",
        "password": password if use_auth else "",
    }


def with_webshare_api_key(payment_cfg, api_key: str | None):
    normalized_key = str(api_key or "").strip()
    if not normalized_key:
        return payment_cfg
    return SimpleNamespace(**{**vars(payment_cfg), "webshare_api_key": normalized_key})


def fetch_webshare_proxy_list(session=None, payment_cfg=None) -> list[dict[str, Any]]:
    payment_cfg = payment_cfg or cfg.payment
    client = session or requests
    params = {"mode": "direct", "page": 1, "page_size": 25}
    if getattr(payment_cfg, "webshare_plan_id", ""):
        params["plan_id"] = payment_cfg.webshare_plan_id
    print("🧭 Webshare: 正在获取当前静态代理列表")
    resp = client.get(
        WEBSHARE_LIST_URL,
        params=params,
        headers=_auth_headers(payment_cfg.webshare_api_key),
        timeout=payment_cfg.http_timeout,
    )
    payload = _raise_for_api_error(resp, "读取 Webshare 代理列表")
    items = _extract_proxy_items(payload)
    if not items:
        raise RuntimeError("Webshare 代理列表为空")
    print(f"🧭 Webshare: 已获取代理列表，共 {len(items)} 条")
    return items


def get_current_webshare_static_proxy(
    session=None,
    payment_cfg=None,
    *,
    prefer_http: bool = False,
) -> dict[str, Any]:
    payment_cfg = payment_cfg or cfg.payment
    if getattr(payment_cfg, "proxy_debug_mode", False):
        proxy = _debug_proxy_to_runtime_proxy(payment_cfg)
        print(f"🧪 Webshare 代理调试模式已启用，使用固定代理: {describe_proxy(proxy)}")
        return proxy

    items = fetch_webshare_proxy_list(session=session, payment_cfg=payment_cfg)
    current_proxy = _webshare_item_to_runtime_proxy(items[0], prefer_http=prefer_http)
    if not current_proxy:
        raise RuntimeError("Webshare 代理列表缺少可用 host/port")
    print(f"✅ Webshare 当前静态代理: {describe_proxy(current_proxy)}")
    return current_proxy


def _replacement_id(payload: dict[str, Any]) -> str:
    value = payload.get("id") or payload.get("uuid") or payload.get("replacement_id")
    if not value and isinstance(payload.get("data"), dict):
        data = payload["data"]
        value = data.get("id") or data.get("uuid") or data.get("replacement_id")
    if not value:
        raise RuntimeError(f"Webshare 替换响应缺少 id: {payload}")
    return str(value)


def _replacement_status(payload: dict[str, Any]) -> str:
    status = payload.get("state") or payload.get("status")
    if not status and isinstance(payload.get("data"), dict):
        status = payload["data"].get("state") or payload["data"].get("status")
    return str(status or "").strip().lower()


def replace_webshare_static_proxy(
    session=None,
    payment_cfg=None,
    *,
    prefer_http: bool = False,
) -> dict[str, Any]:
    payment_cfg = payment_cfg or cfg.payment
    if getattr(payment_cfg, "proxy_debug_mode", False):
        proxy = _debug_proxy_to_runtime_proxy(payment_cfg)
        print(
            f"🧪 Webshare 代理调试模式已启用，跳过接口调用，使用固定代理: {describe_proxy(proxy)}"
        )
        return proxy

    client = session or requests
    print("🧭 Webshare: 开始为当前任务替换美国静态 IP")
    items = fetch_webshare_proxy_list(session=client, payment_cfg=payment_cfg)
    current_item = items[0]
    current_proxy = _webshare_item_to_runtime_proxy(
        current_item,
        prefer_http=prefer_http,
    )
    if not current_proxy:
        raise RuntimeError("Webshare 代理列表缺少可用 host/port")
    print(f"🧭 Webshare: 当前代理 {describe_proxy(current_proxy)}，准备替换为美国 IP")

    body: dict[str, Any] = {
        "to_replace": {"type": "ip_address", "ip_addresses": [current_proxy["host"]]},
        "replace_with": [{"type": "country", "country_code": "US", "count": 1}],
        "dry_run": False,
    }
    params = {}
    if getattr(payment_cfg, "webshare_plan_id", ""):
        params["plan_id"] = payment_cfg.webshare_plan_id

    resp = client.post(
        WEBSHARE_REPLACE_URL,
        headers=_auth_headers(payment_cfg.webshare_api_key),
        json=body,
        params=params,
        timeout=payment_cfg.http_timeout,
    )
    payload = _raise_for_api_error(resp, "创建 Webshare 代理替换")
    replacement_id = _replacement_id(payload)
    print(f"🧭 Webshare: 已创建替换任务 {replacement_id}")

    deadline = time.time() + payment_cfg.webshare_poll_timeout
    last_status = _replacement_status(payload)
    terminal_ok = {"completed", "complete", "succeeded", "success", "done"}
    terminal_fail = {"failed", "failure", "error", "cancelled", "canceled"}
    while time.time() < deadline:
        if last_status in terminal_ok:
            break
        if last_status in terminal_fail:
            raise RuntimeError(f"Webshare 代理替换失败: status={last_status}")

        time.sleep(max(1, int(payment_cfg.webshare_poll_interval)))
        detail_resp = client.get(
            f"{WEBSHARE_REPLACE_URL}{replacement_id}/",
            headers=_auth_headers(payment_cfg.webshare_api_key),
            params=params,
            timeout=payment_cfg.http_timeout,
        )
        detail_payload = _raise_for_api_error(detail_resp, "查询 Webshare 代理替换")
        last_status = _replacement_status(detail_payload)
        print(f"🧭 Webshare: 替换任务 {replacement_id} 状态 {last_status or 'unknown'}")
    else:
        raise RuntimeError(
            f"Webshare 代理替换超时: last_status={last_status or 'unknown'}"
        )

    print("🧭 Webshare: 替换完成，重新获取代理列表")
    refreshed_items = fetch_webshare_proxy_list(session=client, payment_cfg=payment_cfg)
    refreshed_proxy = _webshare_item_to_runtime_proxy(
        refreshed_items[0],
        prefer_http=prefer_http,
    )
    if not refreshed_proxy:
        raise RuntimeError("Webshare 替换后代理列表缺少可用 host/port")
    print(f"✅ Webshare 已替换为美国静态代理: {describe_proxy(refreshed_proxy)}")
    return refreshed_proxy


def request_stripe_payurl(access_token: str, session=None, payment_cfg=None) -> str:
    payment_cfg = payment_cfg or cfg.payment
    client = session or requests
    last_error = ""
    print("💳 PayURL: 开始请求 Stripe 支付链接")
    for attempt in range(1, max(1, int(payment_cfg.payurl_max_retries)) + 1):
        print(f"💳 PayURL: 第 {attempt}/{payment_cfg.payurl_max_retries} 次请求")
        try:
            resp = client.post(
                payment_cfg.request_payurl_api,
                json={"token": access_token, "plus": True},
                timeout=payment_cfg.http_timeout,
            )
            data = _request_json(resp)
            if resp.status_code < 400 and data.get("status") == "success":
                payurl = str(data.get("Stripe_payurl") or "").strip()
                if payurl:
                    print("✅ PayURL: 已获取 Stripe 支付链接")
                    return payurl
                last_error = "响应缺少 Stripe_payurl"
            else:
                last_error = f"HTTP {resp.status_code}: {str(data)[:300]}"
        except Exception as exc:
            last_error = str(exc)
        print(f"⚠️ 获取 Stripe 支付链接失败，第 {attempt} 次: {last_error}")
        if attempt < int(payment_cfg.payurl_max_retries):
            time.sleep(2)
    raise RuntimeError(
        f"获取 Stripe 支付链接失败，已重试 {payment_cfg.payurl_max_retries} 次: {last_error}"
    )


def _load_card_usage(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"cards": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"cards": {}}
    if not isinstance(data, dict):
        return {"cards": {}}
    if not isinstance(data.get("cards"), dict):
        data["cards"] = {}
    return data


def _write_card_usage(path: Path, usage: dict[str, Any]) -> None:
    os.makedirs(path.parent, exist_ok=True)
    path.write_text(
        json.dumps(usage, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def _load_phone_usage(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"phones": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"phones": {}}
    if not isinstance(data, dict):
        return {"phones": {}}
    if not isinstance(data.get("phones"), dict):
        data["phones"] = {}
    return data


def _write_phone_usage(path: Path, usage: dict[str, Any]) -> None:
    os.makedirs(path.parent, exist_ok=True)
    path.write_text(
        json.dumps(usage, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def _phone_usage_path(payment_cfg) -> Path:
    usage_path = _resolve_project_path(payment_cfg.card_usage_file)
    return usage_path.with_name("paypal_phone_keys_usage.json")


def _looks_like_delivery_content(value: str) -> bool:
    parts = [part.strip() for part in str(value or "").strip().split("----")]
    return len(parts) == 7


def is_payment_simulation_enabled(payment_cfg=None) -> bool:
    payment_cfg = payment_cfg or cfg.payment
    return bool(
        getattr(payment_cfg, "card_debug_mode", False)
    ) and _looks_like_delivery_content(
        str(getattr(payment_cfg, "debug_card_key", "") or "")
    )


def parse_paypal_phone_key(line: str) -> PayPalPhoneKey:
    raw = str(line or "").strip()
    parts = [part.strip() for part in raw.split("|", 1)]
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise ValueError("phone-keys.txt 格式错误，必须是 +1手机号|收码地址")
    return PayPalPhoneKey(phone=parts[0], sms_url=parts[1], raw=raw)


def reserve_next_paypal_phone(email: str = "", payment_cfg=None) -> PayPalPhoneKey:
    payment_cfg = payment_cfg or cfg.payment
    keys_path = _resolve_project_path(
        getattr(payment_cfg, "phone_keys_file", "phone-keys.txt")
    )
    usage_path = _phone_usage_path(payment_cfg)
    print(f"☎️ PayPal 手机号: 正在读取 {keys_path}")
    if not keys_path.exists():
        raise FileNotFoundError(f"手机号文件不存在: {keys_path}")

    with _phone_usage_lock:
        usage = _load_phone_usage(usage_path)
        used = usage["phones"]
        for line in keys_path.read_text(encoding="utf-8").splitlines():
            raw = line.strip()
            if not raw or raw.startswith("#"):
                continue
            phone_key = parse_paypal_phone_key(raw)
            entry = used.get(phone_key.raw) or {}
            if entry.get("status") in {"ok", "failed"}:
                continue
            print(f"☎️ PayPal 手机号: 已选择 {phone_key.phone}")
            return phone_key

    raise RuntimeError("没有可用的 PayPal 手机号")


def _mark_paypal_phone_status(
    phone_key: PayPalPhoneKey,
    *,
    status: str,
    email: str = "",
    detail: str = "",
    payment_cfg=None,
) -> None:
    payment_cfg = payment_cfg or cfg.payment
    usage_path = _phone_usage_path(payment_cfg)
    with _phone_usage_lock:
        usage = _load_phone_usage(usage_path)
        usage["phones"][phone_key.raw] = {
            "status": status,
            "updated_at": _utc_now_iso(),
            "email": email,
            "phone": phone_key.phone,
            "detail": str(detail or "")[:1000],
        }
        _write_phone_usage(usage_path, usage)
    print(f"☎️ PayPal 手机号: 已标记为 {status}")


def mark_paypal_phone_used(
    phone_key: PayPalPhoneKey,
    *,
    email: str = "",
    detail: str = "",
    payment_cfg=None,
) -> None:
    _mark_paypal_phone_status(
        phone_key,
        status="ok",
        email=email,
        detail=detail,
        payment_cfg=payment_cfg,
    )


def mark_paypal_phone_failed(
    phone_key: PayPalPhoneKey,
    *,
    email: str = "",
    detail: str = "",
    payment_cfg=None,
) -> None:
    _mark_paypal_phone_status(
        phone_key,
        status="failed",
        email=email,
        detail=detail,
        payment_cfg=payment_cfg,
    )


def reserve_next_card_key(email: str = "", payment_cfg=None) -> str:
    payment_cfg = payment_cfg or cfg.payment
    if getattr(payment_cfg, "card_debug_mode", False):
        debug_key = str(getattr(payment_cfg, "debug_card_key", "") or "").strip()
        if not debug_key:
            raise RuntimeError("已启用卡密调试模式，但 payment.debug_card_key 为空")
        usage_path = _resolve_project_path(payment_cfg.card_usage_file)
        usage_key = f"debug:{debug_key}"
        with _card_usage_lock:
            usage = _load_card_usage(usage_path)
            usage["cards"][usage_key] = {
                "called_at": _utc_now_iso(),
                "status": "calling",
                "email": email,
                "debug_mode": True,
            }
            _write_card_usage(usage_path, usage)
        print("🧪 卡密调试模式已启用，将重复调用指定 cardkey")
        return debug_key

    keys_path = _resolve_project_path(payment_cfg.card_keys_file)
    usage_path = _resolve_project_path(payment_cfg.card_usage_file)
    print(f"🎟️ 卡密: 正在读取卡密文件 {keys_path}")
    if not keys_path.exists():
        raise FileNotFoundError(f"卡密文件不存在: {keys_path}")

    with _card_usage_lock:
        usage = _load_card_usage(usage_path)
        used = usage["cards"]
        for line in keys_path.read_text(encoding="utf-8").splitlines():
            code = line.strip()
            if not code or code.startswith("#"):
                continue
            if code in used:
                continue
            used[code] = {
                "called_at": _utc_now_iso(),
                "status": "calling",
                "email": email,
            }
            _write_card_usage(usage_path, usage)
            print("🎟️ 卡密: 已锁定一条未调用卡密")
            return code

    raise RuntimeError("没有可用的未调用卡密")


def update_card_usage(
    redeem_code: str,
    *,
    status: str,
    email: str = "",
    detail: str = "",
    payment_cfg=None,
) -> None:
    payment_cfg = payment_cfg or cfg.payment
    usage_path = _resolve_project_path(payment_cfg.card_usage_file)
    usage_key = (
        f"debug:{redeem_code}"
        if getattr(payment_cfg, "card_debug_mode", False)
        else redeem_code
    )
    with _card_usage_lock:
        usage = _load_card_usage(usage_path)
        entry = usage["cards"].setdefault(usage_key, {})
        entry.update(
            {
                "status": status,
                "updated_at": _utc_now_iso(),
                "email": email or entry.get("email", ""),
                "detail": str(detail or "")[:1000],
                "debug_mode": bool(getattr(payment_cfg, "card_debug_mode", False)),
            }
        )
        if "called_at" not in entry:
            entry["called_at"] = entry["updated_at"]
        _write_card_usage(usage_path, usage)
    print(f"🎟️ 卡密: 已更新调用状态 {status}")


def recycle_card_usage(
    redeem_code: str,
    *,
    email: str = "",
    detail: str = "",
    payment_cfg=None,
) -> None:
    payment_cfg = payment_cfg or cfg.payment
    if not redeem_code:
        return

    usage_path = _resolve_project_path(payment_cfg.card_usage_file)
    usage_key = (
        f"debug:{redeem_code}"
        if getattr(payment_cfg, "card_debug_mode", False)
        else redeem_code
    )
    with _card_usage_lock:
        usage = _load_card_usage(usage_path)
        cards = usage["cards"]
        if getattr(payment_cfg, "card_debug_mode", False):
            entry = cards.setdefault(usage_key, {})
            entry.update(
                {
                    "status": "recycled",
                    "updated_at": _utc_now_iso(),
                    "email": email or entry.get("email", ""),
                    "detail": str(detail or "")[:1000],
                    "debug_mode": True,
                }
            )
        else:
            removed = cards.pop(usage_key, None)
            if removed is None:
                return
        _write_card_usage(usage_path, usage)
    print("🎟️ 卡密: 支付失败，已回收卡密")


def mark_card_payment_success(
    card: PaymentCard | None,
    *,
    email: str = "",
    detail: str = "",
    payment_cfg=None,
) -> None:
    if not card or not card.redeem_code:
        return
    update_card_usage(
        card.redeem_code,
        status="used",
        email=email,
        detail=detail or "payment_submitted",
        payment_cfg=payment_cfg,
    )


def recycle_card_after_payment_failure(
    card: PaymentCard | None,
    *,
    email: str = "",
    detail: str = "",
    payment_cfg=None,
) -> None:
    if not card or not card.redeem_code:
        return
    recycle_card_usage(
        card.redeem_code,
        email=email,
        detail=detail or "payment_failed",
        payment_cfg=payment_cfg,
    )


def parse_delivery_content(content: str) -> PaymentCard:
    print("🎟️ 卡密: 正在解析 deliveryContent")
    text = str(content or "").strip()
    print(f"🎟️ 卡密: deliveryContent 原文: {text}")
    parts = [part.strip() for part in text.split("----")]
    if len(parts) != 7:
        print(f"❌ 卡密: deliveryContent 分段数量异常，实际 {len(parts)} 段: {parts}")
        raise ValueError(
            "deliveryContent 格式错误，必须是 card----年/月----cvv----phone----url----name----address,city state postcode,US"
        )

    card_number, expiry, cvv, phone, url, name, address_blob = parts
    expiry_parts = [part.strip() for part in expiry.split("/", 1)]
    if len(expiry_parts) != 2 or not expiry_parts[0] or not expiry_parts[1]:
        raise ValueError("deliveryContent 年/月格式错误")
    year, month = expiry_parts

    address_fields = [part.strip() for part in address_blob.rsplit(",", 2)]
    print(f"🎟️ 卡密: 地址字段拆分结果: {address_fields}")
    if len(address_fields) != 3:
        raise ValueError("deliveryContent 地址格式错误")
    street, city_state_postcode, country = address_fields

    normalized_city_blob = re.sub(r"\s+", " ", city_state_postcode.strip())
    with_state_match = re.fullmatch(
        r"(?P<city>.+?)\s+(?P<state>[A-Za-z]{2})\s+(?P<postcode>\d{5}(?:-\d{4})?)",
        normalized_city_blob,
    )
    without_state_match = re.fullmatch(
        r"(?P<city>.+?)\s+(?P<postcode>\d{5}(?:-\d{4})?)",
        normalized_city_blob,
    )

    if with_state_match:
        city = with_state_match.group("city").strip()
        state = with_state_match.group("state").strip().upper()
        postcode = _normalize_us_postcode(with_state_match.group("postcode"))
        city_state_postcode_parts = [city, state, postcode]
    elif without_state_match:
        city = without_state_match.group("city").strip()
        postcode = _normalize_us_postcode(without_state_match.group("postcode"))
        state = _lookup_us_state_from_postcode(postcode)
        city_state_postcode_parts = [city, postcode]
        print(f"🎟️ 卡密: 接口未返回 state，已按邮编 {postcode} 匹配州 {state}")
    else:
        city_state_postcode_parts = normalized_city_blob.split(" ")
        print(
            "❌ 卡密: city/state/postcode 解析失败 "
            f"(raw={normalized_city_blob!r})"
        )
        raise ValueError("deliveryContent city state postcode 格式错误")

    print(
        "🎟️ 卡密: city/state/postcode 拆分结果: "
        f"{city_state_postcode_parts}"
    )

    if not all(
        [
            card_number,
            year,
            month,
            cvv,
            name,
            street,
            city,
            state,
            postcode,
        ]
    ):
        raise ValueError("deliveryContent 存在空字段")

    card = PaymentCard(
        card=card_number,
        year=year,
        month=month,
        cvv=cvv,
        phone=phone,
        url=url,
        name=name,
        address=street,
        city=city,
        state=state,
        postcode=postcode,
        country=country,
    )
    print(
        "🎟️ 卡密: deliveryContent 解析完成 "
        f"(尾号 {card.card[-4:]}, 姓名 {card.name}, 城市 {card.city})"
    )
    return card


def redeem_next_card(email: str = "", session=None, payment_cfg=None) -> PaymentCard:
    payment_cfg = payment_cfg or cfg.payment
    client = session or requests
    redeem_code = reserve_next_card_key(email=email, payment_cfg=payment_cfg)
    if getattr(payment_cfg, "card_debug_mode", False) and _looks_like_delivery_content(
        redeem_code
    ):
        try:
            print("🧪 卡密调试模式已启用，使用本地 deliveryContent，跳过兑换接口")
            card = replace(parse_delivery_content(redeem_code), redeem_code=redeem_code)
            update_card_usage(
                redeem_code,
                status="redeemed",
                email=email,
                detail="debug_delivery_content",
                payment_cfg=payment_cfg,
            )
            print("✅ 卡密: 已从调试卡密内容获取支付卡信息")
            return card
        except Exception as exc:
            update_card_usage(
                redeem_code,
                status="failed",
                email=email,
                detail=str(exc),
                payment_cfg=payment_cfg,
            )
            print(f"❌ 卡密: 调试卡密内容解析失败: {exc}")
            raise

    try:
        print("🎟️ 卡密: 正在调用兑换接口")
        resp = client.post(
            payment_cfg.redeem_api,
            json={
                "redeemCode": redeem_code,
                "deviceId": payment_cfg.redeem_device_id,
            },
            timeout=payment_cfg.http_timeout,
        )
        data = _request_json(resp)
        print(
            "🎟️ 卡密: 兑换接口原始响应: "
            f"{json.dumps(data, ensure_ascii=False)[:2000]}"
        )
        if resp.status_code >= 400 or data.get("message") != "ok":
            raise RuntimeError(
                f"卡密兑换失败: HTTP {resp.status_code}: {str(data)[:500]}"
            )
        print("🎟️ 卡密: 兑换接口返回 ok")
        payload = data.get("data") or {}
        if not isinstance(payload, dict):
            raise RuntimeError("卡密兑换响应 data 格式异常")
        delivery_content = str(payload.get("deliveryContent") or "").strip()
        print(f"🎟️ 卡密: 接口返回 deliveryContent: {delivery_content}")
        card = replace(parse_delivery_content(delivery_content), redeem_code=redeem_code)
        update_card_usage(
            redeem_code,
            status="redeemed",
            email=email,
            detail="redeemed",
            payment_cfg=payment_cfg,
        )
        print("✅ 卡密: 已获取支付卡信息")
        return card
    except Exception as exc:
        update_card_usage(
            redeem_code,
            status="failed",
            email=email,
            detail=str(exc),
            payment_cfg=payment_cfg,
        )
        print(f"❌ 卡密: 兑换或解析失败: {exc}")
        raise


def _wait_visible(driver, by, selector: str, timeout: int = 30):
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    return _with_window_target_recovery(
        driver,
        f"等待元素可见 {selector}",
        lambda: WebDriverWait(driver, timeout).until(
            EC.visibility_of_element_located((by, selector))
        ),
    )


def _click_when_clickable(driver, by, selector: str, timeout: int = 30):
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    element = _with_window_target_recovery(
        driver,
        f"等待元素可点击 {selector}",
        lambda: WebDriverWait(driver, timeout).until(
            EC.element_to_be_clickable((by, selector))
        ),
    )
    try:
        element.click()
    except Exception:
        driver.execute_script("arguments[0].click();", element)
    return element


def _wait_clickable(driver, by, selector: str, timeout: int = 30):
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    return _with_window_target_recovery(
        driver,
        f"等待元素可点击 {selector}",
        lambda: WebDriverWait(driver, timeout).until(
            EC.element_to_be_clickable((by, selector))
        ),
    )


def _wait_until_no_clickable_element(driver, by, selector: str, timeout: int = 30):
    from selenium.webdriver.support.ui import WebDriverWait

    def _has_no_clickable_element(current_driver):
        for element in current_driver.find_elements(by, selector):
            try:
                if element.is_displayed() and element.is_enabled():
                    return False
            except Exception:
                continue
        return True

    return _with_window_target_recovery(
        driver,
        f"等待元素不可点击或消失 {selector}",
        lambda: WebDriverWait(driver, timeout).until(_has_no_clickable_element),
    )


def _wait_present(driver, by, selector: str, timeout: int = 30):
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    return _with_window_target_recovery(
        driver,
        f"等待元素出现 {selector}",
        lambda: WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located((by, selector))
        ),
    )


def _wait_url_startswith(driver, prefix: str, timeout: int = 60) -> str:
    from selenium.webdriver.support.ui import WebDriverWait

    normalized_prefix = str(prefix or "")

    def _matches(current_driver):
        current_url = str(getattr(current_driver, "current_url", "") or "")
        return current_url if current_url.startswith(normalized_prefix) else False

    current_url = _with_window_target_recovery(
        driver,
        f"等待页面跳转到 {normalized_prefix}",
        lambda: WebDriverWait(driver, timeout).until(_matches),
    )
    print(f"🌐 PayPal: 已进入 {current_url}")
    return current_url


def _wait_url_startswith_any(
    driver, prefixes: list[str] | tuple[str, ...], timeout: int = 60
) -> str:
    from selenium.webdriver.support.ui import WebDriverWait

    normalized_prefixes = tuple(str(prefix or "") for prefix in prefixes if prefix)
    if not normalized_prefixes:
        raise ValueError("prefixes 不能为空")

    def _matches(current_driver):
        current_url = str(getattr(current_driver, "current_url", "") or "")
        return (
            current_url
            if any(current_url.startswith(prefix) for prefix in normalized_prefixes)
            else False
        )

    current_url = _with_window_target_recovery(
        driver,
        f"等待页面跳转到任一地址 {normalized_prefixes}",
        lambda: WebDriverWait(driver, timeout).until(_matches),
    )
    print(f"🌐 PayPal: 已进入 {current_url}")
    return current_url


def _with_window_target_recovery(driver, action: str, callback, attempts: int = 2):
    last_exc: Exception | None = None
    total_attempts = max(1, int(attempts))

    for attempt in range(1, total_attempts + 1):
        try:
            return callback()
        except Exception as exc:
            last_exc = exc
            if attempt >= total_attempts or not _is_window_target_lost(exc):
                raise
            print(
                f"  ⚠️ {action} 时浏览器当前标签页 target 已失效，正在尝试恢复"
                f"（第 {attempt}/{total_attempts} 次）..."
            )
            if not _recover_window_target(driver):
                raise
            time.sleep(1)

    if last_exc is not None:
        raise last_exc
    raise RuntimeError(f"{action} 失败: unknown_error")


def _find_element_with_recovery(driver, by, selector: str, attempts: int = 2):
    return _with_window_target_recovery(
        driver,
        f"查找元素 {selector}",
        lambda: driver.find_element(by, selector),
        attempts=attempts,
    )


def _current_url_with_recovery(driver, attempts: int = 2) -> str:
    return str(
        _with_window_target_recovery(
            driver,
            "读取当前页面地址",
            lambda: driver.current_url,
            attempts=attempts,
        )
        or ""
    )


def _handle_stripe_react_aria_top_layer(driver) -> bool:
    from selenium.common.exceptions import TimeoutException
    from selenium.webdriver.common.by import By

    print("💳 Stripe: 等待 React Aria 顶层弹层最多 30 秒")
    try:
        _wait_present(
            driver,
            By.CSS_SELECTOR,
            "div[data-react-aria-top-layer], .div[data-react-aria-top-layer]",
            timeout=30,
        )
    except TimeoutException:
        print("💳 Stripe: 未检测到 React Aria 顶层弹层，继续后续流程")
        return False

    print("💳 Stripe: 检测到 React Aria 顶层弹层，等待 #anchor-td")
    try:
        _wait_present(driver, By.CSS_SELECTOR, "#anchor-td", timeout=30)
    except TimeoutException:
        print("💳 Stripe: 未等到 #anchor-td，继续后续流程")
        return False

    driver.execute_script("document.querySelector('#anchor-td').click()")
    print("💳 Stripe: 已点击 #anchor-td")
    return True


def _clear_and_type(element, value: str) -> None:
    if str(element.tag_name or "").lower() == "select":
        from selenium.webdriver.support.ui import Select

        select = Select(element)
        text_value = str(value or "")
        try:
            select.select_by_value(text_value)
            return
        except Exception:
            pass
        try:
            select.select_by_visible_text(text_value)
            return
        except Exception:
            pass

    try:
        element.clear()
    except Exception:
        pass
    text_value = str(value or "")
    if not text_value:
        return
    for char in text_value:
        element.send_keys(char)
        time.sleep(_TYPING_DELAY_SECONDS)


def _set_input_value_with_input_event(driver, element, value: str) -> None:
    text_value = str(value or "")
    driver.execute_script(
        """
        const element = arguments[0];
        const value = arguments[1];
        element.focus();
        element.value = '';
        element.dispatchEvent(new Event('input', { bubbles: true }));
        for (const char of value) {
            element.value += char;
            element.dispatchEvent(new Event('input', { bubbles: true }));
        }
        element.dispatchEvent(new Event('change', { bubbles: true }));
        """,
        element,
        text_value,
    )


def _paste_input_value(driver, element, value: str) -> bool:
    text_value = str(value or "")
    if not text_value:
        _set_input_value_with_input_event(driver, element, text_value)
        return True

    try:
        element.click()
    except Exception:
        pass

    try:
        driver.execute_script(
            """
            const text = arguments[0];
            let clipboard = document.getElementById('__codex-paypal-clipboard__');
            if (!clipboard) {
                clipboard = document.createElement('textarea');
                clipboard.id = '__codex-paypal-clipboard__';
                clipboard.setAttribute('aria-hidden', 'true');
                clipboard.style.position = 'fixed';
                clipboard.style.left = '-9999px';
                clipboard.style.top = '0';
                clipboard.style.opacity = '0';
                document.body.appendChild(clipboard);
            }
            clipboard.value = text;
            clipboard.focus();
            clipboard.select();
            document.execCommand('copy');
            """,
            text_value,
        )
    except Exception:
        pass

    try:
        from selenium.webdriver.common.action_chains import ActionChains
        from selenium.webdriver.common.keys import Keys

        modifiers = [Keys.COMMAND, Keys.CONTROL]
        if platform.system().lower() != "darwin":
            modifiers = [Keys.CONTROL, Keys.COMMAND]
        for modifier in modifiers:
            try:
                element.click()
            except Exception:
                pass
            try:
                ActionChains(driver).key_down(modifier).send_keys("v").key_up(
                    modifier
                ).perform()
            except Exception:
                continue
            try:
                if str(element.get_attribute("value") or "") == text_value:
                    return True
            except Exception:
                pass
    except Exception:
        pass

    try:
        driver.execute_script(
            """
            const element = arguments[0];
            const value = arguments[1];
            element.focus();
            element.value = '';
            try {
                const transfer = new DataTransfer();
                transfer.setData('text/plain', value);
                const pasteEvent = new ClipboardEvent('paste', {
                    bubbles: true,
                    cancelable: true,
                    clipboardData: transfer,
                });
                element.dispatchEvent(pasteEvent);
            } catch (error) {
                // Ignore and continue with direct insertion fallback.
            }
            element.value = value;
            element.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'insertFromPaste',
                data: value,
            }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            """,
            element,
            text_value,
        )
        return True
    except Exception:
        _set_input_value_with_input_event(driver, element, text_value)
        return False


def _ensure_checked(driver, selector: str, timeout: int = 30) -> bool:
    from selenium.webdriver.common.by import By

    checkbox = _find_element_with_recovery(driver, By.CSS_SELECTOR, selector)
    if checkbox.is_selected():
        return False
    driver.execute_script("arguments[0].click();", checkbox)
    return True


def _fill_stripe_billing_details(driver, card: PaymentCard, timeout: int = 30) -> None:
    from selenium.webdriver.common.by import By

    fields = {
        "#billingName": card.name,
        "#billingAddressLine1": card.address,
        "#billingLocality": card.city,
        "#billingPostalCode": card.postcode,
    }
    for selector, value in fields.items():
        try:
            element = _find_element_with_recovery(driver, By.CSS_SELECTOR, selector)
        except Exception:
            print(f"💳 Stripe: 未找到 {selector}，跳过")
            continue
        print(f"💳 Stripe: 填写 {selector}")
        _clear_and_type(element, value)

    if _ensure_checked(driver, "#termsOfServiceConsentCheckbox", timeout=timeout):
        print("💳 Stripe: 已勾选服务条款")
    else:
        print("💳 Stripe: 服务条款已勾选")


def _split_cardholder_name(name: str) -> tuple[str, str]:
    parts = [part for part in str(name or "").strip().split() if part]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], parts[0]
    return parts[0], parts[-1]


def extract_six_digit_code(text: str) -> str | None:
    match = re.search(r"\b(\d{6})\b", str(text or ""))
    return match.group(1) if match else None


def wait_for_paypal_sms_code(
    sms_url: str,
    *,
    session=None,
    timeout: int = 180,
    poll_interval: int = 5,
    payment_cfg=None,
) -> str:
    payment_cfg = payment_cfg or cfg.payment
    client = session or requests
    deadline = time.time() + max(1, int(timeout))
    last_error = ""
    while time.time() < deadline:
        try:
            resp = client.get(
                sms_url,
                timeout=getattr(payment_cfg, "http_timeout", 30),
            )
            text = str(getattr(resp, "text", "") or "")
            code = extract_six_digit_code(text)
            if code:
                print("☎️ PayPal 短信: 已匹配 6 位验证码")
                return code
            last_error = "未匹配到 6 位验证码"
        except Exception as exc:
            last_error = str(exc)
        time.sleep(max(1, int(poll_interval)))

    raise RuntimeError(f"PayPal 短信验证码超时: {last_error or 'N/A'}")


def _try_fill_paypal_sms_code(driver, code: str) -> bool:
    from selenium.webdriver.common.by import By

    selectors = [
        "#ci-ciBasic-0",
        "#otpCode",
        "#verificationCode",
        "#securityCode",
        'input[name="otpCode"]',
        'input[name="verificationCode"]',
        'input[autocomplete="one-time-code"]',
    ]
    for selector in selectors:
        try:
            element = _find_element_with_recovery(driver, By.CSS_SELECTOR, selector)
        except Exception:
            continue
        if selector == "#ci-ciBasic-0":
            pasted = _paste_input_value(driver, element, code)
            if pasted:
                print("☎️ PayPal 短信: 已通过粘贴方式填写验证码 #ci-ciBasic-0")
            else:
                print("☎️ PayPal 短信: 粘贴失败，已回退到输入事件方式 #ci-ciBasic-0")
        else:
            _clear_and_type(element, code)
        print(f"☎️ PayPal 短信: 已填写验证码 {selector}")
        return True
    print("☎️ PayPal 短信: 未找到验证码输入框，继续提交")
    return False


def _detect_paypal_phone_exceeded(driver) -> bool:
    from selenium.webdriver.common.by import By

    try:
        container = _find_element_with_recovery(
            driver,
            By.CSS_SELECTOR,
            ".exceed-main",
        )
    except Exception:
        return False

    try:
        visible = bool(container.is_displayed())
    except Exception:
        visible = True
    if not visible:
        return False
    print("☎️ PayPal 手机号: 检测到 exceed-main 错误提示")
    return True


def _dismiss_paypal_phone_exceeded_dialog(driver) -> None:
    from selenium.webdriver.common.by import By

    print("☎️ PayPal 手机号: 点击 exceed-main 弹窗按钮")
    _click_when_clickable(
        driver,
        By.CSS_SELECTOR,
        '.exceed-main button[type="button"]',
        timeout=15,
    )


def verify_stripe_zero_amount(driver) -> str:
    from selenium.webdriver.common.by import By

    amount = _wait_visible(driver, By.CSS_SELECTOR, ".CurrencyAmount", timeout=45)
    amount_text = " ".join((amount.text or "").split())
    print(f"💳 Stripe: 页面金额 {amount_text or 'N/A'}")
    if amount_text != "€0.00":
        raise RuntimeError(f"Stripe 金额不是 €0.00: {amount_text or 'N/A'}")
    return amount_text


def _is_paypal_cookie_domain(domain: str) -> bool:
    normalized = str(domain or "").strip().lstrip(".").lower()
    return normalized == "paypal.com" or normalized.endswith(".paypal.com")


def clear_paypal_cookies_and_cache(driver) -> None:
    print("🧹 PayPal: 打开支付页前清理 paypal.com Cookie 与缓存")
    cookies = []
    try:
        payload = _execute_cdp_cmd_with_target_recovery(
            driver,
            "Network.getCookies",
            {"urls": list(_PAYPAL_STORAGE_ORIGINS)},
        )
        if isinstance(payload, dict):
            raw_cookies = payload.get("cookies") or []
            if isinstance(raw_cookies, list):
                cookies = [item for item in raw_cookies if isinstance(item, dict)]
    except Exception as exc:
        print(f"⚠️ PayPal: 读取 Cookie 失败，继续尝试清理缓存: {exc}")

    deleted = 0
    seen_cookie_keys: set[tuple[str, str, str]] = set()
    for cookie in cookies:
        name = str(cookie.get("name") or "").strip()
        domain = str(cookie.get("domain") or "").strip()
        path = str(cookie.get("path") or "/").strip() or "/"
        if not name or not _is_paypal_cookie_domain(domain):
            continue
        cookie_key = (name, domain, path)
        if cookie_key in seen_cookie_keys:
            continue
        seen_cookie_keys.add(cookie_key)
        try:
            _execute_cdp_cmd_with_target_recovery(
                driver,
                "Network.deleteCookies",
                {
                    "name": name,
                    "domain": domain,
                    "path": path,
                },
            )
            deleted += 1
        except Exception as exc:
            print(f"⚠️ PayPal: 删除 Cookie 失败 {name}@{domain}{path}: {exc}")

    cleared_origins = 0
    for origin in _PAYPAL_STORAGE_ORIGINS:
        try:
            _execute_cdp_cmd_with_target_recovery(
                driver,
                "Storage.clearDataForOrigin",
                {
                    "origin": origin,
                    "storageTypes": _PAYPAL_STORAGE_TYPES,
                },
            )
            cleared_origins += 1
        except Exception as exc:
            print(f"⚠️ PayPal: 清理站点缓存失败 {origin}: {exc}")

    print(
        f"🧹 PayPal: 已清理 {deleted} 个 Cookie，处理 {cleared_origins} 个站点缓存 origin"
    )


def open_stripe_payment_page(driver, stripe_payurl: str, monitor_callback=None) -> str:
    print(f"💳 打开 Stripe 支付页面: {stripe_payurl}")
    clear_paypal_cookies_and_cache(driver)
    _with_window_target_recovery(
        driver,
        f"打开 Stripe 支付页面 {stripe_payurl}",
        lambda: driver.get(stripe_payurl),
    )
    if monitor_callback:
        monitor_callback(driver, "stripe_open")

    return verify_stripe_zero_amount(driver)


def fill_and_submit_stripe_payment(
    driver, card: PaymentCard, monitor_callback=None
) -> bool:
    from selenium.webdriver.common.by import By

    print("💳 Stripe: 点击 Pay with card")
    driver.execute_script(
        "document.querySelector('[aria-label=\"Pay with card\"]').click()"
    )
    print("💳 Stripe: 点击 Checkout Secondary 按钮")
    driver.execute_script(
        "document.querySelector('.Button-textCheckoutSecondary').click()"
    )
    if monitor_callback:
        monitor_callback(driver, "stripe_pay_with_card")

    try:
        pass_checkbox = _find_element_with_recovery(
            driver, By.CSS_SELECTOR, "#enableStripePass"
        )
        if pass_checkbox.is_selected():
            driver.execute_script("arguments[0].click();", pass_checkbox)
            print("💳 Stripe: 已取消 Stripe Pass")
        else:
            print("💳 Stripe: Stripe Pass 未勾选")
    except Exception:
        print("💳 Stripe: 未找到 Stripe Pass 复选框，继续")
        pass

    fields = {
        "#cardNumber": card.card,
        "#cardExpiry": card.expiry_input,
        "#cardCvc": card.cvv,
        "#billingAdministrativeArea": card.state,
    }
    for selector, value in fields.items():
        print(f"💳 Stripe: 填写 {selector}")
        _clear_and_type(
            _wait_visible(driver, By.CSS_SELECTOR, selector, timeout=30), value
        )
    time.sleep(5)
    _fill_stripe_billing_details(driver, card, timeout=30)

    if monitor_callback:
        monitor_callback(driver, "stripe_card_filled")

    time.sleep(20)
    print("💳 Stripe: 点击提交按钮")
    _click_when_clickable(
        driver,
        By.CSS_SELECTOR,
        "button.SubmitButton.SubmitButton--incomplete",
        timeout=30,
    )
    _handle_stripe_react_aria_top_layer(driver)
    time.sleep(3)

    card_number = _find_element_with_recovery(driver, By.CSS_SELECTOR, "#cardNumber")
    class_name = str(card_number.get_attribute("class") or "").strip()
    print(f"💳 Stripe: 提交后卡号输入框 class={class_name or 'N/A'}")
    if (
        class_name
        == "CheckoutInput CheckoutInput--invalid CheckoutInput--tabularnums Input"
    ):
        raise RuntimeError("Stripe 卡号输入框标记为 invalid")

    if monitor_callback:
        monitor_callback(driver, "stripe_payment_submitted")
    print("✅ Stripe 支付流程已提交")
    return True


def fill_and_submit_paypal_payment(
    driver,
    card: PaymentCard,
    *,
    email: str,
    monitor_callback=None,
    payment_cfg=None,
) -> bool:
    from selenium.webdriver.common.by import By

    payment_cfg = payment_cfg or cfg.payment
    phone_key = reserve_next_paypal_phone(email=email, payment_cfg=payment_cfg)
    paypal_phone_retry_limit = max(
        1,
        int(getattr(payment_cfg, "paypal_phone_retry_limit", 5) or 5),
    )

    print("💳 Stripe: 点击 Pay with PayPal")
    driver.execute_script(
        "document.querySelector('[aria-label=\"Pay with PayPal\"]').click()"
    )
    if monitor_callback:
        monitor_callback(driver, "stripe_pay_with_paypal")

    print("💳 Stripe: 填写 PayPal 提交前账单信息")
    time.sleep(10)
    print("🌐 PayPal: 尝试点击 Enter address manually")
    try:
        _click_when_clickable(
            driver,
            By.CSS_SELECTOR,
            ".Button-textCheckoutSecondary",
            timeout=8,
        )
    except Exception:
        print("🌐 PayPal: 未找到 Enter address manually，继续")
    time.sleep(5)
    _fill_stripe_billing_details(driver, card, timeout=45)
    time.sleep(8)
    print("💳 Stripe: 点击 PayPal 提交按钮")
    _click_when_clickable(driver, By.CSS_SELECTOR, 'button[type="submit"]', timeout=30)
    time.sleep(10)
    paypal_approve_prefix = "https://www.paypal.com/agreements/approve"
    paypal_signup_prefix = "https://www.paypal.com/checkoutweb/signup"
    paypal_pay_prefix = "https://www.paypal.com/pay"
    current_url = _wait_url_startswith_any(
        driver,
        [
            paypal_approve_prefix,
            paypal_signup_prefix,
            paypal_pay_prefix,
        ],
        timeout=40,
    )
    time.sleep(30)
    if current_url.startswith(paypal_pay_prefix):
        if monitor_callback:
            monitor_callback(driver, "paypal_pay")
        print("🌐 PayPal: 已进入 /pay，先点击 submit 触发表单")
        _click_when_clickable(
            driver, By.CSS_SELECTOR, 'button[type="submit"]', timeout=45
        )
        time.sleep(2)
        print("🌐 PayPal: 等待 submit 按钮消失后再填写邮箱")
        _wait_until_no_clickable_element(
            driver, By.CSS_SELECTOR, 'button[type="submit"]', timeout=45
        )
        print("🌐 PayPal: 等待邮箱输入框并填写邮箱")
        _clear_and_type(
            _wait_visible(driver, By.CSS_SELECTOR, 'input[type="email"]', timeout=45),
            email,
        )
        print("🌐 PayPal: 点击继续按钮")
        try:
            _click_when_clickable(
                driver,
                By.CSS_SELECTOR,
                'button[data-testid="continueButton"]',
                timeout=45,
            )
        except Exception:
            _click_when_clickable(
                driver,
                By.CSS_SELECTOR,
                'button[data-atomic-wait-task="login_create_account"]',
                timeout=45,
            )
        try:
            current_url = _wait_url_startswith(driver, paypal_signup_prefix, timeout=90)
        except Exception:
            current_url = _current_url_with_recovery(driver)

    time.sleep(5)
    if current_url.startswith(paypal_approve_prefix):
        if monitor_callback:
            monitor_callback(driver, "paypal_approve")
        print("🌐 PayPal: 创建账号")

        try:
            _click_when_clickable(
                driver, By.CSS_SELECTOR, "#startOnboardingFlow", timeout=30
            )
        except Exception:
            _click_when_clickable(driver, By.CSS_SELECTOR, "#createAccount", timeout=30)

        print("🌐 PayPal: 等待 submit 按钮出现后再填写邮箱")
        _wait_clickable(driver, By.CSS_SELECTOR, "button[type='submit']", timeout=45)
        _clear_and_type(
            _wait_visible(driver, By.CSS_SELECTOR, "[type='email']", timeout=45), email
        )

        _click_when_clickable(
            driver, By.CSS_SELECTOR, "button[type='submit']", timeout=30
        )
    if monitor_callback:
        monitor_callback(driver, "paypal_signup")

    def _fill_with_fallback(
        selectors: list[str], value: str, *, timeout: int = 45
    ) -> None:
        last_error = None
        for selector in selectors:
            try:
                print(f"🌐 PayPal: 填写 {selector}")
                _clear_and_type(
                    _wait_visible(driver, By.CSS_SELECTOR, selector, timeout=timeout),
                    value,
                )
                return
            except Exception as exc:
                last_error = exc
        raise RuntimeError(f"PayPal 字段填写失败: {selectors}") from last_error

    def _wait_visible_with_fallback(selectors: list[str], *, timeout: int = 45):
        last_error = None
        for selector in selectors:
            try:
                print(f"🌐 PayPal: 等待 {selector}")
                return _wait_visible(driver, By.CSS_SELECTOR, selector, timeout=timeout)
            except Exception as exc:
                last_error = exc
        raise RuntimeError(f"PayPal 字段等待失败: {selectors}") from last_error

    country_selectors = [
        "#country",
        'select[name="country"]',
        'select[name="billingCountry"]',
        'input[name="country"]',
        'input[name="billingCountry"]',
    ]
    phone_selectors = ["#phone", 'input[name="phone"]', 'input[name="phoneNumber"]']

    print("🌐 PayPal: 设置账单国家")
    _fill_with_fallback(country_selectors, card.country, timeout=45)
    print("🌐 PayPal: 等待国家切换后的表单刷新完成")
    _wait_visible_with_fallback(phone_selectors, timeout=45)

    fields = {
        "#phone": (
            phone_key.phone,
            phone_selectors,
        ),
        "#email": (email, ["#email", 'input[type="email]']),  # 妈的，不要在删除这个了
        "#cardNumber": (card.card, ["#cardNumber", 'input[name="cardNumber"]']),
        "#cardExpiry": (
            card.expiry_input,
            ["#cardExpiry", 'input[name="cardExpiry"]', 'input[name="expiry"]'],
        ),
        "#cardCvv": (
            card.cvv,
            ["#cardCvv", 'input[name="cardCvv"]', 'input[name="cvv"]'],
        ),
        "#password": ("Bb9388271", ["#password", 'input[name="password"]']),
        "#billingLine1": (card.address, ["#billingLine1"]),
    }
    first_name, last_name = _split_cardholder_name(card.name)
    fields["#firstName"] = (first_name, ["#firstName"])
    fields["#lastName"] = (last_name, ["#lastName"])

    for _, (value, selectors) in fields.items():
        if selectors == phone_selectors:
            continue
        _fill_with_fallback(selectors, value, timeout=45)

    _fill_with_fallback(["#billingCity"], card.city, timeout=45)
    _fill_with_fallback(["#billingPostalCode"], card.postcode, timeout=45)

    print("🌐 PayPal: 设置账单州")
    _fill_with_fallback(
        ["#billingState", 'select[name="billingState"]', 'input[name="billingState"]'],
        card.state,
        timeout=45,
    )

    for phone_attempt in range(1, paypal_phone_retry_limit + 1):
        print(
            f"☎️ PayPal 手机号: 使用 {phone_key.phone} 提交（第 {phone_attempt}/{paypal_phone_retry_limit} 次）"
        )
        _fill_with_fallback(phone_selectors, phone_key.phone, timeout=45)

        print("🌐 PayPal: 点击提交按钮触发短信验证码")
        try:
            _click_when_clickable(
                driver, By.CSS_SELECTOR, 'button[type="submit"]', timeout=45
            )
        except Exception as exc:
            raise RuntimeError("PayPal 短信触发提交失败") from exc

        time.sleep(2)
        if _detect_paypal_phone_exceeded(driver):
            mark_paypal_phone_failed(
                phone_key,
                email=email,
                detail="paypal_phone_exceeded",
                payment_cfg=payment_cfg,
            )
            _dismiss_paypal_phone_exceeded_dialog(driver)
            if phone_attempt >= paypal_phone_retry_limit:
                raise RuntimeError("PayPal 手机号多次触发 exceed-main，无法继续")
            phone_key = reserve_next_paypal_phone(email=email, payment_cfg=payment_cfg)
            continue

        print("☎️ PayPal: 等待验证码输入框出现")
        try:
            _wait_visible(driver, By.CSS_SELECTOR, "#ci-ciBasic-0", timeout=45)
            break
        except Exception as exc:
            raise RuntimeError("PayPal 验证码输入框未出现") from exc
    else:
        raise RuntimeError("PayPal 手机号重试后仍未进入验证码输入")

    print("☎️ PayPal: 等待短信验证码")
    sms_code = wait_for_paypal_sms_code(
        phone_key.sms_url,
        timeout=int(getattr(payment_cfg, "paypal_sms_timeout", 180)),
        poll_interval=int(getattr(payment_cfg, "paypal_sms_poll_interval", 5)),
        payment_cfg=payment_cfg,
    )
    _try_fill_paypal_sms_code(driver, sms_code)

    if monitor_callback:
        monitor_callback(driver, "paypal_form_filled")

    print("🌐 PayPal: 点击最终提交按钮")
    try:
        _click_when_clickable(
            driver, By.CSS_SELECTOR, 'button[type="submit"]', timeout=45
        )
    except Exception as exc:
        raise RuntimeError("PayPal 最终提交失败") from exc
    mark_paypal_phone_used(
        phone_key,
        email=email,
        detail="paypal_signup_submitted",
        payment_cfg=payment_cfg,
    )
    if monitor_callback:
        monitor_callback(driver, "paypal_payment_submitted")
    print("✅ PayPal 支付流程已提交")
    return True


def complete_stripe_payment(
    driver, stripe_payurl: str, card: PaymentCard, monitor_callback=None
) -> bool:
    open_stripe_payment_page(driver, stripe_payurl, monitor_callback=monitor_callback)
    return fill_and_submit_stripe_payment(
        driver, card, monitor_callback=monitor_callback
    )


def normalize_payment_method(value: str) -> str:
    method = str(value or "card").strip().lower()
    return method if method in {"card", "paypal"} else "card"


def execute_payurl_payment_flow(
    driver,
    pay_url: str,
    *,
    payment_method: str = "card",
    email: str = "",
    monitor_callback=None,
    payment_cfg=None,
) -> PaymentCard:
    payment_cfg = payment_cfg or cfg.payment
    normalized_pay_url = str(pay_url or "").strip()
    if not normalized_pay_url:
        raise ValueError("pay_url 不能为空")

    method = normalize_payment_method(payment_method)
    normalized_email = str(email or "").strip()
    if method == "paypal" and not normalized_email:
        raise ValueError("PayPal 支付测试需要提供 email")

    card: PaymentCard | None = None
    print("💳 支付测试: step 1/3 打开支付页面并确认金额")
    open_stripe_payment_page(
        driver,
        normalized_pay_url,
        monitor_callback=monitor_callback,
    )

    try:
        print("💳 支付测试: step 2/3 获取支付卡信息")
        card = redeem_next_card(email=normalized_email, payment_cfg=payment_cfg)

        print(f"💳 支付测试: step 3/3 提交 {method} 支付流程")
        if method == "paypal":
            fill_and_submit_paypal_payment(
                driver,
                card,
                email=normalized_email,
                monitor_callback=monitor_callback,
                payment_cfg=payment_cfg,
            )
        else:
            fill_and_submit_stripe_payment(
                driver,
                card,
                monitor_callback=monitor_callback,
            )
        mark_card_payment_success(
            card,
            email=normalized_email,
            detail=f"{method}_payment_submitted",
            payment_cfg=payment_cfg,
        )
    except Exception as exc:
        recycle_card_after_payment_failure(
            card,
            email=normalized_email,
            detail=f"{method}_payment_failed: {exc}",
            payment_cfg=payment_cfg,
        )
        raise

    return card


def fetch_and_save_browser_json_for_registered_account(
    *,
    email: str,
    password: str,
    email_provider: str,
    mailbox_credential: str,
    output_dir: str | None = None,
    proxy: dict | None = None,
    headless: bool = False,
    monitor_callback=None,
    oauth_login_func=perform_browser_codex_oauth_login,
):
    from . import browser_json_service

    output_dir = output_dir or cfg.oauth.token_json_dir
    print(f"🌐 JSON: 开始浏览器 OAuth 获取 Codex token ({email})")
    tokens = oauth_login_func(
        email=email,
        password=password,
        email_provider=email_provider,
        mail_token=mailbox_credential or email,
        proxy=proxy,
        headless=headless,
        monitor_callback=monitor_callback,
    )
    print("🌐 JSON: OAuth token 已获取，开始保存")
    saved_token_path = save_codex_tokens(
        email=email,
        tokens=tokens,
        oauth_cfg=browser_json_service._build_output_oauth_cfg(output_dir),
        proxy=proxy,
    )
    browser_json_service._append_browser_json_exports(
        email=email,
        password=password,
        token_path=saved_token_path,
        tokens=tokens,
    )
    print(f"✅ JSON: 已保存并追加导出 {saved_token_path}")
    return saved_token_path
