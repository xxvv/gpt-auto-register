"""
浏览器自动化模块 - ChatGPT 注册流程
"""

import io
import os
import socket
import struct
import tempfile
import threading
import time
import zipfile
import undetected_chromedriver as uc
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
from .utils import generate_user_info


def _page_text(driver) -> str:
    try:
        return (driver.page_source or "").lower()
    except Exception:
        return ""


def _is_email_verification_page(driver) -> bool:
    try:
        current_url = (driver.current_url or "").lower()
    except Exception:
        current_url = ""

    if any(token in current_url for token in ["email-verification", "verification", "/code", "enter-code"]):
        return True

    page_text = _page_text(driver)
    text_markers = [
        "检查您的收件箱",
        "验证邮箱",
        "验证码",
        "verify your email",
        "check your inbox",
        "enter code",
        "verification code",
    ]
    if any(marker in page_text for marker in text_markers):
        return True

    verification_selectors = [
        'input[name="code"]',
        'input[name*="code"]',
        'input[autocomplete="one-time-code"]',
        'input[placeholder*="代码"]',
        'input[placeholder*="验证码"]',
        'input[placeholder*="code" i]',
        'input[aria-label*="代码"]',
        'input[aria-label*="验证码"]',
        'input[aria-label*="code" i]',
    ]
    for selector in verification_selectors:
        try:
            elements = driver.find_elements(By.CSS_SELECTOR, selector)
            if any(el.is_displayed() for el in elements):
                return True
        except Exception:
            continue

    try:
        otp_boxes = driver.find_elements(
            By.CSS_SELECTOR,
            'input[inputmode="numeric"], input[autocomplete="one-time-code"], input[maxlength="1"]',
        )
        visible_count = sum(1 for el in otp_boxes if el.is_displayed())
        if visible_count >= 4:
            return True
    except Exception:
        pass

    return False


def _wait_for_post_email_step(driver, timeout: int = 10) -> str:
    end_time = time.time() + timeout
    print(f"🔀 等待密码或验证码页面...（最长 {timeout}s）")
    while time.time() < end_time:
        try:
            password_inputs = driver.find_elements(By.CSS_SELECTOR, 'input[autocomplete="new-password"], input[type="password"]')
            if any(el.is_displayed() for el in password_inputs):
                print("✅ 检测到密码页，继续输入密码")
                return "password"
        except Exception:
            pass

        if _is_email_verification_page(driver):
            print("✅ 检测到验证码页，跳过密码设置")
            return "verification"

        time.sleep(0.5)

    print("❌ 邮箱提交后未识别到密码页或验证码页")
    return "unknown"


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

    # 使用自定义的 SafeChrome (注意: 传入 real_headless=False)
    driver = SafeChrome(
        options=options, use_subprocess=True, headless=real_headless, version_main=145
    )

    # === 深度伪装 (针对 Headless 模式) ===
    if headless:
        print("🎭 应用深度指纹伪装...")

        # 1. 伪造 WebGL 供应商 (让它看起来像有真实显卡)
        driver.execute_cdp_cmd(
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
        driver.execute_cdp_cmd(
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
        driver.execute_cdp_cmd(
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
    """打印浏览器当前出口 IP，用于确认代理是否生效。"""
    print("🌍 正在检测浏览器出口 IP...")
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
            print(f"  ✅ 浏览器出口 IP: {value}")
            return
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
                print(f"  ✅ 浏览器出口 IP: {ip} ({url})")
                return
        except Exception as e:
            print(f"  ⚠️ 回退检测失败 ({url}): {e}")

    print("  ❌ 出口 IP 检测失败：代理可能不可用，或当前网络阻断了 IP 检测服务")


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
        except Exception as e:
            print(f"  ⚠️ 检查入口按钮时出错 (非致命): {e}")

        email_input = WebDriverWait(driver, SHORT_WAIT_TIME).until(
            EC.visibility_of_element_located(
                (
                    By.CSS_SELECTOR,
                    'input[type="email"], input[name="email"], input[autocomplete="email"]',
                )
            )
        )

        print("📝 正在输入邮箱...")
        actions = ActionChains(driver)
        actions.move_to_element(email_input)
        actions.click()
        actions.pause(0.3)
        actions.send_keys(email)
        actions.perform()

        time.sleep(1)
        actual_value = email_input.get_attribute("value")
        if actual_value == email:
            print(f"✅ 已输入邮箱: {email}")
        else:
            print(f"⚠️ 输入可能不完整，实际值: {actual_value}")

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
        time.sleep(2)

        next_step = _wait_for_post_email_step(driver, timeout=10)
        if next_step == "verification":
            return True, False
        if next_step != "password":
            return False, False

        print("🔑 等待密码输入框...")
        password_input = WebDriverWait(driver, SHORT_WAIT_TIME).until(
            EC.visibility_of_element_located(
                (By.CSS_SELECTOR, 'input[autocomplete="new-password"], input[type="password"]')
            )
        )
        password_input.clear()
        time.sleep(0.5)
        type_slowly(password_input, password)
        print("✅ 已输入密码")
        time.sleep(2)

        print("🔘 点击继续按钮...")
        if not click_button_with_retry(
            driver, 'button[type="submit"]', monitor_callback=monitor_callback
        ):
            print("❌ 点击继续按钮失败")
            return False, False
        print("✅ 已点击继续")

        time.sleep(3)
        while check_and_handle_error(driver, monitor_callback=monitor_callback):
            _sleep_with_heartbeat(
                driver,
                2,
                monitor_callback=monitor_callback,
                step_name="error_recheck_wait",
            )

        return True, True

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
        driver.get("https://chat.openai.com/auth/login")
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

        # 2. 输入生日
        print("🎂 正在输入生日...")
        time.sleep(1)

        # 年份
        year_input = WebDriverWait(driver, 30).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, '[data-type="year"]'))
        )
        driver.execute_script(
            "arguments[0].scrollIntoView({block: 'center'});", year_input
        )
        time.sleep(0.5)

        actions = ActionChains(driver)
        actions.click(year_input).perform()
        time.sleep(0.3)
        year_input.send_keys(Keys.CONTROL + "a")
        time.sleep(0.1)
        type_slowly(year_input, birthday_year, delay=0.1)
        time.sleep(0.5)

        # 月份
        month_input = driver.find_element(By.CSS_SELECTOR, '[data-type="month"]')
        actions = ActionChains(driver)
        actions.click(month_input).perform()
        time.sleep(0.3)
        month_input.send_keys(Keys.CONTROL + "a")
        time.sleep(0.1)
        type_slowly(month_input, birthday_month, delay=0.1)
        time.sleep(0.5)

        # 日期
        day_input = driver.find_element(By.CSS_SELECTOR, '[data-type="day"]')
        actions = ActionChains(driver)
        actions.click(day_input).perform()
        time.sleep(0.3)
        day_input.send_keys(Keys.CONTROL + "a")
        time.sleep(0.1)
        type_slowly(day_input, birthday_day, delay=0.1)

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


def verify_logged_in(driver, timeout=45):
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

            # 如果 URL 已不在 auth 路径，且没有明显登录/注册提示，作为兜底判定
            if "auth" not in current_url:
                print("✅ 登录状态验证成功（URL 兜底判定）")
                return True

        except Exception as e:
            print(f"  登录状态检查中断: {e}")

        time.sleep(2)

    print("❌ 登录状态验证失败：超时仍未确认登录")
    return False
