import type { Block } from '../transcript/types.js';
import type { Category } from './state.js';

// Estimate only: the category is guessed from the tools a turn used.
export const TEST_COMMAND = /\b(test|vitest|jest|pytest|tsc|lint|build|cargo check|go vet)\b/;

// Helpers such as Explore read files through Bash, so a command that only looks counts as reading.
const LOOKS_ONLY = /^(ls|cat|head|tail|grep|egrep|rg|find|tree|wc|stat|file|less|awk|sed -n|git (diff|log|show|status|grep|blame))\b/;
function onlyLooks(command: string): boolean {
  const c = command.trim().replace(/^cd\s+[^;&|]+(&&|;)\s*/, '');
  return LOOKS_ONLY.test(c) && !c.replace(/2>&1|2>\/dev\/null/g, '').includes('>');
}

// Code written through Bash: a script fed on stdin, an in-place edit, or output redirected into a file.
export function writesFiles(command: string): boolean {
  const bare = command.replace(/'[^']*'|"(\\.|[^"\\])*"/g, "''");
  return /\b(python3?|node|ruby|perl)\s+-\s*<</.test(bare) || /\bsed\s+-i\b|\bperl\s+-[a-z]*i\b|\btee\b/.test(bare)
    || /(^|[^0-9&>])>>?\s*(?!&|\/dev\/null)[^\s|&;]/.test(bare);
}

export function categorize(blocks: Block[], hasEdited: boolean): Category {
  const tools = blocks.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
  if (tools.some((t) => ['Edit', 'Write', 'NotebookEdit'].includes(t.name) || (t.name === 'Bash' && writesFiles(String(t.input.command ?? ''))))) return 'coding';
  // A turn that hands work to a helper counts as that helper's kind of work.
  const sentTo = (re: RegExp) => tools.some((t) => t.name === 'Agent' && re.test(String(t.input.subagent_type ?? '')));
  if (tools.some((t) => ['EnterPlanMode', 'ExitPlanMode', 'SendMessage'].includes(t.name)) || sentTo(/(^|:)(reviewer|Plan)$/)) return 'planning';
  if (sentTo(/(^|:)runner$/)) return 'tests';
  if (sentTo(/(^|:)(scout|Explore)$/)) return 'reading';
  if (tools.some((t) => t.name === 'Bash' && TEST_COMMAND.test(String(t.input.command ?? '')))) return 'tests';
  if (tools.some((t) => ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'].includes(t.name) || (t.name === 'Bash' && onlyLooks(String(t.input.command ?? ''))))) return 'reading';
  const chars = blocks.reduce((n, b) => n + (b.type === 'text' ? b.chars : 0), 0);
  if (!hasEdited && (tools.some((t) => t.name === 'TodoWrite') || chars > 1200)) return 'planning';
  return 'talking';
}
