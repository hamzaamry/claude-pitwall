import { describe, it, expect, beforeEach } from 'vitest';
import { appendFileSync, cpSync, mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionWatcher } from '../src/watcher.js';

const FIXTURE = new URL('./fixtures/session', import.meta.url).pathname;
const SID = '11111111-1111-1111-1111-111111111111';
const CWD = '/proj';
let home: string;
let projectDir: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'pitwall-w-'));
  projectDir = join(home, '.claude', 'projects', '-proj');
});

const assistantLine = (id: string, output: number) => JSON.stringify({
  type: 'assistant', timestamp: '2026-11-11T10:01:00.000Z', effort: 'medium',
  message: { id, model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'hi' }],
    usage: { input_tokens: 0, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
});

describe('SessionWatcher', () => {
  it('returns null when the project dir does not exist', () => {
    expect(new SessionWatcher({ cwd: CWD, home }).poll()).toBeNull();
  });

  it('returns null when the project dir is empty', () => {
    mkdirSync(projectDir, { recursive: true });
    expect(new SessionWatcher({ cwd: CWD, home }).poll()).toBeNull();
  });

  it('reads a fixture session: 3 agents, tokens counted once', () => {
    cpSync(FIXTURE, projectDir, { recursive: true });
    const s = new SessionWatcher({ cwd: CWD, home }).poll()!;
    expect(s.sessionId).toBe(SID);
    expect(Object.keys(s.agents).sort()).toEqual(['a1', 'a2', 'main']);
    expect(s.agents.main.tokens).toBe(115);
    expect(s.agents.a1.tokens).toBe(30);
    expect(s.agents.a2.tokens).toBe(50);
    expect(s.agents.a1).toMatchObject({ role: 'Explore', model: 'haiku', effort: 'low', title: 'find callers', status: 'done', toolUseId: 'toolu_1' });
    expect(s.agents.a2).toMatchObject({ role: 'general-purpose', model: 'opus', status: 'working' });
    expect(s.currentTask).toBe('fix the save bug');
  });

  it('picks up appended lines on the next poll', () => {
    cpSync(FIXTURE, projectDir, { recursive: true });
    const w = new SessionWatcher({ cwd: CWD, home });
    expect(w.poll()!.agents.main.tokens).toBe(115);
    appendFileSync(join(projectDir, `${SID}.jsonl`), assistantLine('m2', 100) + '\n');
    expect(w.poll()!.agents.main.tokens).toBe(215);
  });

  it('does not double count when nothing changed', () => {
    cpSync(FIXTURE, projectDir, { recursive: true });
    const w = new SessionWatcher({ cwd: CWD, home });
    w.poll();
    expect(w.poll()!.agents.main.tokens).toBe(115);
  });

  it('buffers a half-written last line until its newline', () => {
    cpSync(FIXTURE, projectDir, { recursive: true });
    const w = new SessionWatcher({ cwd: CWD, home });
    w.poll();
    const line = assistantLine('m2', 100);
    appendFileSync(join(projectDir, `${SID}.jsonl`), line.slice(0, 40));
    expect(w.poll()!.agents.main.tokens).toBe(115);
    appendFileSync(join(projectDir, `${SID}.jsonl`), line.slice(40) + '\n');
    expect(w.poll()!.agents.main.tokens).toBe(215);
  });

  it('registers a subagent that appears later and updates finished status', () => {
    cpSync(FIXTURE, projectDir, { recursive: true });
    const w = new SessionWatcher({ cwd: CWD, home });
    expect(w.poll()!.agents.a2.status).toBe('working');
    writeFileSync(join(projectDir, SID, 'subagents', 'agent-a2.meta.json'),
      JSON.stringify({ agentType: 'general-purpose', description: 'check tests', toolUseId: 'toolu_2', pickedEffortModel: 'claude-opus-5-5', finished: true }));
    expect(w.poll()!.agents.a2.status).toBe('done');
  });

  it('switches to a newer session when one appears', () => {
    cpSync(FIXTURE, projectDir, { recursive: true });
    utimesSync(join(projectDir, `${SID}.jsonl`), 1000, 1000);
    const w = new SessionWatcher({ cwd: CWD, home });
    expect(w.poll()!.sessionId).toBe(SID);
    writeFileSync(join(projectDir, 'newer.jsonl'), assistantLine('n1', 7) + '\n');
    const s = w.poll()!;
    expect(s.sessionId).toBe('newer');
    expect(s.agents.main.tokens).toBe(7);
    expect(Object.keys(s.agents)).toEqual(['main']);
  });

  it('stays on a pinned session even when a newer one appears', () => {
    cpSync(FIXTURE, projectDir, { recursive: true });
    const w = new SessionWatcher({ cwd: CWD, home, sessionId: SID });
    w.poll();
    writeFileSync(join(projectDir, 'newer.jsonl'), assistantLine('n1', 7) + '\n');
    expect(w.poll()!.sessionId).toBe(SID);
  });

  it('returns null for a pinned session that does not exist', () => {
    mkdirSync(projectDir, { recursive: true });
    expect(new SessionWatcher({ cwd: CWD, home, sessionId: 'nope' }).poll()).toBeNull();
  });

  it('survives a bad line in the middle of a transcript', () => {
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 's.jsonl'), 'garbage\n' + assistantLine('m1', 5) + '\n');
    expect(new SessionWatcher({ cwd: CWD, home }).poll()!.agents.main.tokens).toBe(5);
  });

  it('does not flap between two sessions that write in turn', () => {
    mkdirSync(projectDir, { recursive: true });
    const now = Date.now() / 1000;
    writeFileSync(join(projectDir, 'one.jsonl'), assistantLine('o1', 1) + '\n');
    const w = new SessionWatcher({ cwd: CWD, home });
    expect(w.poll()!.sessionId).toBe('one');
    writeFileSync(join(projectDir, 'two.jsonl'), assistantLine('t1', 1) + '\n');
    expect(w.poll()!.sessionId).toBe('two');
    for (let i = 0; i < 6; i++) {
      const f = i % 2 ? 'one' : 'two';
      appendFileSync(join(projectDir, `${f}.jsonl`), assistantLine(`x${i}`, 1) + '\n');
      utimesSync(join(projectDir, `${f}.jsonl`), now + i + 1, now + i + 1);
      expect(w.poll()!.sessionId).toBe('two');
    }
  });

  it('switches when the current session has been quiet for a long time', () => {
    mkdirSync(projectDir, { recursive: true });
    const old = Date.now() / 1000 - 120;
    writeFileSync(join(projectDir, 'one.jsonl'), assistantLine('o1', 1) + '\n');
    utimesSync(join(projectDir, 'one.jsonl'), old, old);
    writeFileSync(join(projectDir, 'two.jsonl'), assistantLine('t1', 1) + '\n');
    utimesSync(join(projectDir, 'two.jsonl'), old - 500, old - 500);
    const w = new SessionWatcher({ cwd: CWD, home });
    expect(w.poll()!.sessionId).toBe('one');
    const fresh = Date.now() / 1000;
    appendFileSync(join(projectDir, 'two.jsonl'), assistantLine('t2', 1) + '\n');
    utimesSync(join(projectDir, 'two.jsonl'), fresh, fresh);
    expect(w.poll()!.sessionId).toBe('two');
  });

  it('keeps each session state when switching back and forth (no re-read from zero)', () => {
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'one.jsonl'), assistantLine('o1', 5) + '\n');
    const w = new SessionWatcher({ cwd: CWD, home, sessionId: 'one' });
    const first = w.poll()!;
    expect(w.poll()).toBe(first);
  });

  it('reads message blocks spread over several lines of one message', () => {
    mkdirSync(projectDir, { recursive: true });
    const l = (content: unknown[]) => JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), effort: 'medium',
      message: { id: 'multi', model: 'claude-sonnet-5-5', content,
        usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 } } });
    writeFileSync(join(projectDir, 's.jsonl'), [
      l([{ type: 'thinking' }]), l([{ type: 'text', text: 'hi' }]),
      l([{ type: 'tool_use', id: 'toolu_a', name: 'Agent', input: { description: 'find callers', subagent_type: 'Explore' } }]),
      l([{ type: 'tool_use', id: 'toolu_s', name: 'Skill', input: { skill: 'brainstorming' } }]),
      l([{ type: 'tool_use', id: 'toolu_w', name: 'Write', input: {} }]),
    ].join('\n') + '\n');
    const s = new SessionWatcher({ cwd: CWD, home }).poll()!;
    expect(s.agents.main.tokens).toBe(10);
    expect(s.skills.map((k) => k.name)).toEqual(['brainstorming']);
    expect(s.log.map((x) => x.text)).toContain('main → Explore: find callers');
    expect(s.categories.coding).toBe(10);
  });

  it('does not replay old events as live dots', () => {
    cpSync(FIXTURE, projectDir, { recursive: true });
    const s = new SessionWatcher({ cwd: CWD, home }).poll()!;
    expect(s.log.length).toBeGreaterThan(0);
    expect(s.pendingFlows).toEqual([]);
  });

  it('keeps recent flows', () => {
    mkdirSync(projectDir, { recursive: true });
    const now = new Date().toISOString();
    writeFileSync(join(projectDir, 's.jsonl'), JSON.stringify({ type: 'assistant', timestamp: now, message: { id: 'm', model: 'claude-sonnet-5-5',
      content: [{ type: 'tool_use', id: 'toolu_a', name: 'Agent', input: { description: 'd', subagent_type: 'Explore' } }],
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }) + '\n');
    expect(new SessionWatcher({ cwd: CWD, home }).poll()!.pendingFlows).toHaveLength(1);
  });

  describe('pitwall events and team flag', () => {
    const eventsFile = () => join(home, '.claude', 'pitwall', 'events', `${SID}.jsonl`);
    const writeEvents = (lines: string[]) => {
      mkdirSync(join(home, '.claude', 'pitwall', 'events'), { recursive: true });
      writeFileSync(eventsFile(), lines.join('\n') + '\n');
    };
    const evLine = (o: object) => JSON.stringify({ t: new Date().toISOString(), session: SID, ...o });

    it('no events file: teamOn is undefined (phase 1 behaviour)', () => {
      cpSync(FIXTURE, projectDir, { recursive: true });
      expect(new SessionWatcher({ cwd: CWD, home }).poll()!.teamOn).toBeUndefined();
    });

    it('events file without the flag: teamOn is false; with the flag: true', () => {
      cpSync(FIXTURE, projectDir, { recursive: true });
      writeEvents([evLine({ event: 'Stop' })]);
      const w = new SessionWatcher({ cwd: CWD, home });
      expect(w.poll()!.teamOn).toBe(false);
      mkdirSync(join(home, '.claude', 'pitwall', 'team'), { recursive: true });
      writeFileSync(join(home, '.claude', 'pitwall', 'team', SID), '');
      expect(w.poll()!.teamOn).toBe(true);
    });

    it('applies subagent events and nudges as they are appended', () => {
      cpSync(FIXTURE, projectDir, { recursive: true });
      writeEvents([evLine({ event: 'SubagentStart', agent: 'live1', agentType: 'pitwall:scout' })]);
      const w = new SessionWatcher({ cwd: CWD, home });
      expect(w.poll()!.agents.live1).toMatchObject({ role: 'pitwall:scout', status: 'working' });
      appendFileSync(eventsFile(), evLine({ event: 'SubagentStop', agent: 'live1' }) + '\n' + evLine({ event: 'Nudge', kind: 'review-gate' }) + '\n');
      const s = w.poll()!;
      expect(s.agents.live1.status).toBe('done');
      expect(s.nudges['review-gate']).toBeTruthy();
    });

    it('buffers a half-written last events line, ignores events of another session and bad lines', () => {
      cpSync(FIXTURE, projectDir, { recursive: true });
      writeEvents(['garbage', evLine({ event: 'SubagentStart', agent: 'x1', agentType: 'a' }).replace(SID, 'other')]);
      const w = new SessionWatcher({ cwd: CWD, home });
      expect(w.poll()!.agents.x1).toBeUndefined();
      const line = evLine({ event: 'SubagentStart', agent: 'half1', agentType: 'a' });
      appendFileSync(eventsFile(), line.slice(0, 30));
      expect(w.poll()!.agents.half1).toBeUndefined();
      appendFileSync(eventsFile(), line.slice(30) + '\n');
      expect(w.poll()!.agents.half1).toBeDefined();
    });
  });
});
