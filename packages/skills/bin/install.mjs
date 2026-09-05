#!/usr/bin/env node

import { cpSync, lstatSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

const SKILL_NAME = 'inferencex-api';
const TARGET_DIRS = {
  claude: '.claude/skills',
  codex: '.agents/skills',
  agents: '.agents/skills',
};

const HELP = `inferencex-skills — install the InferenceX public API skill

Requires Node 24 or later.

Usage:
  inferencex-skills install [options]
  inferencex-skills list
  inferencex-skills --help

Install options:
  --target <name>  claude (default), codex, or agents
                  claude: .claude/skills; codex/agents: .agents/skills
  --dir <path>     Skills directory, relative to your project or absolute
                  Overrides --target; installs into <path>/inferencex-api
  --force          Merge and overwrite an existing skill; retains obsolete files

Existing skills are skipped unless --force is supplied.
Bundled skill: inferencex-api
`;

function main() {
  let command;
  let values;
  try {
    const parsed = parseArgs({
      options: {
        help: { type: 'boolean', short: 'h' },
        target: { type: 'string' },
        dir: { type: 'string' },
        force: { type: 'boolean' },
      },
      allowPositionals: true,
    });
    values = parsed.values;
    command = parsed.positionals[0] ?? 'help';
    if (parsed.positionals.length > 1 || !['help', 'list', 'install'].includes(command)) {
      throw new Error('Expected help, list, or install, followed only by supported options.');
    }
    if (values.target !== undefined && !Object.hasOwn(TARGET_DIRS, values.target)) {
      throw new Error('Unknown --target. Choose claude, codex, or agents.');
    }
    if (values.dir !== undefined && values.dir.trim() === '') {
      throw new Error('--dir requires a nonempty destination.');
    }
    if (command !== 'install' && ['target', 'dir', 'force'].some((key) => key in values)) {
      throw new Error('--target, --dir, and --force require the install command.');
    }
  } catch (error) {
    console.error(`${error.message}\nRun inferencex-skills --help for usage.`);
    process.exitCode = 2;
    return;
  }

  if (command === 'help' || values.help) {
    console.log(HELP);
    return;
  }

  try {
    if (Number(process.versions.node.split('.')[0]) < 24) {
      throw new Error('Node 24 or later is required.');
    }
    const source = join(import.meta.dirname, '..', 'skills', SKILL_NAME);
    readFileSync(join(source, 'SKILL.md'), 'utf8');
    if (command === 'list') {
      console.log(`Bundled InferenceX skill:\n  ${SKILL_NAME}`);
      return;
    }

    const root = resolve(values.dir ?? TARGET_DIRS[values.target ?? 'claude']);
    const destination = join(root, SKILL_NAME);
    const existing = lstatSync(destination, { throwIfNoEntry: false });
    if (existing && !values.force) {
      console.log(
        `Skipped ${SKILL_NAME}: already exists at ${destination}; use --force to overwrite.`,
      );
      return;
    }
    if (existing && !existing.isDirectory()) {
      throw new Error(`Cannot overwrite ${destination}: the existing skill is not a directory.`);
    }
    if (existing) {
      for (const path of readdirSync(source, { recursive: true })) {
        const target = join(destination, path);
        if (lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) {
          throw new Error(`Cannot overwrite symbolic link at ${target}.`);
        }
      }
    }
    mkdirSync(root, { recursive: true });
    cpSync(source, destination, { recursive: true, force: true });
    console.log(`Installed ${SKILL_NAME} into ${destination}`);
  } catch (error) {
    console.error(`Could not ${command} the skill: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
