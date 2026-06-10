from __future__ import annotations

import dataclasses
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request, send_from_directory

from .automation import (
    RoxyClient,
    parse_phone_tasks,
    parse_url_queue,
    run_url_task,
)


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="")


@dataclasses.dataclass
class RunState:
    running: bool = False
    stop_requested: bool = False
    current_url: str = ""
    total: int = 0
    completed: int = 0
    success: int = 0
    fail: int = 0
    pending_urls: list[str] = dataclasses.field(default_factory=list)
    consumed_urls: list[str] = dataclasses.field(default_factory=list)
    logs: list[str] = dataclasses.field(default_factory=list)
    thread: threading.Thread | None = None
    token: str = ""
    workspace_id: str = ""
    window_id: str = ""
    phone_queue_key: tuple[tuple[str, str], ...] = dataclasses.field(default_factory=tuple)
    phone_task: Any = None


STATE = RunState()
LOCK = threading.RLock()


def log(message: str) -> None:
    timestamp = datetime.now().strftime("%H:%M:%S")
    line = f"[{timestamp}] {message}"
    with LOCK:
        STATE.logs.append(line)
        STATE.logs = STATE.logs[-500:]


def snapshot() -> dict[str, Any]:
    with LOCK:
        return {
            "running": STATE.running,
            "stop_requested": STATE.stop_requested,
            "current_url": STATE.current_url,
            "total": STATE.total,
            "completed": STATE.completed,
            "success": STATE.success,
            "fail": STATE.fail,
            "pending_urls": list(STATE.pending_urls),
            "pending_count": len(STATE.pending_urls),
            "consumed_urls": list(STATE.consumed_urls),
            "logs": list(STATE.logs),
        }


def _payload() -> dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _json_error(error: Exception, status: int = 400):
    return jsonify({"ok": False, "error": str(error)}), status


def _urls_from_payload(data: dict[str, Any]) -> list[str]:
    parts: list[str] = []
    raw_urls = data.get("urls")
    if isinstance(raw_urls, list):
        parts.extend(str(item or "") for item in raw_urls)
    elif raw_urls not in (None, ""):
        parts.append(str(raw_urls))
    parts.append(str(data.get("urlQueueText") or ""))
    return parse_url_queue("\n".join(parts))


def _phone_queue_key(phone_tasks) -> tuple[tuple[str, str], ...]:
    return tuple((task.phone, task.sms_url) for task in phone_tasks)


def _run_config_from_payload(data: dict[str, Any]) -> dict[str, Any]:
    token = str(data.get("roxyToken") or data.get("token") or "").strip()
    workspace_id = str(data.get("workspaceId") or "").strip()
    window_id = str(data.get("windowId") or data.get("dirId") or "").strip()
    urls = _urls_from_payload(data)
    phones = parse_phone_tasks(str(data.get("phoneQueueText") or ""))
    if not token:
        raise ValueError("Roxy Token 不能为空")
    if not window_id:
        raise ValueError("窗口 ID 不能为空")
    if not urls:
        raise ValueError("URL 队列不能为空")
    if not phones:
        raise ValueError("手机号队列没有可解析记录")
    return {
        "token": token,
        "workspace_id": workspace_id,
        "window_id": window_id,
        "urls": urls,
        "phone_task": phones[0],
        "phone_queue_key": _phone_queue_key(phones),
    }


def _reset_for_new_run_locked(config: dict[str, Any]) -> None:
    STATE.running = True
    STATE.stop_requested = False
    STATE.current_url = ""
    STATE.total = len(config["urls"])
    STATE.completed = 0
    STATE.success = 0
    STATE.fail = 0
    STATE.pending_urls = list(config["urls"])
    STATE.consumed_urls = []
    STATE.logs = []
    STATE.token = config["token"]
    STATE.workspace_id = config["workspace_id"]
    STATE.window_id = config["window_id"]
    STATE.phone_queue_key = config["phone_queue_key"]
    STATE.phone_task = config["phone_task"]


def _start_worker_locked() -> None:
    thread = threading.Thread(
        target=_run_batch,
        args=(STATE.token, STATE.workspace_id, STATE.window_id, STATE.phone_task),
        daemon=True,
    )
    STATE.thread = thread
    thread.start()


def _clear_runtime_config_locked() -> None:
    STATE.token = ""
    STATE.workspace_id = ""
    STATE.window_id = ""
    STATE.phone_queue_key = ()
    STATE.phone_task = None


@app.get("/")
def index():
    return send_from_directory(str(STATIC_DIR), "index.html")


@app.post("/api/health")
def health():
    try:
        token = str(_payload().get("roxyToken") or _payload().get("token") or "").strip()
        result = RoxyClient(token).health()
        return jsonify({"ok": True, "result": result})
    except Exception as exc:
        return _json_error(exc)


@app.post("/api/run")
def run():
    try:
        config = _run_config_from_payload(_payload())
        with LOCK:
            if STATE.running:
                raise RuntimeError("已有任务正在运行")
            _reset_for_new_run_locked(config)
            _start_worker_locked()
        log(f"任务启动，共 {len(config['urls'])} 个 URL")
        return jsonify({"ok": True, "status": snapshot()})
    except Exception as exc:
        with LOCK:
            if not STATE.thread or not STATE.thread.is_alive():
                STATE.running = False
        return _json_error(exc)


@app.post("/api/push")
def push():
    try:
        config = _run_config_from_payload(_payload())
        should_log_started = False
        with LOCK:
            if STATE.running:
                if config["token"] != STATE.token:
                    raise ValueError("Roxy Token 与当前运行任务不一致")
                if config["workspace_id"] != STATE.workspace_id:
                    raise ValueError("工作空间 ID 与当前运行任务不一致")
                if config["window_id"] != STATE.window_id:
                    raise ValueError("窗口 ID 与当前运行任务不一致")
                if config["phone_queue_key"] != STATE.phone_queue_key:
                    raise ValueError("手机号队列与当前运行任务不一致")
                STATE.pending_urls.extend(config["urls"])
                STATE.total += len(config["urls"])
            else:
                _reset_for_new_run_locked(config)
                _start_worker_locked()
                should_log_started = True
            pending_count = len(STATE.pending_urls)

        if should_log_started:
            log("推送触发任务启动")
        log(f"收到推送 URL {len(config['urls'])} 个；当前待处理 {pending_count} 个")
        return jsonify({"ok": True, "status": snapshot()})
    except Exception as exc:
        with LOCK:
            if not STATE.thread or not STATE.thread.is_alive():
                STATE.running = False
        return _json_error(exc)


@app.post("/api/stop")
def stop():
    with LOCK:
        STATE.stop_requested = True
    log("收到停止请求")
    return jsonify({"ok": True, "status": snapshot()})


@app.get("/api/status")
def status():
    return jsonify({"ok": True, "status": snapshot()})


def _run_batch(token: str, workspace_id: str, window_id: str, phone_task) -> None:
    try:
        while True:
            with LOCK:
                if STATE.stop_requested:
                    log("任务已停止，剩余 URL 保留在待处理队列")
                    break
                if not STATE.pending_urls:
                    break
                url = STATE.pending_urls.pop(0)
                STATE.current_url = url
            try:
                log(f"开始处理 URL: {url}")
                result = run_url_task(
                    token=token,
                    workspace_id=workspace_id,
                    window_id=window_id,
                    url=url,
                    phone_task=phone_task,
                    log=log,
                    stop_requested=lambda: snapshot()["stop_requested"],
                )
                log(f"URL 执行成功: {url} email={result.get('email', '')}")
                with LOCK:
                    STATE.success += 1
            except Exception as exc:
                log(f"URL 执行失败并移除: {url} error={exc}")
                with LOCK:
                    STATE.fail += 1
            finally:
                with LOCK:
                    STATE.completed += 1
                    STATE.consumed_urls.append(url)
                    STATE.current_url = ""
        log("任务结束")
    finally:
        with LOCK:
            STATE.running = False
            STATE.stop_requested = False
            if not STATE.pending_urls:
                _clear_runtime_config_locked()


def serve(host: str = "127.0.0.1", port: int = 8765) -> None:
    print(f"Roxy step4 console: http://{host}:{port}")
    app.run(host=host, port=port, threaded=True)


if __name__ == "__main__":
    serve()
