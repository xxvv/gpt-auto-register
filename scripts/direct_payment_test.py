#!/usr/bin/env python3
"""
直接打开 pay_url 的支付测试脚本。
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.browser import create_driver, log_browser_egress_ip
from app.payment_service import (
    execute_payurl_payment_flow,
    get_current_webshare_static_proxy,
    normalize_payment_method,
    replace_webshare_static_proxy,
)
from app.utils import describe_proxy


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="直接打开 pay_url，执行 Stripe/PayPal 支付测试流程"
    )
    parser.add_argument("--pay-url", required=True, help="要直接打开的支付页面链接")
    parser.add_argument(
        "--method",
        default="card",
        choices=["card", "paypal"],
        help="支付方式，默认 card",
    )
    parser.add_argument(
        "--email",
        default="",
        help="PayPal 测试使用的邮箱；当 --method=paypal 时必填",
    )
    parser.add_argument(
        "--proxy-mode",
        default="none",
        choices=["none", "current", "replace"],
        help="代理模式：none=不用代理，current=使用当前静态代理，replace=先切美国静态代理",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="启用伪无头模式运行浏览器",
    )
    parser.add_argument(
        "--no-pause",
        action="store_true",
        help="流程结束后立即关闭浏览器，不等待人工检查",
    )
    parser.add_argument(
        "--hold-seconds",
        type=int,
        default=300,
        help="非交互终端下保留浏览器的秒数，默认 300",
    )
    return parser


def _resolve_proxy(proxy_mode: str):
    mode = str(proxy_mode or "none").strip().lower()
    if mode == "current":
        return get_current_webshare_static_proxy()
    if mode == "replace":
        return replace_webshare_static_proxy()
    return None


def _maybe_pause_before_close(headless: bool, no_pause: bool, hold_seconds: int) -> None:
    if headless or no_pause:
        return

    if sys.stdin.isatty():
        try:
            input("流程已结束，按回车关闭浏览器...")
        except EOFError:
            pass
        return

    seconds = max(0, int(hold_seconds))
    if seconds > 0:
        print(f"ℹ️ 当前不是交互终端，浏览器将在 {seconds}s 后自动关闭")
        time.sleep(seconds)


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()
    method = normalize_payment_method(args.method)
    email = str(args.email or "").strip()
    if method == "paypal" and not email:
        parser.error("--method paypal 时必须提供 --email")

    proxy = _resolve_proxy(args.proxy_mode)
    if proxy:
        print(f"🧭 本次支付测试代理: {describe_proxy(proxy)}")
    else:
        print("🧭 本次支付测试不使用代理")

    driver = None
    try:
        driver = create_driver(headless=args.headless, proxy=proxy)
        if proxy:
            log_browser_egress_ip(driver)

        card = execute_payurl_payment_flow(
            driver,
            args.pay_url,
            payment_method=method,
            email=email,
        )
        print(
            "✅ 支付测试流程已提交，"
            f"卡尾号 {card.card[-4:]}"
        )
        return 0
    except Exception as exc:
        print(f"❌ 支付测试失败: {exc}")
        return 1
    finally:
        if driver is not None:
            _maybe_pause_before_close(
                headless=bool(args.headless),
                no_pause=bool(args.no_pause),
                hold_seconds=args.hold_seconds,
            )
            try:
                driver.quit()
            except Exception:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
