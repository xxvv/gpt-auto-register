import errno
import threading
import time
import builtins
import os
import random
from contextlib import contextmanager
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from flask import Flask, jsonify, request, send_from_directory

# 导入业务逻辑
from . import main
from . import browser
from . import nnai_service
from . import email_providers
from . import oauth_service
from . import token_batch_service
from . import account_login_service
from . import browser_json_service
from . import us_proxy_pool
from . import utils
from .config import (
    DEFAULT_ACCOUNTS_FILE,
    PROJECT_ROOT,
    allocate_output_batch_id,
    cfg,
    dated_accounts_file_path,
    set_output_batch_id,
)
from .utils import describe_proxy, ensure_proxy_ready

STATIC_DIR = PROJECT_ROOT / "static"
REGISTRATION_GROUP_REST_EVERY = 4
REGISTRATION_GROUP_REST_SECONDS = 120

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

        # 邮箱渠道固定为 NNAI，域名可多选
        self.selected_providers = list(email_providers.DEFAULT_PROVIDERS)
        self.selected_email_domains = nnai_service.get_configured_domains()

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
_log_context = threading.local()


def _current_log_proxy():
    proxy = getattr(_log_context, "proxy", None)
    return dict(proxy) if isinstance(proxy, dict) else proxy


@contextmanager
def _log_proxy_context(proxy):
    previous_proxy = getattr(_log_context, "proxy", None)
    _log_context.proxy = dict(proxy) if proxy else None
    try:
        yield
    finally:
        if previous_proxy is None:
            try:
                delattr(_log_context, "proxy")
            except AttributeError:
                pass
        else:
            _log_context.proxy = previous_proxy


def _inject_proxy_label(message, proxy):
    if not message or not proxy or not proxy.get("enabled"):
        return message

    proxy_label = describe_proxy(proxy)
    if not proxy_label or proxy_label == "未启用代理" or proxy_label in message:
        return message

    prefix = f"[代理 {proxy_label}] "
    for idx, char in enumerate(message):
        if char not in "\r\n":
            return f"{message[:idx]}{prefix}{message[idx:]}"
    return f"{prefix}{message}"

# Hack: 劫持 print 函数以捕获日志
original_print = builtins.print
def hooked_print(*args, **kwargs):
    sep = kwargs.get('sep', ' ')
    msg = sep.join(map(str, args))
    msg = _inject_proxy_label(msg, _current_log_proxy())
    state.add_log(msg)
    original_print(msg, **kwargs)

# 应用劫持到所有服务模块
for module in (
    main,
    browser,
    email_providers,
    nnai_service,
    oauth_service,
    token_batch_service,
    account_login_service,
    browser_json_service,
    us_proxy_pool,
    utils,
):
    module.print = hooked_print

# ==========================================
# 🧵 后台工作线程
# ==========================================
def _build_registration_proxy_rotation(proxy):
    if not proxy or not proxy.get("enabled"):
        return None

    payload = us_proxy_pool.load_us_proxy_pool()
    rotation = us_proxy_pool.ProxyRotation(
        payload.get("proxies", []),
        start_proxy=proxy,
    )
    if rotation.enabled:
        main.print(
            f"🔁 已启用代理自动轮换，共 {rotation.available_count} 条可用代理，"
            f"起点: {describe_proxy(rotation.starting_proxy)}"
        )
        return rotation

    if rotation.available_count > 0:
        main.print("ℹ️ 当前代理不在最近一次本地代理池缓存中，批量注册将保持单代理模式")
    else:
        main.print("ℹ️ 当前没有可用的本地代理缓存，批量注册将保持单代理模式")
    return None


def _next_distinct_registration_proxy(proxy_rotation, current_proxy):
    """从轮换池取一个不同于当前代理的下一个代理。"""
    if not proxy_rotation or not proxy_rotation.enabled:
        return None

    attempts = max(1, proxy_rotation.available_count)
    current_label = describe_proxy(current_proxy)
    for _ in range(attempts):
        candidate = proxy_rotation.next_proxy()
        if not candidate:
            return None
        if describe_proxy(candidate) != current_label:
            return candidate
    return None


def _pick_registration_start_proxy(proxy):
    if proxy and proxy.get("enabled"):
        return dict(proxy), False

    payload = us_proxy_pool.load_us_proxy_pool()
    for item in payload.get("proxies", []):
        runtime_proxy = us_proxy_pool.pool_item_to_runtime_proxy(item)
        if runtime_proxy:
            return runtime_proxy, True

    return dict(proxy) if proxy else None, False


def _current_email_domains():
    configured_domains = nnai_service.get_configured_domains()
    selected = [
        domain
        for domain in (state.selected_email_domains or configured_domains)
        if domain in configured_domains
    ]
    return selected or configured_domains


def worker_thread(count, selected_providers, parallel, headless, proxy, selected_domains=None):
    state.is_running = True
    state.stop_requested = False
    state.success_count = 0
    state.fail_count = 0
    state.current_action = f"🚀 任务启动，目标: {count}"
    state.reset_progress(task_type="registration", total=count)
    state.update_frame(None)
    batch_id = allocate_output_batch_id()
    set_output_batch_id(batch_id)

    task_proxy, auto_selected_proxy = _pick_registration_start_proxy(proxy)
    if auto_selected_proxy and task_proxy and task_proxy.get("enabled"):
        main.print(
            f"🧭 未手动选择代理，任务启动时已自动切换到代理池首条: {describe_proxy(task_proxy)}"
        )

    with state.lock:
        state.proxy = dict(task_proxy) if task_proxy else {
            "enabled": False,
            "type": "http",
            "host": "",
            "port": 8080,
            "use_auth": False,
            "username": "",
            "password": "",
        }

    del selected_providers
    try:
        email_domains = nnai_service.normalize_domain_list(
            selected_domains or _current_email_domains()
        )
        configured_domains = set(nnai_service.get_configured_domains())
        email_domains = [domain for domain in email_domains if domain in configured_domains]
    except ValueError as exc:
        main.print(f"⚠️ 邮箱域名选择无效，已回退到默认域名: {exc}")
        email_domains = nnai_service.get_configured_domains()
    if not email_domains:
        email_domains = nnai_service.get_configured_domains()

    with _log_proxy_context(task_proxy):
        main.print(f"🚀 开始批量任务，计划注册: {count} 个，并行数: {parallel}")
        main.print(f"🧾 输出批次: {batch_id}")
        main.print("📬 邮箱渠道: NNAI.website")
        main.print(f"🌐 邮箱域名: {', '.join(email_domains)}")
        main.print(f"🖥️ 浏览器模式: {'Headless' if headless else '有界面'}")
        proxy_rotation = None
        if task_proxy and task_proxy.get("enabled"):
            main.print(f"🌐 代理: {describe_proxy(task_proxy)}")
            try:
                ensure_proxy_ready(task_proxy, purpose="批量注册任务启动前代理预检", timeout=10)
            except Exception as exc:
                state.is_running = False
                set_output_batch_id(None)
                state.current_action = "代理预检失败"
                main.print(f"🛑 任务启动终止: {exc}")
                return
            proxy_rotation = _build_registration_proxy_rotation(task_proxy)

        counter_lock = threading.Lock()
        register_slot = threading.Semaphore(max(1, int(parallel)))
        started = [0]
        completed_for_rest = [0]
        group_gate = threading.Condition()
        rest_after_completed = [0]

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
            slot_released = False

            def release_slot():
                nonlocal slot_released
                if not slot_released:
                    slot_released = True
                    register_slot.release()

            register_slot.acquire()
            if state.stop_requested:
                release_slot()
                return

            with group_gate:
                while (
                    rest_after_completed[0]
                    and completed_for_rest[0] >= rest_after_completed[0]
                    and not state.stop_requested
                ):
                    state.current_action = (
                        f"已处理 {rest_after_completed[0]} 个账号，休息 "
                        f"{REGISTRATION_GROUP_REST_SECONDS} 秒后继续..."
                    )
                    main.print(
                        f"⏸️ 已处理 {rest_after_completed[0]} 个账号，休息 "
                        f"{REGISTRATION_GROUP_REST_SECONDS} 秒后继续..."
                    )
                    rest_after_completed[0] = 0
                    group_gate.release()
                    time.sleep(REGISTRATION_GROUP_REST_SECONDS)
                    group_gate.acquire()
                    group_gate.notify_all()
                if state.stop_requested:
                    release_slot()
                    return
                started[0] += 1
                idx = started[0]
            account_proxy = dict(task_proxy) if task_proxy else None
            if proxy_rotation:
                rotated_proxy = proxy_rotation.next_proxy()
                if rotated_proxy:
                    account_proxy = rotated_proxy
                    with state.lock:
                        state.proxy = dict(rotated_proxy)

            with _log_proxy_context(account_proxy):
                state.current_action = f"正在注册 ({idx}/{count})..."
                if account_proxy and account_proxy.get("enabled"):
                    proxy_label = describe_proxy(account_proxy)
                    state.current_action = f"{state.current_action} [{proxy_label}]"
                    main.print(f"🧭 第 {idx}/{count} 个账号使用代理: {proxy_label}")
                provider = "nnai"
                email_domain = random.choice(email_domains)
                try:
                    attempt_proxy = account_proxy

                    def on_success_ready(_email, _password, _account_record_info):
                        main.print("⚡ accessToken 已保存并保留窗口完成，开始排队下个注册任务")
                        release_slot()

                    while True:
                        try:
                            with _log_proxy_context(attempt_proxy):
                                _, _, success = main.register_one_account(
                                    monitor_callback=monitor,
                                    email_provider=provider,
                                    email_domain=email_domain,
                                    headless=headless,
                                    proxy=attempt_proxy,
                                    raise_proxy_errors=True,
                                    success_callback=on_success_ready,
                                )
                            break
                        except main.ProxyEgressCheckError as proxy_exc:
                            next_proxy = _next_distinct_registration_proxy(
                                proxy_rotation,
                                attempt_proxy,
                            )
                            if not next_proxy:
                                raise proxy_exc

                            old_label = describe_proxy(attempt_proxy)
                            new_label = describe_proxy(next_proxy)
                            main.print(
                                f"🔁 代理出口检测失败，自动切换代理: {old_label} -> {new_label}"
                            )
                            attempt_proxy = next_proxy
                            with state.lock:
                                state.proxy = dict(next_proxy)
                            state.current_action = (
                                f"正在注册 ({idx}/{count})... [{new_label}]"
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
                    with group_gate:
                        completed_for_rest[0] += 1
                        if (
                            completed_for_rest[0] % REGISTRATION_GROUP_REST_EVERY == 0
                            and completed_for_rest[0] < count
                        ):
                            rest_after_completed[0] = completed_for_rest[0]
                        group_gate.notify_all()
                except InterruptedError:
                    main.print("🛑 任务已中断")
                except Exception as e:
                    with counter_lock:
                        state.fail_count += 1
                        state.update_progress(
                            completed=state.success_count + state.fail_count,
                            processed=state.success_count,
                        )
                    with group_gate:
                        completed_for_rest[0] += 1
                        if (
                            completed_for_rest[0] % REGISTRATION_GROUP_REST_EVERY == 0
                            and completed_for_rest[0] < count
                        ):
                            rest_after_completed[0] = completed_for_rest[0]
                        group_gate.notify_all()
                    main.print(f"❌ 异常: {str(e)}")
                finally:
                    release_slot()

        try:
            max_workers = max(1, min(count, int(parallel) * 4))
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
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
            set_output_batch_id(None)
            state.current_action = "任务已完成"
            main.print("🏁 任务结束")


def token_worker_thread(accounts_file, output_dir, proxy):
    with _log_proxy_context(proxy):
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
        if proxy and proxy.get("enabled"):
            main.print(f"🌐 代理: {describe_proxy(proxy)}")
            try:
                ensure_proxy_ready(proxy, purpose="Token 任务启动前代理预检", timeout=10)
            except Exception as exc:
                state.is_running = False
                state.current_action = "代理预检失败"
                main.print(f"🛑 Token 任务启动终止: {exc}")
                return

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


def login_worker_thread(accounts_file, headless, proxy):
    with _log_proxy_context(proxy):
        state.is_running = True
        state.stop_requested = False
        state.success_count = 0
        state.fail_count = 0
        state.reset_progress(task_type="account_login", total=0)
        state.current_action = "正在批量登录账号..."
        state.update_frame(None)

        main.print("🔐 开始批量登录账号")
        main.print(f"📄 登录账号 TXT: {accounts_file}")
        main.print(f"🖥️ 浏览器模式: {'Headless' if headless else '有界面'}")
        if proxy and proxy.get("enabled"):
            main.print(f"🌐 代理: {describe_proxy(proxy)}")
            try:
                ensure_proxy_ready(proxy, purpose="登录任务启动前代理预检", timeout=10)
            except Exception as exc:
                state.is_running = False
                state.current_action = "代理预检失败"
                main.print(f"🛑 登录任务启动终止: {exc}")
                return

        def monitor(driver, _step):
            if state.stop_requested:
                main.print("🛑 检测到停止请求，正在中断登录任务...")
                raise InterruptedError("用户请求停止")
            try:
                state.update_frame(driver.get_screenshot_as_png())
            except Exception:
                pass

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
                    f"账号登录中: {progress['completed']}/{progress['total']} "
                    f"(成功 {progress['success']} / 失败 {progress['fail']} / 跳过 {progress['skipped']})"
                )
            if progress.get("current_email"):
                state.current_action += f" - {progress['current_email']}"

        try:
            result = account_login_service.process_login_accounts_from_file(
                accounts_file=accounts_file,
                headless=headless,
                proxy=proxy,
                monitor_callback=monitor,
                stop_requested=lambda: state.stop_requested,
                progress_callback=on_progress,
            )
            state.success_count = result["success"]
            state.fail_count = result["fail"]
            state.update_progress(
                task_type="account_login",
                total=result["total"],
                completed=result["completed"],
                processed=result["processed"],
                skipped=result["skipped"],
            )
            state.current_action = (
                f"账号登录完成: {result['completed']}/{result['total']} "
                f"(成功 {result['success']} / 失败 {result['fail']} / 跳过 {result['skipped']})"
            )
            main.print("🏁 批量登录账号完成")
        except Exception as e:
            state.fail_count += 1
            state.current_action = "账号登录失败"
            main.print(f"❌ 批量登录任务失败: {e}")
        finally:
            state.is_running = False


def browser_json_worker_thread(emails, output_dir, headless, proxy):
    with _log_proxy_context(proxy):
        state.is_running = True
        state.stop_requested = False
        state.success_count = 0
        state.fail_count = 0
        state.reset_progress(task_type="browser_json", total=len(emails))
        state.current_action = "正在通过浏览器获取 JSON..."
        state.update_frame(None)
        batch_id = allocate_output_batch_id()
        set_output_batch_id(batch_id)

        main.print("🌐 开始浏览器获取 JSON")
        main.print(f"🧾 输出批次: {batch_id}")
        main.print(f"📄 账号文件: {PROJECT_ROOT / 'data' / 'accounts'}")
        main.print(f"📁 输出目录: {output_dir}")
        main.print(f"🧾 勾选账号数: {len(emails)}")
        main.print(f"🖥️ 浏览器模式: {'Headless' if headless else '有界面'}")
        if proxy and proxy.get("enabled"):
            main.print(f"🌐 代理: {describe_proxy(proxy)}")
            try:
                ensure_proxy_ready(proxy, purpose="浏览器 JSON 任务启动前代理预检", timeout=10)
            except Exception as exc:
                state.is_running = False
                set_output_batch_id(None)
                state.current_action = "代理预检失败"
                main.print(f"🛑 浏览器 JSON 任务启动终止: {exc}")
                return

        def monitor(driver, _step):
            if state.stop_requested:
                main.print("🛑 检测到停止请求，正在中断浏览器 JSON 任务...")
                raise InterruptedError("用户请求停止")
            try:
                state.update_frame(driver.get_screenshot_as_png())
            except Exception:
                pass

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
                    f"浏览器获取 JSON: {progress['completed']}/{progress['total']} "
                    f"(成功 {progress['success']} / 失败 {progress['fail']})"
                )
            if progress.get("current_email"):
                state.current_action += f" - {progress['current_email']}"

        try:
            account_files = _account_list_paths()
            result = browser_json_service.process_selected_accounts(
                accounts_file=account_files,
                emails=emails,
                output_dir=output_dir,
                proxy=proxy,
                headless=headless,
                monitor_callback=monitor,
                stop_requested=lambda: state.stop_requested,
                progress_callback=on_progress,
            )
            state.success_count = result["success"]
            state.fail_count = result["fail"]
            state.update_progress(
                task_type="browser_json",
                total=result["total"],
                completed=result["completed"],
                processed=result["processed"],
                skipped=result["skipped"],
            )
            state.current_action = (
                f"浏览器 JSON 获取完成: {result['completed']}/{result['total']} "
                f"(成功 {result['success']} / 失败 {result['fail']})"
            )
            main.print(f"🏁 浏览器 JSON 获取完成，输出目录: {result['output_dir']}")
        except Exception as e:
            state.fail_count += 1
            state.current_action = "浏览器 JSON 获取失败"
            main.print(f"❌ 浏览器 JSON 任务失败: {e}")
        finally:
            state.is_running = False
            set_output_batch_id(None)

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
        "current_proxy": dict(state.proxy),
        "total_inventory": total_inventory,
        "logs": state.get_logs(int(request.args.get('log_index', 0)))
    })

@app.route('/api/start', methods=['POST'])
def start_task():
    if state.is_running:
        return jsonify({"error": "Already running"}), 400

    data = request.json
    count = data.get('count', 1)

    providers = ["nnai"]
    domains = _current_email_domains()

    threading.Thread(
        target=worker_thread,
        args=(count, providers, state.parallel_count, state.headless, dict(state.proxy), domains),
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
    account_paths = _account_list_paths()
    accounts_file = account_paths[-1] if account_paths else _default_accounts_candidate_path()
    return jsonify({
        "accounts_file": str(accounts_file),
        "output_dir": str(_resolve_repo_path(cfg.oauth.token_json_dir)),
    })


@app.route('/api/login/settings', methods=['GET'])
def get_login_settings():
    return jsonify({
        "accounts_file": str(account_login_service.DEFAULT_LOGIN_ACCOUNTS_FILE),
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


@app.route('/api/login/start', methods=['POST'])
def start_login_task():
    if state.is_running:
        return jsonify({"error": "Already running"}), 400

    data = request.json or {}
    accounts_file = str(
        _resolve_request_path(
            data.get("accounts_file", str(account_login_service.DEFAULT_LOGIN_ACCOUNTS_FILE))
        )
    )

    if not os.path.exists(accounts_file):
        return jsonify({"error": "登录账号 TXT 文件不存在"}), 400

    threading.Thread(
        target=login_worker_thread,
        args=(accounts_file, state.headless, dict(state.proxy)),
        daemon=True
    ).start()
    return jsonify({"status": "started", "accounts_file": accounts_file})


@app.route('/api/accounts/browser-json/start', methods=['POST'])
def start_accounts_browser_json():
    if state.is_running:
        return jsonify({"error": "Already running"}), 400

    data = request.json or {}
    emails = data.get("emails", [])
    if not isinstance(emails, list):
        return jsonify({"error": "emails 必须是数组"}), 400

    normalized_emails = []
    seen = set()
    for email in emails:
        normalized = str(email).strip()
        if not normalized or "@" not in normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized_emails.append(normalized)

    if not normalized_emails:
        return jsonify({"error": "请先勾选需要获取 JSON 的账号"}), 400

    output_dir = str(_resolve_request_path(data.get("output_dir", cfg.oauth.token_json_dir)))

    threading.Thread(
        target=browser_json_worker_thread,
        args=(normalized_emails, output_dir, state.headless, dict(state.proxy)),
        daemon=True
    ).start()
    return jsonify({
        "status": "started",
        "emails": normalized_emails,
        "output_dir": output_dir,
    })

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


@app.route('/api/us-proxies', methods=['GET'])
def get_us_proxies():
    payload = us_proxy_pool.load_us_proxy_pool()
    payload["current_proxy"] = dict(state.proxy)
    return jsonify(payload)


@app.route('/api/us-proxies/refresh', methods=['POST'])
def refresh_us_proxies():
    if state.is_running:
        return jsonify({"error": "任务运行中，暂不支持刷新代理池"}), 400

    try:
        us_proxy_pool.refresh_us_proxy_pool()
        payload = us_proxy_pool.load_us_proxy_pool()
        payload["current_proxy"] = dict(state.proxy)
        main.print(
            f"🧭 本地代理池已刷新: 原始 {payload['raw_row_count']} 条，可用 {payload['working_count']} 条"
        )
        return jsonify(payload)
    except Exception as exc:
        main.print(f"❌ 刷新本地代理池失败: {exc}")
        return jsonify({"error": str(exc)}), 500


@app.route('/api/us-proxies/apply', methods=['POST'])
def apply_us_proxy():
    data = request.json or {}
    host = str(data.get("host", "")).strip()
    proxy_type = str(data.get("type", "http") or "http").strip().lower()
    try:
        port = int(data.get("port", 0))
    except (TypeError, ValueError):
        port = 0

    if not host or port <= 0:
        return jsonify({"error": "代理 host/port 无效"}), 400

    payload = us_proxy_pool.load_us_proxy_pool()
    matched = None
    for item in payload.get("proxies", []):
        item_type = str(item.get("type", "http") or "http").lower()
        if (
            item.get("host") == host
            and int(item.get("port", 0)) == port
            and item_type == proxy_type
        ):
            matched = item
            break

    if not matched:
        return jsonify({"error": "该代理不在最近一次可用列表中"}), 400

    runtime_proxy = us_proxy_pool.pool_item_to_runtime_proxy(matched)
    if not runtime_proxy:
        return jsonify({"error": "代理数据无效"}), 400

    state.proxy = runtime_proxy
    main.print(f"✅ 已应用当前代理: {describe_proxy(state.proxy)}")
    return jsonify({"status": "ok", "proxy": state.proxy, "applied": matched})

@app.route('/api/stop', methods=['POST'])
def stop_task():
    if not state.is_running:
        return jsonify({"error": "Not running"}), 400

    state.stop_requested = True
    return jsonify({"status": "stopping"})

@app.route('/api/providers', methods=['GET'])
def get_providers():
    """获取邮箱提供商列表。当前只保留 NNAI。"""
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
    """兼容旧 API：邮箱渠道固定为 NNAI。"""
    data = request.json or {}
    selected = data.get('selected', [])

    # 过滤出合法的提供商 ID
    valid = [p for p in selected if p in email_providers.PROVIDERS]
    if not valid:
        return jsonify({"error": "至少需要选择一个提供商"}), 400

    state.selected_providers = valid
    return jsonify({"status": "ok", "selected": valid})


@app.route('/api/email-domains', methods=['GET'])
def get_email_domains():
    """获取 NNAI 可用域名列表及当前选中状态。"""
    configured_domains = nnai_service.get_configured_domains()
    selected = set(_current_email_domains())
    return jsonify([
        {
            "domain": domain,
            "selected": domain in selected,
        }
        for domain in configured_domains
    ])


@app.route('/api/email-domains', methods=['POST'])
def set_email_domains():
    """更新选中的 NNAI 邮箱域名列表。"""
    data = request.json or {}
    try:
        selected = nnai_service.normalize_domain_list(data.get('selected', []))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    configured_domains = set(nnai_service.get_configured_domains())
    valid = [domain for domain in selected if domain in configured_domains]
    if not valid:
        return jsonify({"error": "至少需要选择一个已配置邮箱域名"}), 400

    state.selected_email_domains = valid
    return jsonify({"status": "ok", "selected": valid})

@app.route('/api/accounts')
def get_accounts():
    accounts = []
    for accounts_path in _account_list_paths():
        if not accounts_path.exists():
            continue
        try:
            with open(accounts_path, 'r', encoding='utf-8') as f:
                for line in f:
                    parts = line.strip().split('|')
                    if len(parts) >= 2 and '@' in parts[0]:
                        provider_id = parts[5].strip() if len(parts) > 5 else 'nnai'
                        provider_info = email_providers.get_provider_info(provider_id)
                        accounts.append({
                            "email": parts[0].strip(),
                            "password": parts[1].strip(),
                            "time": parts[2].strip() if len(parts) > 2 else "",
                            "status": parts[3].strip() if len(parts) > 3 else "",
                            "temp_credential": parts[4].strip() if len(parts) > 4 else "",
                            "provider": provider_id,
                            "provider_name": provider_info["name"] if provider_info else provider_id,
                            "inbox_url": provider_info["inbox_url"] if provider_info else email_providers.PROVIDERS["nnai"]["inbox_url"],
                            "has_password": provider_info["has_password"] if provider_info else False,
                        })
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    return jsonify(accounts[::-1])

def serve_app():
    from waitress import serve
    host = os.environ.get("WEB_HOST", "0.0.0.0")
    port_text = os.environ.get("WEB_PORT", os.environ.get("PORT", "8888"))
    try:
        port = int(port_text)
    except ValueError as exc:
        raise SystemExit(f"❌ WEB_PORT/PORT 必须是整数，当前值: {port_text!r}") from exc

    display_host = "localhost" if host in ("0.0.0.0", "::", "") else host
    print(f"🌐 Web Server started at http://{display_host}:{port}")
    try:
        serve(app, host=host, port=port, threads=6)
    except OSError as exc:
        if exc.errno == errno.EADDRINUSE:
            raise SystemExit(
                f"❌ 端口 {port} 已被占用。当前已有服务在运行，"
                f"可先停止旧进程，或改用: WEB_PORT={port + 1} uv run python server.py"
            ) from exc
        raise


def _resolve_repo_path(path_value: str) -> Path:
    if str(path_value) == cfg.files.accounts_file:
        return dated_accounts_file_path(path_value)

    path = Path(path_value)
    if path.is_absolute():
        return path
    return PROJECT_ROOT / path


def _resolve_request_path(path_value: str) -> Path:
    return Path(os.path.abspath(os.path.expanduser(str(path_value))))


def _account_list_paths() -> list[Path]:
    if cfg.files.accounts_file == DEFAULT_ACCOUNTS_FILE:
        account_dir = PROJECT_ROOT / "data" / "accounts"
        if account_dir.exists():
            return sorted(account_dir.glob("*.txt"))
    return [_resolve_repo_path(cfg.files.accounts_file)]


def _default_accounts_candidate_path() -> Path:
    return PROJECT_ROOT / "data" / "accounts" / f"{datetime.now().strftime('%Y%m%d')}_001.txt"


if __name__ == '__main__':
    serve_app()
