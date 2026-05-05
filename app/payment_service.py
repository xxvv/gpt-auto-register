"""
注册后支付流程服务。
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

from .config import PROJECT_ROOT, cfg
from .oauth_service import perform_browser_codex_oauth_login, save_codex_tokens
from .utils import describe_proxy

WEBSHARE_LIST_URL = "https://proxy.webshare.io/api/v2/proxy/list/"
WEBSHARE_REPLACE_URL = "https://proxy.webshare.io/api/v3/proxy/replace/"
PAYMENT_SUCCESS_STATUS = "已注册/支付成功"
PAYMENT_FAILED_STATUS = "支付失败"

_card_usage_lock = threading.Lock()
_phone_usage_lock = threading.Lock()


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


def _webshare_item_to_runtime_proxy(item: dict[str, Any]) -> dict[str, Any] | None:
    host = str(
        item.get("proxy_address")
        or item.get("host")
        or item.get("ip")
        or item.get("ip_address")
        or ""
    ).strip()
    if not host:
        return None

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
        "type": "socks5",
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


def get_current_webshare_static_proxy(session=None, payment_cfg=None) -> dict[str, Any]:
    payment_cfg = payment_cfg or cfg.payment
    if getattr(payment_cfg, "proxy_debug_mode", False):
        proxy = _debug_proxy_to_runtime_proxy(payment_cfg)
        print(f"🧪 Webshare 代理调试模式已启用，使用固定代理: {describe_proxy(proxy)}")
        return proxy

    items = fetch_webshare_proxy_list(session=session, payment_cfg=payment_cfg)
    current_proxy = _webshare_item_to_runtime_proxy(items[0])
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


def replace_webshare_static_proxy(session=None, payment_cfg=None) -> dict[str, Any]:
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
    current_proxy = _webshare_item_to_runtime_proxy(current_item)
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
    refreshed_proxy = _webshare_item_to_runtime_proxy(refreshed_items[0])
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
    return bool(getattr(payment_cfg, "card_debug_mode", False)) and _looks_like_delivery_content(
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
            if entry.get("status") == "ok":
                continue
            print(f"☎️ PayPal 手机号: 已选择 {phone_key.phone}")
            return phone_key

    raise RuntimeError("没有可用的 PayPal 手机号")


def mark_paypal_phone_used(
    phone_key: PayPalPhoneKey,
    *,
    email: str = "",
    detail: str = "",
    payment_cfg=None,
) -> None:
    payment_cfg = payment_cfg or cfg.payment
    usage_path = _phone_usage_path(payment_cfg)
    with _phone_usage_lock:
        usage = _load_phone_usage(usage_path)
        usage["phones"][phone_key.raw] = {
            "status": "ok",
            "updated_at": _utc_now_iso(),
            "email": email,
            "phone": phone_key.phone,
            "detail": str(detail or "")[:1000],
        }
        _write_phone_usage(usage_path, usage)
    print("☎️ PayPal 手机号: 已标记成功使用")


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


def parse_delivery_content(content: str) -> PaymentCard:
    print("🎟️ 卡密: 正在解析 deliveryContent")
    text = str(content or "").strip()
    parts = [part.strip() for part in text.split("----")]
    if len(parts) != 7:
        raise ValueError(
            "deliveryContent 格式错误，必须是 card----年/月----cvv----phone----url----name----address,city state postcode,US"
        )

    card_number, expiry, cvv, phone, url, name, address_blob = parts
    expiry_parts = [part.strip() for part in expiry.split("/", 1)]
    if len(expiry_parts) != 2 or not expiry_parts[0] or not expiry_parts[1]:
        raise ValueError("deliveryContent 年/月格式错误")
    year, month = expiry_parts

    address_fields = [part.strip() for part in address_blob.rsplit(",", 2)]
    if len(address_fields) != 3:
        raise ValueError("deliveryContent 地址格式错误")
    street, city_state_postcode, country = address_fields

    city_state_postcode_parts = city_state_postcode.rsplit(None, 2)
    if len(city_state_postcode_parts) != 3:
        raise ValueError("deliveryContent city state postcode 格式错误")
    city, state, postcode = [part.strip() for part in city_state_postcode_parts]
    if len(state) != 2 or not state.isalpha():
        raise ValueError("deliveryContent city state postcode 格式错误")

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
            card = parse_delivery_content(redeem_code)
            update_card_usage(
                redeem_code,
                status="ok",
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
        if resp.status_code >= 400 or data.get("message") != "ok":
            raise RuntimeError(
                f"卡密兑换失败: HTTP {resp.status_code}: {str(data)[:500]}"
            )
        print("🎟️ 卡密: 兑换接口返回 ok")
        payload = data.get("data") or {}
        if not isinstance(payload, dict):
            raise RuntimeError("卡密兑换响应 data 格式异常")
        delivery_content = str(payload.get("deliveryContent") or "").strip()
        card = parse_delivery_content(delivery_content)
        update_card_usage(
            redeem_code,
            status="ok",
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

    return WebDriverWait(driver, timeout).until(
        EC.visibility_of_element_located((by, selector))
    )


def _click_when_clickable(driver, by, selector: str, timeout: int = 30):
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    element = WebDriverWait(driver, timeout).until(
        EC.element_to_be_clickable((by, selector))
    )
    try:
        element.click()
    except Exception:
        driver.execute_script("arguments[0].click();", element)
    return element


def _wait_present(driver, by, selector: str, timeout: int = 30):
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((by, selector))
    )


def _wait_url_startswith(driver, prefix: str, timeout: int = 60) -> str:
    from selenium.webdriver.support.ui import WebDriverWait

    normalized_prefix = str(prefix or "")

    def _matches(current_driver):
        current_url = str(getattr(current_driver, "current_url", "") or "")
        return current_url if current_url.startswith(normalized_prefix) else False

    current_url = WebDriverWait(driver, timeout).until(_matches)
    print(f"🌐 PayPal: 已进入 {current_url}")
    return current_url


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
    element.send_keys(str(value or ""))


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
        "#otpCode",
        "#verificationCode",
        "#securityCode",
        'input[name="otpCode"]',
        'input[name="verificationCode"]',
        'input[autocomplete="one-time-code"]',
    ]
    for selector in selectors:
        try:
            element = driver.find_element(By.CSS_SELECTOR, selector)
        except Exception:
            continue
        _clear_and_type(element, code)
        print(f"☎️ PayPal 短信: 已填写验证码 {selector}")
        return True
    print("☎️ PayPal 短信: 未找到验证码输入框，继续提交")
    return False


def verify_stripe_zero_amount(driver) -> str:
    from selenium.webdriver.common.by import By

    amount = _wait_visible(driver, By.CSS_SELECTOR, ".CurrencyAmount", timeout=45)
    amount_text = " ".join((amount.text or "").split())
    print(f"💳 Stripe: 页面金额 {amount_text or 'N/A'}")
    if amount_text != "€0.00":
        raise RuntimeError(f"Stripe 金额不是 €0.00: {amount_text or 'N/A'}")
    return amount_text


def open_stripe_payment_page(driver, stripe_payurl: str, monitor_callback=None) -> str:
    print(f"💳 打开 Stripe 支付页面: {stripe_payurl}")
    driver.get(stripe_payurl)
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
        pass_checkbox = driver.find_element(By.CSS_SELECTOR, "#enableStripePass")
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
        "#billingName": card.name,
        "#billingAddressLine1": card.address,
        "#billingLocality": card.city,
        "#billingAdministrativeArea": card.state,
        "#billingPostalCode": card.postcode,
    }
    for selector, value in fields.items():
        print(f"💳 Stripe: 填写 {selector}")
        _clear_and_type(
            _wait_visible(driver, By.CSS_SELECTOR, selector, timeout=30), value
        )

    terms = driver.find_element(By.CSS_SELECTOR, "#termsOfServiceConsentCheckbox")
    if not terms.is_selected():
        driver.execute_script("arguments[0].click();", terms)
        print("💳 Stripe: 已勾选服务条款")
    else:
        print("💳 Stripe: 服务条款已勾选")

    if monitor_callback:
        monitor_callback(driver, "stripe_card_filled")

    time.sleep(2)
    print("💳 Stripe: 点击提交按钮")
    _click_when_clickable(
        driver,
        By.CSS_SELECTOR,
        "button.SubmitButton.SubmitButton--incomplete",
        timeout=30,
    )
    _handle_stripe_react_aria_top_layer(driver)
    time.sleep(3)

    card_number = driver.find_element(By.CSS_SELECTOR, "#cardNumber")
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

    print("💳 Stripe: 点击 Pay with PayPal")
    driver.execute_script(
        "document.querySelector('[aria-label=\"Pay with PayPal\"]').click()"
    )
    if monitor_callback:
        monitor_callback(driver, "stripe_pay_with_paypal")

    print("💳 Stripe: 点击 PayPal 提交按钮")
    _click_when_clickable(driver, By.CSS_SELECTOR, 'button[type="submit"]', timeout=30)
    _wait_url_startswith(
        driver,
        "https://www.paypal.com/agreements/approve",
        timeout=90,
    )
    if monitor_callback:
        monitor_callback(driver, "paypal_approve")

    print("🌐 PayPal: 输入注册邮箱并创建账号")
    _clear_and_type(_wait_visible(driver, By.CSS_SELECTOR, "#email", timeout=45), email)
    _click_when_clickable(driver, By.CSS_SELECTOR, "#createAccount", timeout=30)
    _wait_url_startswith(
        driver,
        "https://www.paypal.com/checkoutweb/signup",
        timeout=90,
    )
    if monitor_callback:
        monitor_callback(driver, "paypal_signup")

    fields = {
        "#phone": phone_key.phone,
        "#cardNumber": card.card,
        "#cardExpiry": card.expiry_input,
        "#cardCvv": card.cvv,
        "#password": "Bb9388271",
        "#billingCity": card.city,
        "#billingPostalCode": card.postcode,
        "#billingLine1": card.address,
    }
    first_name, last_name = _split_cardholder_name(card.name)
    fields["#firstName"] = first_name
    fields["#lastName"] = last_name

    for selector, value in fields.items():
        print(f"🌐 PayPal: 填写 {selector}")
        _clear_and_type(
            _wait_visible(driver, By.CSS_SELECTOR, selector, timeout=45),
            value,
        )

    print("🌐 PayPal: 设置账单州")
    _clear_and_type(
        _wait_visible(driver, By.CSS_SELECTOR, "#billingState", timeout=45),
        card.state,
    )

    print("☎️ PayPal: 等待短信验证码")
    sms_code = wait_for_paypal_sms_code(phone_key.sms_url, payment_cfg=payment_cfg)
    _try_fill_paypal_sms_code(driver, sms_code)

    if monitor_callback:
        monitor_callback(driver, "paypal_form_filled")

    print("🌐 PayPal: 点击最终提交按钮")
    _click_when_clickable(driver, By.CSS_SELECTOR, 'button[type="submit"]', timeout=45)
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
