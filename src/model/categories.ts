import type { Block } from '../transcript/types.js';
import type { Category } from './state.js';

// Estimate only: the category is guessed from the tools a turn used.
const TEST_COMMAND = /\b(test|vitest|jest|pytest|tsc|lint|build|cargo check|go vet)\b/;

export function categorize(blocks: Block[], hasEdited: boolean): Category {
  const tools = blocks.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
  if (tools.some((t) => ['Edit', 'Write', 'NotebookEdit'].includes(t.name))) return 'coding';
  if (tools.some((t) => t.name === 'Bash' && TEST_COMMAND.test(String(t.input.command ?? '')))) return 'tests';
  if (tools.some((t) => ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'].includes(t.name))) return 'reading';
  const chars = blocks.reduce((n, b) => n + (b.type === 'text' ? b.chars : 0), 0);
  if (!hasEdited && (tools.some((t) => t.name === 'TodoWrite') || chars > 1200)) return 'planning';
  return 'talking';
}
