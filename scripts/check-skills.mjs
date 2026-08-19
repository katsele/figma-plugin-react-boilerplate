#!/usr/bin/env node
// Validates the Agent Skills in .claude/skills/. Zero dependencies — hand-rolled
// frontmatter parsing (`key: value` plus `>-`/`|` block scalars). npm run check:skills.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = path.join(repoRoot, '.claude', 'skills');
const ALLOWED_KEYS = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Structural checks first — the regression guard for the original bug: a symlinked
// .claude/skills checks out as a plain text file on Windows clones, silently breaking every skill.
const errors = [];
if (fs.existsSync(path.join(repoRoot, 'skills'))) {
  errors.push('root-level skills/ directory exists. That location does not auto-load — Claude Code only reads .claude/skills/. Move its contents there and delete this directory.');
}
let stat;
try { stat = fs.lstatSync(skillsDir); } catch { /* missing, handled below */ }
if (!stat) {
  errors.push('.claude/skills/ does not exist.');
} else if (stat.isSymbolicLink()) {
  errors.push('.claude/skills is a symlink. On a Windows clone without core.symlinks=true, a symlink checks out as a plain text file, so every skill silently fails to load. It must be a real directory.');
} else if (!stat.isDirectory()) {
  errors.push('.claude/skills exists but is not a directory.');
}
if (errors.length) {
  errors.forEach((e) => console.log(`FAIL  ${e}`));
  process.exit(1);
}

// Parses simple frontmatter: top-level `key: value`, or `key: >-`/`key: |` plus indented
// lines (also swallows a bare nested map/list under a key — we only need the key to exist).
function parseFrontmatter(block) {
  const lines = block.split('\n');
  const data = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }
    const m = line.match(/^([A-Za-z0-9_-]+):[ \t]*(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1], rest = m[2].trim();
    if (rest === '' || rest === '>' || rest === '>-' || rest === '|' || rest === '|-') {
      const style = rest[0]; i++;
      const sub = [];
      while (i < lines.length && (lines[i].trim() === '' || /^[ \t]/.test(lines[i]))) {
        sub.push(lines[i].trim() === '' ? '' : lines[i].replace(/^[ \t]+/, ''));
        i++;
      }
      while (sub.length && sub[sub.length - 1] === '') sub.pop();
      data[key] = style === '|' ? sub.join('\n') : sub.join(' ').replace(/\s+/g, ' ').trim();
      continue;
    }
    data[key] = rest.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    i++;
  }
  return data;
}

const entries = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'));
let failCount = 0;
const warnings = [];

for (const entry of entries) {
  const name = entry.name;
  if (!entry.isDirectory()) {
    console.log(`FAIL  ${name}: not a directory`);
    failCount++; continue;
  }
  const skillPath = path.join(skillsDir, name, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    console.log(`FAIL  ${name}: missing SKILL.md`);
    failCount++; continue;
  }
  const content = fs.readFileSync(skillPath, 'utf8').replace(/\r\n/g, '\n');
  const lines = content.split('\n');
  if (lines[0].trim() !== '---') {
    console.log(`FAIL  ${name}: SKILL.md must start with a --- frontmatter block`);
    failCount++; continue;
  }
  const closeOffset = lines.slice(1).findIndex((l) => l.trim() === '---');
  if (closeOffset === -1) {
    console.log(`FAIL  ${name}: frontmatter is never closed with ---`);
    failCount++; continue;
  }
  const fm = parseFrontmatter(lines.slice(1, closeOffset + 1).join('\n'));
  const problems = [];
  for (const key of Object.keys(fm)) {
    if (!ALLOWED_KEYS.has(key)) problems.push(`unknown frontmatter key "${key}"`);
  }
  if (!fm.name) problems.push('missing or empty "name"');
  if (!fm.description) problems.push('missing or empty "description"');
  if (fm.name && fm.name !== name) problems.push(`name "${fm.name}" does not match directory name`);
  if (fm.name && !NAME_RE.test(fm.name)) problems.push(`name "${fm.name}" is not kebab-case`);
  if (fm.name && fm.name.length > 64) problems.push('name exceeds 64 characters');
  if (fm.description && fm.description.length > 1024) problems.push('description exceeds 1024 characters');

  if (problems.length) {
    console.log(`FAIL  ${name}: ${problems.join('; ')}`);
    failCount++; continue;
  }
  if (lines.length > 500) {
    warnings.push(`${name}: SKILL.md is ${lines.length} lines (over the 500-line guidance ceiling)`);
  }
  console.log(`OK    ${name}`);
}

for (const w of warnings) console.log(`WARN  ${w}`);
console.log(`${entries.length - failCount}/${entries.length} skills OK`);
process.exit(failCount > 0 ? 1 : 0);
