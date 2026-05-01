"""
ChatGPT 账号自动注册 - 主程序
使用 NNAI Worker 邮箱完成注册流程，支持多个邮箱域名随机使用
"""

import time
import random

from .config import TOTAL_ACCOUNTS, BATCH_INTERVAL_MIN, BATCH_INTERVAL_MAX
from .utils import generate_random_password, save_to_txt, update_account_status
from . import email_providers
from .browser import (
    CHATGPT_HOME_URL,
    create_driver,
    log_browser_egress_ip,
    fill_signup_form,
    enter_verification_code,
    fill_profile_info,
    open_chatgpt_url,
    verify_logged_in,
    fetch_current_access_token,
)


class ProxyEgressCheckError(RuntimeError):
    """浏览器代理出口检测失败，可由上层触发代理切换。"""


def _build_registered_account_info(driver, proxy=None) -> str:
    """
    注册成功后写入账号 TXT 第四列的内容。

    直接保存当前 ChatGPT 会话 accessToken；如果连 session token 都没拿到，
    则写入错误信息。
    """
    del proxy
    try:
        access_token = fetch_current_access_token(driver)
    except Exception as exc:
        message = f"错误: 获取accessToken失败: {exc}"
        print(f"❌ {message}")
        return message

    print("✅ accessToken 已读取，准备保存")
    return access_token


def register_one_account(
    monitor_callback=None,
    email_provider="nnai",
    email_domain=None,
    headless=False,
    proxy=None,
    raise_proxy_errors=False,
    success_callback=None,
):
    """
    注册单个账号
    :param monitor_callback: 回调函数 func(driver, step_name)，用于截图和中断检查
    :param email_provider: 临时邮箱提供商 ID（当前固定为 nnai）
    :param email_domain: NNAI 邮箱域名；为空时由服务配置随机选择
    :param success_callback: 注册成功且 accessToken 已保存后立即调用，用于上层提前调度下个任务

    返回:
        tuple: (邮箱, 密码, 是否成功)
    """
    driver = None
    email = None
    password = None
    success = False
    success_notified = False
    temp_credential = None
    account_record_info = ""

    # 获取提供商信息
    provider_info = email_providers.get_provider_info(email_provider)
    if not provider_info:
        print(f"❌ 未知邮箱提供商: {email_provider}，回退到 NNAI.website")
        email_provider = "nnai"
        provider_info = email_providers.get_provider_info("nnai")

    provider_name = provider_info["name"]

    # 辅助函数：执行回调
    def _report(step_name):
        if monitor_callback and driver:
            monitor_callback(driver, step_name)

    def _mark_provider_registered(status):
        mark_func = getattr(provider_info["module"], "mark_registered_email", None)
        if callable(mark_func) and email:
            try:
                mark_func(email, password or "", status)
            except Exception as e:
                print(f"⚠️ 标记邮箱已注册失败: {e}")

    def _release_provider_reservation():
        module = provider_info.get("module") if isinstance(provider_info, dict) else None
        release_func = getattr(module, "release_reserved_email", None)
        if callable(release_func) and email and not success:
            try:
                release_func(email)
            except Exception as e:
                print(f"⚠️ 释放邮箱占用失败: {e}")

    def _notify_success_ready():
        nonlocal success_notified
        if not callable(success_callback) or success_notified:
            return
        success_notified = True
        try:
            success_callback(email, password, account_record_info)
        except Exception as e:
            print(f"⚠️ 注册成功回调失败: {e}")

    try:
        # 1. 创建临时邮箱
        print(f"📧 正在使用 {provider_name} 创建临时邮箱...")
        # 临时邮箱链路不走代理，只给 OpenAI 注册浏览器使用代理
        email, token, temp_credential = email_providers.create_temp_email(
            email_provider,
            domain=email_domain,
        )
        if email and temp_credential:
            save_to_txt(
                email,
                password,
                "邮箱已创建",
                mailbox_credential=str(temp_credential or ""),
                provider=email_provider,
            )
        if not email:
            print(f"❌ 创建邮箱失败（{provider_name}），终止注册")
            return None, None, False

        # 2. 生成随机密码
        password = generate_random_password()

        # 3. 初始化浏览器
        driver = create_driver(headless=headless, proxy=proxy)
        _report("init_browser")

        # 若启用代理，先打印浏览器出口 IP 便于确认是否生效
        if proxy and proxy.get("enabled"):
            browser_proxy_diag = log_browser_egress_ip(driver)
            if not browser_proxy_diag.get("ok"):
                raise ProxyEgressCheckError(
                    f"浏览器代理出口检测失败: {browser_proxy_diag.get('reason', 'unknown_error')}"
                )
            _report("proxy_ip_check")

        # 4. 打开注册页面
        url = CHATGPT_HOME_URL
        print(f"🌐 正在打开 {url}...")
        try:
            open_chatgpt_url(driver, url)
        except Exception as e:
            current_url = ""
            handle_count = 0
            try:
                current_url = str(driver.current_url or "")
            except Exception:
                pass
            try:
                handle_count = len(driver.window_handles)
            except Exception:
                pass
            raise RuntimeError(
                f"打开 ChatGPT 页面失败: {e} | current_url={current_url or 'N/A'} | windows={handle_count}"
            ) from e
        time.sleep(3)
        _report("open_page")

        # 5. 填写注册表单（邮箱和密码）
        form_ok, password_entered = fill_signup_form(
            driver, email, password, monitor_callback=monitor_callback
        )
        if not form_ok:
            print("❌ 填写注册表单失败")
            return email, password, False
        if not password_entered:
            print("ℹ️ 未检测到密码输入，继续处理邮箱验证码页")
        _report("fill_form")

        # 6. 等待验证邮件
        time.sleep(5)
        safe_token = str(token or "")
        verification_code = email_providers.wait_for_verification_email(
            email_provider, safe_token
        )

        if not verification_code:
            print("❌ 未获取到验证码，终止注册")
            return email, password, False

        # 7. 输入验证码
        if not enter_verification_code(
            driver, verification_code, monitor_callback=monitor_callback
        ):
            print("❌ 输入验证码失败")
            return email, password, False
        _report("enter_code")

        # 8. 填写个人资料
        if not fill_profile_info(driver):
            print("❌ 填写个人资料失败")
            return email, password, False
        _report("fill_profile")

        # 9. 页面稳定等待
        time.sleep(4)

        # 10. 最终校验：确认已登录
        if not verify_logged_in(driver):
            print("❌ 最终登录状态校验失败")
            return email, password, False
        _report("verify_logged_in")

        account_record_info = _build_registered_account_info(driver, proxy=proxy)
        account_status = "已注册"

        # 保存账号信息（含临时邮箱凭证和提供商，用于再次登录临时邮箱）
        save_to_txt(
            email,
            password,
            account_record_info or account_status,
            mailbox_credential=str(temp_credential or ""),
            provider=email_provider,
        )
        success = True
        _mark_provider_registered(account_status)
        _notify_success_ready()

        print("\n" + "=" * 50)
        print("🎉 注册成功！")
        print(f"   邮箱: {email}")
        print(f"   密码: {password}")
        print(f"   邮箱渠道: {provider_name}")
        print("=" * 50)

        _report("registered")

    except InterruptedError:
        print("🛑 任务已被用户强制中断")
        if email:
            update_account_status(email, "用户中断", provider=email_provider)
        return email, password, False

    except ProxyEgressCheckError as e:
        print(f"❌ 发生错误: {e}")
        if email and password:
            update_account_status(
                email, f"错误: {str(e)[:50]}", provider=email_provider
            )
        if raise_proxy_errors:
            raise

    except Exception as e:
        print(f"❌ 发生错误: {e}")
        if email and password:
            update_account_status(
                email, f"错误: {str(e)[:50]}", provider=email_provider
            )

    finally:
        if driver:
            print("🔒 正在关闭浏览器...")
            try:
                driver.quit()
            except Exception as e:
                print(f"⚠️ 关闭浏览器时忽略异常: {e}")
        _release_provider_reservation()

    return email, password, success


def run_batch(selected_providers=None):
    """
    批量注册账号
    :param selected_providers: 可用提供商列表；当前固定为 nnai
    """
    del selected_providers
    selected_providers = ["nnai"]

    print("\n" + "=" * 60)
    print(f"🚀 开始批量注册，目标数量: {TOTAL_ACCOUNTS}")
    print(f"   邮箱渠道: {', '.join(selected_providers)}")
    print("=" * 60 + "\n")

    success_count = 0
    fail_count = 0
    registered_accounts = []

    for i in range(TOTAL_ACCOUNTS):
        print("\n" + "#" * 60)
        print(f"📝 正在注册第 {i + 1}/{TOTAL_ACCOUNTS} 个账号")
        print("#" * 60 + "\n")

        email, password, success = register_one_account(email_provider="nnai")

        if success:
            success_count += 1
            registered_accounts.append((email, password))
        else:
            fail_count += 1

        print("\n" + "-" * 40)
        print(f"📊 当前进度: {i + 1}/{TOTAL_ACCOUNTS}")
        print(f"   ✅ 成功: {success_count}")
        print(f"   ❌ 失败: {fail_count}")
        print("-" * 40)

        if i < TOTAL_ACCOUNTS - 1:
            wait_time = random.randint(BATCH_INTERVAL_MIN, BATCH_INTERVAL_MAX)
            print(f"\n⏳ 等待 {wait_time} 秒后继续下一个注册...")
            time.sleep(wait_time)

    print("\n" + "=" * 60)
    print("🏁 批量注册完成")
    print("=" * 60)
    print(f"   总计: {TOTAL_ACCOUNTS}")
    print(f"   ✅ 成功: {success_count}")
    print(f"   ❌ 失败: {fail_count}")

    if registered_accounts:
        print("\n📋 成功注册的账号:")
        for email, password in registered_accounts:
            print(f"   - {email}")

    print("=" * 60)


if __name__ == "__main__":
    run_batch()
