"""
Codex OAuth 与 token 持久化服务。

职责:
  - 在账号注册完成后，通过纯 HTTP 协议登录并换取 Codex token
  - 将 access/refresh token 写入本地文件
  - 按配置上传 token JSON 到 CPA 面板
"""

from __future__ import annotations

import base64
import hashlib
import html
import json
import os
import queue
import random
import re
import secrets
import socket
import socketserver
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from datetime import datetime, timezone, timedelta
from typing import Callable
from urllib.parse import parse_qs, urlencode, urlparse, unquote

try:
    from curl_cffi import requests as curl_requests
    HAS_CURL_CFFI = True
except ImportError:
    import requests as curl_requests
    HAS_CURL_CFFI = False

from .config import EMAIL_WAIT_TIMEOUT, PROJECT_ROOT, cfg
from .utils import build_requests_proxies, ensure_proxy_ready

_print_lock = threading.Lock()
_TOKEN_EXPORT_TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")

_CHROME_PROFILES = [
    {
        "major": 131,
        "impersonate": "chrome131",
        "build": 6778,
        "patch_range": (69, 205),
        "sec_ch_ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    },
    {
        "major": 133,
        "impersonate": "chrome133a",
        "build": 6943,
        "patch_range": (33, 153),
        "sec_ch_ua": '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
    },
    {
        "major": 136,
        "impersonate": "chrome136",
        "build": 7103,
        "patch_range": (48, 175),
        "sec_ch_ua": '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
    },
    {
        "major": 142,
        "impersonate": "chrome142",
        "build": 7540,
        "patch_range": (30, 150),
        "sec_ch_ua": '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
    },
]


class NeedPhoneError(RuntimeError):
    """OAuth 登录需要绑定手机号。"""


class OAuthCallbackError(RuntimeError):
    """浏览器 OAuth callback 返回错误。"""


class EmailAlreadyVerifiedRestart(RuntimeError):
    """邮箱验证页提示已验证，需要关闭当前页面并重新开始 OAuth。"""


class _ReusableHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class LocalOAuthCallbackServer:
    def __init__(self, redirect_uri: str, expected_state: str):
        parsed = urlparse(redirect_uri)
        self.host = parsed.hostname or "localhost"
        self.port = parsed.port or (443 if parsed.scheme == "https" else 80)
        self.path = parsed.path or "/auth/callback"
        self.expected_state = expected_state
        self._queue: queue.Queue[dict] = queue.Queue(maxsize=1)
        self._server: _ReusableHTTPServer | None = None
        self._thread: threading.Thread | None = None

    def start(self):
        callback = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                parsed = urlparse(self.path)
                if parsed.path != callback.path:
                    self.send_error(404, "Not Found")
                    return

                params = _extract_callback_params(self.path)
                code = params.get("code", "").strip()
                state = params.get("state", "").strip()
                error = params.get("error", "").strip()
                error_description = params.get("error_description", "").strip()

                if state != callback.expected_state:
                    result = {
                        "error": "invalid_state",
                        "error_description": f"expected {callback.expected_state}, got {state}",
                        "state": state,
                    }
                    self._send_html(
                        400,
                        "Codex OAuth failed",
                        "State mismatch. You can close this tab.",
                    )
                elif error:
                    result = {
                        "error": error,
                        "error_description": error_description,
                        "state": state,
                    }
                    self._send_html(
                        400,
                        "Codex OAuth failed",
                        error_description or error,
                    )
                elif not code:
                    result = {
                        "error": "no_code",
                        "error_description": "No authorization code received",
                        "state": state,
                    }
                    self._send_html(
                        400,
                        "Codex OAuth failed",
                        "No authorization code received. You can close this tab.",
                    )
                else:
                    result = {"code": code, "state": state}
                    self._send_html(
                        200,
                        "Codex OAuth complete",
                        "Authentication finished. You can close this tab.",
                    )

                try:
                    callback._queue.put_nowait(result)
                except queue.Full:
                    pass

            def _send_html(self, status: int, title: str, message: str):
                body = (
                    '<!doctype html><html><head><meta charset="utf-8">'
                    f"<title>{html.escape(title)}</title>"
                    "<style>body{font-family:-apple-system,BlinkMacSystemFont,"
                    "Segoe UI,sans-serif;margin:48px;line-height:1.5}</style>"
                    "</head><body>"
                    f"<h1>{html.escape(title)}</h1>"
                    f"<p>{html.escape(message)}</p>"
                    "</body></html>"
                )
                raw = body.encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def log_message(self, fmt, *args):
                return

        bind_host = "127.0.0.1" if self.host in ("localhost", "127.0.0.1") else self.host
        self._server = _ReusableHTTPServer((bind_host, self.port), Handler)
        self._thread = threading.Thread(
            target=self._server.serve_forever,
            name="codex-oauth-callback",
            daemon=True,
        )
        self._thread.start()

    def wait(self, timeout: float):
        try:
            return self._queue.get(timeout=timeout)
        except queue.Empty:
            return None

    def poll(self):
        try:
            return self._queue.get_nowait()
        except queue.Empty:
            return None

    def stop(self):
        if self._server:
            self._server.shutdown()
            self._server.server_close()
            self._server = None
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
        self._thread = None


def _truncate(value, maxlen=500):
    text = str(value)
    return text[:maxlen] + f"...(共{len(text)}字符)" if len(text) > maxlen else text


def _request_kwargs(impersonate: str | None = None) -> dict:
    if impersonate and HAS_CURL_CFFI:
        return {"impersonate": impersonate}
    return {}


def _new_session(impersonate: str | None = None):
    if impersonate and HAS_CURL_CFFI:
        return curl_requests.Session(impersonate=impersonate)
    return curl_requests.Session()


def _random_chrome_version():
    profile = random.choice(_CHROME_PROFILES)
    patch = random.randint(*profile["patch_range"])
    full_ver = f'{profile["major"]}.0.{profile["build"]}.{patch}'
    ua = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        f"Chrome/{full_ver} Safari/537.36"
    )
    return profile["impersonate"], profile["major"], full_ver, ua, profile["sec_ch_ua"]


def _make_trace_headers():
    trace_id = random.randint(10**17, 10**18 - 1)
    parent_id = random.randint(10**17, 10**18 - 1)
    return {
        "traceparent": f"00-{uuid.uuid4().hex}-{format(parent_id, '016x')}-01",
        "tracestate": "dd=s:1;o:rum",
        "x-datadog-origin": "rum",
        "x-datadog-sampling-priority": "1",
        "x-datadog-trace-id": str(trace_id),
        "x-datadog-parent-id": str(parent_id),
    }


def _generate_pkce():
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(64)).rstrip(b"=").decode("ascii")
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def _extract_code_from_url(url: str):
    if not url or "code=" not in url:
        return None
    try:
        return parse_qs(urlparse(url).query).get("code", [None])[0]
    except Exception:
        return None


def _extract_callback_params(url: str) -> dict:
    try:
        parsed = urlparse(url or "")
        query = parse_qs(parsed.query)
    except Exception:
        return {}
    return {
        "code": (query.get("code") or [""])[0],
        "state": (query.get("state") or [""])[0],
        "error": (query.get("error") or [""])[0],
        "error_description": (query.get("error_description") or [""])[0],
    }


def _decode_jwt_payload(token: str):
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return {}
        payload = parts[1]
        pad = 4 - len(payload) % 4
        if pad != 4:
            payload += "=" * pad
        return json.loads(base64.urlsafe_b64decode(payload))
    except Exception:
        return {}


def _needs_email_otp(page_type: str, continue_url: str) -> bool:
    normalized_page_type = str(page_type or "").strip().lower().replace("-", "_")
    normalized_continue_url = str(continue_url or "").strip().lower().replace("_", "-")
    email_otp_page_types = {
        "email_otp",
        "email_otp_verification",
        "email_verification",
        "email_verify",
        "email_code",
        "otp_email",
        "mfa_email",
        "mfa_email_challenge",
    }
    email_otp_url_markers = (
        "email-verification",
        "email-verify",
        "verify-email",
        "email-otp",
        "otp-email",
        "email-code",
        "mfa-email",
    )
    return (
        normalized_page_type in email_otp_page_types
        or any(marker in normalized_continue_url for marker in email_otp_url_markers)
    )


def _needs_phone_verification(continue_url: str) -> bool:
    normalized_continue_url = str(continue_url or "").strip().lower().replace("_", "-")
    return "add-phone" in normalized_continue_url


def _has_usable_password(password: str | None) -> bool:
    normalized = str(password or "").strip()
    return bool(normalized) and normalized.upper() != "N/A"


def _resolve_path(path_value: str) -> str:
    if os.path.isabs(path_value):
        return path_value
    return os.path.join(PROJECT_ROOT, path_value)


def _resolve_output_path(path_value: str) -> str:
    configured_path = _resolve_path(path_value)
    base_dir = os.path.dirname(configured_path)
    filename = os.path.basename(configured_path)
    return os.path.join(base_dir, _TOKEN_EXPORT_TIMESTAMP, filename)


class SentinelTokenGenerator:
    MAX_ATTEMPTS = 500000
    ERROR_PREFIX = "wQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D"

    def __init__(self, device_id=None, user_agent=None):
        self.device_id = device_id or str(uuid.uuid4())
        self.user_agent = user_agent or (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/145.0.0.0 Safari/537.36"
        )
        self.requirements_seed = str(random.random())
        self.sid = str(uuid.uuid4())

    @staticmethod
    def _fnv1a_32(text: str):
        h = 2166136261
        for ch in text:
            h ^= ord(ch)
            h = (h * 16777619) & 0xFFFFFFFF
        h ^= h >> 16
        h = (h * 2246822507) & 0xFFFFFFFF
        h ^= h >> 13
        h = (h * 3266489909) & 0xFFFFFFFF
        h ^= h >> 16
        return format(h & 0xFFFFFFFF, "08x")

    def _get_config(self):
        now_str = time.strftime(
            "%a %b %d %Y %H:%M:%S GMT+0000 (Coordinated Universal Time)",
            time.gmtime(),
        )
        perf_now = random.uniform(1000, 50000)
        time_origin = time.time() * 1000 - perf_now
        nav_prop = random.choice(
            [
                "vendorSub",
                "productSub",
                "vendor",
                "maxTouchPoints",
                "scheduling",
                "userActivation",
                "doNotTrack",
                "geolocation",
                "connection",
                "plugins",
                "mimeTypes",
                "pdfViewerEnabled",
                "webkitTemporaryStorage",
                "webkitPersistentStorage",
                "hardwareConcurrency",
                "cookieEnabled",
                "credentials",
                "mediaDevices",
                "permissions",
                "locks",
                "ink",
            ]
        )
        nav_val = f"{nav_prop}-undefined"
        return [
            "1920x1080",
            now_str,
            4294705152,
            random.random(),
            self.user_agent,
            "https://sentinel.openai.com/sentinel/20260124ceb8/sdk.js",
            None,
            None,
            "en-US",
            "en-US,en",
            random.random(),
            nav_val,
            random.choice(["location", "implementation", "URL", "documentURI", "compatMode"]),
            random.choice(["Object", "Function", "Array", "Number", "parseFloat", "undefined"]),
            perf_now,
            self.sid,
            "",
            random.choice([4, 8, 12, 16]),
            time_origin,
        ]

    @staticmethod
    def _base64_encode(data):
        raw = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        return base64.b64encode(raw).decode("ascii")

    def _run_check(self, start_time, seed, difficulty, config, nonce):
        config[3] = nonce
        config[9] = round((time.time() - start_time) * 1000)
        data = self._base64_encode(config)
        hash_hex = self._fnv1a_32(seed + data)
        if hash_hex[: len(difficulty)] <= difficulty:
            return data + "~S"
        return None

    def generate_token(self, seed=None, difficulty=None):
        seed = seed if seed is not None else self.requirements_seed
        difficulty = str(difficulty or "0")
        start_time = time.time()
        config = self._get_config()
        for i in range(self.MAX_ATTEMPTS):
            result = self._run_check(start_time, seed, difficulty, config, i)
            if result:
                return "gAAAAAB" + result
        return "gAAAAAB" + self.ERROR_PREFIX + self._base64_encode(str(None))

    def generate_requirements_token(self):
        config = self._get_config()
        config[3] = 1
        config[9] = round(random.uniform(5, 50))
        return "gAAAAAC" + self._base64_encode(config)


def fetch_sentinel_challenge(session, device_id, flow="authorize_continue", user_agent=None, sec_ch_ua=None, impersonate=None):
    generator = SentinelTokenGenerator(device_id=device_id, user_agent=user_agent)
    headers = {
        "Content-Type": "text/plain;charset=UTF-8",
        "Referer": "https://sentinel.openai.com/backend-api/sentinel/frame.html",
        "Origin": "https://sentinel.openai.com",
        "User-Agent": user_agent or "Mozilla/5.0",
        "sec-ch-ua": sec_ch_ua or '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
    }
    body = {"p": generator.generate_requirements_token(), "id": device_id, "flow": flow}
    try:
        resp = session.post(
            "https://sentinel.openai.com/backend-api/sentinel/req",
            data=json.dumps(body),
            headers=headers,
            timeout=20,
            **_request_kwargs(impersonate),
        )
    except Exception:
        return None
    if resp.status_code != 200:
        return None
    try:
        return resp.json()
    except Exception:
        return None


def build_sentinel_token(session, device_id, flow="authorize_continue", user_agent=None, sec_ch_ua=None, impersonate=None):
    challenge = fetch_sentinel_challenge(
        session,
        device_id,
        flow=flow,
        user_agent=user_agent,
        sec_ch_ua=sec_ch_ua,
        impersonate=impersonate,
    )
    if not challenge:
        return None
    c_value = challenge.get("token", "")
    if not c_value:
        return None
    pow_data = challenge.get("proofofwork") or {}
    generator = SentinelTokenGenerator(device_id=device_id, user_agent=user_agent)
    if pow_data.get("required") and pow_data.get("seed"):
        p_value = generator.generate_token(
            seed=pow_data.get("seed"),
            difficulty=pow_data.get("difficulty", "0"),
        )
    else:
        p_value = generator.generate_requirements_token()
    return json.dumps(
        {"p": p_value, "t": "", "c": c_value, "id": device_id, "flow": flow},
        separators=(",", ":"),
    )


class BrowserCodexOAuthClient:
    GETEMAIL_COMPAT_PROVIDERS = {"getemail", "nnai"}

    def __init__(self, proxy: dict | None = None, headless: bool | None = None):
        self.proxy = proxy or {}
        self.headless = headless
        self.session = _new_session()
        proxies = build_requests_proxies(self.proxy)
        if proxies:
            self.session.proxies = proxies
        self.ua = (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
        )
        self.session.headers.update({"User-Agent": self.ua})

    def _print(self, message: str):
        with _print_lock:
            print(message)

    def _build_authorize_url(self, state: str, challenge: str) -> str:
        issuer = cfg.oauth.issuer.rstrip("/")
        params = {
            "client_id": cfg.oauth.client_id,
            "response_type": "code",
            "redirect_uri": cfg.oauth.redirect_uri,
            "scope": "openid email profile offline_access",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "prompt": "login",
            "id_token_add_organizations": "true",
            "codex_cli_simplified_flow": "true",
        }
        return f"{issuer}/oauth/authorize?{urlencode(params)}"

    def _exchange_code_for_tokens(self, code: str, verifier: str) -> dict:
        issuer = cfg.oauth.issuer.rstrip("/")
        token_url = f"{issuer}/oauth/token"
        self._print(f"[OAuth] 访问 token 交换地址: {token_url}")
        resp = self.session.post(
            token_url,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
                "User-Agent": self.ua,
            },
            data={
                "grant_type": "authorization_code",
                "client_id": cfg.oauth.client_id,
                "code": code,
                "redirect_uri": cfg.oauth.redirect_uri,
                "code_verifier": verifier,
            },
            timeout=60,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"token 交换失败: HTTP {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        if not data.get("access_token"):
            raise RuntimeError("token 响应缺少 access_token")
        return data

    def _poll_getemail_code(
        self,
        email: str,
        tried_codes: set[str],
        timeout_seconds: float,
        interval_seconds: float = 5,
    ) -> str | None:
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            try:
                url = f"https://getemail.nnai.website/api/code?email={email}&format=json"
                self._print(f"[OAuth] 访问验证码接口: {url}")
                resp = self.session.get(url, timeout=10)
                if resp.status_code == 200:
                    data = resp.json()
                    code = str(data.get("code") or "").strip()
                    if not code:
                        time.sleep(interval_seconds)
                        continue
                    if not code.isdigit() or len(code) != 6:
                        self._print(f"[OAuth] 忽略无效邮箱验证码 {code}")
                        time.sleep(interval_seconds)
                        continue
                    if code in tried_codes:
                        time.sleep(interval_seconds)
                        continue
                    tried_codes.add(code)
                    return code
            except Exception as exc:
                self._print(f"[OAuth] 获取验证码失败，继续等待: {exc}")
            time.sleep(interval_seconds)
        return None

    def _driver_current_url(self, driver) -> str:
        try:
            return str(driver.current_url or "")
        except Exception:
            return ""

    def _print_driver_url(self, driver, label: str):
        self._print(f"[OAuth][Selenium] {label}: {self._driver_current_url(driver) or 'N/A'}")

    def _callback_from_driver_url(self, driver, expected_state: str):
        params = _extract_callback_params(self._driver_current_url(driver))
        if not any(params.values()):
            return None
        if params.get("state") and params.get("state") != expected_state:
            return {
                "error": "invalid_state",
                "error_description": f"expected {expected_state}, got {params.get('state')}",
                "state": params.get("state"),
            }
        if params.get("error"):
            return params
        if params.get("code"):
            return {"code": params["code"], "state": params.get("state", "")}
        return None

    def _is_oauth_consent_url(self, url: str) -> bool:
        normalized = str(url or "").lower()
        return (
            "auth.openai.com/sign-in-with-chatgpt/codex/consent" in normalized
            or "/sign-in-with-chatgpt/codex/consent" in normalized
        )

    def _is_oauth_callback_or_consent_url(self, url: str) -> bool:
        normalized = str(url or "").lower()
        return self._is_oauth_consent_url(normalized) or "/auth/callback" in normalized

    def _is_need_phone_url(self, url: str) -> bool:
        return _needs_phone_verification(url)

    def _raise_if_need_phone_url(self, driver) -> None:
        current_url = self._driver_current_url(driver)
        if self._is_need_phone_url(current_url):
            self._print_driver_url(driver, "检测到手机号绑定页")
            raise NeedPhoneError("OAuth 阶段需要绑定手机号")

    def _click_continue_like_selenium(self, driver, monitor_callback=None) -> bool:
        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.action_chains import ActionChains
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.support.ui import WebDriverWait

        candidates = [
            (By.CSS_SELECTOR, "button[type='submit']"),
            (
                By.XPATH,
                '//button[contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "continue") '
                'or contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "next") '
                'or contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "confirm") '
                'or contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "verify") '
                'or contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "allow") '
                'or contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "authorize") '
                'or contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "log in") '
                'or contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "sign in") '
                'or contains(normalize-space(.), "继续") '
                'or contains(normalize-space(.), "下一步") '
                'or contains(normalize-space(.), "确定") '
                'or contains(normalize-space(.), "确认") '
                'or contains(normalize-space(.), "验证") '
                'or contains(normalize-space(.), "允许") '
                'or contains(normalize-space(.), "授权") '
                'or contains(normalize-space(.), "登录")]',
            ),
            (By.CSS_SELECTOR, "input[type='submit']"),
            (By.CSS_SELECTOR, "button"),
        ]

        for by, selector in candidates:
            try:
                button = WebDriverWait(driver, 5).until(
                    EC.element_to_be_clickable((by, selector))
                )
                self._print("[OAuth][Selenium] 准备点击继续/确认按钮，等待 1.5s")
                time.sleep(1.5)
                try:
                    ActionChains(driver).move_to_element(button).click().perform()
                except Exception:
                    driver.execute_script("arguments[0].click();", button)
                self._print("[OAuth][Selenium] 已点击继续/确认按钮")
                time.sleep(3)
                self._print_driver_url(driver, "点击后当前地址")
                return True
            except Exception:
                continue

        if monitor_callback:
            monitor_callback(driver, "oauth_continue_button_not_found")
        return False

    def _run_browser_flow(
        self,
        email: str,
        password: str | None,
        authorize_url: str,
        state: str,
        callback_server: LocalOAuthCallbackServer,
        monitor_callback=None,
    ) -> dict:
        from .browser import (
            create_driver,
            enter_verification_code,
            fill_login_form,
            is_email_already_verified_page,
            log_browser_egress_ip,
            open_chatgpt_url,
        )

        timeout_seconds = 300
        deadline = time.time() + timeout_seconds
        tried_codes: set[str] = set()
        driver = None

        def _report(step_name: str):
            if monitor_callback and driver:
                monitor_callback(driver, step_name)

        self._print(f"[OAuth][Selenium] 启动浏览器获取 JSON，等待 callback 最长 {timeout_seconds}s")
        self._print(f"[OAuth][Selenium] 访问授权地址: {authorize_url}")

        try:
            driver = create_driver(headless=self.headless, proxy=self.proxy)
            _report("oauth_init_browser")

            if self.proxy and self.proxy.get("enabled"):
                browser_proxy_diag = log_browser_egress_ip(driver)
                if not browser_proxy_diag.get("ok"):
                    raise RuntimeError(
                        f"浏览器代理出口检测失败: {browser_proxy_diag.get('reason', 'unknown_error')}"
                    )
                _report("oauth_proxy_ip_check")

            open_chatgpt_url(driver, authorize_url)
            time.sleep(3)
            self._print_driver_url(driver, "授权页打开后当前地址")
            _report("oauth_open_authorize_url")

            form_ok, password_entered = fill_login_form(
                driver,
                email,
                password or "",
                monitor_callback=monitor_callback,
                success_url_predicate=self._is_oauth_callback_or_consent_url,
            )
            if not form_ok:
                self._raise_if_need_phone_url(driver)
                raise RuntimeError("Selenium 登录表单填写失败")
            if not password_entered:
                self._print("[OAuth][Selenium] 未检测到密码输入，继续处理邮箱验证码页")
            self._print_driver_url(driver, "登录表单提交后当前地址")
            _report("oauth_fill_login_form")

            while time.time() < deadline:
                callback_result = callback_server.poll()
                if callback_result:
                    self._print(f"[OAuth][Selenium] callback server 收到结果: {callback_result}")
                    return callback_result

                result = self._callback_from_driver_url(driver, state)
                if result:
                    self._print_driver_url(driver, "页面 URL 已包含 callback 参数")
                    return result

                self._raise_if_need_phone_url(driver)

                if is_email_already_verified_page(driver):
                    self._print("[OAuth][Selenium] 邮箱验证页显示已验证，关闭页面后重新进行 OAuth 流程")
                    raise EmailAlreadyVerifiedRestart("email already verified")

                current_url = self._driver_current_url(driver)
                if self._is_oauth_consent_url(current_url):
                    self._print_driver_url(driver, "已进入 Codex 授权确认页")
                    if self._click_continue_like_selenium(
                        driver,
                        monitor_callback=monitor_callback,
                    ):
                        _report("oauth_click_consent_submit")
                        continue

                remaining = max(min(deadline - time.time(), 120), 1)
                self._print("[OAuth][Selenium] 等待邮箱验证码")
                code = self._poll_getemail_code(
                    email=email,
                    tried_codes=tried_codes,
                    timeout_seconds=remaining,
                )
                if not code:
                    break

                self._print(f"[OAuth][Selenium] 获取到验证码，准备输入: {code}")
                code_result = enter_verification_code(
                    driver,
                    code,
                    monitor_callback=monitor_callback,
                )
                if code_result == "retry_auth":
                    self._print("[OAuth][Selenium] 验证码页重试后回到邮箱输入页，重新执行登录表单")
                    form_ok, password_entered = fill_login_form(
                        driver,
                        email,
                        password or "",
                        monitor_callback=monitor_callback,
                        success_url_predicate=self._is_oauth_callback_or_consent_url,
                    )
                    if not form_ok:
                        self._raise_if_need_phone_url(driver)
                        raise RuntimeError("Selenium 登录表单重试失败")
                    if not password_entered:
                        self._print("[OAuth][Selenium] 重试登录后未检测到密码输入，继续处理邮箱验证码页")
                    self._print_driver_url(driver, "重试登录表单提交后当前地址")
                    _report("oauth_fill_login_form_retry")
                    continue
                if not code_result:
                    self._print("[OAuth][Selenium] 验证码输入/提交失败，继续等待新验证码")
                    continue
                self._print_driver_url(driver, "验证码提交后当前地址")
                _report("oauth_enter_code")

                for _ in range(20):
                    callback_result = callback_server.poll()
                    if callback_result:
                        self._print(f"[OAuth][Selenium] callback server 收到结果: {callback_result}")
                        return callback_result

                    result = self._callback_from_driver_url(driver, state)
                    if result:
                        self._print_driver_url(driver, "页面 URL 已包含 callback 参数")
                        return result
                    self._raise_if_need_phone_url(driver)
                    if is_email_already_verified_page(driver):
                        self._print("[OAuth][Selenium] 验证码提交后页面显示邮箱已验证，准备重新进行 OAuth 流程")
                        raise EmailAlreadyVerifiedRestart("email already verified")
                    if self._click_continue_like_selenium(
                        driver,
                        monitor_callback=monitor_callback,
                    ):
                        _report("oauth_click_continue")
                        result = self._callback_from_driver_url(driver, state)
                        if result:
                            self._print_driver_url(driver, "页面 URL 已包含 callback 参数")
                            return result
                        self._raise_if_need_phone_url(driver)
                    time.sleep(1)

            raise RuntimeError("等待 OAuth callback 超时")
        finally:
            if driver:
                try:
                    driver.quit()
                except Exception:
                    pass

    def perform_login(
        self,
        email: str,
        password: str | None,
        email_provider: str,
        mail_token: str | None = None,
        monitor_callback=None,
    ):
        normalized_provider = str(email_provider or "").strip().lower()
        if normalized_provider not in self.GETEMAIL_COMPAT_PROVIDERS:
            raise RuntimeError(f"浏览器 OAuth 暂仅支持 getemail/nnai provider: {email_provider}")
        if mail_token:
            self._print("[OAuth] 浏览器流程使用 NNAI/getemail API 获取验证码，已忽略邮箱 token")

        max_attempts = 2
        for attempt in range(1, max_attempts + 1):
            verifier, challenge = _generate_pkce()
            state = secrets.token_urlsafe(24)
            authorize_url = self._build_authorize_url(state, challenge)
            callback_server = LocalOAuthCallbackServer(cfg.oauth.redirect_uri, state)

            try:
                callback_server.start()
            except OSError as exc:
                if isinstance(exc, socket.error):
                    raise RuntimeError(
                        f"OAuth callback 端口不可用，请确认 {cfg.oauth.redirect_uri} 未被占用"
                    ) from exc
                raise

            try:
                result = self._run_browser_flow(
                    email=email,
                    password=password,
                    authorize_url=authorize_url,
                    state=state,
                    callback_server=callback_server,
                    monitor_callback=monitor_callback,
                )
                break
            except EmailAlreadyVerifiedRestart:
                if attempt >= max_attempts:
                    raise RuntimeError("邮箱验证页持续显示已验证，重新进行 OAuth 后仍未拿到 callback")
                self._print(f"[OAuth][Selenium] 重新开始 OAuth 流程（第 {attempt + 1}/{max_attempts} 次）")
                time.sleep(2)
                continue
            finally:
                callback_server.stop()

        error = (result or {}).get("error")
        if error:
            description = (result or {}).get("error_description") or error
            raise OAuthCallbackError(f"OAuth callback error: {description}")

        code = (result or {}).get("code", "").strip()
        result_state = (result or {}).get("state", "").strip()
        if not code:
            raise RuntimeError("OAuth callback 缺少 authorization code")
        if result_state != state:
            raise RuntimeError("OAuth callback state 不匹配")

        self._print("[OAuth] 已获取 authorization code，开始交换 token")
        data = self._exchange_code_for_tokens(code, verifier)
        self._print("[OAuth] token 交换成功")
        return data


class CodexOAuthClient:
    def __init__(self, proxy: dict | None = None):
        self.device_id = str(uuid.uuid4())
        self.auth_session_logging_id = str(uuid.uuid4())
        (
            self.impersonate,
            self.chrome_major,
            self.chrome_full,
            self.ua,
            self.sec_ch_ua,
        ) = _random_chrome_version()
        self.session = _new_session(self.impersonate)
        proxies = build_requests_proxies(proxy or {})
        if proxies:
            self.session.proxies = proxies
        self.session.headers.update(
            {
                "User-Agent": self.ua,
                "Accept-Language": random.choice(
                    [
                        "en-US,en;q=0.9",
                        "en-US,en;q=0.9,zh-CN;q=0.8",
                        "en,en-US;q=0.9",
                        "en-US,en;q=0.8",
                    ]
                ),
                "sec-ch-ua": self.sec_ch_ua,
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"Windows"',
                "sec-ch-ua-arch": '"x86"',
                "sec-ch-ua-bitness": '"64"',
                "sec-ch-ua-full-version": f'"{self.chrome_full}"',
                "sec-ch-ua-platform-version": f'"{random.randint(10, 15)}.0.0"',
            }
        )
        self.session.cookies.set("oai-did", self.device_id, domain="chatgpt.com")

    def _print(self, message: str):
        with _print_lock:
            print(message)

    def _oauth_json_headers(self, referer: str):
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Origin": cfg.oauth.issuer.rstrip("/"),
            "Referer": referer,
            "User-Agent": self.ua,
            "oai-device-id": self.device_id,
        }
        headers.update(_make_trace_headers())
        return headers

    def _bootstrap_oauth_session(self, authorize_url: str, authorize_params: dict):
        issuer = cfg.oauth.issuer.rstrip("/")
        try:
            resp = self.session.get(
                authorize_url,
                headers={
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Referer": "https://chatgpt.com/",
                    "Upgrade-Insecure-Requests": "1",
                    "User-Agent": self.ua,
                },
                allow_redirects=True,
                timeout=30,
                **_request_kwargs(self.impersonate),
            )
        except Exception as exc:
            self._print(f"[OAuth] /oauth/authorize 异常: {exc}")
            return "", False

        final_url = str(resp.url)
        has_login = any(getattr(cookie, "name", "") == "login_session" for cookie in self.session.cookies)
        if has_login:
            return final_url, True

        try:
            resp = self.session.get(
                f"{issuer}/api/oauth/oauth2/auth",
                params=authorize_params,
                headers={
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Referer": authorize_url,
                    "Upgrade-Insecure-Requests": "1",
                    "User-Agent": self.ua,
                },
                allow_redirects=True,
                timeout=30,
                **_request_kwargs(self.impersonate),
            )
            final_url = str(resp.url)
        except Exception as exc:
            self._print(f"[OAuth] /api/oauth/oauth2/auth 异常: {exc}")
            return "", False

        has_login = any(getattr(cookie, "name", "") == "login_session" for cookie in self.session.cookies)
        return final_url, has_login

    def _follow_for_code(self, start_url: str, referer: str | None = None, max_hops: int = 16):
        headers = {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Upgrade-Insecure-Requests": "1",
            "User-Agent": self.ua,
        }
        if referer:
            headers["Referer"] = referer
        current_url = start_url
        last_url = start_url
        issuer = cfg.oauth.issuer.rstrip("/")
        for _ in range(max_hops):
            try:
                resp = self.session.get(
                    current_url,
                    headers=headers,
                    allow_redirects=False,
                    timeout=30,
                    **_request_kwargs(self.impersonate),
                )
            except Exception as exc:
                maybe_localhost = re.search(r'(https?://localhost[^\s\'\"]+)', str(exc))
                if maybe_localhost:
                    code = _extract_code_from_url(maybe_localhost.group(1))
                    if code:
                        return code, maybe_localhost.group(1)
                return None, last_url

            last_url = str(resp.url)
            code = _extract_code_from_url(last_url)
            if code:
                return code, last_url

            if resp.status_code in (301, 302, 303, 307, 308):
                location = resp.headers.get("Location", "")
                if not location:
                    return None, last_url
                if location.startswith("/"):
                    location = f"{issuer}{location}"
                code = _extract_code_from_url(location)
                if code:
                    return code, location
                current_url = location
                headers["Referer"] = last_url
                continue
            return None, last_url
        return None, last_url

    def _decode_oauth_session_cookie(self):
        cookie_items = list(getattr(self.session.cookies, "jar", []) or [])
        for cookie in cookie_items:
            name = getattr(cookie, "name", "") or ""
            if "oai-client-auth-session" not in name:
                continue
            raw_value = (getattr(cookie, "value", "") or "").strip()
            if not raw_value:
                continue
            for candidate in [raw_value, unquote(raw_value)]:
                try:
                    value = candidate
                    if (value.startswith('"') and value.endswith('"')) or (
                        value.startswith("'") and value.endswith("'")
                    ):
                        value = value[1:-1]
                    value = value.split(".")[0] if "." in value else value
                    pad = 4 - len(value) % 4
                    if pad != 4:
                        value += "=" * pad
                    payload = json.loads(base64.urlsafe_b64decode(value).decode("utf-8"))
                    if isinstance(payload, dict):
                        return payload
                except Exception:
                    continue
        return None

    def _submit_workspace_and_org(self, consent_url: str):
        session_data = self._decode_oauth_session_cookie()
        if not session_data:
            return None
        workspaces = session_data.get("workspaces", [])
        if not workspaces:
            return None
        workspace_id = (workspaces[0] or {}).get("id")
        if not workspace_id:
            return None

        issuer = cfg.oauth.issuer.rstrip("/")
        headers = self._oauth_json_headers(consent_url)
        resp = self.session.post(
            f"{issuer}/api/accounts/workspace/select",
            json={"workspace_id": workspace_id},
            headers=headers,
            allow_redirects=False,
            timeout=30,
            **_request_kwargs(self.impersonate),
        )
        if resp.status_code in (301, 302, 303, 307, 308):
            location = resp.headers.get("Location", "")
            if location.startswith("/"):
                location = f"{issuer}{location}"
            code = _extract_code_from_url(location)
            if code:
                return code
            code, _ = self._follow_for_code(location, referer=consent_url)
            return code
        if resp.status_code != 200:
            return None

        try:
            payload = resp.json()
        except Exception:
            return None

        next_url = payload.get("continue_url", "")
        orgs = payload.get("data", {}).get("orgs", [])
        org_id = None
        project_id = None
        if orgs:
            org_id = (orgs[0] or {}).get("id")
            projects = (orgs[0] or {}).get("projects", [])
            if projects:
                project_id = (projects[0] or {}).get("id")

        if org_id:
            body = {"org_id": org_id}
            if project_id:
                body["project_id"] = project_id
            org_headers = dict(headers)
            if next_url:
                org_headers["Referer"] = next_url if next_url.startswith("http") else f"{issuer}{next_url}"
            resp = self.session.post(
                f"{issuer}/api/accounts/organization/select",
                json=body,
                headers=org_headers,
                allow_redirects=False,
                timeout=30,
                **_request_kwargs(self.impersonate),
            )
            if resp.status_code in (301, 302, 303, 307, 308):
                location = resp.headers.get("Location", "")
                if location.startswith("/"):
                    location = f"{issuer}{location}"
                code = _extract_code_from_url(location)
                if code:
                    return code
                code, _ = self._follow_for_code(location, referer=org_headers.get("Referer"))
                return code
            if resp.status_code == 200:
                try:
                    payload = resp.json()
                except Exception:
                    payload = {}
                next_url = payload.get("continue_url", "") or next_url

        if next_url:
            if next_url.startswith("/"):
                next_url = f"{issuer}{next_url}"
            code, _ = self._follow_for_code(next_url, referer=consent_url)
            return code
        return None

    def perform_login(self, email: str, password: str | None, email_provider: str, mail_token: str | None = None):
        issuer = cfg.oauth.issuer.rstrip("/")
        self.session.cookies.set("oai-did", self.device_id, domain=".auth.openai.com")
        self.session.cookies.set("oai-did", self.device_id, domain="auth.openai.com")

        verifier, challenge = _generate_pkce()
        state = secrets.token_urlsafe(24)
        authorize_params = {
            "response_type": "code",
            "client_id": cfg.oauth.client_id,
            "redirect_uri": cfg.oauth.redirect_uri,
            "scope": "openid profile email offline_access",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": state,
        }
        authorize_url = f"{issuer}/oauth/authorize?{urlencode(authorize_params)}"

        final_url, _ = self._bootstrap_oauth_session(authorize_url, authorize_params)
        if not final_url:
            raise RuntimeError("无法初始化 OAuth 会话")

        sentinel_authorize = build_sentinel_token(
            self.session,
            self.device_id,
            flow="authorize_continue",
            user_agent=self.ua,
            sec_ch_ua=self.sec_ch_ua,
            impersonate=self.impersonate,
        )
        if not sentinel_authorize:
            raise RuntimeError("无法获取 authorize_continue sentinel token")

        continue_headers = self._oauth_json_headers(
            final_url if final_url.startswith(issuer) else f"{issuer}/log-in"
        )
        continue_headers["openai-sentinel-token"] = sentinel_authorize
        resp_continue = self.session.post(
            f"{issuer}/api/accounts/authorize/continue",
            json={"username": {"kind": "email", "value": email}},
            headers=continue_headers,
            timeout=30,
            allow_redirects=False,
            **_request_kwargs(self.impersonate),
        )
        if resp_continue.status_code == 400 and "invalid_auth_step" in (getattr(resp_continue, "text", "") or ""):
            final_url, _ = self._bootstrap_oauth_session(authorize_url, authorize_params)
            if not final_url:
                raise RuntimeError("OAuth 会话失效且重试初始化失败")
            sentinel_authorize = build_sentinel_token(
                self.session,
                self.device_id,
                flow="authorize_continue",
                user_agent=self.ua,
                sec_ch_ua=self.sec_ch_ua,
                impersonate=self.impersonate,
            )
            if not sentinel_authorize:
                raise RuntimeError("重试时无法获取 authorize_continue sentinel token")
            continue_headers = self._oauth_json_headers(
                final_url if final_url.startswith(issuer) else f"{issuer}/log-in"
            )
            continue_headers["openai-sentinel-token"] = sentinel_authorize
            resp_continue = self.session.post(
                f"{issuer}/api/accounts/authorize/continue",
                json={"username": {"kind": "email", "value": email}},
                headers=continue_headers,
                timeout=30,
                allow_redirects=False,
                **_request_kwargs(self.impersonate),
            )
        if resp_continue.status_code != 200:
            raise RuntimeError(f"邮箱提交失败: HTTP {resp_continue.status_code}")

        continue_data = resp_continue.json()
        continue_url = continue_data.get("continue_url", "")
        page_type = (continue_data.get("page") or {}).get("type", "")
        self._print(f"[OAuth] 邮箱提交后 page_type={page_type or 'unknown'} continue_url={continue_url or 'N/A'}")

        has_password = _has_usable_password(password)
        need_email_otp = _needs_email_otp(page_type, continue_url)
        used_email_otp = False

        if not need_email_otp:
            if not has_password:
                raise RuntimeError(
                    f"账号未保存可用密码，且邮箱提交后未进入邮箱 OTP 分支（page_type={page_type or 'unknown'}）"
                )

            sentinel_pwd = build_sentinel_token(
                self.session,
                self.device_id,
                flow="password_verify",
                user_agent=self.ua,
                sec_ch_ua=self.sec_ch_ua,
                impersonate=self.impersonate,
            )
            if not sentinel_pwd:
                raise RuntimeError("无法获取 password_verify sentinel token")

            verify_headers = self._oauth_json_headers(f"{issuer}/log-in/password")
            verify_headers["openai-sentinel-token"] = sentinel_pwd
            resp_verify = self.session.post(
                f"{issuer}/api/accounts/password/verify",
                json={"password": password},
                headers=verify_headers,
                timeout=30,
                allow_redirects=False,
                **_request_kwargs(self.impersonate),
            )
            if resp_verify.status_code != 200:
                raise RuntimeError(f"密码校验失败: HTTP {resp_verify.status_code}")

            verify_data = resp_verify.json()
            continue_url = verify_data.get("continue_url", "") or continue_url
            page_type = (verify_data.get("page") or {}).get("type", "") or page_type
            self._print(f"[OAuth] 密码校验后 page_type={page_type or 'unknown'} continue_url={continue_url or 'N/A'}")
            need_email_otp = _needs_email_otp(page_type, continue_url)
        else:
            self._print("[OAuth] 检测到无密码邮箱 OTP 分支，跳过密码校验")

        if need_email_otp:
            used_email_otp = True
            if not mail_token:
                raise RuntimeError("OAuth 阶段需要邮箱 OTP，但缺少邮箱令牌")
            from . import email_providers

            otp_headers = self._oauth_json_headers(f"{issuer}/email-verification")
            otp_timeout = max(int(EMAIL_WAIT_TIMEOUT), 120)
            otp_deadline = time.time() + otp_timeout
            tried_codes = set()
            otp_ok = False

            self._print(f"[OAuth] 等待邮箱 OTP，provider={email_provider}，最长 {otp_timeout}s")
            while time.time() < otp_deadline and not otp_ok:
                codes = email_providers.list_verification_codes(email_provider, mail_token)
                candidate_codes = [code for code in codes if code and code not in tried_codes]
                if not candidate_codes:
                    time.sleep(2)
                    continue

                self._print(f"[OAuth] 收到 {len(candidate_codes)} 个待尝试 OTP")
                for otp_code in candidate_codes:
                    tried_codes.add(otp_code)
                    resp_otp = self.session.post(
                        f"{issuer}/api/accounts/email-otp/validate",
                        json={"code": otp_code},
                        headers=otp_headers,
                        timeout=30,
                        allow_redirects=False,
                        **_request_kwargs(self.impersonate),
                    )
                    if resp_otp.status_code != 200:
                        self._print(f"[OAuth] OTP {otp_code} 校验失败: HTTP {resp_otp.status_code}")
                        continue
                    otp_data = resp_otp.json()
                    continue_url = otp_data.get("continue_url", "") or continue_url
                    page_type = (otp_data.get("page") or {}).get("type", "") or page_type
                    otp_ok = True
                    self._print(f"[OAuth] OTP {otp_code} 校验成功")
                    if _needs_phone_verification(continue_url):
                        raise NeedPhoneError("OAuth 阶段需要绑定手机号")
                    break

            if not otp_ok:
                raise RuntimeError(f"OAuth 阶段未获取到有效 OTP（provider={email_provider}）")

        code = None
        consent_url = continue_url
        if consent_url and consent_url.startswith("/"):
            consent_url = f"{issuer}{consent_url}"
        if consent_url:
            code = _extract_code_from_url(consent_url)
        follow_referer = f"{issuer}/email-verification" if used_email_otp else f"{issuer}/log-in/password"
        if not code and consent_url:
            code, _ = self._follow_for_code(consent_url, referer=follow_referer)
        if not code:
            fallback = consent_url or f"{issuer}/sign-in-with-chatgpt/codex/consent"
            code = self._submit_workspace_and_org(fallback)
        if not code:
            raise RuntimeError("未获取到 authorization code")

        token_resp = self.session.post(
            f"{issuer}/oauth/token",
            headers={"Content-Type": "application/x-www-form-urlencoded", "User-Agent": self.ua},
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": cfg.oauth.redirect_uri,
                "client_id": cfg.oauth.client_id,
                "code_verifier": verifier,
            },
            timeout=60,
            **_request_kwargs(self.impersonate),
        )
        if token_resp.status_code != 200:
            raise RuntimeError(f"token 交换失败: HTTP {token_resp.status_code}")
        data = token_resp.json()
        if not data.get("access_token"):
            raise RuntimeError("token 响应缺少 access_token")
        return data


def poll_oauth_otp_code(email_provider: str, mail_token: str, timeout: int = 120):
    from . import email_providers

    deadline = time.time() + timeout
    tried_codes = set()
    while time.time() < deadline:
        codes = email_providers.list_verification_codes(email_provider, mail_token)
        fresh_codes = [code for code in codes if code and code not in tried_codes]
        if fresh_codes:
            return fresh_codes[0]
        time.sleep(2)
    return None


def upload_token_json(filepath: str, cpa_cfg=None, proxy: dict | None = None, session_factory: Callable | None = None):
    cpa_cfg = cpa_cfg or cfg.cpa
    if not cpa_cfg.upload_api_url:
        return None
    if not cpa_cfg.upload_api_token:
        print("⚠️ 未配置 CPA 管理 key，已跳过上传")
        return None

    session = session_factory() if session_factory else _new_session()
    proxies = build_requests_proxies(proxy or {})
    if proxies:
        session.proxies = proxies

    if HAS_CURL_CFFI and session_factory is None:
        from curl_cffi import CurlMime

        multipart = CurlMime()
        try:
            multipart.addpart(
                name="file",
                filename=os.path.basename(filepath),
                content_type="application/json",
                local_path=filepath,
            )
            resp = session.post(
                cpa_cfg.upload_api_url,
                multipart=multipart,
                headers={"Authorization": f"Bearer {cpa_cfg.upload_api_token}"},
                timeout=30,
                verify=False,
            )
        finally:
            multipart.close()
    else:
        with open(filepath, "rb") as handle:
            files = {"file": (os.path.basename(filepath), handle, "application/json")}
            resp = session.post(
                cpa_cfg.upload_api_url,
                files=files,
                headers={"Authorization": f"Bearer {cpa_cfg.upload_api_token}"},
                timeout=30,
                verify=False,
            )

    if resp.status_code != 200:
        raise RuntimeError(f"CPA 上传失败: HTTP {resp.status_code} - {resp.text[:200]}")
    return resp


# ── CLIProxyAPI Token 池接入 ────────────────────────────────────────


def _cliproxy_file_name(email: str) -> str:
    safe = email.replace("@", "_").replace(".", "_")
    return f"token_{safe}_{int(time.time())}.json"


def _upload_to_cliproxy(token_data: dict, cliproxy_cfg=None):
    """
    将 Codex Token 上传到 CLIProxyAPI token 池。
    优先 HTTP POST（需要 CLIPROXY_API_KEY），失败则直接写 auth dir 文件。
    """
    cliproxy_cfg = cliproxy_cfg or cfg.cliproxy
    cliproxy_api_url = (getattr(cliproxy_cfg, "api_url", "") or "http://localhost:8317").rstrip("/")
    cliproxy_api_key = getattr(cliproxy_cfg, "api_key", "") or ""
    cliproxy_upload_url = f"{cliproxy_api_url}/v0/management/auth-files"
    cliproxy_auth_dir = os.path.expanduser(
        getattr(cliproxy_cfg, "auth_dir", "") or "~/.cli-proxy-api"
    )

    email = token_data.get("email", "")
    file_name = _cliproxy_file_name(email)

    # 方式 1: HTTP POST（需要 API Key）
    if cliproxy_api_key:
        try:
            resp = curl_requests.post(
                cliproxy_upload_url,
                params={"name": file_name, "provider": "codex"},
                json=token_data,
                headers={
                    "Authorization": f"Bearer {cliproxy_api_key}",
                    "Content-Type": "application/json",
                },
                timeout=15,
            )
            if resp.status_code == 200:
                print(f"  ✅ CLIProxyAPI: Token 已加入池 ({email})")
                return True
            print(f"  ⚠️ CLIProxyAPI HTTP: {resp.status_code} {resp.text[:80]}")
        except Exception as e:
            print(f"  ⚠️ CLIProxyAPI 连接失败: {e}")

    # 方式 2: 直接写 auth dir 文件（watcher 自动检测）
    try:
        os.makedirs(cliproxy_auth_dir, exist_ok=True)
        file_path = os.path.join(cliproxy_auth_dir, file_name)
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(token_data, f, ensure_ascii=False, indent=2)
        print(f"  ✅ CLIProxyAPI: Token 文件已写入 {file_path}（watcher 自动加载）")
        return True
    except Exception as e:
        print(f"  ❌ CLIProxyAPI 文件写入失败: {e}")
        return False


# ────────────────────────────────────────────────────────────────────

def save_codex_tokens(
    email: str,
    tokens: dict,
    oauth_cfg=None,
    cpa_cfg=None,
    cliproxy_cfg=None,
    proxy: dict | None = None,
    session_factory: Callable | None = None,
):
    oauth_cfg = oauth_cfg or cfg.oauth
    cpa_cfg = cpa_cfg or cfg.cpa
    cliproxy_cfg = cliproxy_cfg or cfg.cliproxy
    access_token = tokens.get("access_token", "")
    refresh_token = tokens.get("refresh_token", "")
    id_token = tokens.get("id_token", "")

    if not access_token:
        raise ValueError("缺少 access_token，无法保存")

    token_dir = _resolve_path(oauth_cfg.token_json_dir)
    ak_path = _resolve_output_path(oauth_cfg.ak_file)
    rk_path = _resolve_output_path(oauth_cfg.rk_file)

    os.makedirs(os.path.dirname(ak_path) or ".", exist_ok=True)
    os.makedirs(os.path.dirname(rk_path) or ".", exist_ok=True)
    os.makedirs(token_dir, exist_ok=True)

    with open(ak_path, "a", encoding="utf-8") as handle:
        handle.write(f"{access_token}\n")

    if refresh_token:
        with open(rk_path, "a", encoding="utf-8") as handle:
            handle.write(f"{refresh_token}\n")

    payload = _decode_jwt_payload(access_token)
    auth_info = payload.get("https://api.openai.com/auth", {})
    account_id = auth_info.get("chatgpt_account_id", "")

    exp_timestamp = payload.get("exp")
    expired_str = ""
    if isinstance(exp_timestamp, int) and exp_timestamp > 0:
        exp_dt = datetime.fromtimestamp(exp_timestamp, tz=timezone(timedelta(hours=8)))
        expired_str = exp_dt.strftime("%Y-%m-%dT%H:%M:%S+08:00")

    now = datetime.now(tz=timezone(timedelta(hours=8)))
    token_data = {
        "type": "codex",
        "email": email,
        "expired": expired_str,
        "id_token": id_token,
        "account_id": account_id,
        "access_token": access_token,
        "last_refresh": now.strftime("%Y-%m-%dT%H:%M:%S+08:00"),
        "refresh_token": refresh_token,
    }

    token_path = os.path.join(token_dir, f"codex-{email}.json")
    with open(token_path, "w", encoding="utf-8") as handle:
        json.dump(token_data, handle, ensure_ascii=False)

    if cpa_cfg.upload_api_url:
        try:
            upload_token_json(
                token_path,
                cpa_cfg=cpa_cfg,
                proxy=proxy,
                session_factory=session_factory,
            )
        except Exception as exc:
            print(f"⚠️ CPA 上传失败，但本地 token 已保存: {exc}")

    # ── 自动推送到 CLIProxyAPI token 池 ──────────────────────
    if getattr(cliproxy_cfg, "enabled", False):
        try:
            _upload_to_cliproxy(token_data, cliproxy_cfg=cliproxy_cfg)
        except Exception as exc:
            print(f"⚠️ CLIProxyAPI 上传失败: {exc}")
    # ──────────────────────────────────────────────────────────

    return token_path


def perform_codex_oauth_login(email: str, password: str, email_provider: str, mail_token: str | None = None, proxy: dict | None = None):
    if proxy and proxy.get("enabled"):
        ensure_proxy_ready(proxy, purpose="OAuth 代理预检", timeout=10)
    client = CodexOAuthClient(proxy=proxy)
    return client.perform_login(
        email=email,
        password=password,
        email_provider=email_provider,
        mail_token=mail_token,
    )


def perform_browser_codex_oauth_login(
    email: str,
    password: str,
    email_provider: str = "getemail",
    mail_token: str | None = None,
    proxy: dict | None = None,
    headless: bool | None = None,
    monitor_callback=None,
):
    if proxy and proxy.get("enabled"):
        ensure_proxy_ready(proxy, purpose="浏览器 OAuth 代理预检", timeout=10)
    client = BrowserCodexOAuthClient(proxy=proxy, headless=headless)
    return client.perform_login(
        email=email,
        password=password,
        email_provider=email_provider,
        mail_token=mail_token,
        monitor_callback=monitor_callback,
    )
