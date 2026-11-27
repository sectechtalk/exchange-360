import { readdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(mjs|js|cjs)$/.test(name)) files.push(full);
  }
}
walk(root);
let bad = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    bad += 1;
    process.stderr.write(`${file}\n${result.stderr}`);
  }
}
if (!readFileSync(path.join(root, 'public', 'fonts', 'InterVariable.woff2')).length) {
  bad += 1;
  process.stderr.write('Inter font is missing\n');
}
if (bad) process.exit(1);
console.log(`syntax ok (${files.length} files)`);
