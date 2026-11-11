import { colorForRole, colors } from '../ui/theme.js';
import { categorize } from './categories.js';
const LOG_CAP = 200;
export function modelAlias(model) {
    const m = model.match(/claude-([a-z]+)/);
    return m ? m[1] : model;
}
function agentFor(s, key) {
    let a = s.agents[key];
    if (!a) {
        a = { key, role: key === 'main' ? 'main' : 'agent', model: '', title: '', tokens: 0, status: 'idle' };
        s.agents[key] = a;
    }
    return a;
}
function log(s, time, who, text) {
    s.log.push({ time, who, text });
    if (s.log.length > LOG_CAP)
        s.log.splice(0, s.log.length - LOG_CAP);
}
export function registerSubagent(s, key, meta) {
    const a = agentFor(s, key);
    a.role = meta.agentType;
    a.title = meta.description;
    if (meta.pickedEffortModel)
        a.model = modelAlias(meta.pickedEffortModel);
    if (meta.toolUseId)
        a.toolUseId = meta.toolUseId;
    if (meta.finished && a.status !== 'failed')
        a.status = 'done';
}
function onToolUse(s, key, time, b) {
    const who = agentFor(s, key).role;
    if (b.name === 'Agent') {
        const description = String(b.input.description ?? '');
        const type = String(b.input.subagent_type ?? 'general-purpose');
        s.pendingFlows.push({ from: key, to: b.id, label: description, color: colorForRole(type) });
        log(s, time, who, `${who} → ${type}: ${description}`);
    }
    else if (b.name === 'Skill') {
        const name = String(b.input.skill ?? '');
        if (!name)
            return;
        const known = s.skills.find((k) => k.name === name && k.by === who);
        if (known)
            known.lastAt = time;
        else
            s.skills.push({ name, by: who, firstAt: time, lastAt: time });
    }
}
export function applyEvent(s, agentKey, e) {
    if (e.time) {
        s.startedAt ??= e.time;
        s.lastActivity = e.time;
    }
    const agent = agentFor(s, agentKey);
    if (e.kind === 'userPrompt') {
        if (agentKey === 'main') {
            s.currentTask = e.text.length > 60 ? e.text.slice(0, 60) + '…' : e.text;
            s.hasEdited = false;
        }
        return s;
    }
    if (e.kind === 'toolResult') {
        if (e.isError && agentKey !== 'main')
            agent.status = 'failed';
        return s;
    }
    // The same message is written on several lines with the same usage: count it once.
    if (s.seenMessageIds.has(e.messageId))
        return s;
    s.seenMessageIds.add(e.messageId);
    if (e.model)
        agent.model = modelAlias(e.model);
    if (e.effort)
        agent.effort = e.effort;
    if (agent.status !== 'failed' && agent.status !== 'done')
        agent.status = 'working';
    agent.startedAt ??= e.time;
    const total = e.usage.input + e.usage.output + e.usage.cacheRead + e.usage.cacheWrite;
    agent.tokens += total;
    s.categories[categorize(e.blocks, agentKey === 'main' && s.hasEdited)] += total;
    for (const b of e.blocks) {
        if (b.type === 'tool_use') {
            onToolUse(s, agentKey, e.time, b);
            if (agentKey === 'main' && ['Edit', 'Write', 'NotebookEdit'].includes(b.name))
                s.hasEdited = true;
        }
    }
    if (e.advisorUsage) {
        const u = e.advisorUsage;
        s.advisorCalls.push({ time: e.time, source: 'native', why: 'native advice',
            tokens: u.input + u.output + u.cacheRead + u.cacheWrite });
        s.pendingFlows.push({ from: agentKey, to: 'advisor', label: 'advice 🔒', color: colors.advisor });
        log(s, e.time, 'advisor', 'advice 🔒');
    }
    return s;
}
