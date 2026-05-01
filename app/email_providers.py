"""
临时邮箱服务注册表
统一管理当前可用的临时邮箱提供商

当前只保留:
  - nnai: NNAI.website catch-all + Cloudflare Worker 验证码 API

旧的邮箱渠道文件保留在仓库中，但不再注册到应用可选渠道。
"""

import inspect

from . import nnai_service

PROVIDERS = {
    "nnai": {
        "name": "NNAI.website",
        "module": nnai_service,
        "inbox_url": "https://cloudflare-email-inbox.111pengwei.workers.dev",
        "has_password": False,  # catch-all 域名 + Worker API
    },
}

DEFAULT_PROVIDERS = ["nnai"]


def get_provider_info(provider_id: str) -> dict:
    """获取提供商信息"""
    return PROVIDERS.get(provider_id)


def create_temp_email(provider_id: str, proxy: dict = None, **kwargs):
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

    create_func = info["module"].create_temp_email
    signature = inspect.signature(create_func)
    call_kwargs = {}
    if "proxy" in signature.parameters:
        call_kwargs["proxy"] = proxy
    for key, value in kwargs.items():
        if value is not None and key in signature.parameters:
            call_kwargs[key] = value
    return create_func(**call_kwargs)


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
