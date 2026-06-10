from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Optional
import time

import requests
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service


LogFn = Callable[[str], None]


@dataclass
class RoxyConfig:
    token: str
    workspace_id: int
    dir_id: str
    api_host: str = "http://127.0.0.1:50000"
    force_open: bool = False
    headless: bool = False
    proxy: dict[str, Any] | None = None

    @classmethod
    def from_payload(cls, payload: dict) -> "RoxyConfig":
        token = str(payload.get("token") or "").strip()
        dir_id = str(payload.get("dir_id") or payload.get("dirId") or "").strip()
        api_host = str(payload.get("api_host") or payload.get("apiHost") or "http://127.0.0.1:50000").strip()
        try:
            workspace_id = int(payload.get("workspace_id") or payload.get("workspaceId") or 0)
        except (TypeError, ValueError):
            workspace_id = 0

        if not token:
            raise ValueError("请先输入 Roxy API Token")
        if workspace_id <= 0:
            raise ValueError("请填写有效的 workspaceId")
        if not dir_id:
            raise ValueError("请填写 Roxy 窗口 dirId")

        return cls(
            token=token,
            workspace_id=workspace_id,
            dir_id=dir_id,
            api_host=api_host.rstrip("/"),
            force_open=bool(payload.get("force_open") or payload.get("forceOpen")),
            headless=bool(payload.get("headless")),
            proxy=payload.get("proxy") if isinstance(payload.get("proxy"), dict) else None,
        )


def roxy_proxy_info(proxy: dict[str, Any] | None) -> dict[str, Any]:
    if not proxy or not proxy.get("enabled"):
        return {
            "moduleId": 0,
            "proxyMethod": "custom",
            "proxyCategory": "noproxy",
            "ipType": "IPV4",
            "host": "",
            "port": "",
            "proxyUserName": "",
            "proxyPassword": "",
            "refreshUrl": "",
            "checkChannel": "IPRust.io",
        }

    protocol = str(proxy.get("type") or "http").strip().upper()
    if protocol in {"SOCKS", "SOCKS5"}:
        protocol = "SOCKS5"
    elif protocol not in {"HTTP", "HTTPS", "SOCKS5"}:
        protocol = "HTTP"

    use_auth = bool(proxy.get("use_auth") or proxy.get("username"))
    return {
        "moduleId": 0,
        "proxyMethod": "custom",
        "proxyCategory": protocol,
        "ipType": "IPV4",
        "protocol": protocol,
        "host": str(proxy.get("host") or "").strip(),
        "port": str(proxy.get("port") or "").strip(),
        "proxyUserName": str(proxy.get("username") or "").strip() if use_auth else "",
        "proxyPassword": str(proxy.get("password") or "") if use_auth else "",
        "refreshUrl": str(proxy.get("refresh_url") or proxy.get("refreshUrl") or ""),
        "checkChannel": str(proxy.get("check_channel") or proxy.get("checkChannel") or "IPRust.io"),
    }


class RoxyApiClient:
    def __init__(self, config: RoxyConfig, log: Optional[LogFn] = None):
        self.config = config
        self.log = log or (lambda _message: None)

    def _request(self, method: str, path: str, **kwargs) -> dict:
        url = f"{self.config.api_host}{path}"
        headers = dict(kwargs.pop("headers", {}) or {})
        headers["token"] = self.config.token
        if "json" in kwargs:
            headers.setdefault("Content-Type", "application/json")
        self.log(f"Roxy API {method.upper()} {path}")
        response = requests.request(method, url, headers=headers, timeout=30, **kwargs)
        try:
            payload = response.json()
        except ValueError as exc:
            raise RuntimeError(f"Roxy API 返回非 JSON: HTTP {response.status_code}") from exc
        if response.status_code >= 400:
            raise RuntimeError(f"Roxy API HTTP {response.status_code}: {payload}")
        if payload.get("code") not in (0, "0", None):
            raise RuntimeError(str(payload.get("msg") or payload))
        return payload

    def health(self) -> dict:
        return self._request("GET", "/health")

    def open_browser(self) -> dict:
        payload = {
            "workspaceId": self.config.workspace_id,
            "dirId": self.config.dir_id,
            "forceOpen": self.config.force_open,
            "headless": self.config.headless,
            "args": ["--remote-allow-origins=*"],
        }
        result = self._request("POST", "/browser/open", json=payload)
        data = result.get("data") or {}
        if not data.get("http") or not data.get("driver"):
            raise RuntimeError("Roxy /browser/open 缺少 http 或 driver 返回值")
        return data

    def close_browser(self) -> dict:
        return self._request("POST", "/browser/close", json={"dirId": self.config.dir_id})

    def modify_browser_proxy(self, proxy: dict[str, Any] | None) -> dict:
        payload = {
            "workspaceId": self.config.workspace_id,
            "dirId": self.config.dir_id,
            "proxyInfo": roxy_proxy_info(proxy),
        }
        return self._request("POST", "/browser/mdf", json=payload)


class RoxySeleniumSession:
    def __init__(self, config: RoxyConfig, log: Optional[LogFn] = None):
        self.config = config
        self.log = log or (lambda _message: None)
        self.client = RoxyApiClient(config, self.log)
        self.driver: webdriver.Chrome | None = None
        self.open_info: dict = {}

    def open(self) -> dict:
        self.log("检查 Roxy API 健康状态")
        self.client.health()
        if self.config.proxy is not None:
            self.log("Sync Roxy proxy profile setting")
            self.client.modify_browser_proxy(self.config.proxy)
        self.log("打开 Roxy 浏览器窗口")
        self.open_info = self.client.open_browser()
        self.log(f"Roxy 窗口已打开，调试地址: {self.open_info.get('http')}")
        self.driver = self._attach_driver(self.open_info)
        self.log("Selenium 已连接到 Roxy 窗口")
        return self.open_info

    def _attach_driver(self, open_info: dict) -> webdriver.Chrome:
        driver_path = str(open_info["driver"])
        driver_name = Path(driver_path).name.lower()
        if "geckodriver" in driver_name:
            raise RuntimeError(
                "Roxy 返回的是 geckodriver，说明当前窗口使用 Firefox 内核。"
                "Roxy 官方 Selenium 示例使用 chromedriver + debuggerAddress，"
                "请把该 Roxy 窗口的内核/核心版本切换为 Chromium/Chrome 后再执行。"
            )
        if "chromedriver" not in driver_name:
            raise RuntimeError(f"不支持的 Roxy WebDriver: {driver_path}")
        debugger_address = str(open_info["http"]).replace("http://", "").replace("https://", "")
        options = Options()
        options.add_experimental_option("debuggerAddress", debugger_address)
        service = Service(executable_path=driver_path)
        return webdriver.Chrome(service=service, options=options)

    def navigate(self, url: str) -> str:
        driver = self.require_driver()
        target = str(url or "").strip()
        if not target:
            raise ValueError("URL 不能为空")
        if "://" not in target:
            target = "https://" + target
        self.log(f"导航到 {target}")
        driver.get(target)
        return driver.current_url

    def run_js(self, script: str):
        driver = self.require_driver()
        code = str(script or "").strip()
        if not code:
            raise ValueError("JS 脚本不能为空")
        self.log("执行页面 JS")
        return driver.execute_script(code)

    def snapshot(self) -> dict:
        driver = self.require_driver()
        return {
            "title": driver.title,
            "url": driver.current_url,
            "window_handles": list(driver.window_handles),
        }

    def close(self, close_roxy_window: bool = False) -> None:
        if self.driver is not None:
            try:
                self.driver.quit()
            except Exception as exc:
                self.log(f"Selenium 断开时出现警告: {exc}")
            self.driver = None
        if close_roxy_window:
            self.log("关闭 Roxy 浏览器窗口")
            self.client.close_browser()

    def require_driver(self) -> webdriver.Chrome:
        if self.driver is None:
            raise RuntimeError("Selenium 尚未连接，请先打开窗口")
        return self.driver


def smoke_test(config: RoxyConfig, url: str, log: Optional[LogFn] = None) -> dict:
    session = RoxySeleniumSession(config, log)
    started_at = time.time()
    try:
        open_info = session.open()
        current_url = session.navigate(url or "https://chatgpt.com")
        snapshot = session.snapshot()
        return {
            "ok": True,
            "open_info": open_info,
            "current_url": current_url,
            "snapshot": snapshot,
            "elapsed": round(time.time() - started_at, 2),
        }
    finally:
        session.close(close_roxy_window=False)
