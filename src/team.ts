import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Must give the same key and path as hooks/lib/hook.mjs (a contract test checks it).
const safe = (s: string) => String(s ?? '').replace(/[^A-Za-z0-9_-]/g, '');

export const pitwallHome = (): string => process.env.PITWALL_HOME || join(homedir(), '.claude', 'pitwall');
export const teamKey = (input: { sessionId?: string }): string => safe(input.sessionId ?? '');
export const teamFlagPath = (key: string, home: string = pitwallHome()): string => join(home, 'team', key);
export const isTeamOn = (key: string, home: string = pitwallHome()): boolean => key !== '' && existsSync(teamFlagPath(key, home));
