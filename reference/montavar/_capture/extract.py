#!/usr/bin/env python3
"""Rebuild raw reference captures from agent transcripts.

The page dumper (dump.js) writes `[CAP <slug> <i>/<n>] <JSON string>` console lines; the browser
tool returns them to the agent, so they end up in the agent's transcript (.jsonl). This script
collects those chunks and writes one text file per slug.

Large tool results are not kept in the transcript: the harness saves them under `tool-results/`
next to it, so pass the session folder (it holds both).

Usage: python3 extract.py --out <dir> <session dir | transcript.jsonl> [...]
"""
import argparse
import base64
import json
import os
import re
import sys

# Two formats: the first sweeps wrote a JSON string; later ones write base64 with the chunk length
# (the browser tool rewrites text that looks like an absolute URL, which cut some JSON chunks short).
CHUNK = re.compile(r'\[CAP (\S+) (\d+)/(\d+)(?: @(\w+))?\] (?:b64:([A-Za-z0-9+/=]+)\.(\d+)|("(?:[^"\\]|\\.)*"))')
JSON_CHUNK = 8000


def strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for value in node.values():
            yield from strings(value)
    elif isinstance(node, list):
        for value in node:
            yield from strings(value)


def files(paths):
    """Transcripts (.jsonl) and the files the harness writes when one tool result is too large (tool-results/*)."""
    for path in paths:
        if os.path.isdir(path):
            for root, _dirs, names in os.walk(path):
                for name in names:
                    if name.endswith('.jsonl') or os.path.basename(root) == 'tool-results':
                        yield os.path.join(root, name)
        else:
            yield path


def texts(path):
    """Every string that may hold console output, with one level of JSON escaping removed."""
    if path.endswith('.jsonl'):
        with open(path, encoding='utf-8', errors='surrogatepass') as handle:
            for line in handle:
                if '[CAP ' not in line:
                    continue
                try:
                    yield from strings(json.loads(line))
                except ValueError:
                    continue
        return
    if os.path.splitext(path)[1].lower() not in ('.json', '.txt', ''):
        return
    with open(path, encoding='utf-8', errors='surrogatepass') as handle:
        body = handle.read()
    if '[CAP ' not in body:
        return
    try:
        yield from strings(json.loads(body))
    except ValueError:
        yield body


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True)
    parser.add_argument('paths', nargs='+')
    args = parser.parse_args()

    runs = {}  # slug -> [ {'run': id, 'n': total, 'chunks': {i: text}, 'cut': set()} ], oldest first
    for path in sorted(files(args.paths), key=os.path.getmtime):
        for text in texts(path):
            if '[CAP ' not in text:
                continue
            for match in CHUNK.finditer(text):
                slug, index, total, run = match.group(1), int(match.group(2)), int(match.group(3)), match.group(4)
                cut = False
                if match.group(5):
                    try:
                        chunk = base64.b64decode(match.group(5)).decode('utf-8')
                    except (ValueError, UnicodeDecodeError):
                        continue
                    if len(chunk.encode('utf-16-le')) // 2 != int(match.group(6)):
                        continue  # truncated in transit: treat as not received
                else:
                    try:
                        chunk = json.loads(match.group(7))
                    except ValueError:
                        continue
                    cut = index < total - 1 and len(chunk.encode('utf-16-le', 'surrogatepass')) // 2 < JSON_CHUNK
                    run = 'json%d' % total
                history = runs.setdefault(slug, [])
                entry = next((e for e in history if e['run'] == run), None)
                if entry is None:
                    entry = {'run': run, 'n': total, 'chunks': {}, 'cut': set()}
                    history.append(entry)
                if index in entry['chunks'] and len(entry['chunks'][index]) > len(chunk):
                    continue  # never let a shorter copy replace a fuller one
                entry['chunks'][index] = chunk
                (entry['cut'].add if cut else entry['cut'].discard)(index)

    # Per slug: the newest complete run wins; if none is complete, report the newest.
    captures, damaged = {}, []
    for slug, history in runs.items():
        complete_runs = [e for e in history if len(e['chunks']) == e['n']]
        chosen = complete_runs[-1] if complete_runs else history[-1]
        captures[slug] = chosen
        if chosen['cut']:
            damaged.append((slug, sorted(chosen['cut'])))

    os.makedirs(args.out, exist_ok=True)
    complete, incomplete = [], []
    for slug, entry in sorted(captures.items()):
        missing = [i for i in range(entry['n']) if i not in entry['chunks']]
        if missing:
            incomplete.append((slug, entry['n'], missing))
            continue
        text = ''.join(entry['chunks'][i] for i in range(entry['n']))
        text = text.encode('utf-16', 'surrogatepass').decode('utf-16', 'replace')
        with open(os.path.join(args.out, slug + '.txt'), 'w', encoding='utf-8') as handle:
            handle.write(text)
        complete.append((slug, len(text)))

    for slug, size in complete:
        print(f'ok   {slug}  {size} chars')
    for slug, cut in sorted(damaged):
        print(f'DAMAGED {slug}: chunk(s) {cut} were cut short in transit (text is missing); capture this page again')
    for slug, total, missing in incomplete:
        print(f'MISSING {slug}: {len(missing)} of {total} chunks missing: {missing[:20]}')
    print(f'{len(complete)} complete, {len(incomplete)} incomplete, {len(damaged)} damaged')
    return 1 if incomplete else 0


if __name__ == '__main__':
    sys.exit(main())
