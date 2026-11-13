// The terminal window title, through the xterm control sequences most terminals understand.
type Output = { isTTY?: boolean; write(text: string): unknown };

const ESC = '\x1b';
const BEL = '\x07';
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

/** "pitwall · <conversation title>", or "pitwall" until Claude Code has named the conversation. */
export function dashboardTitle(conversation?: string): string {
  const name = (conversation ?? '').replace(CONTROL_CHARS, '').trim();
  return name ? `pitwall · ${name}` : 'pitwall';
}

export function setTitle(out: Output, title: string): void {
  if (out.isTTY) out.write(`${ESC}]0;${title}${BEL}`);
}

/** Pushes the terminal's own title on its title stack, so restoreTitle can put it back. */
export function saveTitle(out: Output): void {
  if (out.isTTY) out.write(`${ESC}[22;0t`);
}

export function restoreTitle(out: Output): void {
  if (out.isTTY) out.write(`${ESC}[23;0t`);
}
