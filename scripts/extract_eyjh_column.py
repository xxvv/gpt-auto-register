"""
从账号导出文件中提取第 4 列里以 eyJh 开头的内容。

输入格式（一行一条）:
    账户|密码|时间|token|邮箱|来源

默认读取 data/accounts/20260513_005.txt，输出到同目录的
20260513_005_eyjh.txt。

示例:
    uv run python scripts/extract_eyjh_column.py
    uv run python scripts/extract_eyjh_column.py --input data/accounts/20260513_005.txt --output data/accounts/eyjh.txt
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = PROJECT_ROOT / "data" / "accounts" / "20260513_005.txt"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="读取 | 分隔账号文件，导出第 4 列中以 eyJh 开头的内容"
    )
    parser.add_argument(
        "--input",
        default=str(DEFAULT_INPUT),
        help="输入文件，默认: data/accounts/20260513_005.txt",
    )
    parser.add_argument(
        "--output",
        help="输出文件，默认: 输入文件同目录/<文件名>_eyjh.txt",
    )
    parser.add_argument(
        "--prefix",
        default="eyJh",
        help="要匹配的第 4 列前缀，默认: eyJh",
    )
    return parser


def resolve_path(path_value: str) -> Path:
    path = Path(path_value).expanduser()
    if path.is_absolute():
        return path
    return (PROJECT_ROOT / path).resolve()


def default_output_path(input_path: Path) -> Path:
    return input_path.with_name(f"{input_path.stem}_eyjh.txt")


def extract_matching_column(input_path: Path, prefix: str) -> tuple[list[str], list[str]]:
    if not input_path.exists():
        raise SystemExit(f"输入文件不存在: {input_path}")
    if not input_path.is_file():
        raise SystemExit(f"不是文件: {input_path}")

    values: list[str] = []
    warnings: list[str] = []

    for line_number, raw_line in enumerate(input_path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line:
            continue

        columns = line.split("|")
        if len(columns) < 4:
            warnings.append(f"第 {line_number} 行: 列数不足，已跳过")
            continue

        value = columns[3].strip()
        if value.startswith(prefix):
            values.append(value)

    return values, warnings


def main() -> None:
    args = build_parser().parse_args()
    input_path = resolve_path(args.input)
    output_path = resolve_path(args.output) if args.output else default_output_path(input_path)

    values, warnings = extract_matching_column(input_path, args.prefix)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(values) + ("\n" if values else ""), encoding="utf-8")

    print(f"已导出 {len(values)} 条以 {args.prefix} 开头的第 4 列内容到: {output_path}")
    for warning in warnings:
        print(f"警告: {warning}", file=sys.stderr)


if __name__ == "__main__":
    main()
