export const colors = {
  main: '#f0883e',
  advisor: '#d2a8ff',
  sub: '#79c0ff',
  runner: '#56d4dd',
  done: '#3fb950',
  failed: '#f85149',
  warning: '#d29922',
  dim: '#6e7681',
  muted: '#8b949e',
  border: '#30363d',
  frame: '#21262d',
  bright: '#f0f6fc',
  pill: '#161b22',
} as const;

export function colorForRole(role: string): string {
  if (role === 'main') return colors.main;
  if (role === 'you') return colors.muted;
  if (role === 'advisor') return colors.advisor;
  if (role === 'runner') return colors.runner;
  return colors.sub;
}
