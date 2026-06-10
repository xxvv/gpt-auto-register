from __future__ import annotations

import os
import threading
import contextlib
import io
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urlparse

from flask import Flask, jsonify, request, send_from_directory
from waitress import serve

from . import payment_service
from . import roxy_flow_service
from .config import cfg
from .roxy_selenium_service import RoxyConfig, RoxySeleniumSession, smoke_test
from .utils import describe_proxy


PROJECT_ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = PROJECT_ROOT / "static"

app = Flask(__name__, static_url_path="", static_folder=str(STATIC_DIR))


@app.after_request
def no_cache_static(response):
    if request.path in {"/", "/roxy-console.css", "/roxy-console.js"}:
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


class RoxyConsoleState:
    def __init__(self):
        self.lock = threading.Lock()
        self.logs: list[str] = []
        self.session: RoxySeleniumSession | None = None
        self.running = False
        self.last_snapshot: dict = {}
        self.last_settings: dict = {}
        self.current_proxy: dict = {}

    def log(self, message: str) -> None:
        timestamp = datetime.now().strftime("%H:%M:%S")
        with self.lock:
            self.logs.append(f"[{timestamp}] {message}")
            if len(self.logs) > 1000:
                self.logs = self.logs[-1000:]

    def get_logs(self, start_index: int = 0) -> list[str]:
        with self.lock:
            return list(self.logs[start_index:])

    def set_session(self, session: RoxySeleniumSession | None) -> None:
        with self.lock:
            self.session = session

    def get_session(self) -> RoxySeleniumSession | None:
        with self.lock:
            return self.session

    def set_running(self, value: bool) -> None:
        with self.lock:
            self.running = bool(value)

    def set_snapshot(self, snapshot: dict) -> None:
        with self.lock:
            self.last_snapshot = dict(snapshot or {})

    def set_settings(self, settings: dict) -> None:
        with self.lock:
            self.last_settings = dict(settings or {})

    def set_proxy(self, proxy: dict | None) -> None:
        with self.lock:
            self.current_proxy = dict(proxy or {})

    def get_proxy(self) -> dict:
        with self.lock:
            return dict(self.current_proxy or {})

    def status(self, log_index: int = 0) -> dict:
        with self.lock:
            return {
                "running": self.running,
                "connected": self.session is not None and self.session.driver is not None,
                "snapshot": dict(self.last_snapshot),
                "settings_count": len(self.last_settings),
                "current_proxy": dict(self.current_proxy or {}),
                "logs": list(self.logs[log_index:]),
            }


state = RoxyConsoleState()


def _json_error(exc: Exception, status: int = 400):
    state.log(f"错误: {exc}")
    return jsonify({"ok": False, "error": str(exc)}), status


def _payload() -> dict:
    data = request.get_json(silent=True)
    payload = data if isinstance(data, dict) else {}
    settings = payload.get("settings")
    if isinstance(settings, dict):
        state.set_settings(settings)
    return payload


def _as_bool(value, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def _disabled_proxy() -> dict:
    return {
        "enabled": False,
        "type": "http",
        "host": "",
        "port": 0,
        "use_auth": False,
        "username": "",
        "password": "",
    }


def _runtime_proxy(proxy: dict | None) -> dict | None:
    if not isinstance(proxy, dict) or not proxy:
        return None
    if not proxy.get("enabled"):
        return _disabled_proxy()
    host = str(proxy.get("host") or "").strip()
    try:
        port = int(proxy.get("port") or 0)
    except (TypeError, ValueError):
        port = 0
    if not host or port <= 0:
        return None
    proxy_type = str(proxy.get("type") or "http").strip().lower()
    if proxy_type in {"socks", "socks5"}:
        proxy_type = "socks5"
    elif proxy_type not in {"http", "https"}:
        proxy_type = "http"
    username = str(proxy.get("username") or "")
    password = str(proxy.get("password") or "")
    use_auth = _as_bool(proxy.get("use_auth"), bool(username))
    return {
        "enabled": True,
        "type": proxy_type,
        "host": host,
        "port": port,
        "use_auth": use_auth,
        "username": username if use_auth else "",
        "password": password if use_auth else "",
    }


def _parse_proxy_url(value: str) -> dict | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    parsed = urlparse(raw if "://" in raw else f"http://{raw}")
    host = str(parsed.hostname or "").strip()
    if not host or not parsed.port:
        raise ValueError("proxyUrlInput must include host and port")
    proxy_type = (parsed.scheme or "http").lower()
    return _runtime_proxy(
        {
            "enabled": True,
            "type": proxy_type,
            "host": host,
            "port": parsed.port,
            "use_auth": bool(parsed.username),
            "username": unquote(parsed.username or ""),
            "password": unquote(parsed.password or ""),
        }
    )


def _first_non_empty_line(value: str) -> str:
    for line in str(value or "").splitlines():
        item = line.strip()
        if item:
            return item
    return ""


def _proxy_from_payload(
    payload: dict,
    *,
    fallback_to_state: bool = True,
    fallback_to_webshare: bool = False,
) -> dict | None:
    settings = payload.get("settings") if isinstance(payload.get("settings"), dict) else {}
    if "proxyEnabledCheckbox" in settings and not _as_bool(settings.get("proxyEnabledCheckbox")):
        return _disabled_proxy()
    proxy = _runtime_proxy(payload.get("proxy"))
    if proxy:
        return proxy
    manual_proxy = _parse_proxy_url(settings.get("proxyUrlInput", ""))
    if manual_proxy:
        return manual_proxy
    if fallback_to_state:
        state_proxy = _runtime_proxy(state.get_proxy())
        if state_proxy:
            return state_proxy
    if fallback_to_webshare and _first_non_empty_line(settings.get("webshareApiKeyInput", "")):
        payment_cfg = _payment_cfg_from_settings(settings)
        proxy = payment_service.get_current_webshare_static_proxy(
            payment_cfg=payment_cfg,
            prefer_http=_prefer_http(settings),
        )
        state.set_proxy(proxy)
        return proxy
    return None


def _payload_with_proxy(payload: dict, *, fallback_to_webshare: bool = False) -> dict:
    proxy = _proxy_from_payload(payload, fallback_to_webshare=fallback_to_webshare)
    if proxy is None:
        return payload
    enriched = dict(payload)
    enriched["proxy"] = proxy
    return enriched


def _payment_cfg_from_settings(settings: dict):
    api_key = _first_non_empty_line(settings.get("webshareApiKeyInput", ""))
    return payment_service.with_webshare_api_key(cfg.payment, api_key)


def _prefer_http(settings: dict) -> bool:
    return str(settings.get("proxyProtocolSelect") or "http").strip().lower() == "http"


def _proxy_country(settings: dict, key: str = "step1ProxyCountrySelect") -> str:
    country = str(settings.get(key) or "US").strip().upper()
    if country in {"", "KEEP_STEP1", "KEEP_STEP3"}:
        return "US"
    return country


def _call_with_log_capture(func, *args, **kwargs):
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(buffer):
        result = func(*args, **kwargs)
    for line in buffer.getvalue().splitlines():
        if line.strip():
            state.log(line.strip())
    return result


def _prepare_flow_proxy(payload: dict) -> dict | None:
    settings = payload.get("settings") if isinstance(payload.get("settings"), dict) else {}
    if "proxyEnabledCheckbox" in settings and not _as_bool(settings.get("proxyEnabledCheckbox")):
        state.log("Flow proxy disabled, clearing Roxy proxy")
        return _disabled_proxy()

    manual_proxy = _parse_proxy_url(settings.get("proxyUrlInput", ""))
    if manual_proxy:
        state.log(f"Flow proxy using manual proxy: {describe_proxy(manual_proxy)}")
        return manual_proxy

    country = _proxy_country(settings)
    if country == "NONE":
        state.log("Flow proxy country is NONE, clearing Roxy proxy")
        return _disabled_proxy()

    api_key = _first_non_empty_line(settings.get("webshareApiKeyInput", ""))
    if api_key:
        state.log(f"Flow proxy replacing Webshare proxy: country={country}")
        payment_cfg = _payment_cfg_from_settings(settings)
        return _call_with_log_capture(
            payment_service.replace_webshare_static_proxy,
            payment_cfg=payment_cfg,
            prefer_http=_prefer_http(settings),
            country_code=country,
        )

    state_proxy = _runtime_proxy(state.get_proxy())
    if state_proxy:
        state.log(f"Flow proxy using cached proxy: {describe_proxy(state_proxy)}")
        return state_proxy

    raise RuntimeError("Flow proxy enabled, but no manual proxy/Webshare key/cached proxy found")


def _apply_proxy_to_roxy(payload: dict, proxy: dict | None) -> dict:
    config = RoxyConfig.from_payload({**payload, "proxy": proxy})
    client = RoxySeleniumSession(config, state.log).client
    client.modify_browser_proxy(proxy)
    state.set_proxy(proxy)
    state.log(f"Roxy proxy applied: {describe_proxy(proxy)}")
    return {"ok": True, "proxy": proxy}


def _run_background(label: str, target, *args, **kwargs):
    def runner():
        state.set_running(True)
        state.log(f"{label} 开始")
        try:
            result = target(*args, **kwargs)
            if isinstance(result, dict):
                state.set_snapshot(result.get("snapshot") or result)
            state.log(f"{label} 完成")
        except Exception as exc:
            state.log(f"{label} 失败: {exc}")
        finally:
            state.set_running(False)

    thread = threading.Thread(target=runner, daemon=True)
    thread.start()


@app.route("/")
def index():
    return send_from_directory(str(STATIC_DIR), "roxy-console.html")


@app.route("/roxy-console.css")
def css():
    return send_from_directory(str(STATIC_DIR), "roxy-console.css")


@app.route("/roxy-console.js")
def js():
    return send_from_directory(str(STATIC_DIR), "roxy-console.js")


@app.route("/api/roxy/status")
def api_status():
    try:
        log_index = int(request.args.get("log_index", "0"))
    except ValueError:
        log_index = 0
    return jsonify(state.status(max(log_index, 0)))


@app.route("/api/roxy/health", methods=["POST"])
def api_health():
    try:
        config = RoxyConfig.from_payload(_payload_with_proxy(_payload()))
        client = RoxySeleniumSession(config, state.log).client
        payload = client.health()
        state.log("Roxy API 健康检查成功")
        return jsonify({"ok": True, "data": payload})
    except Exception as exc:
        return _json_error(exc)


@app.route("/api/roxy/open", methods=["POST"])
def api_open():
    try:
        config = RoxyConfig.from_payload(_payload_with_proxy(_payload(), fallback_to_webshare=True))
    except Exception as exc:
        return _json_error(exc)

    def open_session():
        old_session = state.get_session()
        if old_session is not None:
            old_session.close(close_roxy_window=False)
        session = RoxySeleniumSession(config, state.log)
        session.open()
        state.set_session(session)
        state.set_snapshot(session.snapshot())

    _run_background("打开并连接 Roxy 窗口", open_session)
    return jsonify({"ok": True})


@app.route("/api/roxy/navigate", methods=["POST"])
def api_navigate():
    data = _payload()
    url = str(data.get("url") or "").strip()
    session = state.get_session()
    if session is None:
        return _json_error(RuntimeError("请先打开并连接 Roxy 窗口"))

    def navigate():
        session.navigate(url)
        state.set_snapshot(session.snapshot())

    _run_background("导航任务", navigate)
    return jsonify({"ok": True})


@app.route("/api/roxy/run-js", methods=["POST"])
def api_run_js():
    data = _payload()
    script = str(data.get("script") or "").strip()
    session = state.get_session()
    if session is None:
        return _json_error(RuntimeError("请先打开并连接 Roxy 窗口"))

    def run_js():
        result = session.run_js(script)
        snapshot = session.snapshot()
        snapshot["js_result"] = result
        state.set_snapshot(snapshot)
        state.log(f"JS 返回: {result!r}")

    _run_background("JS 执行任务", run_js)
    return jsonify({"ok": True})


@app.route("/api/roxy/action", methods=["GET", "POST", "OPTIONS"])
def api_action():
    if request.method == "OPTIONS":
        return jsonify({"ok": True})
    data = _payload() if request.method == "POST" else dict(request.args)
    action = str(data.get("action") or "").strip()
    settings = data.get("settings") if isinstance(data.get("settings"), dict) else {}
    if not action:
        return _json_error(ValueError("缺少 action"))
    session = state.get_session()
    config = None
    proxy_actions = {"proxy.current", "proxy.apply", "proxy.replace", "proxy.clear"}
    if action in proxy_actions:
        try:
            if action == "proxy.current":
                payment_cfg = _payment_cfg_from_settings(settings)
                proxy = _call_with_log_capture(
                    payment_service.get_current_webshare_static_proxy,
                    payment_cfg=payment_cfg,
                    prefer_http=_prefer_http(settings),
                )
            elif action == "proxy.replace":
                payment_cfg = _payment_cfg_from_settings(settings)
                proxy = _call_with_log_capture(
                    payment_service.replace_webshare_static_proxy,
                    payment_cfg=payment_cfg,
                    prefer_http=_prefer_http(settings),
                    country_code=_proxy_country(settings),
                )
            elif action == "proxy.clear":
                proxy = _disabled_proxy()
            else:
                proxy = _proxy_from_payload(data, fallback_to_state=True)
                if proxy is None:
                    raise ValueError("No proxy is configured")
            result = _apply_proxy_to_roxy(data, proxy)
            return jsonify(result)
        except Exception as exc:
            return _json_error(exc)

    flow_actions = {"flow.full", "flow.to_step2", "flow.team_registration"}
    if action in flow_actions:
        proxy = _prepare_flow_proxy(data)
        if proxy is not None:
            data = dict(data)
            data["proxy"] = proxy
            try:
                _apply_proxy_to_roxy(data, proxy)
            except Exception as exc:
                return _json_error(exc)
        if session is not None:
            try:
                session.close(close_roxy_window=True)
            finally:
                state.set_session(None)
                session = None
    else:
        data = _payload_with_proxy(data, fallback_to_webshare=True)
    if action != "flow.cancel" and (session is None or session.driver is None):
        try:
            config = RoxyConfig.from_payload(data)
        except Exception as exc:
            return _json_error(exc)

    def run_action():
        nonlocal session
        if action == "flow.cancel":
            state.log("收到取消请求；当前 Python Selenium 任务会在安全点结束")
            return
        opened_for_action = False
        state.log(f"收到 v2 动作: {action}")
        state.log(f"配置项数量: {len(settings)}")
        run_count = str(settings.get("runCountInput") or "1").strip()
        if run_count:
            state.log(f"执行次数: {run_count}")
        try:
            if session is None or session.driver is None:
                state.log("自动打开 Roxy 浏览器窗口")
                session = RoxySeleniumSession(config, state.log)
                session.open()
                state.set_session(session)
                opened_for_action = True
            result = roxy_flow_service.run_action(action, settings, session.driver, state.log)
            if not result.ok:
                raise RuntimeError(result.error or f"动作失败: {action}")
            state.set_snapshot({
                "title": f"v2 action: {action}",
                "url": getattr(session.driver, "current_url", ""),
                "window_handles": list(getattr(session.driver, "window_handles", []) or []),
                "js_result": {
                    "action": action,
                    "settings_count": len(settings),
                    "email": result.email,
                    "ok": result.ok,
                },
            })
        finally:
            if session is not None:
                state.log("任务结束，关闭 Roxy 浏览器窗口")
                session.close(close_roxy_window=True)
                state.set_session(None)
                if opened_for_action:
                    state.log("自动打开的 Roxy 窗口已关闭")

    _run_background(f"v2 动作 {action}", run_action)
    return jsonify({"ok": True})


@app.route("/api/roxy/smoke-test", methods=["POST"])
def api_smoke_test():
    data = _payload()
    try:
        config = RoxyConfig.from_payload(_payload_with_proxy(data, fallback_to_webshare=True))
    except Exception as exc:
        return _json_error(exc)
    url = str(data.get("url") or "https://chatgpt.com").strip()
    _run_background("Selenium 冒烟测试", smoke_test, config, url, state.log)
    return jsonify({"ok": True})


@app.route("/api/roxy/disconnect", methods=["POST"])
def api_disconnect():
    data = _payload()
    close_roxy_window = bool(data.get("close_roxy_window") or data.get("closeRoxyWindow"))
    session = state.get_session()
    if session is not None:
        try:
            session.close(close_roxy_window=close_roxy_window)
        finally:
            state.set_session(None)
            state.log("Selenium 已断开")
    return jsonify({"ok": True})


@app.route("/api/roxy/clear-logs", methods=["POST"])
def api_clear_logs():
    with state.lock:
        state.logs.clear()
    return jsonify({"ok": True})


def serve_roxy_console():
    host = os.getenv("ROXY_WEB_HOST", "127.0.0.1")
    port = int(os.getenv("ROXY_WEB_PORT", "7861"))
    display_host = "localhost" if host in {"0.0.0.0", "::", ""} else host
    print(f"Roxy Selenium Console: http://{display_host}:{port}")
    serve(app, host=host, port=port, threads=6)


if __name__ == "__main__":
    serve_roxy_console()
