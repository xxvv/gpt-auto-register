from __future__ import annotations

import os
import threading
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from waitress import serve

from . import roxy_flow_service
from .roxy_selenium_service import RoxyConfig, RoxySeleniumSession, smoke_test


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

    def status(self, log_index: int = 0) -> dict:
        with self.lock:
            return {
                "running": self.running,
                "connected": self.session is not None and self.session.driver is not None,
                "snapshot": dict(self.last_snapshot),
                "settings_count": len(self.last_settings),
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
        config = RoxyConfig.from_payload(_payload())
        client = RoxySeleniumSession(config, state.log).client
        payload = client.health()
        state.log("Roxy API 健康检查成功")
        return jsonify({"ok": True, "data": payload})
    except Exception as exc:
        return _json_error(exc)


@app.route("/api/roxy/open", methods=["POST"])
def api_open():
    try:
        config = RoxyConfig.from_payload(_payload())
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
        config = RoxyConfig.from_payload(data)
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
