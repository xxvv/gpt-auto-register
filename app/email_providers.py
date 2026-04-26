"""
临时邮箱服务注册表
统一管理所有可用的临时邮箱提供商

已验证可用（OpenAI 不拦截）:
  - mailtm     : mail.tm REST API，动态域名
  - temporam   : temporam.com，Cookie 缓存 + REST API
  - custom2925 : 2925 自有邮箱别名 + IMAP 收件箱
  - gptmail    : mail.chatgpt.org.uk，Cookie + JWT + REST API
  - tempmail_lol: api.tempmail.lol，纯 REST API
  - gaggle     : gaggle.email，已登录 Cookie + create-group/activity API
  - outlookemail: 相邻 outlookemail 项目，对外 API 邮箱池
  - nnai       : nnai.website catch-all + Cloudflare Worker 验证码 API

已移除（OpenAI 返回 "The email you provided is not supported"）:
  - mailgw / guerrillamail / tempmail_lol (旧版)
  对应 .py 文件保留，可用于其他非 OpenAI 服务的注册
"""

from . import custom2925_service
from . import mailtm_service
from . import temporam_service
from . import gptmail_service
from . import tempmail_lol_service
from . import gaggle_service
from . import outlookemail_service
from . import nnai_service

PROVIDERS = {
    "mailtm": {
        "name": "mail.tm",
        "module": mailtm_service,
        "inbox_url": "https://mail.tm",
        "has_password": True,   # 有密码，可重新登录收件箱
    },
    "temporam": {
        "name": "Temporam",
        "module": temporam_service,
        "inbox_url": "https://temporam.com/zh",
        "has_password": False,  # 基于浏览器会话，无独立密码
    },
    "custom2925": {
        "name": "2925邮箱",
        "module": custom2925_service,
        "inbox_url": "https://mail.2925.com",
        "has_password": False,
    },
    "gptmail": {
        "name": "GPTMail",
        "module": gptmail_service,
        "inbox_url": "https://mail.chatgpt.org.uk",
        "has_password": False,  # 基于 Cookie + JWT 会话
    },
    "tempmail_lol": {
        "name": "TempMail.lol",
        "module": tempmail_lol_service,
        "inbox_url": "https://tempmail.lol",
        "has_password": False,  # 基于 token
    },
    "gaggle": {
        "name": "Gaggle",
        "module": gaggle_service,
        "inbox_url": "https://gaggle.email",
        "has_password": False,  # 基于共享登录态，不是独立邮箱密码
    },
    "outlookemail": {
        "name": "OutlookEmail",
        "module": outlookemail_service,
        "inbox_url": "http://localhost:5000",
        "has_password": False,  # 基于 OutlookEmail 对外 API Key
    },
    "nnai": {
        "name": "NNAI.website",
        "module": nnai_service,
        "inbox_url": "https://cloudflare-email-inbox.111pengwei.workers.dev",
        "has_password": False,  # catch-all 域名 + Worker API
    },
}

# 默认公开服务：mailtm + gptmail + tempmail_lol
# temporam 因 SSL 不稳定默认不启用
DEFAULT_PROVIDERS = ["mailtm", "gptmail", "tempmail_lol"]


def get_provider_info(provider_id: str) -> dict:
    """获取提供商信息"""
    return PROVIDERS.get(provider_id)


def create_temp_email(provider_id: str, proxy: dict = None):
    """
    使用指定提供商创建临时邮箱

    返回:
        tuple: (邮箱地址, token/session_id, credential)
               失败返回 (None, None, None)
    """
    info = PROVIDERS.get(provider_id)
    if not info:
        print(f"❌ 未知邮箱提供商: {provider_id}")
        return None, None, None

    module = info["module"]
    if hasattr(module.create_temp_email, "__code__") and \
       "proxy" in module.create_temp_email.__code__.co_varnames:
        return module.create_temp_email(proxy=proxy)
    return module.create_temp_email()


def wait_for_verification_email(provider_id: str, token: str, timeout: int = None):
    """
    使用指定提供商等待验证邮件

    返回:
        str: 验证码，未找到返回 None
    """
    info = PROVIDERS.get(provider_id)
    if not info:
        print(f"❌ 未知邮箱提供商: {provider_id}")
        return None

    if timeout is not None:
        return info["module"].wait_for_verification_email(token, timeout)
    return info["module"].wait_for_verification_email(token)


def list_verification_codes(provider_id: str, token: str) -> list[str]:
    """列出指定 provider 当前收件箱中的验证码候选。"""
    info = PROVIDERS.get(provider_id)
    if not info:
        print(f"❌ 未知邮箱提供商: {provider_id}")
        return []

    func = getattr(info["module"], "list_verification_codes", None)
    if not callable(func):
        return []
    return func(token)
