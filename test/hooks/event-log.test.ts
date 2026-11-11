import { describe, it, expect, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const SCRIPT = join(root, 'hooks/event-log.mjs');
let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'pitwall-el-')); });

const fire = (input: unknown, raw?: string) =>
  spawnSync('node', [SCRIPT], { input: raw ?? JSON.stringify(input), encoding: 'utf8', env: { ...process.env, PITWALL_HOME: home } });
const events = (s = 's1') => {
  const f = join(home, 'events', `${s}.jsonl`);
  return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
};
const base = { session_id: 's1', cwd: '/x', transcript_path: '/t' };

describe('event-log', () => {
  it('SubagentStart: agent id and type', () => {
    fire({ ...base, hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'pitwall:scout' });
    expect(events()).toEqual([expect.objectContaining({ event: 'SubagentStart', session: 's1', agent: 'a1', agentType: 'pitwall:scout' })]);
    expect(typeof events()[0].t).toBe('string');
  });

  it('SubagentStop: keeps the first line of the final message as detail', () => {
    fire({ ...base, hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'pitwall:reviewer',
      last_assistant_message: 'fix\n1. app/x.ts:3 do this' });
    expect(events()[0]).toMatchObject({ event: 'SubagentStop', agent: 'a1', agentType: 'pitwall:reviewer', detail: 'fix' });
  });

  it('PreToolUse of the Agent tool keeps its description', () => {
    fire({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input: { description: 'find callers', prompt: 'long prompt' } });
    expect(events()[0]).toMatchObject({ event: 'PreToolUse', tool: 'Agent', description: 'find callers' });
    expect(JSON.stringify(events()[0])).not.toContain('long prompt');
  });

  it('PreToolUse and PostToolUse of other tools keep only the tool name, and the agent when a subagent calls', () => {
    fire({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/secret/path' }, agent_id: 'a1', agent_type: 'Explore' });
    fire({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'rm -rf x' }, tool_response: { stdout: 'out' } });
    const [pre, post] = events();
    expect(pre).toMatchObject({ event: 'PreToolUse', tool: 'Read', agent: 'a1', agentType: 'Explore' });
    expect(post).toMatchObject({ event: 'PostToolUse', tool: 'Bash' });
    expect(JSON.stringify(events())).not.toContain('/secret/path');
    expect(JSON.stringify(events())).not.toContain('rm -rf');
  });

  it('Stop', () => {
    fire({ ...base, hook_event_name: 'Stop', stop_hook_active: false, last_assistant_message: 'done' });
    expect(events()[0]).toMatchObject({ event: 'Stop', session: 's1' });
  });

  it('UserPromptSubmit: a multi-line prompt is stored on one line, max 120 chars', () => {
    fire({ ...base, hook_event_name: 'UserPromptSubmit', prompt: 'line one\nline two\n' + 'x'.repeat(300) });
    const d = events()[0].detail as string;
    expect(d).not.toContain('\n');
    expect(d.length).toBeLessThanOrEqual(120);
    expect(d.startsWith('line one line two')).toBe(true);
  });

  it('logs with the team off (no flag file exists)', () => {
    fire({ ...base, hook_event_name: 'Stop' });
    expect(events()).toHaveLength(1);
  });

  it('writes nothing and exits 0 for invalid JSON, no session id, an unknown event, or an unwritable home', () => {
    for (const r of [fire(null, 'not json'), fire({ hook_event_name: 'Stop' }), fire({ ...base, hook_event_name: 'Whatever' })]) {
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('');
    }
    expect(existsSync(join(home, 'events'))).toBe(false);
    mkdirSync(join(home, 'events'));
    chmodSync(join(home, 'events'), 0o500);
    const r = fire({ ...base, hook_event_name: 'Stop' });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });
});

describe('hooks.json', () => {
  const hooks = JSON.parse(readFileSync(join(root, 'hooks/hooks.json'), 'utf8')).hooks as Record<string, { hooks: { command: string }[] }[]>;
  it('registers event-log for the six events', () => {
    for (const ev of ['SubagentStart', 'SubagentStop', 'PreToolUse', 'PostToolUse', 'Stop', 'UserPromptSubmit']) {
      const cmds = (hooks[ev] ?? []).flatMap((g) => g.hooks.map((h) => h.command));
      expect(cmds.some((c) => c.includes('event-log.mjs')), ev).toBe(true);
    }
  });
  it('every script a command names exists in the repo', () => {
    for (const groups of Object.values(hooks)) for (const g of groups) for (const h of g.hooks) {
      const m = h.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/(hooks\/[\w./-]+\.mjs)/);
      expect(m, h.command).not.toBeNull();
      expect(existsSync(join(root, m![1])), m![1]).toBe(true);
    }
  });
});
