#!/usr/bin/env python3
"""Cost of one Claude Code session, per agent, as a Markdown table.

usage: python3 cost.py <session.jsonl | project folder (takes its newest session)>

Costs are API-price equivalents (the best proxy for how fast a session eats the
subscription limits). One API message is written on several lines with the same
message id: usage is counted once per id.
"""
import glob, json, os, sys
from datetime import datetime

# $ per million tokens: (input, output). Cache write = 1.25x input, cache read = 0.1x input.
PRICES = {'opus': (4, 20), 'sonnet': (2, 10), 'haiku': (0.10, 0.50)}


def scan(path):
    seen, s = set(), dict(usd=0.0, turns=0, tokens=0, models=set(), first=None, last=None, advisor=0, tools={})
    for line in open(path, errors='ignore'):
        try:
            d = json.loads(line)
        except ValueError:
            continue
        ts = d.get('timestamp')
        if d.get('type') == 'user' and ts and s['first'] is None:
            s['first'] = ts
        if d.get('type') != 'assistant':
            continue
        s['last'] = ts or s['last']
        m = d['message']
        for b in m.get('content') or []:
            if not isinstance(b, dict):
                continue
            if b.get('type') == 'tool_use':
                s['tools'][b['name']] = s['tools'].get(b['name'], 0) + 1
            if b.get('type') == 'server_tool_use' and b.get('name') == 'advisor':
                s['advisor'] += 1
        if m.get('id') in seen:
            continue
        seen.add(m.get('id'))
        fam = next((k for k in PRICES if k in m.get('model', '')), None)
        if not fam:
            continue
        u = m.get('usage') or {}
        i, o = PRICES[fam]
        inp, cw, cr, out = (u.get(k, 0) for k in ('input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens'))
        s['usd'] += (inp * i + cw * i * 1.25 + cr * i * 0.1 + out * o) / 1e6
        s['tokens'] += inp + cw + cr + out
        s['turns'] += 1
        s['models'].add(fam)
    return s


def minutes(a, b):
    if not a or not b:
        return 0
    f = lambda t: datetime.fromisoformat(t.replace('Z', '+00:00'))
    return (f(b) - f(a)).total_seconds() / 60


def main():
    target = sys.argv[1]
    if os.path.isdir(target):
        target = max(glob.glob(os.path.join(target, '*.jsonl')), key=os.path.getmtime)
    rows = [('main', scan(target))]
    for meta in sorted(glob.glob(target[:-6] + '/subagents/*.meta.json')):
        md = json.load(open(meta))
        rows.append((f"{md.get('agentType', 'agent')}: {md.get('description', '')[:30]}", scan(meta[:-10] + '.jsonl')))
    total = sum(r['usd'] for _, r in rows)
    main_s = rows[0][1]
    print(f"session `{os.path.basename(target)}`\n")
    print('| agent | model | turns | tokens | cost | share |')
    print('|---|---|---:|---:|---:|---:|')
    for name, r in rows:
        share = r['usd'] / total * 100 if total else 0
        print(f"| {name} | {'/'.join(sorted(r['models']))} | {r['turns']} | {r['tokens'] / 1000:.1f}k | ${r['usd']:.3f} | {share:.0f}% |")
    print(f"| **total** | | {sum(r['turns'] for _, r in rows)} | {sum(r['tokens'] for _, r in rows) / 1000:.1f}k | **${total:.3f}** | |")
    print(f"\nelapsed: {minutes(main_s['first'], main_s['last']):.1f} min · main turns: {main_s['turns']} · "
          f"native advisor calls: {main_s['advisor']} · main tools: {main_s['tools']}")


if __name__ == '__main__':
    main()
