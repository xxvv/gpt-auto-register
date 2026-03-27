"""
ChatGPT 账号自动注册 - 主程序
使用临时邮箱完成注册流程，支持多个临时邮箱服务提供商
"""

import time
import random

from .config import TOTAL_ACCOUNTS, BATCH_INTERVAL_MIN, BATCH_INTERVAL_MAX, cfg
from .utils import generate_random_password, save_to_txt, update_account_status
from . import email_providers
from .oauth_service import perform_codex_oauth_login, save_codex_tokens
from .browser import (
    create_driver,
    log_browser_egress_ip,
    fill_signup_form,
    enter_verification_code,
    fill_profile_info,
    verify_logged_in,
)


def register_one_account(
    monitor_callback=None, email_provider="mailtm", headless=False, proxy=None
):
    """
    注册单个账号
    :param monitor_callback: 回调函数 func(driver, step_name)，用于截图和中断检查
    :param email_provider: 临时邮箱提供商 ID（见 email_providers.PROVIDERS）

    返回:
        tuple: (邮箱, 密码, 是否成功)
    """
    driver = None
    email = None
    password = None
    success = False

    # 获取提供商信息
    provider_info = email_providers.get_provider_info(email_provider)
    if not provider_info:
        print(f"❌ 未知邮箱提供商: {email_provider}，回退到 mail.tm")
        email_provider = "mailtm"
        provider_info = email_providers.get_provider_info("mailtm")

    provider_name = provider_info["name"]

    # 辅助函数：执行回调
    def _report(step_name):
        if monitor_callback and driver:
            monitor_callback(driver, step_name)

    try:
        # 1. 创建临时邮箱
        print(f"📧 正在使用 {provider_name} 创建临时邮箱...")
        # 临时邮箱链路不走代理，只给 OpenAI 注册浏览器使用代理
        email, token, temp_credential = email_providers.create_temp_email(
            email_provider
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
            log_browser_egress_ip(driver)
            _report("proxy_ip_check")

        # 4. 打开注册页面
        url = "https://chat.openai.com/chat"
        print(f"🌐 正在打开 {url}...")
        driver.get(url)
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
            print("ℹ️ 本次流程直接进入邮箱验证码页，未设置密码")
            password = None
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

        safe_token = str(token or "")
        oauth_status = "未启用"
        if cfg.oauth.enabled:
            print("🔑 开始获取 Codex OAuth Token...")
            try:
                tokens = perform_codex_oauth_login(
                    email=email,
                    password=password,
                    email_provider=email_provider,
                    mail_token=safe_token,
                    proxy=proxy,
                )
                save_codex_tokens(email=email, tokens=tokens, proxy=proxy)
                oauth_status = "成功"
                print("✅ Codex OAuth Token 已保存")
            except Exception as e:
                oauth_status = f"失败: {e}"
                print(f"❌ OAuth 获取失败: {e}")
                if cfg.oauth.required:
                    save_to_txt(
                        email,
                        password,
                        "已注册/OAuth失败",
                        mailtm_password=str(temp_credential or ""),
                        provider=email_provider,
                    )
                    return email, password, False

        account_status = "已注册"
        if cfg.oauth.enabled:
            account_status = (
                "已注册/OAuth成功" if oauth_status == "成功" else "已注册/OAuth失败"
            )

        # 保存账号信息（含临时邮箱凭证和提供商，用于再次登录临时邮箱）
        save_to_txt(
            email,
            password,
            account_status,
            mailtm_password=str(temp_credential or ""),
            provider=email_provider,
        )

        print("\n" + "=" * 50)
        print("🎉 注册成功！")
        print(f"   邮箱: {email}")
        print(f"   密码: {password}")
        print(f"   邮箱服务: {provider_name}")
        if cfg.oauth.enabled:
            print(f"   OAuth: {oauth_status}")
        print("=" * 50)

        success = True
        time.sleep(3)
        _report("registered")

    except InterruptedError:
        print("🛑 任务已被用户强制中断")
        if email:
            update_account_status(email, "用户中断", provider=email_provider)
        return email, password, False

    except Exception as e:
        print(f"❌ 发生错误: {e}")
        if email and password:
            update_account_status(
                email, f"错误: {str(e)[:50]}", provider=email_provider
            )

    finally:
        if driver:
            print("🔒 正在关闭浏览器...")
            driver.quit()

    return email, password, success


def run_batch(selected_providers=None):
    """
    批量注册账号
    :param selected_providers: 可用提供商列表，每次随机从中选一个；为 None 则仅用 mailtm
    """
    if not selected_providers:
        selected_providers = ["mailtm"]

    print("\n" + "=" * 60)
    print(f"🚀 开始批量注册，目标数量: {TOTAL_ACCOUNTS}")
    print(f"   邮箱服务: {', '.join(selected_providers)}")
    print("=" * 60 + "\n")

    success_count = 0
    fail_count = 0
    registered_accounts = []

    for i in range(TOTAL_ACCOUNTS):
        print("\n" + "#" * 60)
        print(f"📝 正在注册第 {i + 1}/{TOTAL_ACCOUNTS} 个账号")
        print("#" * 60 + "\n")

        # 随机选择提供商
        provider = random.choice(selected_providers)
        email, password, success = register_one_account(email_provider=provider)

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
