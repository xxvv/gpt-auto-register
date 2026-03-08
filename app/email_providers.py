"""
临时邮箱服务注册表
统一管理所有可用的临时邮箱提供商

已验证可用（OpenAI 不拦截）:
  - mailtm   : mail.tm  REST API，动态域名
  - temporam  : temporam.com，Cookie 缓存 + REST API

已移除（OpenAI 返回 "The email you provided is not supported"）:
  - mailgw / guerrillamail / tempmail_lol
  对应 .py 文件保留，可用于其他非 OpenAI 服务的注册
"""

from . import mailtm_service
from . import temporam_service

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
}

# 默认两个都启用
DEFAULT_PROVIDERS = list(PROVIDERS.keys())


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
    # temporam_service 的 create_temp_email 接受 proxy 参数
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
