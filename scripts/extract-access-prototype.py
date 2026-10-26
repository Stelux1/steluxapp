"""Read the supplied ISO details table without executing Access forms or macros.

Run with: uv run --with access-parser==0.0.6 python scripts/extract-access-prototype.py FILE.accdb
"""
import argparse
import json
import logging
from pathlib import Path
from access_parser import AccessParser

parser = argparse.ArgumentParser()
parser.add_argument('database', type=Path)
parser.add_argument('--output', type=Path, default=Path('.data/access-prototype/source.json'))
args = parser.parse_args()
logging.getLogger('access_parser').setLevel(logging.CRITICAL)
database = AccessParser(str(args.database))
table = database.parse_table('ISO details')
if not table or 'Isometric' not in table or 'Weld No' not in table:
    raise SystemExit('The database does not contain a readable ISO details table.')
lengths = {len(values) for values in table.values()}
if len(lengths) != 1:
    raise SystemExit('The Access reader returned uneven columns. No output was written.')
rows = [dict(zip(table, values)) for values in zip(*table.values())]
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
args.output.chmod(0o600)
print(f'Extracted {len(rows)} rows and {len(table)} columns to {args.output}')
