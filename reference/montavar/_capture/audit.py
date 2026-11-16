#!/usr/bin/env python3
"""List every browser action that agents took on the reference site, from their transcripts.

The reference must only be read. This prints, per agent transcript, the browser tools used, the
URLs navigated to, the JavaScript run (grouped), and any mouse / keyboard / form action in full,
so a click or a typed value cannot go unnoticed.

Usage: python3 audit.py <transcript.jsonl | dir> [...]
"""
import collections
import json
import os
import sys

CHROME = 'mcp__claude-in-chrome__'
INPUT_ACTIONS = {'left_click', 'right_click', 'double_click', 'triple_click', 'type', 'key', 'left_click_drag'}


def files(paths):
    for path in paths:
        if os.path.isdir(path):
            for root, _dirs, names in os.walk(path):
                for name in names:
                    if name.endswith('.jsonl') and name != 'journal.jsonl':
                        yield os.path.join(root, name)
        else:
            yield path


def classify_js(text):
    text = text or ''
    if text.startswith('__capNext'):
        return 'capNext'
    if '__capRun' in text:
        return 'capRun'
    if '__capFetchScripts' in text:
        return 'capFetchScripts'
    return 'OTHER: ' + ' '.join(text.split())[:160]


def note(action, tool_input, counts, navs, scripts, inputs):
    if action == 'navigate':
        navs.append(str(tool_input.get('url', '')).replace('https://montavar.websonik.nl', ''))
    elif action == 'javascript_tool':
        scripts[classify_js(tool_input.get('text'))] += 1
    elif action == 'computer':
        kind = str(tool_input.get('action'))
        counts['computer:' + kind] += 1
        if kind in INPUT_ACTIONS:
            inputs.append(json.dumps({k: tool_input.get(k) for k in ('action', 'action_summary', 'coordinate', 'ref', 'text')}, ensure_ascii=False))
    elif action in ('form_input', 'file_upload'):
        inputs.append(action + ' ' + json.dumps(tool_input, ensure_ascii=False)[:300])
    else:
        counts[action] += 1


def main():
    total_inputs = 0
    for path in sorted(files(sys.argv[1:]), key=os.path.getmtime):
        counts, scripts, navs, inputs = collections.Counter(), collections.Counter(), [], []
        with open(path, encoding='utf-8', errors='replace') as handle:
            for line in handle:
                if CHROME not in line:
                    continue
                try:
                    record = json.loads(line)
                except ValueError:
                    continue
                message = record.get('message') if isinstance(record, dict) else None
                content = message.get('content') if isinstance(message, dict) else None
                if not isinstance(content, list):
                    continue
                for part in content:
                    if not isinstance(part, dict) or part.get('type') != 'tool_use':
                        continue
                    name = str(part.get('name', ''))
                    if not name.startswith(CHROME):
                        continue
                    tool = name[len(CHROME):]
                    tool_input = part.get('input') if isinstance(part.get('input'), dict) else {}
                    if tool == 'browser_batch':
                        actions = tool_input.get('actions')
                        if isinstance(actions, str):
                            try:
                                actions = json.loads(actions)
                            except ValueError:
                                actions = []
                        for action in actions or []:
                            if isinstance(action, dict):
                                note(str(action.get('name')), action.get('input') if isinstance(action.get('input'), dict) else {}, counts, navs, scripts, inputs)
                    else:
                        note(tool, tool_input, counts, navs, scripts, inputs)
        if not (counts or scripts or navs or inputs):
            continue
        total_inputs += len(inputs)
        print(os.path.basename(path))
        print('  navigated:', navs)
        print('  javascript:', dict(scripts))
        print('  other:', dict(counts))
        for item in inputs:
            print('  INPUT ACTION:', item)
    print(f'mouse / keyboard / form actions in total: {total_inputs}')


if __name__ == '__main__':
    main()
