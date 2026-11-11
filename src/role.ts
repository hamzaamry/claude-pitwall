/** Plugin agents are named <plugin>:<name> (pitwall:scout); on screen only the name is useful. */
export const shortRole = (role: string): string => role.replace(/^[a-z0-9_-]+:/i, '');
