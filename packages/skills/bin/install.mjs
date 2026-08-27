#!/usr/bin/env node
/**
 * inferencex-skills — installer CLI for the InferenceX Agent Skills.
 *
 * Usage:
 *   npx @semianalysisai/inferencex-skills install [--target claude|codex|cursor|agents] [--dir <path>]
 *   npx @semianalysisai/inferencex-skills list
 *   npx @semianalysisai/inferencex-skills --help
 *
 * Pure Node (>=18), no dependencies.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';

const __dirname = import.meta.dirname;
const SKILLS_SRC = join(__dirname, '..', 'skills');

/** Where each --target installs, relative to the current working directory. */
const TARGET_DIRS = {
  claude: '.claude/skills',
  codex: '.codex/skills',
  cursor: '.cursor/skills',
  agents: '.agents/skills',
};

const HELP = `inferencex-skills — install InferenceX Agent Skills

Usage:
  npx @semianalysisai/inferencex-skills install [options]   Copy the skills into your project
  npx @semianalysisai/inferencex-skills list                List bundled skills
  npx @semianalysisai/inferencex-skills --help              Show this help

Install options:
  --target <name>   Destination convention: claude | codex | cursor | agents
                    (claude -> .claude/skills, codex -> .codex/skills,
                     cursor -> .cursor/skills, agents -> .agents/skills)
                    Default: claude
  --dir <path>      Explicit destination directory (overrides --target)
  --force           Overwrite skills that already exist at the destination

Bundled skills:
${listSkills()
  .map((s) => `  ${s.name.padEnd(24)} ${s.description}`)
  .join('\n')}

Examples:
  npx @semianalysisai/inferencex-skills install
  npx @semianalysisai/inferencex-skills install --target cursor
  npx @semianalysisai/inferencex-skills install --dir ./my-agent/skills
`;

/** Parse "name: ..." / "description: ..." out of SKILL.md YAML frontmatter (no YAML dep). */
function parseFrontmatter(skillMdPath) {
  const out = { name: '', description: '' };
  try {
    const text = readFileSync(skillMdPath, 'utf8');
    const m = text.match(/^---\r?\n(?<frontmatter>[\s\S]*?)\r?\n---/);
    if (!m) return out;
    for (const line of m.groups.frontmatter.split(/\r?\n/)) {
      const kv = line.match(/^(?<key>name|description):\s*(?<value>.*)$/);
      if (kv) out[kv.groups.key] = kv.groups.value.trim();
    }
  } catch {
    /* unreadable frontmatter is non-fatal */
  }
  return out;
}

function listSkills() {
  if (!existsSync(SKILLS_SRC)) return [];
  return readdirSync(SKILLS_SRC)
    .filter((entry) => {
      const p = join(SKILLS_SRC, entry);
      return statSync(p).isDirectory() && existsSync(join(p, 'SKILL.md'));
    })
    .sort()
    .map((entry) => {
      const fm = parseFrontmatter(join(SKILLS_SRC, entry, 'SKILL.md'));
      return {
        dir: entry,
        name: fm.name || entry,
        description: fm.description || '(no description)',
      };
    });
}

function parseArgs(argv) {
  const args = { command: '', target: 'claude', dir: '', force: false, help: false };
  const rest = [...argv];
  while (rest.length > 0) {
    const a = rest.shift();
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--force') args.force = true;
    else if (a === '--target') args.target = rest.shift() ?? '';
    else if (a === '--dir') args.dir = rest.shift() ?? '';
    else if (a.startsWith('--')) {
      console.error(`Unknown option: ${a}\n`);
      console.error(HELP);
      process.exit(2);
    } else if (args.command) {
      console.error(`Unexpected argument: ${a}\n`);
      console.error(HELP);
      process.exit(2);
    } else {
      args.command = a;
    }
  }
  return args;
}

function cmdList() {
  const skills = listSkills();
  if (skills.length === 0) {
    console.error('No bundled skills found (package may be corrupted).');
    process.exit(1);
  }
  console.log('Bundled InferenceX skills:\n');
  for (const s of skills) {
    console.log(`  ${s.name}`);
    console.log(`      ${s.description}\n`);
  }
}

function cmdInstall(args) {
  if (args.dir === '' && !(args.target in TARGET_DIRS)) {
    console.error(
      `Unknown --target "${args.target}". Allowed: ${Object.keys(TARGET_DIRS).join(', ')}`,
    );
    process.exit(2);
  }
  const destRoot = resolve(process.cwd(), args.dir === '' ? TARGET_DIRS[args.target] : args.dir);
  const skills = listSkills();
  if (skills.length === 0) {
    console.error('No bundled skills found (package may be corrupted).');
    process.exit(1);
  }
  mkdirSync(destRoot, { recursive: true });

  let installed = 0;
  let skipped = 0;
  for (const s of skills) {
    const src = join(SKILLS_SRC, s.dir);
    const dest = join(destRoot, s.dir);
    if (existsSync(dest) && !args.force) {
      console.log(`  skip     ${s.dir} (already exists; use --force to overwrite)`);
      skipped += 1;
      continue;
    }
    cpSync(src, dest, { recursive: true, force: true });
    console.log(`  install  ${s.dir} -> ${dest}`);
    installed += 1;
  }
  console.log(`\nDone. ${installed} installed, ${skipped} skipped, into ${destRoot}`);
  console.log('Each skill is a directory with a SKILL.md entry point plus supporting files.');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.command === 'help' || args.command === '') {
    console.log(HELP);
    return;
  }
  if (args.command === 'list') return cmdList();
  if (args.command === 'install') return cmdInstall(args);
  console.error(`Unknown command: ${args.command}\n`);
  console.error(HELP);
  process.exit(2);
}

main();
