"""
从 accounts-cpa.txt 中提取第 4 列 JSON，并保存为独立 JSON 文件。

输入格式（一行一条）:
    账户|密码|email|json数据

默认读取项目根目录的 accounts-cpa.txt，输出到 cpa/json/ 目录。

示例:
    uv run python cpa/extract_json_files.py
    uv run python cpa/extract_json_files.py --input accounts-cpa.txt --output-dir cpa/json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = PROJECT_ROOT / "accounts-cpa.txt"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "cpa" / "json"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="读取 accounts-cpa.txt 第 4 列 JSON，并逐条保存为 .json 文件"
    )
    parser.add_argument(
        "--input",
        default=str(DEFAULT_INPUT),
        help="输入文件，默认: 项目根目录/accounts-cpa.txt",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="JSON 输出目录，默认: 项目根目录/cpa/json",
    )
    return parser


def resolve_path(path_value: str) -> Path:
    path = Path(path_value).expanduser()
    if path.is_absolute():
        return path
    return (PROJECT_ROOT / path).resolve()


def safe_filename_part(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    return cleaned.strip("._-") or "account"


def iter_json_payloads(input_path: Path) -> tuple[list[tuple[int, str, dict[str, Any]]], list[str]]:
    if not input_path.exists():
        raise SystemExit(f"输入文件不存在: {input_path}")
    if not input_path.is_file():
        raise SystemExit(f"不是文件: {input_path}")

    payloads: list[tuple[int, str, dict[str, Any]]] = []
    warnings: list[str] = []

    for line_number, raw_line in enumerate(input_path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line:
            continue

        columns = line.split("|", 3)
        if len(columns) < 4:
            warnings.append(f"第 {line_number} 行: 列数不足，已跳过")
            continue

        account = columns[0].strip() or f"line-{line_number}"
        json_text = columns[3].strip()

        try:
            payload = json.loads(json_text)
        except json.JSONDecodeError as exc:
            warnings.append(f"第 {line_number} 行: JSON 解析失败 ({exc.msg})，已跳过")
            continue

        if not isinstance(payload, dict):
            warnings.append(f"第 {line_number} 行: 第 4 列不是 JSON 对象，已跳过")
            continue

        payloads.append((line_number, account, payload))

    return payloads, warnings


def write_json_files(payloads: list[tuple[int, str, dict[str, Any]]], output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    written_files: list[Path] = []

    for line_number, account, payload in payloads:
        filename = f"{line_number:06d}-{safe_filename_part(account)}.json"
        output_path = output_dir / filename
        output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        written_files.append(output_path)

    return written_files


def main() -> None:
    args = build_parser().parse_args()
    input_path = resolve_path(args.input)
    output_dir = resolve_path(args.output_dir)

    payloads, warnings = iter_json_payloads(input_path)
    written_files = write_json_files(payloads, output_dir)

    print(f"已导出 {len(written_files)} 个 JSON 文件到: {output_dir}")
    for warning in warnings:
        print(f"警告: {warning}", file=sys.stderr)


if __name__ == "__main__":
    main()
