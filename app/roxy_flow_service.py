from __future__ import annotations

import contextlib
import io
from dataclasses import dataclass
from typing import Callable

from . import email_providers
from . import payment_service
from .browser import (
    CHATGPT_HOME_URL,
    enter_verification_code,
    fetch_current_access_token,
    fill_profile_info,
    fill_signup_form,
    open_chatgpt_url,
    verify_logged_in,
)
from .utils import generate_random_password, save_to_txt


LogFn = Callable[[str], None]


@dataclass
class RoxyFlowResult:
    ok: bool
    email: str = ""
    password: str = ""
    error: str = ""
    access_token: str = ""


class _LogWriter(io.TextIOBase):
    def __init__(self, log: LogFn):
        self.log = log
        self._buffer = ""

    def write(self, value):
        text = str(value)
        self._buffer += text
        while "\n" in self._buffer:
            line, self._buffer = self._buffer.split("\n", 1)
            if line.strip():
                self.log(line)
        return len(text)

    def flush(self):
        if self._buffer.strip():
            self.log(self._buffer.strip())
        self._buffer = ""


def _setting(settings: dict, key: str, default: str = "") -> str:
    return str(settings.get(key) or default).strip()


def _first_non_empty_line(value: str) -> str:
    for line in str(value or "").splitlines():
        item = line.strip()
        if item:
            return item
    return ""


def _payment_method(settings: dict) -> str:
    value = _setting(settings, "paymentMethodSelect", "default")
    return "paypal" if value == "paypal" else "card"


def _email_domain_from_specified(email: str) -> str:
    if "@" not in email:
        return ""
    return email.rsplit("@", 1)[-1].strip().lower()


def run_action(action: str, settings: dict, driver, log: LogFn) -> RoxyFlowResult:
    writer = _LogWriter(log)
    with contextlib.redirect_stdout(writer), contextlib.redirect_stderr(writer):
        try:
            if action == "flow.full":
                return run_registration_flow(settings, driver, log, stop_after_registration=False)
            if action == "flow.to_step2":
                return run_registration_flow(settings, driver, log, stop_after_registration=True)
            if action == "payment.from_payurl":
                return run_payurl_payment(settings, driver, log)
            if action in {"payment.from_step3", "payment.from_step4", "payment.fill_step5"}:
                return run_payurl_payment(settings, driver, log)
            raise NotImplementedError(f"Python Selenium 动作尚未实现: {action}")
        except Exception as exc:
            log(f"Python Selenium 动作失败: {exc}")
            return RoxyFlowResult(ok=False, error=str(exc))
        finally:
            writer.flush()


def run_registration_flow(settings: dict, driver, log: LogFn, *, stop_after_registration: bool) -> RoxyFlowResult:
    specified_email = _first_non_empty_line(_setting(settings, "specifiedAccountInput"))
    registration_method = _setting(settings, "registrationMethodSelect", "email")
    if registration_method != "email":
        raise NotImplementedError("手机号注册流程将由 Python Selenium 实现，当前先支持邮箱注册")

    provider = "nnai"
    if specified_email:
        email = specified_email
        token = email
        credential = email
        password = generate_random_password()
        log(f"使用指定邮箱注册: {email}")
    else:
        domain = _setting(settings, "emailDomainInput") or ""
        email, token, credential = email_providers.create_temp_email(provider, domain=domain or None)
        if not email:
            raise RuntimeError("创建临时邮箱失败")
        password = generate_random_password()
        log(f"临时邮箱创建成功: {email}")

    open_chatgpt_url(driver, CHATGPT_HOME_URL)
    form_ok, _password_entered = fill_signup_form(driver, email, password)
    if not form_ok:
        raise RuntimeError("注册表单提交失败")

    code = email_providers.wait_for_verification_email(provider, str(token or ""), timeout=180)
    if not code:
        raise RuntimeError("未收到邮箱验证码")
    if not enter_verification_code(driver, code):
        raise RuntimeError("验证码提交失败")

    if not fill_profile_info(driver):
        raise RuntimeError("个人资料填写失败")
    if not verify_logged_in(driver):
        raise RuntimeError("登录状态校验失败")

    access_token = fetch_current_access_token(driver)
    save_to_txt(email, password, access_token or "已注册", mailbox_credential=str(credential or ""), provider=provider)
    log(f"注册成功: {email}")

    if stop_after_registration or not bool(settings.get("paymentFlowEnabledCheckbox")):
        return RoxyFlowResult(ok=True, email=email, password=password, access_token=access_token or "")

    pay_url = _first_non_empty_line(_setting(settings, "payUrlInput"))
    if pay_url:
        payment_service.execute_payurl_payment_flow(
            driver,
            pay_url,
            payment_method=_payment_method(settings),
            email=email,
        )
        log("PayURL 支付流程已提交")

    return RoxyFlowResult(ok=True, email=email, password=password, access_token=access_token or "")


def run_payurl_payment(settings: dict, driver, log: LogFn) -> RoxyFlowResult:
    pay_url = _first_non_empty_line(_setting(settings, "payUrlInput"))
    if not pay_url:
        raise ValueError("PayURL 为空")
    email = _first_non_empty_line(_setting(settings, "specifiedAccountInput"))
    payment_service.execute_payurl_payment_flow(
        driver,
        pay_url,
        payment_method=_payment_method(settings),
        email=email,
    )
    log("PayURL 支付流程已提交")
    return RoxyFlowResult(ok=True, email=email)
