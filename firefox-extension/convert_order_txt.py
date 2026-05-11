import argparse
import json
from pathlib import Path


FIELDS = ("email", "password", "client_id", "refresh_token")
SEPARATOR = "----"


def build_default_output(input_path: Path) -> Path:
    return input_path.with_name(f"{input_path.stem}_converted.txt")


def convert(input_path: Path, output_path: Path) -> int:
    with input_path.open("r", encoding="utf-8-sig") as file:
        records = json.load(file)

    if not isinstance(records, list):
        raise ValueError("Input JSON must be a list of account objects.")

    lines = []
    for index, record in enumerate(records, start=1):
        if not isinstance(record, dict):
            raise ValueError(f"Record #{index} is not an object.")

        missing = [field for field in FIELDS if record.get(field) in (None, "")]
        if missing:
            raise ValueError(f"Record #{index} is missing: {', '.join(missing)}")

        lines.append(SEPARATOR.join(str(record[field]) for field in FIELDS))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    return len(lines)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert order JSON txt to email----password----client_id----refresh_token lines."
    )
    parser.add_argument("input", help="Path to source txt file containing JSON array.")
    parser.add_argument(
        "-o",
        "--output",
        help="Output txt path. Defaults to <input_name>_converted.txt in the same folder.",
    )
    args = parser.parse_args()

    input_path = Path(args.input).expanduser().resolve()
    output_path = (
        Path(args.output).expanduser().resolve()
        if args.output
        else build_default_output(input_path)
    )

    count = convert(input_path, output_path)
    print(f"Converted {count} records to: {output_path}")


if __name__ == "__main__":
    main()
