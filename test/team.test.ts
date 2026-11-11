import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { teamKey, teamFlagPath, isTeamOn } from '../src/team.js';
// @ts-expect-error plain .mjs, no types
import * as hook from '../hooks/lib/hook.mjs';

describe('team flag (dashboard side)', () => {
  it('key and path agree with the hook library', () => {
    const home = '/h';
    for (const id of ['abc-123', 'x_y', '../../evil', '']) {
      expect(teamKey({ sessionId: id })).toBe(hook.teamKey({ session_id: id }));
      expect(teamFlagPath(teamKey({ sessionId: id }), home)).toBe(hook.teamFlagPath(hook.teamKey({ session_id: id }), home));
    }
  });
  it('isTeamOn is true only when the flag file exists', () => {
    const home = mkdtempSync(join(tmpdir(), 'pitwall-team-'));
    expect(isTeamOn('s1', home)).toBe(false);
    mkdirSync(join(home, 'team'), { recursive: true });
    writeFileSync(join(home, 'team', 's1'), '');
    expect(isTeamOn('s1', home)).toBe(true);
    expect(isTeamOn('', home)).toBe(false);
  });
});
