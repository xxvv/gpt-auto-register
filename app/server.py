import threading
import time
import builtins
import os
import random
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory

# 导入业务逻辑
from . import main
from . import browser
from . import mailtm_service
from . import temporam_service
from . import email_providers
from . import token_batch_service
from .config import PROJECT_ROOT, cfg

STATIC_DIR = PROJECT_ROOT / "static"

app = Flask(__name__, static_url_path="", static_folder=str(STATIC_DIR))

# ==========================================
# 🔧 状态管理与日志捕获
# ==========================================

# 全局状态
class AppState:
    def __init__(self):
        self.is_running = False
        self.stop_requested = False
        self.success_count = 0
        self.fail_count = 0
        self.current_action = "等待启动"
        self.task_type = "idle"
        self.progress_total = 0
        self.progress_completed = 0
        self.progress_processed = 0
        self.progress_skipped = 0
        self.logs = []
        self.lock = threading.Lock()

        # 选中的邮箱提供商列表（默认全部启用）
        self.selected_providers = list(email_providers.PROVIDERS.keys())

        # 并行注册数（1 = 串行）
        self.parallel_count = 1

        # 是否使用 headless 浏览器
        self.headless = False

        # 代理配置
        self.proxy = {
            "enabled": False,
            "type": "http",
            "host": "",
            "port": 8080,
            "use_auth": False,
            "username": "",
            "password": "",
        }

        # MJPEG 流缓冲区
        self.last_frame = None
        self.frame_lock = threading.Lock()

    def add_log(self, message):
        timestamp = datetime.now().strftime("%H:%M:%S")
        with self.lock:
            self.logs.append(f"[{timestamp}] {message}")
            if len(self.logs) > 1000:
                self.logs.pop(0)

    def get_logs(self, start_index=0):
        with self.lock:
            return list(self.logs[start_index:])

    def update_frame(self, frame_bytes):
        with self.frame_lock:
            self.last_frame = frame_bytes

    def get_frame(self):
        with self.frame_lock:
            return self.last_frame

    def reset_progress(self, task_type="idle", total=0):
        with self.lock:
            self.task_type = task_type
            self.progress_total = total
            self.progress_completed = 0
            self.progress_processed = 0
            self.progress_skipped = 0

    def update_progress(self, *, task_type=None, total=None, completed=None, processed=None, skipped=None):
        with self.lock:
            if task_type is not None:
                self.task_type = task_type
            if total is not None:
                self.progress_total = total
            if completed is not None:
                self.progress_completed = completed
            if processed is not None:
                self.progress_processed = processed
            if skipped is not None:
                self.progress_skipped = skipped

    def get_progress(self):
        with self.lock:
            remaining = max(self.progress_total - self.progress_completed, 0)
            return {
                "task_type": self.task_type,
                "total": self.progress_total,
                "completed": self.progress_completed,
                "processed": self.progress_processed,
                "skipped": self.progress_skipped,
                "remaining": remaining,
            }

state = AppState()

# Hack: 劫持 print 函数以捕获日志
original_print = builtins.print
def hooked_print(*args, **kwargs):
    sep = kwargs.get('sep', ' ')
    msg = sep.join(map(str, args))
    state.add_log(msg)
    original_print(*args, **kwargs)

# 应用劫持到所有服务模块
main.print = hooked_print
browser.print = hooked_print
mailtm_service.print = hooked_print
temporam_service.print = hooked_print
email_providers.print = hooked_print
token_batch_service.print = hooked_print

# ==========================================
# 🧵 后台工作线程
# ==========================================
def worker_thread(count, selected_providers, parallel, headless, proxy):
    state.is_running = True
    state.stop_requested = False
    state.success_count = 0
    state.fail_count = 0
    state.current_action = f"🚀 任务启动，目标: {count}"
    state.reset_progress(task_type="registration", total=count)
    state.update_frame(None)

    main.print(f"🚀 开始批量任务，计划注册: {count} 个，并行数: {parallel}")
    main.print(f"📬 邮箱服务: {', '.join(selected_providers)}")
    main.print(f"🖥️ 浏览器模式: {'Headless' if headless else '有界面'}")
    if proxy and proxy.get("enabled"):
        main.print(f"🌐 代理: {proxy.get('type','http')}://{proxy.get('host','')}:{proxy.get('port','')}")

    counter_lock = threading.Lock()
    started = [0]

    def monitor(driver, _step):
        if state.stop_requested:
            main.print("🛑 检测到停止请求，正在中断任务...")
            raise InterruptedError("用户请求停止")
        try:
            state.update_frame(driver.get_screenshot_as_png())
        except Exception:
            pass

    def do_one(_):
        if state.stop_requested:
            return
        with counter_lock:
            started[0] += 1
            idx = started[0]
        state.current_action = f"正在注册 ({idx}/{count})..."
        provider = random.choice(selected_providers)
        try:
            _, _, success = main.register_one_account(
                monitor_callback=monitor,
                email_provider=provider,
                headless=headless,
                proxy=proxy,
            )
            with counter_lock:
                if success:
                    state.success_count += 1
                else:
                    state.fail_count += 1
                state.update_progress(
                    completed=state.success_count + state.fail_count,
                    processed=state.success_count,
                )
        except InterruptedError:
            main.print("🛑 任务已中断")
        except Exception as e:
            with counter_lock:
                state.fail_count += 1
                state.update_progress(
                    completed=state.success_count + state.fail_count,
                    processed=state.success_count,
                )
            main.print(f"❌ 异常: {str(e)}")

    try:
        with ThreadPoolExecutor(max_workers=parallel) as executor:
            futures = [executor.submit(do_one, i) for i in range(count)]
            for future in as_completed(futures):
                if state.stop_requested:
                    break
                try:
                    future.result()
                except Exception:
                    pass
    except Exception as e:
        main.print(f"💥 严重错误: {e}")
    finally:
        state.is_running = False
        state.current_action = "任务已完成"
        main.print("🏁 任务结束")


def token_worker_thread(accounts_file, output_dir, proxy):
    state.is_running = True
    state.stop_requested = False
    state.success_count = 0
    state.fail_count = 0
    state.reset_progress(task_type="token_import", total=0)
    state.current_action = "正在导入账号并获取 Token..."
    state.update_frame(None)

    main.print("📥 开始批量获取 Token")
    main.print(f"📄 TXT 路径: {accounts_file}")
    main.print(f"📁 输出目录: {output_dir}")

    def on_progress(progress):
        state.success_count = progress["success"]
        state.fail_count = progress["fail"]
        state.update_progress(
            task_type=progress["task_type"],
            total=progress["total"],
            completed=progress["completed"],
            processed=progress["processed"],
            skipped=progress["skipped"],
        )
        if progress["total"] > 0:
            state.current_action = (
                f"Token 获取中: {progress['completed']}/{progress['total']} "
                f"(成功 {progress['success']} / 失败 {progress['fail']} / 跳过 {progress['skipped']})"
            )
        if progress.get("current_email"):
            state.current_action += f" - {progress['current_email']}"

    try:
        result = token_batch_service.process_accounts_from_file(
            accounts_file=accounts_file,
            output_dir=output_dir,
            proxy=proxy,
            stop_requested=lambda: state.stop_requested,
            progress_callback=on_progress,
        )
        state.success_count = result["success"]
        state.fail_count = result["fail"]
        state.update_progress(
            task_type="token_import",
            total=result["total"],
            completed=result["completed"],
            processed=result["processed"],
            skipped=result["skipped"],
        )
        state.current_action = (
            f"Token 获取完成: {result['completed']}/{result['total']} "
            f"(成功 {result['success']} / 失败 {result['fail']} / 跳过 {result['skipped']})"
        )
        main.print(f"🏁 Token 获取完成，输出目录: {result['output_dir']}")
    except Exception as e:
        state.fail_count += 1
        state.current_action = "Token 获取失败"
        main.print(f"❌ Token 获取任务失败: {e}")
    finally:
        state.is_running = False

# ==========================================
# 🌊 MJPEG 流生成器
# ==========================================
def gen_frames():
    """生成流数据的生成器"""
    while True:
        frame = state.get_frame()
        if frame:
            yield (b'--frame\r\n'
                   b'Content-Type: image/png\r\n\r\n' + frame + b'\r\n')
        else:
            pass

        time.sleep(0.5)

@app.route('/video_feed')
def video_feed():
    return Flask.response_class(gen_frames(),
                               mimetype='multipart/x-mixed-replace; boundary=frame')

# ==========================================
# 🌐 API 接口
# ==========================================

@app.route('/')
def index():
    return send_from_directory(str(STATIC_DIR), 'index.html')

@app.route('/api/status')
def get_status():
    total_inventory = 0
    accounts_path = _resolve_repo_path(cfg.files.accounts_file)
    if accounts_path.exists():
        try:
            with open(accounts_path, 'r', encoding='utf-8') as f:
                total_inventory = sum(1 for line in f if '@' in line)
        except Exception:
            pass

    return jsonify({
        "is_running": state.is_running,
        "current_action": state.current_action,
        "success": state.success_count,
        "fail": state.fail_count,
        "progress": state.get_progress(),
        "total_inventory": total_inventory,
        "logs": state.get_logs(int(request.args.get('log_index', 0)))
    })

@app.route('/api/start', methods=['POST'])
def start_task():
    if state.is_running:
        return jsonify({"error": "Already running"}), 400

    data = request.json
    count = data.get('count', 1)

    # 使用当前选中的提供商列表
    providers = list(state.selected_providers)
    if not providers:
        providers = ["mailtm"]

    threading.Thread(
        target=worker_thread,
        args=(count, providers, state.parallel_count, state.headless, dict(state.proxy)),
        daemon=True
    ).start()
    return jsonify({"status": "started"})

@app.route('/api/settings', methods=['GET'])
def get_settings():
    return jsonify({
        "parallel": state.parallel_count,
        "headless": state.headless,
        "proxy": state.proxy,
    })


@app.route('/api/token-import/settings', methods=['GET'])
def get_token_import_settings():
    return jsonify({
        "accounts_file": str(_resolve_repo_path(cfg.files.accounts_file)),
        "output_dir": str(_resolve_repo_path(cfg.oauth.token_json_dir)),
    })


@app.route('/api/token-import/start', methods=['POST'])
def start_token_import():
    if state.is_running:
        return jsonify({"error": "Already running"}), 400

    data = request.json or {}
    accounts_file = str(_resolve_request_path(data.get("accounts_file", cfg.files.accounts_file)))
    output_dir = str(_resolve_request_path(data.get("output_dir", cfg.oauth.token_json_dir)))

    if not os.path.exists(accounts_file):
        return jsonify({"error": "账号 TXT 文件不存在"}), 400

    threading.Thread(
        target=token_worker_thread,
        args=(accounts_file, output_dir, dict(state.proxy)),
        daemon=True
    ).start()
    return jsonify({"status": "started", "accounts_file": accounts_file, "output_dir": output_dir})

@app.route('/api/settings', methods=['POST'])
def set_settings():
    data = request.json
    if "parallel" in data:
        state.parallel_count = max(1, min(10, int(data["parallel"])))
    if "headless" in data:
        state.headless = bool(data["headless"])
    if "proxy" in data:
        p = data["proxy"]
        state.proxy = {
            "enabled":  bool(p.get("enabled", False)),
            "type":     p.get("type", "http"),
            "host":     str(p.get("host", "")),
            "port":     int(p.get("port", 8080)),
            "use_auth": bool(p.get("use_auth", False)),
            "username": str(p.get("username", "")),
            "password": str(p.get("password", "")),
        }
    return jsonify({"status": "ok", "parallel": state.parallel_count,
                    "headless": state.headless, "proxy": state.proxy})

@app.route('/api/stop', methods=['POST'])
def stop_task():
    if not state.is_running:
        return jsonify({"error": "Not running"}), 400

    state.stop_requested = True
    return jsonify({"status": "stopping"})

@app.route('/api/providers', methods=['GET'])
def get_providers():
    """获取所有提供商列表及当前选中状态"""
    result = []
    for pid, info in email_providers.PROVIDERS.items():
        result.append({
            "id": pid,
            "name": info["name"],
            "inbox_url": info["inbox_url"],
            "has_password": info["has_password"],
            "selected": pid in state.selected_providers
        })
    return jsonify(result)

@app.route('/api/providers', methods=['POST'])
def set_providers():
    """更新选中的提供商列表"""
    data = request.json
    selected = data.get('selected', [])

    # 过滤出合法的提供商 ID
    valid = [p for p in selected if p in email_providers.PROVIDERS]
    if not valid:
        return jsonify({"error": "至少需要选择一个提供商"}), 400

    state.selected_providers = valid
    return jsonify({"status": "ok", "selected": valid})

@app.route('/api/accounts')
def get_accounts():
    accounts = []
    accounts_path = _resolve_repo_path(cfg.files.accounts_file)
    if accounts_path.exists():
        try:
            with open(accounts_path, 'r', encoding='utf-8') as f:
                for line in f:
                    parts = line.strip().split('|')
                    if len(parts) >= 2 and '@' in parts[0]:
                        provider_id = parts[5].strip() if len(parts) > 5 else 'mailtm'
                        provider_info = email_providers.get_provider_info(provider_id)
                        accounts.append({
                            "email": parts[0].strip(),
                            "password": parts[1].strip(),
                            "time": parts[2].strip() if len(parts) > 2 else "",
                            "status": parts[3].strip() if len(parts) > 3 else "",
                            "temp_credential": parts[4].strip() if len(parts) > 4 else "",
                            "provider": provider_id,
                            "provider_name": provider_info["name"] if provider_info else provider_id,
                            "inbox_url": provider_info["inbox_url"] if provider_info else "https://mail.tm",
                            "has_password": provider_info["has_password"] if provider_info else True,
                        })
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    return jsonify(accounts[::-1])

def serve_app():
    from waitress import serve
    print("🌐 Web Server started at http://localhost:8888")
    serve(app, host='0.0.0.0', port=8888, threads=6)


def _resolve_repo_path(path_value: str) -> Path:
    path = Path(path_value)
    if path.is_absolute():
        return path
    return PROJECT_ROOT / path


def _resolve_request_path(path_value: str) -> Path:
    return Path(os.path.abspath(os.path.expanduser(str(path_value))))


if __name__ == '__main__':
    serve_app()
