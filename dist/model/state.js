export function emptyState(sessionId) {
    return {
        sessionId, currentTask: '', agents: {}, seenMessageIds: new Set(), skills: [], advisorCalls: [],
        categories: { coding: 0, reading: 0, talking: 0, planning: 0, tests: 0 },
        log: [], pendingFlows: [], hasEdited: false,
    };
}
