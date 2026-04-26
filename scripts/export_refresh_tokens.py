"""
从 token JSON 文件中导出 refresh_token 列表。

示例:
    uv run python scripts/export_refresh_tokens.py
    uv run python scripts/export_refresh_tokens.py --output data/sub2api-refresh-tokens.txt
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT_DIR = PROJECT_ROOT / "data" / "tokens"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="读取 token JSON 并导出 refresh_token 列表（一行一个）"
    )
    parser.add_argument(
        "--input-dir",
        default=str(DEFAULT_INPUT_DIR),
        help="token JSON 所在目录，默认: data/tokens",
    )
    parser.add_argument(
        "--output",
        help="可选，输出到指定文本文件；不传时打印到标准输出",
    )
    return parser


def resolve_path(path_value: str) -> Path:
    path = Path(path_value).expanduser()
    if path.is_absolute():
        return path
    return (PROJECT_ROOT / path).resolve()


def load_refresh_tokens(input_dir: Path) -> tuple[list[str], list[str]]:
    if not input_dir.exists():
        raise SystemExit(f"目录不存在: {input_dir}")
    if not input_dir.is_dir():
        raise SystemExit(f"不是目录: {input_dir}")

    json_files = sorted(
        path for path in input_dir.iterdir() if path.is_file() and path.suffix.lower() == ".json"
    )
    if not json_files:
        raise SystemExit(f"目录下没有 JSON 文件: {input_dir}")

    refresh_tokens: list[str] = []
    warnings: list[str] = []

    for json_file in json_files:
        try:
            payload = json.loads(json_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            warnings.append(f"{json_file.name}: JSON 解析失败 ({exc.msg})")
            continue

        if not isinstance(payload, dict):
            warnings.append(f"{json_file.name}: 顶层内容不是 JSON 对象")
            continue

        refresh_token = payload.get("refresh_token")
        if not isinstance(refresh_token, str) or not refresh_token.strip():
            warnings.append(f"{json_file.name}: 缺少 refresh_token")
            continue

        refresh_tokens.append(refresh_token.strip())

    if not refresh_tokens:
        raise SystemExit(f"没有找到可导出的 refresh_token: {input_dir}")

    return refresh_tokens, warnings


def main() -> None:
    args = build_parser().parse_args()
    input_dir = resolve_path(args.input_dir)
    refresh_tokens, warnings = load_refresh_tokens(input_dir)

    output_text = "\n".join(refresh_tokens) + "\n"

    if args.output:
        output_path = resolve_path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(output_text, encoding="utf-8")
    else:
        sys.stdout.write(output_text)

    for warning in warnings:
        print(f"警告: {warning}", file=sys.stderr)


if __name__ == "__main__":
    main()
