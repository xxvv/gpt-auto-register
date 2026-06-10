from __future__ import annotations

import dataclasses
import json
import random
import re
import string
import time
from datetime import date
from typing import Any, Callable
from urllib.parse import urlparse

import requests
from selenium import webdriver
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait


ROXY_API_BASE = "http://127.0.0.1:50000"
DEFAULT_PASSWORD = "Bb02911ss"
SMS_POLL_INTERVAL_SECONDS = 3
SMS_POLL_TIMEOUT_SECONDS = 90


LogFn = Callable[[str], None]
StopFn = Callable[[], bool]


@dataclasses.dataclass(frozen=True)
class PhoneTask:
    phone: str
    sms_url: str
    raw: str


@dataclasses.dataclass(frozen=True)
class GeneratedIdentity:
    card_number: str
    expiry_month: str
    expiry_year: str
    expiry_display: str
    cvv: str
    first_name: str
    last_name: str
    full_name: str
    address: str
    city: str
    state: str
    postcode: str
    country: str = "US"
    password: str = DEFAULT_PASSWORD
    date_of_birth: str = ""
    country_specific_first_name: str = ""
    country_specific_last_name: str = ""


def parse_url_queue(text: str) -> list[str]:
    urls = []
    for line in str(text or "").splitlines():
        value = line.strip()
        if value:
            urls.append(value)
    return urls


def parse_phone_line(line: str) -> PhoneTask | None:
    raw = str(line or "").strip()
    if not raw:
        return None
    if "----" in raw:
        phone, sms_url = raw.split("----", 1)
    elif "|" in raw:
        phone, sms_url = raw.split("|", 1)
    else:
        return None
    phone = re.sub(r"[^\d+]", "", phone.strip())
    sms_url = sms_url.strip()
    if not phone or not sms_url:
        return None
    parsed = urlparse(sms_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return PhoneTask(phone=phone, sms_url=sms_url, raw=raw)


def parse_phone_tasks(text: str) -> list[PhoneTask]:
    tasks = []
    for line in str(text or "").splitlines():
        task = parse_phone_line(line)
        if task:
            tasks.append(task)
    return tasks


def extract_sms_code(text: str) -> str:
    body = str(text or "")
    try:
        parsed = json.loads(body)
    except Exception:
        parsed = None
    if parsed is not None:
        flattened = json.dumps(parsed, ensure_ascii=False)
        match = re.search(r"(?<!\d)(\d{6})(?!\d)", flattened)
        return match.group(1) if match else ""
    match = re.search(r"(?<!\d)(\d{6})(?!\d)", body)
    return match.group(1) if match else ""


def calculate_luhn_check_digit(body: str) -> str:
    digits = re.sub(r"\D+", "", body)
    if not digits:
        raise ValueError("card body is empty")
    total = 0
    should_double = True
    for raw_digit in reversed(digits):
        digit = int(raw_digit)
        if should_double:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
        should_double = not should_double
    return str((10 - (total % 10)) % 10)


def is_luhn_valid(card_number: str) -> bool:
    digits = re.sub(r"\D+", "", card_number)
    if len(digits) < 2:
        return False
    return calculate_luhn_check_digit(digits[:-1]) == digits[-1]


def generate_luhn_card_number() -> str:
    prefixes = ["4", "51", "52", "53", "54", "55"]
    prefix = random.choice(prefixes)
    body = prefix + "".join(random.choice(string.digits) for _ in range(15 - len(prefix)))
    return body + calculate_luhn_check_digit(body)


def generate_paypal_email() -> str:
    today = date.today()
    alphabet = string.ascii_lowercase + string.digits
    suffix = "".join(random.choice(alphabet) for _ in range(12))
    return f"{today.month:02d}{today.day:02d}{suffix}@gmail.com"


def generate_identity() -> GeneratedIdentity:
    first_names = ["James", "Emma", "Liam", "Olivia", "Noah", "Ava", "Mia", "Lucas"]
    last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Miller"]
    addresses = [
        ("350 5th Ave", "New York", "NY", "10001"),
        ("1 Market St", "San Francisco", "CA", "94105"),
        ("233 S Wacker Dr", "Chicago", "IL", "60606"),
        ("401 Congress Ave", "Austin", "TX", "78701"),
        ("1201 3rd Ave", "Seattle", "WA", "98101"),
    ]
    first_name = random.choice(first_names)
    last_name = random.choice(last_names)
    address, city, state, postcode = random.choice(addresses)
    month = random.randint(1, 12)
    current_year = date.today().year
    year = current_year + random.randint(2, 5)
    return GeneratedIdentity(
        card_number=generate_luhn_card_number(),
        expiry_month=f"{month:02d}",
        expiry_year=str(year),
        expiry_display=f"{month:02d}/{str(year)[-2:]}",
        cvv=f"{random.randint(0, 999):03d}",
        first_name=first_name,
        last_name=last_name,
        full_name=f"{first_name} {last_name}",
        address=address,
        city=city,
        state=state,
        postcode=postcode,
    )


def generate_japan_signup_identity() -> GeneratedIdentity:
    month = random.randint(1, 12)
    current_year = date.today().year
    year = current_year + random.randint(2, 5)
    return GeneratedIdentity(
        card_number=generate_luhn_card_number(),
        expiry_month=f"{month:02d}",
        expiry_year=str(year),
        expiry_display=f"{month:02d}/{str(year)[-2:]}",
        cvv=f"{random.randint(100, 999)}",
        first_name="タロウ",
        last_name="ヤマダ",
        full_name="ミン リー",
        address="渋谷2丁目21番1号",
        city="京都市",
        state="京都府",
        postcode="150-0002",
        country="JP",
        date_of_birth="1991/10/28",
        country_specific_first_name="ミン",
        country_specific_last_name="リー",
    )


class RoxyClient:
    def __init__(
        self,
        token: str,
        *,
        base_url: str = ROXY_API_BASE,
        session: requests.Session | None = None,
    ) -> None:
        self.token = str(token or "").strip()
        self.base_url = base_url.rstrip("/")
        self.session = session or requests.Session()
        if not self.token:
            raise ValueError("Roxy Token 不能为空")

    def _headers(self) -> dict[str, str]:
        return {"token": self.token, "Content-Type": "application/json"}

    def health(self) -> dict[str, Any]:
        response = self.session.get(
            f"{self.base_url}/health",
            headers={"token": self.token},
            timeout=10,
        )
        response.raise_for_status()
        return _response_json(response)

    def open_browser(self, window_id: str, workspace_id: int | str | None = None) -> dict[str, str]:
        dir_id = str(window_id or "").strip()
        if not dir_id:
            raise ValueError("窗口 ID 不能为空")
        self.clear_local_cache(dir_id)
        self.clear_server_cache(dir_id, workspace_id)
        response = self.session.post(
            f"{self.base_url}/browser/open",
            headers=self._headers(),
            json={"dirId": dir_id},
            timeout=60,
        )
        response.raise_for_status()
        payload = _response_json(response)
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, dict):
            data = payload if isinstance(payload, dict) else {}
        debugger_address = str(data.get("http") or data.get("debuggerAddress") or "").strip()
        driver_path = str(data.get("driver") or data.get("driverPath") or "").strip()
        if not debugger_address or not driver_path:
            raise RuntimeError(f"Roxy /browser/open 响应缺少 http 或 driver: {payload}")
        return {"debugger_address": debugger_address, "driver_path": driver_path}

    def clear_local_cache(self, window_id: str) -> dict[str, Any]:
        dir_id = str(window_id or "").strip()
        if not dir_id:
            raise ValueError("窗口 ID 不能为空")
        response = self.session.post(
            f"{self.base_url}/browser/clear_local_cache",
            headers=self._headers(),
            json={"dirIds": [dir_id]},
            timeout=60,
        )
        response.raise_for_status()
        payload = _response_json(response)
        if isinstance(payload, dict) and payload.get("code") not in (None, 0):
            raise RuntimeError(f"Roxy 清空窗口本地缓存失败: {payload}")
        return payload

    def clear_server_cache(self, window_id: str, workspace_id: int | str | None = None) -> dict[str, Any]:
        dir_id = str(window_id or "").strip()
        if not dir_id:
            raise ValueError("窗口 ID 不能为空")
        resolved_workspace_id = self._resolve_workspace_id(dir_id, workspace_id)
        response = self.session.post(
            f"{self.base_url}/browser/clear_server_cache",
            headers=self._headers(),
            json={"workspaceId": resolved_workspace_id, "dirIds": [dir_id]},
            timeout=60,
        )
        response.raise_for_status()
        payload = _response_json(response)
        if isinstance(payload, dict) and payload.get("code") not in (None, 0):
            raise RuntimeError(f"Roxy 清空窗口服务器缓存失败: {payload}")
        return payload

    def _resolve_workspace_id(self, window_id: str, workspace_id: int | str | None) -> int:
        if workspace_id not in (None, ""):
            try:
                return int(workspace_id)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"工作空间 ID 无效: {workspace_id}") from exc
        for candidate in self.list_workspace_ids():
            if self.workspace_has_window(candidate, window_id):
                return candidate
        raise RuntimeError("清空窗口服务器缓存需要工作空间 ID，且自动发现失败")

    def list_workspace_ids(self) -> list[int]:
        response = self.session.get(
            f"{self.base_url}/browser/workspace",
            headers={"token": self.token},
            params={"page_index": 1, "page_size": 200},
            timeout=30,
        )
        response.raise_for_status()
        payload = _response_json(response)
        rows = (((payload or {}).get("data") or {}).get("rows") or [])
        ids = []
        for row in rows:
            try:
                ids.append(int(row.get("id")))
            except Exception:
                continue
        return ids

    def workspace_has_window(self, workspace_id: int, window_id: str) -> bool:
        response = self.session.get(
            f"{self.base_url}/browser/list_v3",
            headers={"token": self.token},
            params={
                "workspaceId": workspace_id,
                "dirIds": window_id,
                "page_index": 1,
                "page_size": 1,
            },
            timeout=30,
        )
        response.raise_for_status()
        payload = _response_json(response)
        rows = (((payload or {}).get("data") or {}).get("rows") or [])
        return any(str(row.get("dirId") or "").strip() == str(window_id).strip() for row in rows)


def create_roxy_driver(open_info: dict[str, str]):
    options = webdriver.ChromeOptions()
    options.add_experimental_option("debuggerAddress", open_info["debugger_address"])
    service = Service(executable_path=open_info["driver_path"])
    driver = webdriver.Chrome(service=service, options=options)
    driver.set_page_load_timeout(45)
    return driver


class PayPalStep4Automation:
    def __init__(
        self,
        driver,
        *,
        log: LogFn | None = None,
        stop_requested: StopFn | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.driver = driver
        self.log = log or (lambda _message: None)
        self.stop_requested = stop_requested or (lambda: False)
        self.sleep = sleep

    def run(self, start_url: str, phone_task: PhoneTask) -> dict[str, Any]:
        self._check_stop()
        email = generate_paypal_email()
        identity = generate_japan_signup_identity()
        self.log(f"打开 URL: {start_url}")
        self.driver.get(start_url)
        self.log(f"Navigation complete, current URL: {self._current_url() or '(empty)'}")
        self._wait_document_ready(45)
        self._short_delay()
        self._run_login_page(email)
        self._run_signup_page(email, phone_task, identity)
        return {"ok": True, "email": email, "phone": phone_task.phone}

    def _run_login_page(self, email: str) -> None:
        self.log("步骤4: 等待进入 paypal.com")
        self._wait_url_prefix("https://www.paypal.com", 30)
        self._short_delay()
        self.log("开始找点击按钮")
        clicked_entry_button = self._click_any(
            [
                "#createAccount",
                "#startOnboardingFlow",
                'button[data-atomic-wait-intent="Pay_With_Card"]',
            ],
            timeout=5,
            required=False,
            label="PayPal 创建账号/银行卡按钮",
        )
        if clicked_entry_button:
            self.log("步骤4: 已点击创建账号/银行卡按钮")
            self._short_delay()
        else:
            self.log("步骤4: 未找到创建账号/银行卡按钮，继续查找下一步逻辑")
        paypal_login_email_selectors = [
            "#login_email",
            "#onboardingFlowEmail",
            'input[name="email"]',
        ]
        self.log(f"步骤4: 开始填充 PayPal 邮箱 {email}")
        if self._fill_first(paypal_login_email_selectors, email, timeout=10, type_text=True, required=False):
            self.log(f"步骤4: 已输入 PayPal 邮箱 {email}")
            self._short_delay()
            self._click_paypal_next_button(timeout=30, required=False)
        else:
            self.log("步骤4: 未找到登录邮箱输入框，继续等待 signup")

    def _run_signup_page(self, email: str, phone_task: PhoneTask, identity: GeneratedIdentity) -> None:
        self.log("步骤5: 等待 PayPal signup 页面")
        self._wait_url_prefix("https://www.paypal.com/checkoutweb/signup", 120)
        self._fill_signup_form(email, phone_task.phone, identity)
        self._short_delay()
        baseline = self._fetch_current_sms(phone_task)
        self.log(f"提交前短信验证码基线: {baseline or 'null'}")
        self._click_any(['button[type="submit"]'], timeout=30, label="signup 提交按钮")
        try:
            self._wait_selector("#ci-ciBasic-0", 10)
        except TimeoutException:
            self.log("步骤5: 10秒内未找到短信验证码输入框，重新生成卡片并再次提交")
            identity = self._regenerate_signup_card(identity)
            self._fill_signup_card_fields(identity)
            self._short_delay()
            baseline = self._fetch_current_sms(phone_task)
            self.log(f"重新提交前短信验证码基线: {baseline or 'null'}")
            self._click_any(['button[type="submit"]'], timeout=30, label="signup 重新提交按钮")
            self._wait_selector("#ci-ciBasic-0", 120)
        self._short_delay()
        sms_code = self._poll_new_sms_code(phone_task, baseline)
        self.log(f"步骤5: 准备输入短信 {sms_code}")
        self._fill_otp(sms_code)
        self.log(f"步骤5: 短信验证码已输入 {sms_code}")
        self._finish_consent_or_return()

    def _fill_signup_form(self, email: str, phone: str, identity: GeneratedIdentity) -> None:
        self.log("步骤5: 使用 v2 日本 signup 填充")
        country_result = self._set_select_if_needed(["#country", "#billingCountry"], identity.country, timeout=60)
        if country_result.get("changed"):
            self.log(f"步骤5: 国家已改为 {identity.country}，等待页面刷新")
            self._short_delay()
        else:
            self.log(f"步骤5: 国家为 {identity.country} 不用修改")
        self._fill_first(["#email"], email, timeout=30)
        self._fill_first(["#phone", 'input[type="tel"]', 'input[autocomplete="tel"]'], phone, timeout=30)
        field_map = [
            (["#cardNumber", "#cardnumber", 'input[name="cardNumber"]', 'input[autocomplete="cc-number"]'], identity.card_number),
            (["#cardExpiry", "#cardExpiration", 'input[name="cardExpiry"]', 'input[autocomplete="cc-exp"]'], identity.expiry_display),
            (["#cardCvv", "#cardCvc", "#cvv", "#cvc", 'input[autocomplete="cc-csc"]'], identity.cvv),
            (["#billingName", 'input[name="billingName"]', 'input[autocomplete="cc-name"]'], identity.full_name),
            (["#firstName"], identity.first_name),
            (["#lastName"], identity.last_name),
            (["#billingLine1", "#billingAddressLine1", 'input[name="addressLine1"]', 'input[autocomplete="billing address-line1"]'], identity.address),
            (["#billingCity", "#billingLocality", 'input[name="city"]', 'input[autocomplete="billing address-level2"]'], identity.city),
            (
                [
                    "#billingState",
                    "#billingAdministrativeArea",
                    'input[name="billingState"]',
                    'select[name="billingState"]',
                    'input[name="billingAdministrativeArea"]',
                    'select[name="billingAdministrativeArea"]',
                    'select[name="state"]',
                    'input[name="state"]',
                ],
                identity.state,
            ),
            (["#billingPostalCode", "#postalCode", "#zip", 'input[name="postalCode"]', 'input[autocomplete="billing postal-code"]'], identity.postcode),
            (["#dateOfBirth", 'input[name="dateOfBirth"]', 'input[autocomplete="bday"]'], identity.date_of_birth),
            (["#countrySpecificFirstName", 'input[name="countrySpecificFirstName"]'], identity.country_specific_first_name),
            (["#countrySpecificLastName", 'input[name="countrySpecificLastName"]'], identity.country_specific_last_name),
            (["#password", 'input[type="password"]'], identity.password),
        ]
        filled = 0
        missing = []
        for selectors, value in field_map:
            result = self._set_value_by_selector(", ".join(selectors), value, timeout=4)
            if result.get("ok"):
                filled += 1
            else:
                missing.append(f"{selectors[0]}={result.get('error') or result}")
        if missing:
            self.log(f"步骤5: 已填充 signup 表单字段 {filled} 项，未找到/未填入: {', '.join(missing)}")
        else:
            self.log(f"步骤5: 已填充 signup 表单字段 {filled} 项")

    def _regenerate_signup_card(self, identity: GeneratedIdentity) -> GeneratedIdentity:
        month = random.randint(1, 12)
        year = date.today().year + random.randint(2, 5)
        return dataclasses.replace(
            identity,
            card_number=generate_luhn_card_number(),
            expiry_month=f"{month:02d}",
            expiry_year=str(year),
            expiry_display=f"{month:02d}/{str(year)[-2:]}",
            cvv=f"{random.randint(100, 999)}",
        )

    def _fill_signup_card_fields(self, identity: GeneratedIdentity) -> None:
        field_map = [
            (["#cardNumber", "#cardnumber", 'input[name="cardNumber"]', 'input[autocomplete="cc-number"]'], identity.card_number),
            (["#cardExpiry", "#cardExpiration", 'input[name="cardExpiry"]', 'input[autocomplete="cc-exp"]'], identity.expiry_display),
            (["#cardCvv", "#cardCvc", "#cvv", "#cvc", 'input[autocomplete="cc-csc"]'], identity.cvv),
        ]
        filled = 0
        missing = []
        for selectors, value in field_map:
            result = self._set_value_by_selector(", ".join(selectors), value, timeout=10)
            if result.get("ok"):
                filled += 1
            else:
                missing.append(f"{selectors[0]}={result.get('error') or result}")
        if missing:
            raise TimeoutException(f"重新填写卡片字段失败: {', '.join(missing)}")
        self.log(f"步骤5: 已重新填写卡片字段 {filled} 项")

    def _finish_consent_or_return(self) -> None:
        self.log("等待 PayPal 授权或 ChatGPT 回跳")
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            self._check_stop()
            current_url = self._find_url_matching(
                lambda url: _url_host_matches(url, "chatgpt.com") or _paypal_path_startswith(url, "/checkoutweb/genericError")
                or _paypal_path_startswith(url, "/checkoutweb/billingwithoutpurchase"),
                switch=True,
            ) or self._current_url()
            if _url_host_matches(current_url, "chatgpt.com"):
                self.log(f"支付流程成功，已返回 ChatGPT: {current_url}")
                return
            if _paypal_path_startswith(current_url, "/checkoutweb/genericError"):
                raise RuntimeError(f"PayPal 支付失败，进入错误页面: {current_url}")
            if _paypal_path_startswith(current_url, "/checkoutweb/billingwithoutpurchase"):
                if self._click_any(["#consentButton"], timeout=10, required=False, label="PayPal 授权按钮"):
                    self.log("已点击 PayPal 授权按钮")
            if self._click_any(["#modalClose"], timeout=2, required=False, label="PayPal 中间页关闭按钮"):
                self.log("已点击 PayPal 中间页关闭按钮")
            self.sleep(1)
        raise TimeoutError("等待 PayPal 授权结果超时")

    def _poll_new_sms_code(self, phone_task: PhoneTask, baseline: str) -> str:
        deadline = time.monotonic() + SMS_POLL_TIMEOUT_SECONDS
        attempt = 0
        while time.monotonic() < deadline:
            self._check_stop()
            attempt += 1
            code = self._fetch_current_sms(phone_task)
            if code and code != baseline:
                return code
            self.log(f"第 {attempt} 次未取到新短信码，继续轮询")
            self.sleep(SMS_POLL_INTERVAL_SECONDS)
        raise TimeoutError("获取短信验证码失败，90 秒内没有新 6 位验证码")

    def _fetch_current_sms(self, phone_task: PhoneTask) -> str:
        try:
            response = requests.get(
                phone_task.sms_url,
                headers={"Accept": "text/plain,application/json,text/html,*/*"},
                timeout=15,
            )
            body = response.text
            if not response.ok:
                self.log(f"短信接口 HTTP {response.status_code}: {body[:120]}")
                return ""
            return extract_sms_code(body)
        except Exception as exc:
            self.log(f"短信接口请求失败: {exc}")
            return ""

    def _fill_otp(self, code: str) -> None:
        selectors = [f"#ci-ciBasic-{index}" for index in range(6)]
        for selector, digit in zip(selectors, code):
            self._fill_first([selector], digit, timeout=30)

    def _wait_url_prefix(self, prefix: str, timeout: float) -> str:
        deadline = time.monotonic() + timeout
        last_urls = []
        last_logged = ""
        while time.monotonic() < deadline:
            self._check_stop()
            current = self._current_url()
            if _url_matches_prefix(current, prefix):
                self.log(f"Matched current page: {current}")
                return current
            matched = self._find_url_matching(lambda url: _url_matches_prefix(url, prefix), switch=True)
            if matched:
                self.log(f"已识别页面: {matched}")
                return matched
            last_urls = [current] if current else self._visible_urls()
            visible_text = "; ".join(last_urls) if last_urls else "(未获取到 URL)"
            if visible_text != last_logged:
                self.log(f"等待 URL {prefix}，当前获取到: {visible_text}")
                last_logged = visible_text
            self.sleep(1)
        detail = "; ".join(last_urls[-5:])
        raise TimeoutError(f"等待 URL 超时: {prefix}{'，当前可见 URL: ' + detail if detail else ''}")

    def _current_url(self) -> str:
        try:
            return str(getattr(self.driver, "current_url", "") or "")
        except Exception:
            return ""

    def _visible_urls(self) -> list[str]:
        urls = []
        try:
            current_handle = self.driver.current_window_handle
        except Exception:
            current_handle = None
        try:
            handles = list(self.driver.window_handles)
        except Exception:
            handles = []
        if not handles:
            current = self._current_url()
            return [current] if current else []
        for handle in handles:
            try:
                self.driver.switch_to.window(handle)
                current = self._current_url()
                if current:
                    urls.append(current)
            except Exception:
                continue
        if current_handle:
            try:
                self.driver.switch_to.window(current_handle)
            except Exception:
                pass
        return urls

    def _find_url_matching(self, predicate: Callable[[str], bool], *, switch: bool) -> str:
        try:
            current_handle = self.driver.current_window_handle
        except Exception:
            current_handle = None
        current = self._current_url()
        if current and predicate(current):
            return current
        try:
            handles = list(self.driver.window_handles)
        except Exception:
            handles = []
        if not handles:
            return current if predicate(current) else ""
        for handle in handles:
            if current_handle and handle == current_handle:
                continue
            try:
                self.driver.switch_to.window(handle)
                current = self._current_url()
                if current.startswith("devtools://"):
                    continue
                if predicate(current):
                    if not switch and current_handle:
                        self.driver.switch_to.window(current_handle)
                    return current
            except Exception:
                continue
        if current_handle:
            try:
                self.driver.switch_to.window(current_handle)
            except Exception:
                pass
        return ""

    def _wait_document_ready(self, timeout: float) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            self._check_stop()
            try:
                if self.driver.execute_script("return document.readyState") == "complete":
                    return
            except Exception:
                pass
            self.sleep(0.5)

    def _wait_selector(self, selector: str, timeout: float):
        self._check_stop()
        return WebDriverWait(self.driver, timeout).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, selector))
        )

    def _click_any(self, selectors: list[str], *, timeout: float, label: str, required: bool = True) -> bool:
        deadline = time.monotonic() + timeout
        last_error = ""
        while time.monotonic() < deadline:
            self._check_stop()
            for selector in selectors:
                try:
                    element = WebDriverWait(self.driver, 1).until(
                        EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
                    )
                    if not self._click_element(element, label=label, selector=selector):
                        continue
                    return True
                except Exception as exc:
                    last_error = str(exc)
            self.sleep(0.3)
        if required:
            raise TimeoutException(f"未找到{label}: {', '.join(selectors)} {last_error}")
        return False

    def _click_element(self, element, *, label: str, selector: str = "") -> bool:
        before_url = self._current_url()
        target = f"{label}{' ' + selector if selector else ''}"
        try:
            self.driver.execute_script(
                """
                const element = arguments[0];
                element.scrollIntoView({ block: 'center' });
                element.click();
                """,
                element,
            )
            self.log(f"已点击 {target}")
            return True
        except Exception as exc:
            after_url = self._current_url()
            if after_url and after_url != before_url:
                self.log(f"已触发点击并跳转 {target}: {after_url}")
                return True
            self.log(f"点击失败 {target}: {exc}")
            return False

    def _click_paypal_next_button(self, *, timeout: float, required: bool = True) -> bool:
        selectors = [
            "#btnNext",
            "#emailSubmitButton",
            "#loginEmailSubmit",
            "#onboardingFlowSubmit",
            'button[data-testid="submit-button"]',
            'button[type="submit"]',
            'input[type="submit"]',
        ]
        if self._click_any(selectors, timeout=3, required=False, label="PayPal 下一步按钮"):
            self.log("步骤4: 已点击 PayPal 下一步按钮")
            return True

        deadline = time.monotonic() + max(0, timeout - 3)
        last_error = ""
        keywords = ("next", "continue", "下一步", "继续")
        while time.monotonic() < deadline:
            self._check_stop()
            try:
                elements = self.driver.find_elements(By.CSS_SELECTOR, "button, input[type='button'], input[type='submit']")
                for element in elements:
                    if not element.is_displayed() or not element.is_enabled():
                        continue
                    label_text = " ".join(
                        str(value or "").strip()
                        for value in (
                            element.text,
                            element.get_attribute("value"),
                            element.get_attribute("aria-label"),
                            element.get_attribute("name"),
                            element.get_attribute("id"),
                        )
                    ).lower()
                    if not any(keyword in label_text for keyword in keywords):
                        continue
                    if not self._click_element(element, label="PayPal 下一步按钮", selector=label_text):
                        continue
                    self.log("步骤4: 已点击 PayPal 下一步按钮")
                    return True
            except Exception as exc:
                last_error = str(exc)
            self.sleep(0.3)
        if required:
            raise TimeoutException(f"未找到 PayPal 下一步按钮 {last_error}")
        self.log("步骤4: 未找到 PayPal 下一步按钮，继续等待 signup")
        return False

    def _fill_first(
        self,
        selectors: list[str],
        value: str,
        *,
        timeout: float,
        type_text: bool = False,
        required: bool = True,
    ) -> bool:
        selector = ", ".join(selectors)
        result = self._set_value_by_selector(selector, value, timeout=timeout, type_text=type_text)
        if result.get("ok"):
            return True
        if required:
            raise TimeoutException(
                f"未找到或未填入输入字段: {', '.join(selectors)} {result.get('error') or result}"
            )
        return False

    def _set_select_if_needed(self, selectors: list[str], value: str, *, timeout: float) -> dict[str, Any]:
        selector = ", ".join(selectors)
        self._check_stop()
        try:
            self.driver.set_script_timeout(max(5, timeout + 5))
        except Exception:
            pass
        try:
            result = self.driver.execute_async_script(
                """
                const selector = String(arguments[0] || "");
                const rawValue = arguments[1];
                const timeoutMs = Number(arguments[2] || 10000);
                const done = arguments[arguments.length - 1];
                const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

                function getValueSetter(element) {
                  if (element instanceof HTMLSelectElement) {
                    return Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
                  }
                  return Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
                }

                function setNativeValue(element, nextValue) {
                  const text = String(nextValue || "");
                  if (element instanceof HTMLSelectElement) {
                    const option = Array.from(element.options).find((item) =>
                      String(item.value || "").toLowerCase() === text.toLowerCase() ||
                      String(item.textContent || "").trim().toLowerCase() === text.toLowerCase()
                    );
                    element.value = option ? option.value : text;
                  } else {
                    const descriptor = getValueSetter(element);
                    if (descriptor && descriptor.set) {
                      descriptor.set.call(element, text);
                    } else {
                      element.value = text;
                    }
                  }
                  element.dispatchEvent(new Event("input", { bubbles: true }));
                  element.dispatchEvent(new Event("change", { bubbles: true }));
                }

                function isUsable(element) {
                  if (!element || element.disabled) {
                    return false;
                  }
                  const style = window.getComputedStyle(element);
                  if (style.display === "none" || style.visibility === "hidden") {
                    return false;
                  }
                  const rect = element.getBoundingClientRect();
                  return rect.width > 0 && rect.height > 0;
                }

                (async () => {
                  const started = Date.now();
                  let element = null;
                  while (Date.now() - started < timeoutMs) {
                    element = Array.from(document.querySelectorAll(selector)).find(isUsable) || null;
                    if (element) break;
                    await delay(300);
                  }
                  if (!element) {
                    done({ ok: false, selector, changed: false, error: `Element not found: ${selector}` });
                    return;
                  }
                  const value = String(rawValue || "");
                  const currentValue = String(element.value || "");
                  if (currentValue.toLowerCase() === value.toLowerCase()) {
                    done({ ok: true, selector, changed: false, value: currentValue });
                    return;
                  }
                  element.focus();
                  setNativeValue(element, value);
                  element.blur();
                  done({ ok: true, selector, changed: true, value: String(element.value || "") });
                })().catch((error) => {
                  done({ ok: false, selector, changed: false, error: error && error.message ? error.message : String(error) });
                });
                """,
                selector,
                value,
                int(timeout * 1000),
            )
        except Exception as exc:
            result = {"ok": False, "selector": selector, "changed": False, "error": str(exc)}
        if not isinstance(result, dict) or not result.get("ok"):
            raise TimeoutException(f"未找到国家字段: {selector} {result}")
        return result

    def _set_value_by_selector(
        self,
        selector: str,
        value: str,
        *,
        timeout: float,
        type_text: bool = False,
    ) -> dict[str, Any]:
        self._check_stop()
        try:
            self.driver.set_script_timeout(max(5, timeout + 5))
        except Exception:
            pass
        try:
            result = self.driver.execute_async_script(
                """
                const selector = String(arguments[0] || "");
                const rawValue = arguments[1];
                const timeoutMs = Number(arguments[2] || 10000);
                const typeText = Boolean(arguments[3]);
                const done = arguments[arguments.length - 1];
                const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

                function getValueSetter(element) {
                  if (element instanceof HTMLTextAreaElement) {
                    return Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
                  }
                  if (element instanceof HTMLSelectElement) {
                    return Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
                  }
                  return Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
                }

                function setNativeValue(element, nextValue) {
                  const text = String(nextValue || "");
                  if (element instanceof HTMLSelectElement) {
                    const option = Array.from(element.options).find((item) =>
                      String(item.value || "").toLowerCase() === text.toLowerCase() ||
                      String(item.textContent || "").trim().toLowerCase() === text.toLowerCase()
                    );
                    element.value = option ? option.value : text;
                    element.dispatchEvent(new Event("input", { bubbles: true }));
                    element.dispatchEvent(new Event("change", { bubbles: true }));
                    return;
                  }
                  const descriptor = getValueSetter(element);
                  if (descriptor && descriptor.set) {
                    descriptor.set.call(element, text);
                  } else {
                    element.value = text;
                  }
                  element.dispatchEvent(new Event("input", { bubbles: true }));
                }

                function isUsable(element) {
                  if (!element || element.disabled || element.readOnly) {
                    return false;
                  }
                  const style = window.getComputedStyle(element);
                  if (style.display === "none" || style.visibility === "hidden") {
                    return false;
                  }
                  const rect = element.getBoundingClientRect();
                  return rect.width > 0 && rect.height > 0;
                }

                function firstUsableElement() {
                  return Array.from(document.querySelectorAll(selector)).find(isUsable) || null;
                }

                function dispatchTypingKeyEvent(element, type, ch) {
                  try {
                    element.dispatchEvent(new KeyboardEvent(type, {
                      key: ch,
                      code: ch.length === 1 && /^[a-z0-9]$/i.test(ch) ? `Key${ch.toUpperCase()}` : "",
                      bubbles: true,
                      cancelable: true
                    }));
                  } catch (_) {
                    element.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
                  }
                }

                async function typeNativeValue(element, nextValue) {
                  const text = String(nextValue || "");
                  element.focus();
                  setNativeValue(element, "");
                  for (const ch of text) {
                    dispatchTypingKeyEvent(element, "keydown", ch);
                    dispatchTypingKeyEvent(element, "keypress", ch);
                    let shouldInsert = true;
                    try {
                      shouldInsert = element.dispatchEvent(new InputEvent("beforeinput", {
                        bubbles: true,
                        cancelable: true,
                        inputType: "insertText",
                        data: ch
                      }));
                    } catch (_) {}
                    if (shouldInsert) {
                      const descriptor = getValueSetter(element);
                      const currentValue = String(element.value || "");
                      if (descriptor && descriptor.set) {
                        descriptor.set.call(element, currentValue + ch);
                      } else {
                        element.value = currentValue + ch;
                      }
                      try {
                        element.dispatchEvent(new InputEvent("input", {
                          bubbles: true,
                          inputType: "insertText",
                          data: ch
                        }));
                      } catch (_) {
                        element.dispatchEvent(new Event("input", { bubbles: true }));
                      }
                    }
                    dispatchTypingKeyEvent(element, "keyup", ch);
                    await delay(20);
                  }
                  element.dispatchEvent(new Event("change", { bubbles: true }));
                  element.blur();
                }

                (async () => {
                  const started = Date.now();
                  let element = null;
                  while (Date.now() - started < timeoutMs) {
                    element = firstUsableElement();
                    if (element) {
                      break;
                    }
                    await delay(300);
                  }
                  if (!element) {
                    done({ ok: false, selector, error: `Element not found: ${selector}` });
                    return;
                  }
                  try {
                    element.scrollIntoView({ block: "center" });
                  } catch (_) {}
                  const text = String(rawValue || "");
                  if (typeText && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
                    await typeNativeValue(element, text);
                  } else {
                    element.focus();
                    setNativeValue(element, text);
                    element.dispatchEvent(new Event("change", { bubbles: true }));
                    element.blur();
                  }
                  const current = String(element.value || "");
                  const compactCurrent = current.replace(/\\s+/g, "");
                  const compactTarget = text.replace(/\\s+/g, "");
                  const ok = text === "" || current === text || compactCurrent === compactTarget || current.trim() !== "";
                  done({ ok, selector, value: current, expected: text });
                })().catch((error) => {
                  done({ ok: false, selector, error: error && error.message ? error.message : String(error) });
                });
                """,
                selector,
                value,
                int(timeout * 1000),
                bool(type_text),
            )
        except Exception as exc:
            return {"ok": False, "selector": selector, "error": str(exc)}
        return result if isinstance(result, dict) else {"ok": bool(result), "selector": selector, "value": result}

    def _set_element_value(self, element, value: str) -> None:
        self.driver.execute_script(
            """
            const element = arguments[0];
            const value = arguments[1];
            const descriptor = Object.getOwnPropertyDescriptor(element.__proto__, 'value')
              || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
              || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
            if (descriptor && descriptor.set) {
              descriptor.set.call(element, value);
            } else {
              element.value = value;
            }
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            """,
            element,
            value,
        )

    def _element_value(self, element) -> str:
        try:
            return str(element.get_attribute("value") or "")
        except Exception:
            return ""

    def _select_or_fill(
        self,
        selectors: list[str],
        value: str,
        *,
        timeout: float,
        required: bool = True,
    ) -> bool:
        return self._fill_first(selectors, value, timeout=timeout, required=required)

    def _short_delay(self) -> None:
        self.sleep(random.uniform(1.0, 2.0))

    def _check_stop(self) -> None:
        if self.stop_requested():
            raise RuntimeError("任务已停止")


def run_url_task(
    *,
    token: str,
    workspace_id: int | str | None = None,
    window_id: str,
    url: str,
    phone_task: PhoneTask,
    log: LogFn,
    stop_requested: StopFn,
) -> dict[str, Any]:
    client = RoxyClient(token)
    log("清空 Roxy 窗口本地/服务器缓存并调用 /browser/open")
    open_info = client.open_browser(window_id, workspace_id)
    driver = create_roxy_driver(open_info)
    try:
        automation = PayPalStep4Automation(driver, log=log, stop_requested=stop_requested)
        return automation.run(url, phone_task)
    except WebDriverException as exc:
        raise RuntimeError(f"Selenium 执行失败: {exc}") from exc


def _response_json(response) -> dict[str, Any]:
    try:
        return response.json()
    except Exception:
        return {"raw": getattr(response, "text", "")}


def _select_value(select: Select, value: str) -> bool:
    target = str(value or "").strip()
    if not target:
        return False
    for method in (select.select_by_value, select.select_by_visible_text):
        try:
            method(target)
            return True
        except Exception:
            pass
    upper_target = target.upper()
    for option in select.options:
        option_value = str(option.get_attribute("value") or "").strip().upper()
        option_text = str(option.text or "").strip().upper()
        if option_value == upper_target or option_text == upper_target:
            option.click()
            return True
    return False


def _url_matches_prefix(url: str, prefix: str) -> bool:
    value = str(url or "")
    expected = str(prefix or "")
    if value.startswith(expected):
        return True
    parsed_prefix = urlparse(expected)
    if parsed_prefix.netloc.endswith("paypal.com"):
        return _url_host_matches(value, "paypal.com") and _parsed_path(value).startswith(parsed_prefix.path or "/")
    if parsed_prefix.netloc:
        return _url_host_matches(value, parsed_prefix.netloc) and _parsed_path(value).startswith(parsed_prefix.path or "/")
    return False


def _url_host_matches(url: str, host: str) -> bool:
    try:
        parsed = urlparse(str(url or ""))
    except Exception:
        return False
    actual = parsed.netloc.lower().split("@")[-1].split(":")[0]
    expected = str(host or "").lower()
    return actual == expected or actual.endswith("." + expected)


def _paypal_path_startswith(url: str, path: str) -> bool:
    return _url_host_matches(url, "paypal.com") and _parsed_path(url).startswith(path)


def _parsed_path(url: str) -> str:
    try:
        return urlparse(str(url or "")).path or "/"
    except Exception:
        return "/"
