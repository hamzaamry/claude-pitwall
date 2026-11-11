import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyEvent, registerSubagent } from './model/reduce.js';
import { emptyState } from './model/state.js';
import { latestSession, projectDirFor, subagentFiles } from './transcript/locate.js';
import { parseLine } from './transcript/parse.js';
import { FileTail } from './transcript/tail.js';
export class SessionWatcher {
    projectDir;
    pinned;
    sessionId;
    state;
    mainTail;
    subs = new Map();
    constructor(opts) {
        this.projectDir = projectDirFor(opts.cwd, opts.home);
        this.pinned = opts.sessionId;
    }
    get dir() { return this.projectDir; }
    poll() {
        const target = this.pinned
            ? (existsSync(join(this.projectDir, `${this.pinned}.jsonl`))
                ? { id: this.pinned, file: join(this.projectDir, `${this.pinned}.jsonl`) } : null)
            : latestSession(this.projectDir);
        if (!target)
            return this.state ?? null;
        if (target.id !== this.sessionId) {
            this.sessionId = target.id;
            this.state = emptyState(target.id);
            this.mainTail = new FileTail(target.file);
            this.subs.clear();
        }
        const state = this.state;
        for (const line of this.mainTail.readNew())
            this.apply(state, 'main', line);
        for (const f of subagentFiles(this.projectDir, target.id)) {
            let sub = this.subs.get(f.key);
            if (!sub) {
                sub = { tail: new FileTail(f.file), finished: false };
                this.subs.set(f.key, sub);
            }
            if (!sub.finished)
                sub.finished = this.readMeta(state, f.key, f.metaFile);
            for (const line of sub.tail.readNew())
                this.apply(state, f.key, line);
        }
        return state;
    }
    apply(state, key, line) {
        const e = parseLine(line);
        if (e)
            applyEvent(state, key, e);
    }
    /** Registers the subagent from its meta file; returns true once it is finished. */
    readMeta(state, key, metaFile) {
        try {
            const m = JSON.parse(readFileSync(metaFile, 'utf8'));
            registerSubagent(state, key, {
                agentType: String(m.agentType ?? 'agent'), description: String(m.description ?? ''),
                pickedEffortModel: m.pickedEffortModel, finished: m.finished === true,
                toolUseId: m.toolUseId,
            });
            return m.finished === true;
        }
        catch {
            return false;
        }
    }
}
