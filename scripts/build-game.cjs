const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
execFileSync(process.execPath, [
  path.join(root, 'node_modules/vite/bin/vite.js'),
  'build',
  '--config',
  path.join(root, 'game/vite.config.mjs'),
], { cwd: root, stdio: 'inherit' });
