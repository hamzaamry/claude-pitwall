import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { applyPitwallEvent, parseEvent } from './events.js';
import { isTeamOn, teamKey } from './team.js';
import { applyEvent, registerSubagent } from './model/reduce.js';
import { emptyState, type SessionState } from './model/state.js';
import { findSessionDir, listSessions, projectDirFor, subagentFiles, type SessionFile } from './transcript/locate.js';
import { parseLine } from './transcript/parse.js';
import { FileTail } from './transcript/tail.js';

// The current session is kept while it is active. Another session that keeps writing
// (a second `claude` in the same folder) must not make the dashboard flip back and forth.
const QUIET_MS = 30_000;
// A spawn or advisor call older than this is history, not something to animate as live.
const LIVE_FLOW_MS = 10_000;

type Ctx = {
  state: SessionState; mainTail: FileTail; eventsFile: string; eventsTail: FileTail;
  subs: Map<string, { tail: FileTail; finished: boolean }>;
};

export class SessionWatcher {
  private projectDir: string;
  private home?: string;
  private pinned?: string;
  private pitwallDir: string;
  private current?: string;
  private known = new Set<string>();
  private ctxs = new Map<string, Ctx>();

  constructor(opts: { cwd: string; home?: string; sessionId?: string; pitwallHome?: string }) {
    this.projectDir = projectDirFor(opts.cwd, opts.home);
    this.home = opts.home;
    this.pitwallDir = opts.pitwallHome ?? process.env.PITWALL_HOME ?? join(opts.home ?? homedir(), '.claude', 'pitwall');
    this.pinned = opts.sessionId;
  }

  get dir(): string { return this.projectDir; }

  private choose(list: SessionFile[]): SessionFile | undefined {
    if (this.pinned) return list.find((x) => x.id === this.pinned);
    const cur = list.find((x) => x.id === this.current);
    const newest = list[0];
    if (!cur) return newest;
    const newcomer = list.find((x) => !this.known.has(x.id));
    if (newcomer) return newcomer;
    if (newest.id !== cur.id && Date.now() - cur.mtime > QUIET_MS) return newest;
    return cur;
  }

  poll(): SessionState | null {
    let list = listSessions(this.projectDir);
    if (this.pinned && !list.some((x) => x.id === this.pinned)) {
      const dir = findSessionDir(this.pinned, this.home);
      if (dir && dir !== this.projectDir) { this.projectDir = dir; list = listSessions(dir); }
    }
    const target = this.choose(list);
    for (const x of list) this.known.add(x.id);
    if (!target) return this.current ? this.ctxs.get(this.current)!.state : null;

    this.current = target.id;
    let ctx = this.ctxs.get(target.id);
    if (!ctx) {
      const eventsFile = join(this.pitwallDir, 'events', `${target.id}.jsonl`);
      ctx = { state: emptyState(target.id), mainTail: new FileTail(target.file), eventsFile, eventsTail: new FileTail(eventsFile), subs: new Map() };
      this.ctxs.set(target.id, ctx);
    }
    const state = ctx.state;

    for (const line of ctx.mainTail.readNew()) this.apply(state, 'main', line);

    for (const f of subagentFiles(this.projectDir, target.id)) {
      let sub = ctx.subs.get(f.key);
      if (!sub) {
        sub = { tail: new FileTail(f.file), finished: false };
        ctx.subs.set(f.key, sub);
      }
      if (!sub.finished) sub.finished = this.readMeta(state, f.key, f.metaFile);
      for (const line of sub.tail.readNew()) this.apply(state, f.key, line);
    }

    // The hooks' own log: exact agent start/stop and nudges. Missing when the plugin's hooks are not installed.
    for (const line of ctx.eventsTail.readNew()) {
      const e = parseEvent(line);
      if (e) applyPitwallEvent(state, e);
    }
    state.teamOn = existsSync(ctx.eventsFile) ? isTeamOn(teamKey({ sessionId: target.id }), this.pitwallDir) : undefined;

    const cutoff = Date.now() - LIVE_FLOW_MS;
    for (let i = state.pendingFlows.length - 1; i >= 0; i--) {
      const at = state.pendingFlows[i].at;
      if (at && Date.parse(at) < cutoff) state.pendingFlows.splice(i, 1);
    }
    return state;
  }

  private apply(state: SessionState, key: string, line: string): void {
    const e = parseLine(line);
    if (e) applyEvent(state, key, e);
  }

  /** Registers the subagent from its meta file; returns true once it is finished. */
  private readMeta(state: SessionState, key: string, metaFile: string): boolean {
    try {
      const m = JSON.parse(readFileSync(metaFile, 'utf8'));
      registerSubagent(state, key, {
        agentType: String(m.agentType ?? 'agent'), description: String(m.description ?? ''),
        finished: m.finished === true,
        toolUseId: m.toolUseId,
      });
      return m.finished === true;
    } catch { return false; }
  }
}
