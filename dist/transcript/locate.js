import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
export function projectDirFor(cwd, home = homedir()) {
    return join(home, '.claude', 'projects', cwd.replace(/\//g, '-'));
}
export function latestSession(projectDir) {
    if (!existsSync(projectDir))
        return null;
    let best = null;
    for (const name of readdirSync(projectDir)) {
        if (!name.endsWith('.jsonl'))
            continue;
        const file = join(projectDir, name);
        const mtime = statSync(file).mtimeMs;
        if (!best || mtime > best.mtime)
            best = { id: name.slice(0, -'.jsonl'.length), file, mtime };
    }
    return best && { id: best.id, file: best.file };
}
export function subagentFiles(projectDir, sessionId) {
    const dir = join(projectDir, sessionId, 'subagents');
    if (!existsSync(dir))
        return [];
    return readdirSync(dir)
        .filter((n) => n.startsWith('agent-') && n.endsWith('.jsonl'))
        .sort()
        .map((n) => ({
        key: n.slice('agent-'.length, -'.jsonl'.length),
        file: join(dir, n),
        metaFile: join(dir, n.replace(/\.jsonl$/, '.meta.json')),
    }));
}
