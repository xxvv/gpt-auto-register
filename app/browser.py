"""
浏览器自动化模块 - ChatGPT 注册流程
"""

import io
import os
import random
import re
import socket
import ssl
import struct
import subprocess
import tempfile
import threading
import time
import zipfile
from datetime import date
from urllib.error import URLError
import undetected_chromedriver as uc
from selenium.common.exceptions import NoSuchWindowException, TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains

from .config import (
    MAX_WAIT_TIME,
    SHORT_WAIT_TIME,
    ERROR_PAGE_MAX_RETRIES,
    BUTTON_CLICK_MAX_RETRIES,
)
from .utils import (
    OPENAI_PROXY_TARGET_URLS,
    ensure_proxy_ready,
    format_probe_location,
    generate_user_info,
    lookup_ip_geolocation,
)

CHATGPT_HOME_URL = "https://chatgpt.com/"
CHATGPT_LOGIN_URL = "https://chatgpt.com/auth/login"

_PASSWORD_INPUT_SELECTORS = [
    (By.CSS_SELECTOR, 'input[autocomplete="new-password"]'),
    (By.CSS_SELECTOR, 'input[name="password"]'),
    (By.CSS_SELECTOR, 'input[type="password"]'),
]
_VERIFICATION_INPUT_SELECTORS = [
    (By.CSS_SELECTOR, 'input[name="code"]'),
    (By.CSS_SELECTOR, 'input[name*="code"]'),
    (By.CSS_SELECTOR, 'input[autocomplete="one-time-code"]'),
    (By.CSS_SELECTOR, 'input[placeholder*="代码"]'),
    (By.CSS_SELECTOR, 'input[placeholder*="验证码"]'),
    (By.CSS_SELECTOR, 'input[placeholder*="code" i]'),
    (By.CSS_SELECTOR, 'input[aria-label*="代码"]'),
    (By.CSS_SELECTOR, 'input[aria-label*="验证码"]'),
    (By.CSS_SELECTOR, 'input[aria-label*="code" i]'),
]
_VERIFICATION_URL_TOKENS = [
    "email-verification",
    "email-otp",
    "enter-code",
    "/code",
]
_VERIFICATION_TEXT_MARKERS = [
    "检查您的收件箱",
    "验证您的邮箱",
    "验证邮箱",
    "check your inbox",
    "verify your email",
    "we sent a code",
    "enter the code we sent",
]


def _page_text(driver) -> str:
    try:
        return (driver.page_source or "").lower()
    except Exception:
        return ""


def _visible_body_text(driver) -> str:
    try:
        body = driver.find_element(By.TAG_NAME, "body")
        return (body.text or "").lower()
    except Exception:
        return _page_text(driver)


def _find_visible_elements(driver, selectors):
    visible_elements = []
    for by, selector in selectors:
        try:
            elements = driver.find_elements(by, selector)
        except Exception:
            continue
        for element in elements:
            try:
                if element.is_displayed():
                    visible_elements.append(element)
            except Exception:
                continue
        if visible_elements:
            return visible_elements
    return visible_elements


def _is_email_verification_page(driver, require_visible_input: bool = False) -> bool:
    verification_inputs = _find_visible_elements(driver, _VERIFICATION_INPUT_SELECTORS)
    if verification_inputs:
        return True

    otp_boxes = _find_visible_elements(
        driver,
        [
            (
                By.CSS_SELECTOR,
                'input[inputmode="numeric"], input[autocomplete="one-time-code"], input[maxlength="1"]',
            )
        ],
    )
    if len(otp_boxes) >= 4:
        return True

    try:
        current_url = (driver.current_url or "").lower()
    except Exception:
        current_url = ""

    has_verification_url = any(
        token in current_url for token in _VERIFICATION_URL_TOKENS
    )
    body_text = _visible_body_text(driver)
    has_verification_text = any(
        marker in body_text for marker in _VERIFICATION_TEXT_MARKERS
    )

    if require_visible_input:
        return has_verification_url and has_verification_text

    return has_verification_text or (has_verification_url and has_verification_text)


def _wait_for_post_email_step(driver, timeout: int = 10, monitor_callback=None) -> str:
    end_time = time.time() + timeout
    print(f"🔀 等待密码或验证码页面...（最长 {timeout}s）")
    verification_hits = 0
    while time.time() < end_time:
        password_inputs = _find_visible_elements(driver, _PASSWORD_INPUT_SELECTORS)
        if password_inputs:
            print("✅ 检测到密码页，继续输入密码")
            return "password"

        if _is_email_verification_page(driver, require_visible_input=True):
            verification_hits += 1
            if verification_hits >= 3:
                print("✅ 连续检测到邮箱验证码页")
                return "verification"
        else:
            verification_hits = 0

        _sleep_with_heartbeat(
            driver,
            0.5,
            monitor_callback=monitor_callback,
            step_name="post_email_step_wait",
            interval=0.5,
        )

    if verification_hits:
        print("⚠️ 邮箱提交后只检测到验证码页，未出现密码输入框")
        return "verification"
    print("❌ 邮箱提交后未识别到密码页或验证码页")
    return "unknown"


def _visible_password_input(driver):
    password_inputs = _find_visible_elements(driver, _PASSWORD_INPUT_SELECTORS)
    if password_inputs:
        return password_inputs[0]
    return None


def _wait_for_visible_password_input(driver, timeout: int = 30, monitor_callback=None):
    end_time = time.time() + timeout
    while time.time() < end_time:
        password_input = _visible_password_input(driver)
        if password_input:
            return password_input

        _sleep_with_heartbeat(
            driver,
            0.5,
            monitor_callback=monitor_callback,
            step_name="password_input_wait",
            interval=0.5,
        )

    raise RuntimeError("未找到密码输入框")


def _wait_for_password_input_or_verification(
    driver, timeout: int = 30, monitor_callback=None
):
    end_time = time.time() + timeout
    verification_hits = 0
    while time.time() < end_time:
        password_input = _visible_password_input(driver)
        if password_input:
            return "password", password_input

        if _is_email_verification_page(driver, require_visible_input=True):
            verification_hits += 1
            if verification_hits >= 2:
                print("✅ 当前已进入邮箱验证码页，跳过密码输入")
                return "verification", None
        else:
            verification_hits = 0

        _sleep_with_heartbeat(
            driver,
            0.5,
            monitor_callback=monitor_callback,
            step_name="password_or_verification_wait",
            interval=0.5,
        )

    return "unknown", None


def _wait_for_password_submit_result(
    driver, timeout: int = 30, monitor_callback=None
) -> str:
    end_time = time.time() + timeout
    verification_hits = 0
    password_hits = 0
    print(f"📬 等待密码提交结果...（最长 {timeout}s）")

    while time.time() < end_time:
        if check_and_handle_error(driver, monitor_callback=monitor_callback):
            print("↩️ 密码提交后检测到错误页，将重新输入密码")
            return "retry_password"

        if _visible_password_input(driver):
            password_hits += 1
            if password_hits >= 3:
                print("↩️ 检测到密码输入框，将重新确认密码并继续")
                return "retry_password"
        else:
            password_hits = 0

        if _is_email_verification_page(driver):
            verification_hits += 1
            if verification_hits >= 2:
                print("✅ 已进入邮箱验证码页")
                return "verification"
        else:
            verification_hits = 0

        _sleep_with_heartbeat(
            driver,
            0.5,
            monitor_callback=monitor_callback,
            step_name="password_submit_result_wait",
            interval=0.5,
        )

    print("❌ 密码提交后未进入邮箱验证码页")
    return "unknown"


def _click_signup_or_login_entry(driver) -> bool:
    print("🔍 检查是否需要点击 注册/登录 按钮...")
    try:
        signup_btns = driver.find_elements(
            By.XPATH,
            '//button[contains(., "Sign up")] | //button[contains(., "注册")] | //div[contains(text(), "Sign up")] | //div[contains(text(), "注册")]',
        )
        login_btns = driver.find_elements(
            By.XPATH,
            '//button[contains(., "Log in")] | //button[contains(., "登录")] | //div[contains(text(), "Log in")] | //div[contains(text(), "登录")]',
        )

        target_btn = None
        if signup_btns:
            target_btn = signup_btns[0]
            print("  -> 找到 注册(Sign up) 按钮")
        elif login_btns:
            target_btn = login_btns[0]
            print("  -> 找到 登录(Log in) 按钮")

        if target_btn and target_btn.is_displayed():
            driver.execute_script("arguments[0].click();", target_btn)
            print("  ✅ 已点击入口按钮")
            time.sleep(3)
            return True
    except Exception as e:
        print(f"  ⚠️ 检查入口按钮时出错 (非致命): {e}")

    return False


def _wait_for_signup_email_input(
    driver,
    timeout: int = MAX_WAIT_TIME,
    refresh_after_attempts: int = 2,
    monitor_callback=None,
):
    end_time = time.time() + timeout
    failure_count = 0
    email_selectors = [
        (
            By.CSS_SELECTOR,
            'input[type="email"], input[name="email"], input[autocomplete="email"]',
        )
    ]

    while time.time() < end_time:
        email_inputs = _find_visible_elements(driver, email_selectors)
        if email_inputs:
            return email_inputs[0]

        failure_count += 1
        if failure_count >= max(1, refresh_after_attempts):
            print("🔄 连续两次未找到邮箱输入框，刷新页面后继续等待...")
            driver.refresh()
            failure_count = 0
            _sleep_with_heartbeat(
                driver,
                random.randint(5, 8),
                monitor_callback=monitor_callback,
                step_name="signup_email_input_refresh_wait",
            )
            _click_signup_or_login_entry(driver)
        else:
            _sleep_with_heartbeat(
                driver,
                1,
                monitor_callback=monitor_callback,
                step_name="signup_email_input_wait",
            )

    raise RuntimeError("未找到邮箱输入框")


class SafeChrome(uc.Chrome):
    """
    自定义 Chrome 类，修复 Windows 下退出时的 WinError 6
    """

    def __del__(self):
        try:
            self.quit()
        except OSError:
            pass
        except Exception:
            pass

    def quit(self):
        try:
            super().quit()
        except OSError:
            pass
        except Exception:
            pass


def _is_transient_urlopen_ssl_error(exc: Exception) -> bool:
    """识别 undetected-chromedriver 下载 driver 时常见的临时 TLS 断流。"""
    if isinstance(exc, URLError):
        reason = getattr(exc, "reason", None)
        if isinstance(reason, ssl.SSLError):
            return True

    message = str(exc).lower()
    transient_markers = (
        "urlopen error",
        "unexpected_eof_while_reading",
        "eof occurred in violation of protocol",
        "_ssl.c",
        "connection reset",
        "remote end closed connection",
    )
    return any(marker in message for marker in transient_markers)


def _raise_chrome_startup_network_error(exc: Exception) -> None:
    raise RuntimeError(
        "浏览器驱动下载/启动时 HTTPS 连接被提前断开。"
        "这通常是网络、代理或到 Google ChromeDriver 源站的 TLS 链路不稳定导致的。"
        "已自动重试仍失败；请检查代理/VPN 是否稳定，或先切换一条可访问 "
        "googlechromelabs.github.io 和 storage.googleapis.com 的网络后再试。"
        f"原始错误: {exc}"
    ) from exc


def _start_safe_chrome_with_retry(chrome_kwargs: dict, attempts: int = 3):
    last_exc: Exception | None = None
    total_attempts = max(1, int(attempts))

    for attempt in range(1, total_attempts + 1):
        try:
            return SafeChrome(**chrome_kwargs)
        except Exception as exc:
            last_exc = exc
            if not _is_transient_urlopen_ssl_error(exc):
                raise
            if attempt >= total_attempts:
                _raise_chrome_startup_network_error(exc)
            wait_time = min(2 ** attempt, 8)
            print(
                "  ⚠️ ChromeDriver 下载/启动时网络断流，"
                f"{wait_time}s 后重试（第 {attempt}/{total_attempts} 次）: {exc}"
            )
            time.sleep(wait_time)

    if last_exc is not None:
        _raise_chrome_startup_network_error(last_exc)

    raise RuntimeError("浏览器驱动启动失败: unknown_error")


def _is_window_target_lost(exc: Exception) -> bool:
    """识别当前 tab/webview 已失效的可恢复异常。"""
    if isinstance(exc, NoSuchWindowException):
        return True
    message = str(exc).lower()
    return "target window already closed" in message or "web view not found" in message


def _recover_window_target(driver) -> bool:
    """
    尝试恢复 Selenium 当前 window target。
    常见场景是 tab 被关闭/崩溃后，session 还在但当前 target 丢了。
    """
    try:
        handles = list(driver.window_handles)
    except Exception as exc:
        print(f"  ⚠️ 读取浏览器窗口列表失败，无法恢复 target: {exc}")
        return False

    for handle in handles:
        try:
            driver.switch_to.window(handle)
            return True
        except Exception:
            continue

    try:
        driver.switch_to.new_window("tab")
        return True
    except Exception as exc:
        print(f"  ⚠️ 创建恢复标签页失败: {exc}")
        return False


def open_chatgpt_url(driver, url: str, attempts: int = 2) -> None:
    """打开 ChatGPT 页面，若当前 tab target 丢失则尝试恢复后重试。"""
    last_exc: Exception | None = None
    total_attempts = max(1, int(attempts))

    for attempt in range(1, total_attempts + 1):
        try:
            driver.get(url)
            return
        except Exception as exc:
            last_exc = exc
            if attempt >= total_attempts or not _is_window_target_lost(exc):
                raise
            print(
                f"  ⚠️ 浏览器当前标签页 target 已失效，正在尝试恢复（第 {attempt}/{total_attempts} 次）..."
            )
            if not _recover_window_target(driver):
                raise
            time.sleep(1)

    if last_exc is not None:
        raise last_exc


def _execute_cdp_cmd_with_target_recovery(
    driver, command: str, params: dict, attempts: int = 2
):
    """执行 CDP 命令，若当前 tab target 丢失则恢复后重试。"""
    last_exc: Exception | None = None
    total_attempts = max(1, int(attempts))

    for attempt in range(1, total_attempts + 1):
        try:
            return driver.execute_cdp_cmd(command, params)
        except Exception as exc:
            last_exc = exc
            if attempt >= total_attempts or not _is_window_target_lost(exc):
                raise
            print(
                f"  ⚠️ CDP 执行时浏览器 target 已失效，正在尝试恢复（第 {attempt}/{total_attempts} 次）..."
            )
            if not _recover_window_target(driver):
                raise
            time.sleep(1)

    if last_exc is not None:
        raise last_exc

    return None


# ──────────────────────────────────────────────────────────
# SOCKS5 带凭证本地中继
# Chrome 不支持在 --proxy-server 里内嵌 SOCKS5 凭证，也不支持扩展拦截
# SOCKS5 握手，所以用本地无认证中继让 Chrome 连过来，再由中继向上游注入凭证。
# ──────────────────────────────────────────────────────────

def _relay_pipe(src: socket.socket, dst: socket.socket):
    """单向管道：把 src 收到的数据原样转发给 dst。"""
    try:
        while True:
            data = src.recv(4096)
            if not data:
                break
            dst.sendall(data)
    except Exception:
        pass
    finally:
        for s in (src, dst):
            try:
                s.close()
            except Exception:
                pass


def _handle_socks5_client(client_sock: socket.socket,
                          upstream_host: str, upstream_port: int,
                          username: str, password: str):
    """
    处理 Chrome 发来的 SOCKS5 连接（无认证），
    并通过 PySocks 以凭证连接到上游 SOCKS5 代理。
    """
    try:
        import socks as _pysocks

        # 1. 读取客户端握手（SOCKS5 版本 + 可接受的认证方法列表）
        header = client_sock.recv(2)
        if len(header) < 2 or header[0] != 5:
            return
        n_methods = header[1]
        client_sock.recv(n_methods)          # 忽略客户端声明的方法列表

        # 2. 回复"无需认证"
        client_sock.sendall(b'\x05\x00')

        # 3. 读取 CONNECT 请求
        req = client_sock.recv(4)
        if len(req) < 4 or req[0] != 5 or req[1] != 1:
            client_sock.sendall(b'\x05\x07\x00\x01\x00\x00\x00\x00\x00\x00')
            return

        atyp = req[3]
        if atyp == 0x01:        # IPv4
            addr = socket.inet_ntoa(client_sock.recv(4))
        elif atyp == 0x03:      # 域名
            length = client_sock.recv(1)[0]
            addr = client_sock.recv(length).decode('utf-8', errors='replace')
        elif atyp == 0x04:      # IPv6
            addr = socket.inet_ntop(socket.AF_INET6, client_sock.recv(16))
        else:
            client_sock.sendall(b'\x05\x08\x00\x01\x00\x00\x00\x00\x00\x00')
            return

        port = struct.unpack('!H', client_sock.recv(2))[0]

        # 4. 通过 PySocks 连接上游（携带凭证）
        upstream_sock = _pysocks.socksocket()
        upstream_sock.set_proxy(
            _pysocks.SOCKS5, upstream_host, upstream_port,
            username=username, password=password
        )
        upstream_sock.connect((addr, port))

        # 5. 告诉 Chrome 连接成功
        client_sock.sendall(b'\x05\x00\x00\x01\x00\x00\x00\x00\x00\x00')

        # 6. 双向转发数据
        t = threading.Thread(
            target=_relay_pipe, args=(upstream_sock, client_sock), daemon=True
        )
        t.start()
        _relay_pipe(client_sock, upstream_sock)
        t.join(timeout=5)

    except Exception as e:
        print(f"  ⚠️ SOCKS5 中继连接错误: {e}")
        try:
            client_sock.sendall(b'\x05\x04\x00\x01\x00\x00\x00\x00\x00\x00')
        except Exception:
            pass
    finally:
        try:
            client_sock.close()
        except Exception:
            pass


class _Socks5AuthRelay:
    """
    全局单例：本地 SOCKS5 无认证中继 → 上游 SOCKS5 带凭证。
    配置不变时复用同一端口，无需重启。
    """

    def __init__(self):
        self._server: socket.socket | None = None
        self._port: int | None = None
        self._config: tuple | None = None
        self._lock = threading.Lock()

    def start(self, host: str, port: int, username: str, password: str) -> int:
        """启动中继（如已用相同配置启动则直接返回端口）。"""
        new_config = (host, port, username, password)
        with self._lock:
            if self._server and self._config == new_config:
                return self._port        # type: ignore[return-value]
            self._stop_locked()

            srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            srv.bind(('127.0.0.1', 0))
            local_port = srv.getsockname()[1]
            srv.listen(64)
            self._server = srv
            self._port = local_port
            self._config = new_config

            def _accept_loop():
                while True:
                    try:
                        client, _ = srv.accept()
                    except Exception:
                        break
                    threading.Thread(
                        target=_handle_socks5_client,
                        args=(client, host, port, username, password),
                        daemon=True,
                    ).start()

            threading.Thread(target=_accept_loop, daemon=True).start()
            print(f"  🔄 SOCKS5 本地中继: 127.0.0.1:{local_port} → {host}:{port}")
            return local_port

    def _stop_locked(self):
        if self._server:
            try:
                self._server.close()
            except Exception:
                pass
            self._server = None
            self._port = None
            self._config = None


_socks5_relay = _Socks5AuthRelay()


def _build_proxy_extension(
    scheme: str, host: str, port: int, username: str, password: str
) -> str:
    """
    为有凭证的代理创建 Chrome 扩展 zip 文件（写入临时目录）。
    返回 zip 文件路径。
    无凭证代理不需要扩展，直接用 --proxy-server 参数即可。
    """
    manifest = """{
  "version": "1.0.0",
  "manifest_version": 2,
  "name": "Proxy Auth Extension",
  "permissions": [
    "proxy", "tabs", "unlimitedStorage", "storage",
    "<all_urls>", "webRequest", "webRequestBlocking"
  ],
  "background": { "scripts": ["background.js"] },
  "minimum_chrome_version": "22.0.0"
}"""
    background = f"""
var config = {{
  mode: "fixed_servers",
  rules: {{
    singleProxy: {{ scheme: "{scheme}", host: "{host}", port: {port} }},
    bypassList: ["localhost", "127.0.0.1"]
  }}
}};
chrome.proxy.settings.set({{value: config, scope: "regular"}}, function(){{}});
chrome.webRequest.onAuthRequired.addListener(
  function(details) {{
    return {{ authCredentials: {{ username: "{username}", password: "{password}" }} }};
  }},
  {{urls: ["<all_urls>"]}},
  ["blocking"]
);
"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, mode="w") as zf:
        zf.writestr("manifest.json", manifest)
        zf.writestr("background.js", background)
    buf.seek(0)
    ext_path = os.path.join(tempfile.gettempdir(), f"proxy_ext_{host}_{port}.zip")
    with open(ext_path, "wb") as f:
        f.write(buf.read())
    return ext_path


def _detect_chrome_major_version() -> int | None:
    """检测本机 Chrome 主版本，避免与 UC driver 主版本不匹配。"""
    candidates = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]
    for binary in candidates:
        if not os.path.exists(binary):
            continue
        try:
            result = subprocess.run(
                [binary, "--version"],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
            output = (result.stdout or result.stderr or "").strip()
            match = re.search(r"(\d+)\.\d+\.\d+\.\d+", output)
            if match:
                major = int(match.group(1))
                print(f"  🧩 检测到本机 Chrome 主版本: {major}")
                return major
        except Exception as e:
            print(f"  ⚠️ 检测 Chrome 版本失败 ({binary}): {e}")
    print("  ℹ️ 未检测到本机 Chrome 版本，交由 undetected-chromedriver 自动匹配")
    return None


def apply_proxy_to_options(options: uc.ChromeOptions, proxy: dict | None) -> None:
    """
    将代理配置写入 ChromeOptions。
    proxy 格式:
      {
        "enabled": True,
        "type": "http" | "socks5",
        "host": "1.2.3.4",
        "port": 8080,
        "use_auth": False,
        "username": "",
        "password": ""
      }
    """
    if not proxy or not proxy.get("enabled"):
        return

    ptype = proxy.get("type", "http").lower()  # "http" | "socks5"
    host = proxy.get("host", "").strip()
    port = int(proxy.get("port", 0))
    use_auth = proxy.get("use_auth", False)
    username = proxy.get("username", "")
    password = proxy.get("password", "")

    if not host or not port:
        print("  ⚠️ 代理已启用但 host/port 无效，已跳过代理设置")
        return

    if ptype == "socks5":
        if use_auth and username:
            # Chrome 不支持 --proxy-server 内嵌 SOCKS5 凭证，也无法用扩展拦截 SOCKS5 握手。
            # 方案：启动本地无认证中继，由中继向上游注入凭证。
            local_port = _socks5_relay.start(host, port, username, password)
            options.add_argument(f"--proxy-server=socks5://127.0.0.1:{local_port}")
            print(f"  🔒 SOCKS5 代理（含认证，中继端口 {local_port}）: {host}:{port}")
        else:
            options.add_argument(f"--proxy-server=socks5://{host}:{port}")
            print(f"  🌐 SOCKS5 代理: socks5://{host}:{port}")
    else:
        # HTTP：无凭证直接用参数，有凭证需要扩展（Chrome 不支持 --proxy-server 内嵌 HTTP 凭证）
        if use_auth and username:
            ext_path = _build_proxy_extension("http", host, port, username, password)
            options.add_extension(ext_path)
            print(f"  🔒 HTTP 代理（含认证）: http://{host}:{port}")
        else:
            options.add_argument(f"--proxy-server=http://{host}:{port}")
            print(f"  🌐 HTTP 代理: http://{host}:{port}")


def create_driver(headless=False, proxy=None):
    """
    创建 undetected Chrome 浏览器驱动

    参数:
        headless (bool): 是否使用无头模式

    返回:
        uc.Chrome: 浏览器驱动实例
    """
    print(f"🌐 正在初始化浏览器 (Headless: {headless})...")
    if proxy and proxy.get("enabled"):
        ensure_proxy_ready(
            proxy,
            purpose="浏览器代理预检",
            timeout=10,
            target_urls=OPENAI_PROXY_TARGET_URLS,
            require_target_ok=False,
            target_timeout=5,
        )

    options = uc.ChromeOptions()

    # === 伪无头模式 (Fake Headless) ===
    # 真正的 Headless 很难过 Cloudflare，我们使用"移出屏幕"的策略
    # 这样既拥有完整的浏览器指纹，用户又看不到窗口
    real_headless = False

    if headless:
        print("  👻 使用'伪无头'模式 (Off-screen) 以绕过检测...")
        options.add_argument("--window-position=-10000,-10000")
        options.add_argument("--window-size=1920,1080")
        options.add_argument(
            "--start-maximized"
        )  # 可能会覆盖 position，但在多屏下通常有效
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")

        # 仍然可以加一些伪装，虽然不是必需的，因为已经是真浏览器了
        options.add_argument("--lang=zh-CN,zh;q=0.9,en;q=0.8")

    # 应用代理设置
    apply_proxy_to_options(options, proxy)

    chrome_major_version = _detect_chrome_major_version()

    chrome_kwargs = {
        "options": options,
        "use_subprocess": True,
        "headless": real_headless,
    }
    if chrome_major_version is not None:
        chrome_kwargs["version_main"] = chrome_major_version

    # 使用自定义的 SafeChrome (注意: 传入 real_headless=False)
    driver = _start_safe_chrome_with_retry(chrome_kwargs)

    # === 深度伪装 (针对 Headless 模式) ===
    if headless:
        print("🎭 应用深度指纹伪装...")

        # 1. 伪造 WebGL 供应商 (让它看起来像有真实显卡)
        _execute_cdp_cmd_with_target_recovery(
            driver,
            "Page.addScriptToEvaluateOnNewDocument",
            {
                "source": """
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                
                const getParameter = WebGLRenderingContext.prototype.getParameter;
                WebGLRenderingContext.prototype.getParameter = function(parameter) {
                    // 37445: UNMASKED_VENDOR_WEBGL
                    // 37446: UNMASKED_RENDERER_WEBGL
                    if (parameter === 37445) {
                        return 'Intel Inc.';
                    }
                    if (parameter === 37446) {
                        return 'Intel(R) Iris(R) Xe Graphics';
                    }
                    return getParameter(parameter);
                };
            """
            },
        )

        # 2. 伪造插件列表 (Headless 默认是空的)
        _execute_cdp_cmd_with_target_recovery(
            driver,
            "Page.addScriptToEvaluateOnNewDocument",
            {
                "source": """
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5],
                });
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['zh-CN', 'zh', 'en'],
                });
            """
            },
        )

        # 3. 绕过常见的检测属性
        _execute_cdp_cmd_with_target_recovery(
            driver,
            "Page.addScriptToEvaluateOnNewDocument",
            {
                "source": """
                // 覆盖 window.chrome
                window.chrome = {
                    runtime: {},
                    loadTimes: function() {},
                    csi: function() {},
                    app: {}
                };
                
                // 伪造 permissions
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                    Promise.resolve({ state: 'denied' }) :
                    originalQuery(parameters)
                );
            """
            },
        )

    return driver


def log_browser_egress_ip(driver, timeout=12):
    """打印浏览器当前出口 IP、地区和延迟，用于确认代理是否生效。"""
    print("🌍 正在检测浏览器出口 IP...")

    fetch_started = time.perf_counter()
    # 先尝试 fetch；某些环境会因为 about:blank/CORS 或代理握手导致 Failed to fetch
    try:
        driver.set_script_timeout(timeout)
        result = driver.execute_async_script(
            """
            const done = arguments[0];
            fetch('https://api.ipify.org?format=json', { cache: 'no-store' })
              .then(r => r.json())
              .then(d => done(d && d.ip ? String(d.ip) : ''))
              .catch(e => done('ERR:' + (e && e.message ? e.message : 'fetch_failed')));
            """
        )
        value = str(result or "").strip()
        if value and not value.startswith("ERR:"):
            details = {
                "ok": True,
                "ip": value,
                "latency_ms": int((time.perf_counter() - fetch_started) * 1000),
                "ip_source": "browser.fetch(api.ipify.org)",
            }
            geo = lookup_ip_geolocation(value, timeout=min(timeout, 8))
            if geo.get("ok"):
                details.update(
                    {
                        "country": geo.get("country", ""),
                        "country_code": geo.get("country_code", ""),
                        "region": geo.get("region", ""),
                        "city": geo.get("city", ""),
                        "geo_source": geo.get("source", ""),
                    }
                )
            else:
                details["geo_reason"] = geo.get("reason", "geo_lookup_failed")

            print(
                f"  ✅ 浏览器出口 IP: {details['ip']} | "
                f"{format_probe_location(details)} | {details['latency_ms']} ms"
            )
            if details.get("geo_reason"):
                print(f"  ℹ️ 出口地区识别失败: {details['geo_reason']}")
            return details
        print(f"  ℹ️ fetch 检测未成功，准备回退页面检测: {value or 'empty_response'}")
    except Exception as e:
        print(f"  ℹ️ fetch 检测异常，准备回退页面检测: {e}")

    # 回退：直接导航到 IP 服务页面读取 body 文本（不依赖 CORS）
    endpoints = [
        "https://api.ipify.org",
        "https://api64.ipify.org",
        "https://ifconfig.me/ip",
    ]
    try:
        driver.set_page_load_timeout(timeout)
    except Exception:
        pass

    for url in endpoints:
        try:
            started = time.perf_counter()
            driver.get(url)
            body_text = driver.execute_script(
                "return (document.body && document.body.innerText) ? document.body.innerText : '';"
            )
            ip = (
                str(body_text or "").strip().splitlines()[0].strip()
                if body_text
                else ""
            )
            if ip and ("." in ip or ":" in ip):
                details = {
                    "ok": True,
                    "ip": ip,
                    "latency_ms": int((time.perf_counter() - started) * 1000),
                    "ip_source": url,
                }
                geo = lookup_ip_geolocation(ip, timeout=min(timeout, 8))
                if geo.get("ok"):
                    details.update(
                        {
                            "country": geo.get("country", ""),
                            "country_code": geo.get("country_code", ""),
                            "region": geo.get("region", ""),
                            "city": geo.get("city", ""),
                            "geo_source": geo.get("source", ""),
                        }
                    )
                else:
                    details["geo_reason"] = geo.get("reason", "geo_lookup_failed")

                print(
                    f"  ✅ 浏览器出口 IP: {details['ip']} | "
                    f"{format_probe_location(details)} | {details['latency_ms']} ms"
                )
                if details.get("geo_reason"):
                    print(f"  ℹ️ 出口地区识别失败: {details['geo_reason']}")
                return details
        except Exception as e:
            print(f"  ⚠️ 回退检测失败 ({url}): {e}")

    reason = "代理可能不可用，或当前网络阻断了 IP 检测服务"
    print(f"  ❌ 出口 IP 检测失败：{reason}")
    return {"ok": False, "reason": reason}


def _sleep_with_heartbeat(
    driver, seconds, monitor_callback=None, step_name="heartbeat", interval=1.0
):
    """
    分段睡眠，期间定期上报监控，避免前端画面在长等待中“卡住”。
    """
    end_time = time.time() + max(0, float(seconds))
    while time.time() < end_time:
        if monitor_callback:
            monitor_callback(driver, step_name)
        remaining = end_time - time.time()
        time.sleep(min(interval, max(0.05, remaining)))


def check_and_handle_error(driver, max_retries=None, monitor_callback=None):
    """
    检测页面错误并自动重试

    参数:
        driver: 浏览器驱动
        max_retries: 最大重试次数

    返回:
        bool: 是否检测到错误并处理
    """
    if max_retries is None:
        max_retries = ERROR_PAGE_MAX_RETRIES

    for attempt in range(max_retries):
        try:
            page_source = driver.page_source.lower()
            error_keywords = [
                "出错",
                "error",
                "timed out",
                "operation timeout",
                "route error",
                "invalid content",
            ]
            has_error = any(keyword in page_source for keyword in error_keywords)

            if has_error:
                try:
                    retry_btn = driver.find_element(
                        By.CSS_SELECTOR, 'button[data-dd-action-name="Try again"]'
                    )
                    print(
                        f"⚠️ 检测到错误页面，正在重试（第 {attempt + 1}/{max_retries} 次）..."
                    )
                    driver.execute_script("arguments[0].click();", retry_btn)
                    wait_time = 5 + (attempt * 2)
                    print(f"  等待 {wait_time} 秒后继续...")
                    _sleep_with_heartbeat(
                        driver,
                        wait_time,
                        monitor_callback=monitor_callback,
                        step_name=f"error_retry_{attempt + 1}",
                    )
                    return True
                except Exception:
                    _sleep_with_heartbeat(
                        driver,
                        2,
                        monitor_callback=monitor_callback,
                        step_name="error_retry_backoff",
                    )
                    continue
            return False

        except Exception as e:
            print(f"  错误检测异常: {e}")
            return False

    return False


def click_button_with_retry(driver, selector, max_retries=None, monitor_callback=None):
    """
    带重试机制的按钮点击

    参数:
        driver: 浏览器驱动
        selector: CSS 选择器
        max_retries: 最大重试次数

    返回:
        bool: 是否成功点击
    """
    if max_retries is None:
        max_retries = BUTTON_CLICK_MAX_RETRIES

    for attempt in range(max_retries):
        try:
            button = WebDriverWait(driver, 30).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
            )
            driver.execute_script("arguments[0].click();", button)
            return True
        except Exception:
            print(f"  第 {attempt + 1} 次点击失败，正在重试...")
            _sleep_with_heartbeat(
                driver,
                2,
                monitor_callback=monitor_callback,
                step_name="button_retry_backoff",
            )

    return False


def type_slowly(element, text, delay=0.05):
    """
    模拟人工缓慢输入

    参数:
        element: 输入框元素
        text: 要输入的文本
        delay: 每个字符之间的延迟（秒）
    """
    for char in text:
        element.send_keys(char)
        time.sleep(delay)


def _fill_input_with_verification(
    element, text: str, field_name: str, attempts: int = 3, mask: bool = False
) -> bool:
    expected = str(text or "")

    for attempt in range(1, attempts + 1):
        try:
            element.click()
        except Exception:
            pass
        try:
            element.clear()
        except Exception:
            pass

        time.sleep(0.3)
        type_slowly(element, expected)
        time.sleep(0.3)

        actual_value = str(element.get_attribute("value") or "")
        if actual_value == expected:
            if mask:
                print(f"✅ 已输入{field_name}（长度 {len(expected)}）")
            else:
                print(f"✅ 已输入{field_name}: {expected}")
            return True

        print(
            f"⚠️ {field_name} 输入不完整（第 {attempt}/{attempts} 次），"
            f"实际长度 {len(actual_value)}/{len(expected)}"
        )

    return False


def _wait_for_email_verification_page(driver, timeout: int = 30, monitor_callback=None) -> bool:
    end_time = time.time() + timeout
    verification_hits = 0
    print(f"📬 等待进入邮箱验证码页...（最长 {timeout}s）")

    while time.time() < end_time:
        while check_and_handle_error(driver, monitor_callback=monitor_callback):
            _sleep_with_heartbeat(
                driver,
                2,
                monitor_callback=monitor_callback,
                step_name="verification_page_error_recheck_wait",
            )

        if _is_email_verification_page(driver):
            verification_hits += 1
            if verification_hits >= 2:
                print("✅ 已进入邮箱验证码页")
                return True
        else:
            verification_hits = 0

        _sleep_with_heartbeat(
            driver,
            0.5,
            monitor_callback=monitor_callback,
            step_name="verification_page_wait",
            interval=0.5,
        )

    print("❌ 密码提交后未进入邮箱验证码页")
    return False


_PROFILE_AGE_SELECTORS = [
    (By.CSS_SELECTOR, 'input[name="age"]'),
    (By.CSS_SELECTOR, 'input[name*="age" i]'),
    (By.CSS_SELECTOR, 'input[id*="age" i]'),
    (By.CSS_SELECTOR, 'input[placeholder*="age" i]'),
    (By.CSS_SELECTOR, 'input[aria-label*="age" i]'),
    (By.CSS_SELECTOR, 'input[data-testid*="age" i]'),
    (By.CSS_SELECTOR, 'input[placeholder*="年龄"]'),
    (By.CSS_SELECTOR, 'input[aria-label*="年龄"]'),
    (By.XPATH, '//label[contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "age")]/following::input[1]'),
    (By.XPATH, '//*[contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "how old")]/following::input[1]'),
]

_PROFILE_YEAR_SELECTORS = [
    (By.CSS_SELECTOR, '[data-type="year"]'),
    (By.CSS_SELECTOR, 'input[autocomplete="bday-year"]'),
    (By.CSS_SELECTOR, 'input[name="year"]'),
    (By.CSS_SELECTOR, 'input[name*="year" i]'),
    (By.CSS_SELECTOR, 'input[placeholder*="year" i]'),
    (By.CSS_SELECTOR, 'input[placeholder*="yyyy" i]'),
    (By.CSS_SELECTOR, 'input[aria-label*="year" i]'),
    (By.XPATH, '//label[contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "year")]/following::input[1]'),
]

_PROFILE_MONTH_SELECTORS = [
    (By.CSS_SELECTOR, '[data-type="month"]'),
    (By.CSS_SELECTOR, 'input[autocomplete="bday-month"]'),
    (By.CSS_SELECTOR, 'input[name="month"]'),
    (By.CSS_SELECTOR, 'input[name*="month" i]'),
    (By.CSS_SELECTOR, 'input[placeholder*="month" i]'),
    (By.CSS_SELECTOR, 'input[placeholder*="mm" i]'),
    (By.CSS_SELECTOR, 'input[aria-label*="month" i]'),
    (By.XPATH, '//label[contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "month")]/following::input[1]'),
]

_PROFILE_DAY_SELECTORS = [
    (By.CSS_SELECTOR, '[data-type="day"]'),
    (By.CSS_SELECTOR, 'input[autocomplete="bday-day"]'),
    (By.CSS_SELECTOR, 'input[name="day"]'),
    (By.CSS_SELECTOR, 'input[name*="day" i]'),
    (By.CSS_SELECTOR, 'input[placeholder*="day" i]'),
    (By.CSS_SELECTOR, 'input[placeholder*="dd" i]'),
    (By.CSS_SELECTOR, 'input[aria-label*="day" i]'),
    (By.XPATH, '//label[contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "day")]/following::input[1]'),
]


def _first_visible_element(driver, selectors):
    for by, selector in selectors:
        try:
            elements = driver.find_elements(by, selector)
        except Exception:
            continue

        for element in elements:
            try:
                if element.is_displayed() and element.is_enabled():
                    return element
            except Exception:
                continue

    return None


def _detect_profile_birth_fields_once(driver):
    age_input = _first_visible_element(driver, _PROFILE_AGE_SELECTORS)
    if age_input:
        return {"mode": "age", "age_input": age_input}

    year_input = _first_visible_element(driver, _PROFILE_YEAR_SELECTORS)
    month_input = _first_visible_element(driver, _PROFILE_MONTH_SELECTORS)
    day_input = _first_visible_element(driver, _PROFILE_DAY_SELECTORS)

    if year_input and month_input and day_input:
        return {
            "mode": "birthday",
            "year_input": year_input,
            "month_input": month_input,
            "day_input": day_input,
        }

    return None


def _wait_for_profile_birth_fields(driver, timeout=30):
    end_time = time.time() + timeout

    while time.time() < end_time:
        fields = _detect_profile_birth_fields_once(driver)
        if fields:
            return fields
        time.sleep(0.5)

    raise RuntimeError("未找到年龄输入框或生日输入框")


def _calculate_age_from_birthday(year: str, month: str, day: str) -> str:
    birthday = date(int(year), int(month), int(day))
    today = date.today()
    age = today.year - birthday.year - ((today.month, today.day) < (birthday.month, birthday.day))
    return str(max(age, 0))


def _fill_input_value(driver, element, value: str, delay=0.1):
    driver.execute_script(
        "arguments[0].scrollIntoView({block: 'center'});", element
    )
    time.sleep(0.3)

    try:
        ActionChains(driver).move_to_element(element).click().perform()
    except Exception:
        driver.execute_script("arguments[0].click();", element)

    time.sleep(0.2)

    try:
        element.clear()
    except Exception:
        pass

    for shortcut in (getattr(Keys, "COMMAND", None), Keys.CONTROL):
        if not shortcut:
            continue
        try:
            element.send_keys(Keys.chord(shortcut, "a"))
            time.sleep(0.05)
            element.send_keys(Keys.BACKSPACE)
        except Exception:
            continue

    try:
        driver.execute_script(
            """
            arguments[0].value = '';
            arguments[0].dispatchEvent(new Event('input', {bubbles: true}));
            arguments[0].dispatchEvent(new Event('change', {bubbles: true}));
            """,
            element,
        )
    except Exception:
        pass

    type_slowly(element, value, delay=delay)


def fill_signup_form(driver, email: str, password: str, monitor_callback=None):
    """
    填写注册表单
    适配 ChatGPT 新版统一登录/注册页面

    参数:
        driver: 浏览器驱动
        email: 邮箱地址
        password: 密码

    返回:
        tuple: (是否成功, 是否已输入密码)
    """
    wait = WebDriverWait(driver, MAX_WAIT_TIME)
    step_wait_timeout = max(20, min(SHORT_WAIT_TIME, 60))

    try:
        # 1. 等待邮箱输入框出现
        print(f"DEBUG: 当前页面标题: {driver.title}")
        print(f"DEBUG: 当前页面URL: {driver.current_url}")
        print("📧 等待邮箱输入框...")

        # 检查是否是 Cloudflare 验证页
        if (
            "Just a moment" in driver.title
            or "Ray ID" in driver.page_source
            or "请稍候" in driver.title
        ):
            print("⚠️ 检测到 Cloudflare 验证页面...")
            time.sleep(10)
            if "Just a moment" in driver.title or "请稍候" in driver.title:
                print("  🔄 尝试刷新页面以突破验证...")
                driver.refresh()
                time.sleep(10)

            try:
                frames = driver.find_elements(By.TAG_NAME, "iframe")
                for frame in frames:
                    try:
                        driver.switch_to.frame(frame)
                        checkbox = driver.find_elements(
                            By.CSS_SELECTOR,
                            "#checkbox, .checkbox, input[type='checkbox'], #challenge-stage",
                        )
                        if checkbox:
                            print("  🖱️ 尝试点击验证框...")
                            driver.execute_script("arguments[0].click();", checkbox[0])
                            time.sleep(5)
                        driver.switch_to.default_content()
                    except Exception:
                        driver.switch_to.default_content()
            except Exception:
                pass

        _click_signup_or_login_entry(driver)

        email_input = _wait_for_signup_email_input(
            driver,
            timeout=MAX_WAIT_TIME,
            refresh_after_attempts=2,
            monitor_callback=monitor_callback,
        )

        print("📝 正在输入邮箱...")
        actions = ActionChains(driver)
        actions.move_to_element(email_input)
        actions.click()
        actions.perform()
        if not _fill_input_with_verification(email_input, email, "邮箱"):
            print("❌ 邮箱输入校验失败")
            return False, False

        time.sleep(1)

        print("🔘 点击继续按钮...")
        continue_btn = wait.until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'button[type="submit"]'))
        )
        actions = ActionChains(driver)
        actions.move_to_element(continue_btn)
        actions.click()
        actions.perform()
        print("✅ 已点击继续")
        _sleep_with_heartbeat(
            driver,
            1.5,
            monitor_callback=monitor_callback,
            step_name="signup_email_submit_wait",
        )

        next_step = _wait_for_post_email_step(
            driver,
            timeout=step_wait_timeout,
            monitor_callback=monitor_callback,
        )
        if next_step == "verification":
            print("✅ 邮箱提交后直接进入验证码页，跳过密码输入")
            return True, False
        if next_step != "password":
            return False, False

        password_entered = False
        password_submit_attempts = max(1, ERROR_PAGE_MAX_RETRIES)
        for password_attempt in range(1, password_submit_attempts + 1):
            if password_attempt == 1:
                print("🔑 等待密码输入框...")
            else:
                print(
                    f"🔁 重新输入密码并继续（第 {password_attempt}/{password_submit_attempts} 次）"
                )

            password_step, password_input = _wait_for_password_input_or_verification(
                driver,
                timeout=SHORT_WAIT_TIME,
                monitor_callback=monitor_callback,
            )
            if password_step == "verification":
                return True, password_entered
            if password_step != "password" or not password_input:
                print("❌ 未找到密码输入框，也未进入邮箱验证码页")
                return False, password_entered

            actions = ActionChains(driver)
            actions.move_to_element(password_input)
            actions.click()
            actions.perform()
            if not _fill_input_with_verification(
                password_input, password, "密码", mask=True
            ):
                print("❌ 密码输入校验失败")
                return False, password_entered
            password_entered = True
            _sleep_with_heartbeat(
                driver,
                1.5,
                monitor_callback=monitor_callback,
                step_name="signup_password_filled_wait",
            )

            print("🔘 点击继续按钮...")
            if not click_button_with_retry(
                driver, 'button[type="submit"]', monitor_callback=monitor_callback
            ):
                print("❌ 点击继续按钮失败")
                return False, password_entered
            print("✅ 已点击继续")

            _sleep_with_heartbeat(
                driver,
                3,
                monitor_callback=monitor_callback,
                step_name="signup_password_submit_wait",
            )
            submit_result = _wait_for_password_submit_result(
                driver,
                timeout=step_wait_timeout,
                monitor_callback=monitor_callback,
            )
            if submit_result == "verification":
                return True, True
            if submit_result == "retry_password":
                continue

            return False, password_entered

        print("❌ 密码提交多次失败，仍未进入邮箱验证码页")
        return False, password_entered

    except Exception as e:
        print(f"❌ 填写表单失败: {e}")
        return False, False


def login(driver, email, password):
    """
    登录 ChatGPT
    """
    print(f"🔐 正在登录 {email}...")
    wait = WebDriverWait(driver, 30)

    try:
        open_chatgpt_url(driver, CHATGPT_LOGIN_URL)
        time.sleep(5)

        # 0. 点击初始页面的 Log in / 登录 按钮
        print("🔘 寻找 Log in / 登录 按钮...")
        try:
            # 尝试多种选择器，支持中文
            xpaths = [
                '//button[@data-testid="login-button"]',
                '//button[contains(., "Log in")]',
                '//button[contains(., "登录")]',
                '//div[contains(text(), "Log in")]',
                '//div[contains(text(), "登录")]',
            ]

            login_btn = None
            for xpath in xpaths:
                try:
                    btns = driver.find_elements(By.XPATH, xpath)
                    for btn in btns:
                        if btn.is_displayed():
                            login_btn = btn
                            break
                    if login_btn:
                        break
                except Exception:
                    continue

            if login_btn:
                # 确保点击
                try:
                    login_btn.click()
                except Exception:
                    driver.execute_script("arguments[0].click();", login_btn)
                print("✅ 点击了登录按钮")
            else:
                print("⚠️ 未找到显式的登录按钮，尝试直接寻找输入框")
        except Exception as e:
            print(f"⚠️ 点击登录按钮出错: {e}")

        time.sleep(3)

        # 1. 输入邮箱
        print("📧 输入邮箱...")
        # 增加等待时间
        email_input = wait.until(
            EC.visibility_of_element_located(
                (
                    By.CSS_SELECTOR,
                    'input[name="username"], input[name="email"], input[id="email-input"]',
                )
            )
        )
        email_input.clear()
        type_slowly(email_input, email)

        # 点击继续
        print("🔘 点击继续...")
        continue_btn = driver.find_element(
            By.CSS_SELECTOR, 'button[type="submit"], button[class*="continue-btn"]'
        )
        continue_btn.click()
        time.sleep(3)

        # ⚠️ 关键修正：检查是否进入了验证码模式，如果是，切换回密码模式
        print("🔍 检查登录方式...")
        try:
            # 寻找所有包含 "密码" 或 "Password" 的文本元素，只要它们看起来像链接或按钮
            # 排除掉密码输入框本身的 label
            switch_candidates = driver.find_elements(
                By.XPATH,
                '//*[contains(text(), "密码") or contains(text(), "Password")]',
            )

            clicked_switch = False
            for el in switch_candidates:
                if not el.is_displayed():
                    continue

                tag_name = el.tag_name.lower()
                text = el.text

                # 排除 label 和 title
                if (
                    tag_name in ["h1", "h2", "label", "span"]
                    and "输入" not in text
                    and "Enter" not in text
                    and "使用" not in text
                ):
                    continue

                # 尝试点击看起来像切换链接的元素
                if (
                    "输入密码" in text
                    or "Enter password" in text
                    or "使用密码" in text
                    or "password instead" in text
                ):
                    print(f"⚠️ 尝试点击切换链接: '{text}' ({tag_name})...")
                    try:
                        el.click()
                        clicked_switch = True
                        time.sleep(2)
                        break
                    except Exception:
                        # 可能是被遮挡，尝试 JS 点击
                        driver.execute_script("arguments[0].click();", el)
                        clicked_switch = True
                        time.sleep(2)
                        break

            if not clicked_switch:
                print("  ℹ️ 未找到明显的'切换密码'链接，假设在密码输入页或强制验证码页")

        except Exception as e:
            print(f"  检查登录方式出错: {e}")

        # 2. 输入密码
        print("🔑 等待密码输入框...")
        try:
            password_input = wait.until(
                EC.visibility_of_element_located(
                    (By.CSS_SELECTOR, 'input[name="password"], input[type="password"]')
                )
            )
            password_input.clear()
            type_slowly(password_input, password)

            # 点击继续/登录
            print("🔘 点击登录...")
            continue_btn = driver.find_element(
                By.CSS_SELECTOR, 'button[type="submit"], button[name="action"]'
            )
            continue_btn.click()

            print("⏳ 等待登录完成...")
            time.sleep(10)

        except Exception as e:
            print("❌ 未找到密码输入框。")
            print("  可能原因: 1. 强制验证码登录; 2. 页面加载过慢; 3. 选择器失效")
            print("  尝试手动干预或检查页面...")
            raise e  # 抛出异常以终止测试

        # 检查是否登录成功
        if "auth" not in driver.current_url:
            print("✅ 登录成功")
            return True
        else:
            print("⚠️ 可能还在登录页面 (URL包含 auth)")
            # 再次检查是否有错误提示
            try:
                err = driver.find_element(
                    By.CSS_SELECTOR, '.error-message, [role="alert"]'
                )
                print(f"❌登录错误提示: {err.text}")
            except Exception:
                pass
            return True

    except Exception as e:
        print(f"❌ 登录失败: {e}")
        return False


def _find_verification_inputs(driver, code: str):
    selectors = [
        'input[name="code"]',
        'input[name*="code"]',
        'input[autocomplete="one-time-code"]',
        'input[placeholder*="代码"]',
        'input[placeholder*="验证码"]',
        'input[placeholder*="code" i]',
        'input[placeholder*="verification" i]',
        'input[aria-label*="代码"]',
        'input[aria-label*="验证码"]',
        'input[aria-label*="code" i]',
        'input[aria-label*="verification" i]',
    ]
    for selector in selectors:
        try:
            elements = [
                el for el in driver.find_elements(By.CSS_SELECTOR, selector)
                if el.is_displayed() and el.is_enabled()
            ]
            if elements:
                return "single", elements
        except Exception:
            continue

    try:
        otp_candidates = [
            el for el in driver.find_elements(
                By.CSS_SELECTOR,
                'input[inputmode="numeric"], input[autocomplete="one-time-code"], input[maxlength="1"]',
            )
            if el.is_displayed() and el.is_enabled()
        ]
        if len(otp_candidates) >= 4:
            otp_candidates = sorted(
                otp_candidates,
                key=lambda el: (el.location.get("y", 0), el.location.get("x", 0)),
            )
            return "multi", otp_candidates[: len(code)]
    except Exception:
        pass

    return None, []


def enter_verification_code(driver, code: str, monitor_callback=None):
    """
    输入验证码

    参数:
        driver: 浏览器驱动
        code: 验证码

    返回:
        bool: 是否成功
    """
    try:
        print("🔢 正在输入验证码...")

        while check_and_handle_error(driver, monitor_callback=monitor_callback):
            _sleep_with_heartbeat(
                driver,
                2,
                monitor_callback=monitor_callback,
                step_name="code_error_recheck_wait",
            )

        input_mode = None
        input_elements = []
        end_time = time.time() + 60
        while time.time() < end_time:
            input_mode, input_elements = _find_verification_inputs(driver, code)
            if input_elements:
                break
            time.sleep(0.5)

        if not input_elements:
            raise RuntimeError("未找到验证码输入框")

        if input_mode == "single":
            code_input = input_elements[0]
            code_input.clear()
            time.sleep(0.5)
            type_slowly(code_input, code, delay=0.1)
        else:
            for idx, digit in enumerate(code):
                if idx >= len(input_elements):
                    break
                box = input_elements[idx]
                try:
                    box.clear()
                except Exception:
                    pass
                box.click()
                time.sleep(0.1)
                box.send_keys(digit)

        print(f"✅ 已输入验证码: {code}")
        time.sleep(2)

        print("🔘 点击继续按钮...")
        if not click_button_with_retry(
            driver, 'button[type="submit"]', monitor_callback=monitor_callback
        ):
            print("❌ 点击继续按钮失败")
            return False
        print("✅ 已点击继续")

        time.sleep(3)
        while check_and_handle_error(driver, monitor_callback=monitor_callback):
            _sleep_with_heartbeat(
                driver,
                2,
                monitor_callback=monitor_callback,
                step_name="code_submit_error_recheck_wait",
            )

        return True

    except Exception as e:
        print(f"❌ 输入验证码失败: {e}")
        return False


def fill_profile_info(driver):
    """
    填写用户资料（随机生成的姓名和生日）

    参数:
        driver: 浏览器驱动

    返回:
        bool: 是否成功
    """
    wait = WebDriverWait(driver, MAX_WAIT_TIME)

    # 生成随机用户信息
    user_info = generate_user_info()
    user_name = user_info["name"]
    birthday_year = user_info["year"]
    birthday_month = user_info["month"]
    birthday_day = user_info["day"]
    age = _calculate_age_from_birthday(
        birthday_year, birthday_month, birthday_day
    )

    try:
        # 1. 输入姓名
        print("👤 等待姓名输入框...")
        name_input = WebDriverWait(driver, 60).until(
            EC.visibility_of_element_located(
                (By.CSS_SELECTOR, 'input[name="name"], input[autocomplete="name"]')
            )
        )
        name_input.clear()
        time.sleep(0.5)
        type_slowly(name_input, user_name)
        print(f"✅ 已输入姓名: {user_name}")
        time.sleep(1)

        # 2. 输入年龄或生日
        print("🎂 正在识别年龄/生日输入方式...")
        time.sleep(1)

        profile_fields = _wait_for_profile_birth_fields(driver, timeout=30)

        if profile_fields["mode"] == "age":
            print("🎯 检测到年龄输入框，改为直接输入年龄...")
            _fill_input_value(driver, profile_fields["age_input"], age, delay=0.1)
            print(f"✅ 已输入年龄: {age}")
        else:
            print("🎯 检测到生日输入框，按年月日填写...")
            _fill_input_value(
                driver, profile_fields["year_input"], birthday_year, delay=0.1
            )
            time.sleep(0.3)
            _fill_input_value(
                driver, profile_fields["month_input"], birthday_month, delay=0.1
            )
            time.sleep(0.3)
            _fill_input_value(
                driver, profile_fields["day_input"], birthday_day, delay=0.1
            )
            print(f"✅ 已输入生日: {birthday_year}/{birthday_month}/{birthday_day}")

        time.sleep(1)

        # 3. 点击最后的继续按钮
        print("🔘 点击最终提交按钮...")
        continue_btn = wait.until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, 'button[type="submit"]'))
        )
        continue_btn.click()
        print("✅ 已提交注册信息")

        return True

    except Exception as e:
        print(f"❌ 填写资料失败: {e}")
        return False


def _dismiss_onboarding(driver):
    """尝试关闭 onboarding 弹窗（条款确认、功能介绍等）。"""
    try:
        # 查找并点击 "Continue" / "Next" / "Done" / "Start" / "OK" 类按钮
        dismiss_selectors = [
            'button[data-testid="onboarding-continue-button"]',
            'button[data-testid="close-onboarding-button"]',
            'button[class*="onboarding"]',
        ]
        for sel in dismiss_selectors:
            try:
                btns = driver.find_elements(By.CSS_SELECTOR, sel)
                for btn in btns:
                    if btn.is_displayed():
                        driver.execute_script("arguments[0].click();", btn)
                        print("  📌 点击了 onboarding 按钮")
                        time.sleep(2)
                        return True
            except Exception:
                continue

        # 更通用的方式：找包含 Continue/Next/Done/Start/OK 的按钮
        try:
            generic_btns = driver.find_elements(
                By.XPATH,
                '//button[contains(translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "continue") '
                'or contains(translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "next") '
                'or contains(translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "done") '
                'or contains(translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "start") '
                'or contains(translate(text(), "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "ok") '
                'or contains(text(), "继续") '
                'or contains(text(), "完成") '
                'or contains(text(), "开始")]'
            )
            for btn in generic_btns:
                if btn.is_displayed():
                    driver.execute_script("arguments[0].click();", btn)
                    print("  📌 点击了 onboarding/引导按钮")
                    time.sleep(2)
                    return True
        except Exception:
            pass
    except Exception:
        pass
    return False


def verify_logged_in(driver, timeout=90):
    """
    验证当前浏览器会话是否已成功登录 ChatGPT

    参数:
        driver: 浏览器驱动
        timeout: 最大等待时长（秒）

    返回:
        bool: 是否验证成功
    """
    print("🔍 正在验证登录状态...")

    # 先等待页面跳转完成；注册成功后有时会在 onboarding 页停留数秒
    end_time = time.time() + timeout
    logged_in_selectors = [
        "textarea#prompt-textarea",
        'button[data-testid="profile-button"]',
        'button[data-testid="user-menu-button"]',
        'nav a[href*="/settings"]',
        'a[href*="/settings"]',
    ]

    while time.time() < end_time:
        try:
            current_url = (driver.current_url or "").lower()

            # 若仍处于认证路径，继续等待跳转
            if any(key in current_url for key in ["/auth", "login", "signup"]):
                time.sleep(2)
                continue

            # 出现核心已登录元素即可判定成功
            for selector in logged_in_selectors:
                elements = driver.find_elements(By.CSS_SELECTOR, selector)
                if any(el.is_displayed() for el in elements):
                    print("✅ 登录状态验证成功")
                    return True

            page_source = (driver.page_source or "").lower()
            blocked_markers = [
                "verify your email",
                "enter code",
                "log in",
                "sign up",
            ]

            if any(marker in page_source for marker in blocked_markers):
                time.sleep(2)
                continue

            # 尝试关闭 onboarding 弹窗
            _dismiss_onboarding(driver)

            # 如果 URL 已不在 auth 路径，且没有明显登录/注册提示，作为兜底判定
            if "auth" not in current_url:
                print("✅ 登录状态验证成功（URL 兜底判定）")
                return True

        except Exception as e:
            print(f"  登录状态检查中断: {e}")

        time.sleep(2)

    print("❌ 登录状态验证失败：超时仍未确认登录")
    return False


def fetch_current_access_token(driver, timeout=30):
    """
    从当前 ChatGPT 浏览器会话读取 /api/auth/session 里的 accessToken。

    该请求必须在浏览器里发起，这样才能携带刚注册完成的登录 cookie。
    """
    print("🔐 正在读取 ChatGPT accessToken...")

    try:
        current_url = str(driver.current_url or "")
    except Exception:
        current_url = ""

    if "chatgpt.com" not in current_url.lower():
        open_chatgpt_url(driver, CHATGPT_HOME_URL)
        time.sleep(2)

    try:
        driver.set_script_timeout(timeout)
    except Exception:
        pass

    result = driver.execute_async_script(
        """
        const done = arguments[0];
        fetch('https://chatgpt.com/api/auth/session', {
          cache: 'no-store',
          credentials: 'include'
        })
          .then(async (response) => {
            const text = await response.text();
            let data = null;
            try {
              data = text ? JSON.parse(text) : {};
            } catch (error) {
              done({
                ok: false,
                status: response.status,
                error: 'session_json_parse_failed',
                text: text.slice(0, 500)
              });
              return;
            }
            done({ok: response.ok, status: response.status, data});
          })
          .catch((error) => {
            done({
              ok: false,
              status: 0,
              error: error && error.message ? error.message : 'session_fetch_failed'
            });
          });
        """
    )

    if not isinstance(result, dict):
        raise RuntimeError("session 接口返回异常")
    if not result.get("ok"):
        detail = result.get("error") or result.get("text") or "unknown_error"
        raise RuntimeError(f"session 接口失败: HTTP {result.get('status', 0)} {detail}")

    data = result.get("data") or {}
    if not isinstance(data, dict):
        raise RuntimeError("session JSON 格式异常")

    access_token = str(
        data.get("accessToken")
        or data.get("access_token")
        or data.get("token")
        or ""
    ).strip()
    if not access_token:
        raise RuntimeError("session JSON 缺少 accessToken")

    print("✅ 已读取 ChatGPT accessToken")
    return access_token
