#!/usr/bin/env python3
"""Merge the per-area findings and their verdicts into one ledger.

Input:  reference/montavar/raw/_findings/<area>.json            (first reader)
        reference/montavar/raw/_findings/<area>.verdicts.json   (second reader; may be several: <area>.verdicts*.json,
                                                                 later files override earlier ones per finding id)
Output: reference/montavar/raw/_findings/LEDGER.json  and a text summary on stdout.

Usage: python3 ledger.py [--list <status>] [--area <area>]
"""
import argparse
import glob
import json
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'raw', '_findings')
OPEN = {'confirmed', 'confirmed-corrected'}


def load(path):
    with open(path, encoding='utf-8') as handle:
        return json.load(handle)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--list', help='print the findings with this status (for example confirmed, unverified, needs-capture)')
    parser.add_argument('--area')
    args = parser.parse_args()

    ledger = []
    for path in sorted(glob.glob(os.path.join(ROOT, '*.json'))):
        name = os.path.basename(path)
        if '.verdicts' in name or name.startswith('LEDGER') or name.startswith('_'):
            continue
        data = load(path)
        area = data.get('area') or name[:-5]
        verdicts, extra = {}, []  # id -> every verdict on it, oldest first
        for vpath in sorted(glob.glob(os.path.join(ROOT, name[:-5] + '.verdicts*.json')), key=os.path.getmtime):
            vdata = load(vpath)
            for verdict in vdata.get('verdicts', []):
                verdicts.setdefault(verdict.get('id'), []).append(verdict)
            for finding in vdata.get('new_findings', []):
                extra.append(finding)
        for finding in list(data.get('findings', [])) + extra:
            row = dict(finding)
            row['area'] = area
            # a finding added by a second reader is its own verdict until a later file says otherwise
            row['status'] = 'confirmed' if finding in extra else 'unverified'
            for verdict in verdicts.get(finding.get('id'), []):
                row.update({k: v for k, v in (verdict.get('corrected') or {}).items() if v not in (None, '')})
                row['status'] = verdict.get('verdict', row['status'])
                reason = verdict.get('reason', '')
                row['verdict_reason'] = (row['verdict_reason'] + ' || LATER: ' + reason) if row.get('verdict_reason') and reason else (reason or row.get('verdict_reason', ''))
                for key in ('fix', 'question', 'capture_request', 'duplicate_of'):
                    if verdict.get(key):
                        row[key] = verdict[key]
            ledger.append(row)

    with open(os.path.join(ROOT, 'LEDGER.json'), 'w', encoding='utf-8') as handle:
        json.dump(ledger, handle, indent=1, ensure_ascii=False)

    areas = sorted({row['area'] for row in ledger})
    statuses = sorted({row['status'] for row in ledger})
    print(f'{len(ledger)} findings in {len(areas)} areas')
    print('area'.ljust(30), ' '.join(s[:12].ljust(12) for s in statuses))
    for area in areas:
        rows = [row for row in ledger if row['area'] == area]
        print(area.ljust(30), ' '.join(str(sum(1 for row in rows if row['status'] == s)).ljust(12) for s in statuses))
    print('TOTAL'.ljust(30), ' '.join(str(sum(1 for row in ledger if row['status'] == s)).ljust(12) for s in statuses))
    sizes = {}
    for row in ledger:
        if row['status'] in OPEN:
            size = (row.get('fix') or {}).get('size', '?')
            sizes[size] = sizes.get(size, 0) + 1
    print('to fix, by size:', sizes)

    if args.list:
        for row in ledger:
            if row['status'] == args.list and (not args.area or row['area'] == args.area):
                size = (row.get('fix') or {}).get('size', '')
                print(f"{row['id']} [{row.get('kind', '')[:4]} {row.get('impact', '')[:7]} {size}] {row.get('title', '')[:170]}")


if __name__ == '__main__':
    main()
