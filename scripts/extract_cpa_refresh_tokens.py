"""
从 accounts-cpa.txt 中提取 refresh_token。

输入格式（一行一条）:
    账户|密码|email|json数据

默认读取项目根目录的 accounts-cpa.txt，输出到 accounts-output.txt。

示例:
    uv run python scripts/extract_cpa_refresh_tokens.py
    uv run python scripts/extract_cpa_refresh_tokens.py --input accounts-cpa.txt --output accounts-output.txt
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = PROJECT_ROOT / "accounts-cpa.txt"
DEFAULT_OUTPUT = PROJECT_ROOT / "accounts-output.txt"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="读取 accounts-cpa.txt 第 4 列 JSON，导出 refresh_token（一行一个）"
    )
    parser.add_argument(
        "--input",
        default=str(DEFAULT_INPUT),
        help="输入文件，默认: 项目根目录/accounts-cpa.txt",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT),
        help="输出文件，默认: 项目根目录/accounts-output.txt",
    )
    return parser


def resolve_path(path_value: str) -> Path:
    path = Path(path_value).expanduser()
    if path.is_absolute():
        return path
    return (PROJECT_ROOT / path).resolve()


def extract_refresh_tokens(input_path: Path) -> tuple[list[str], list[str]]:
    if not input_path.exists():
        raise SystemExit(f"输入文件不存在: {input_path}")
    if not input_path.is_file():
        raise SystemExit(f"不是文件: {input_path}")

    refresh_tokens: list[str] = []
    warnings: list[str] = []

    for line_number, raw_line in enumerate(input_path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line:
            continue

        columns = line.split("|", 3)
        if len(columns) < 4:
            warnings.append(f"第 {line_number} 行: 列数不足，已跳过")
            continue

        json_text = columns[3].strip()
        try:
            payload = json.loads(json_text)
        except json.JSONDecodeError as exc:
            warnings.append(f"第 {line_number} 行: JSON 解析失败 ({exc.msg})，已跳过")
            continue

        if not isinstance(payload, dict):
            warnings.append(f"第 {line_number} 行: 第 4 列不是 JSON 对象，已跳过")
            continue

        refresh_token = payload.get("refresh_token")
        if not isinstance(refresh_token, str) or not refresh_token.strip():
            warnings.append(f"第 {line_number} 行: 缺少 refresh_token，已跳过")
            continue

        refresh_tokens.append(refresh_token.strip())

    return refresh_tokens, warnings


def main() -> None:
    args = build_parser().parse_args()
    input_path = resolve_path(args.input)
    output_path = resolve_path(args.output)

    refresh_tokens, warnings = extract_refresh_tokens(input_path)
    output_path.write_text("\n".join(refresh_tokens) + ("\n" if refresh_tokens else ""), encoding="utf-8")

    print(f"已导出 {len(refresh_tokens)} 条 refresh_token 到: {output_path}")
    for warning in warnings:
        print(f"警告: {warning}", file=sys.stderr)


if __name__ == "__main__":
    main()
