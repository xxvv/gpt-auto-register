"""
临时邮箱服务模块 - 基于 mail.tm 公共 API
API 文档: https://api.mail.tm
"""

import random
import string
import time

from config import EMAIL_WAIT_TIMEOUT, EMAIL_POLL_INTERVAL, HTTP_TIMEOUT
from utils import http_session, get_user_agent, extract_verification_code

MAILTM_API = "https://api.mail.tm"


def _get_available_domain():
    """获取 mail.tm 可用域名"""
    try:
        resp = http_session.get(
            f"{MAILTM_API}/domains",
            headers={"User-Agent": get_user_agent()},
            timeout=HTTP_TIMEOUT
        )
        if resp.status_code == 200:
            data = resp.json()
            members = data.get("hydra:member", [])
            if members:
                return members[0]["domain"]
    except Exception as e:
        print(f"  获取 mail.tm 域名失败: {e}")
    return None


def create_temp_email():
    """
    在 mail.tm 创建临时邮箱

    返回:
        tuple: (邮箱地址, JWT token, 邮箱密码)，失败返回 (None, None, None)
    """
    print("📧 正在创建 mail.tm 临时邮箱...")

    domain = _get_available_domain()
    if not domain:
        print("❌ 获取 mail.tm 域名失败")
        return None, None, None

    username = ''.join(random.choices(string.ascii_lowercase + string.digits, k=10))
    address = f"{username}@{domain}"
    password = ''.join(random.choices(string.ascii_letters + string.digits, k=16))

    headers = {
        "Content-Type": "application/json",
        "User-Agent": get_user_agent()
    }

    try:
        # 创建账号
        resp = http_session.post(
            f"{MAILTM_API}/accounts",
            headers=headers,
            json={"address": address, "password": password},
            timeout=HTTP_TIMEOUT
        )

        if resp.status_code not in (200, 201):
            print(f"❌ mail.tm 创建账号失败: HTTP {resp.status_code} - {resp.text[:200]}")
            return None, None, None

        # 获取 token
        token_resp = http_session.post(
            f"{MAILTM_API}/token",
            headers=headers,
            json={"address": address, "password": password},
            timeout=HTTP_TIMEOUT
        )

        if token_resp.status_code == 200:
            token = token_resp.json().get("token")
            if token:
                print(f"✅ mail.tm 邮箱创建成功: {address}")
                return address, token, password

        print(f"❌ 获取 mail.tm token 失败: HTTP {token_resp.status_code}")

    except Exception as e:
        print(f"❌ 创建 mail.tm 邮箱失败: {e}")

    return None, None, None


def wait_for_verification_email(token: str, timeout: int = None):
    """
    等待并提取 OpenAI 验证码

    参数:
        token: mail.tm JWT token
        timeout: 超时时间（秒），默认使用配置值

    返回:
        str: 验证码，未找到返回 None
    """
    if timeout is None:
        timeout = EMAIL_WAIT_TIMEOUT

    print(f"⏳ 正在等待验证邮件（最长 {timeout} 秒）...")
    start_time = time.time()

    headers = {
        "Authorization": f"Bearer {token}",
        "User-Agent": get_user_agent()
    }

    while time.time() - start_time < timeout:
        try:
            resp = http_session.get(
                f"{MAILTM_API}/messages",
                headers=headers,
                timeout=HTTP_TIMEOUT
            )

            if resp.status_code == 200:
                data = resp.json()
                messages = data.get("hydra:member", [])

                for msg in messages:
                    subject = msg.get("subject", "") or ""
                    from_info = msg.get("from", {}) or {}
                    from_addr = str(from_info.get("address", "")).lower()

                    if "openai" in from_addr or "chatgpt" in subject.lower():
                        print(f"\n📧 收到 OpenAI 验证邮件!")
                        print(f"   主题: {subject}")

                        # 先从主题提取
                        code = extract_verification_code(subject)
                        if code:
                            return code

                        # 获取邮件详情
                        msg_id = msg.get("id")
                        if msg_id:
                            detail_resp = http_session.get(
                                f"{MAILTM_API}/messages/{msg_id}",
                                headers=headers,
                                timeout=HTTP_TIMEOUT
                            )
                            if detail_resp.status_code == 200:
                                detail = detail_resp.json()
                                text_body = detail.get("text", "") or ""
                                html_list = detail.get("html", []) or []
                                html_body = html_list[0] if html_list else ""

                                for content in [text_body, html_body]:
                                    if content:
                                        code = extract_verification_code(content)
                                        if code:
                                            return code

        except Exception as e:
            print(f"  查询 mail.tm 邮件错误: {e}")

        elapsed = int(time.time() - start_time)
        print(f"  等待中... ({elapsed}秒)", end='\r')
        time.sleep(EMAIL_POLL_INTERVAL)

    print("\n⏰ 等待验证邮件超时")
    return None
