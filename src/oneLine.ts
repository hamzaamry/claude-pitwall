/** One line of text: newlines and runs of whitespace become single spaces. Anything drawn in the grid must be one line. */
export const oneLine = (t: string): string => t.replace(/\s+/g, ' ').trim();
