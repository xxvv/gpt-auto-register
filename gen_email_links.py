import os
import sys
import glob

def process_file(input_path, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    basename = os.path.basename(input_path)
    output_path = os.path.join(output_dir, basename)

    with open(input_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    results = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        email = line.split('|')[0]
        results.append(f"{email}|https://getemail.nnai.website/?email={email}")

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(results) + '\n')

    print(f"Done: {output_path} ({len(results)} lines)")


if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(base_dir, 'data', 'output')

    if len(sys.argv) > 1:
        for pattern in sys.argv[1:]:
            for fp in glob.glob(pattern):
                process_file(fp, output_dir)
    else:
        accounts_dir = os.path.join(base_dir, 'data', 'accounts')
        for fp in glob.glob(os.path.join(accounts_dir, '*.txt')):
            process_file(fp, output_dir)
