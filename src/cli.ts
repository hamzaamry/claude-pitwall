import React from 'react';
import { resolve } from 'node:path';
import { render } from 'ink';
import { App } from './App.js';
import { restoreTitle, saveTitle } from './ui/terminalTitle.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const [command] = process.argv.slice(2);
if (command !== 'watch') {
  console.log('usage: pitwall watch [--cwd <dir>] [--session <id>]   (press q to quit)');
  process.exit(command === undefined || command === '--help' ? 0 : 1);
}

saveTitle(process.stdout);
const app = render(React.createElement(App, { cwd: resolve(arg('--cwd') ?? process.cwd()), sessionId: arg('--session') }));
app.waitUntilExit().finally(() => restoreTitle(process.stdout));
