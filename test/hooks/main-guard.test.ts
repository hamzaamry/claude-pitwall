import { describe, it, expect, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = new URL('../../hooks/main-guard.mjs', import.meta.url).pathname;
let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), 'pitwall-mg-')); });

const teamOn = () => { mkdirSync(join(home, 'team'), { recursive: true }); writeFileSync(join(home, 'team', 's1'), ''); };
const check = (tool_input: object, extra: object = {}) => {
  const r = spawnSync('node', [SCRIPT, 'check'], { input: JSON.stringify({ session_id: 's1', hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input, ...extra }), encoding: 'utf8', env: { ...process.env, PITWALL_HOME: home } });
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason as string : '';
};

describe('main-guard: other agent types', () => {
  it('a skill\'s own agent type is denied with the pitwall agents that fit', () => {
    teamOn();
    const why = check({ subagent_type: 'general-purpose', prompt: 'x' });
    for (const a of ['pitwall:scout', 'pitwall:runner', 'pitwall:reviewer']) expect(why).toContain(a);
  });
  it('a pitwall agent passes', () => {
    teamOn();
    expect(check({ subagent_type: 'pitwall:scout', prompt: 'x' })).toBe('');
  });
  it('team off: nothing is denied', () => {
    expect(check({ subagent_type: 'general-purpose', prompt: 'x' })).toBe('');
  });
  it('a subagent (agent_id set) is not held to the main rule', () => {
    teamOn();
    expect(check({ subagent_type: 'general-purpose', prompt: 'x' }, { agent_id: 'a1', agent_type: 'pitwall:runner' })).toBe('');
  });
});
