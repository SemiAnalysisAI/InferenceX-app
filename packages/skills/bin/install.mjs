#!/usr/bin/env node

import {
  cpSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';

const SKILL_NAME = 'inferencex-api';
const INSTALL_METADATA = '.inferencex-skills.json';
const TARGET_DIRS = {
  claude: '.claude/skills',
  codex: '.agents/skills',
  agents: '.agents/skills',
};

const HELP = `inferencex-skills — install and inspect the InferenceX public API skill

Requires Node 24 or later.

Usage:
  inferencex-skills install [options]
  inferencex-skills status [options]
  inferencex-skills list
  inferencex-skills --version
  inferencex-skills --help

Install and status options:
  --target <name>  claude (default), codex, or agents
                  claude: .claude/skills; codex/agents: .agents/skills
  --dir <path>     Skills directory, relative to your project or absolute
                  Overrides --target; installs into <path>/inferencex-api
  --force          Install only: overwrite packaged files; retains obsolete files

Existing skills are skipped unless --force is supplied.
Status reads local installation metadata without changing files or using the network.
--version reports the executing installer, not an installed skill.
Bundled skill: inferencex-api
`;

function installedVersion(destination, packageName) {
  const directory = lstatSync(destination, { throwIfNoEntry: false });
  if (!directory) return 'not installed';
  if (!directory.isDirectory()) return 'unknown (skill path is not a directory)';
  const entry = lstatSync(join(destination, 'SKILL.md'), { throwIfNoEntry: false });
  if (!entry?.isFile()) return 'unknown (SKILL.md is missing or not a regular file)';

  let metadata;
  try {
    const metadataPath = join(destination, INSTALL_METADATA);
    const file = lstatSync(metadataPath, { throwIfNoEntry: false });
    if (!file) return 'unknown (no installation metadata; legacy or manually copied skill)';
    if (!file.isFile()) return 'unknown (installation metadata is not a regular file)';
    metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    if (
      metadata?.package !== packageName ||
      typeof metadata.version !== 'string' ||
      !/^\d+\.\d+\.\d+(?:-[\dA-Za-z.-]+)?(?:\+[\dA-Za-z.-]+)?$/.test(metadata.version)
    ) {
      return 'unknown (invalid installation metadata)';
    }
  } catch (error) {
    return error instanceof SyntaxError
      ? 'unknown (invalid installation metadata)'
      : `unknown (could not read installation metadata: ${error.code ?? 'read error'})`;
  }

  // Legacy installers retain this receipt when overwriting the skill with older files.
  try {
    const scripts = join(destination, 'scripts');
    const exporter = join(scripts, 'export-powerx.mjs');
    if (
      !lstatSync(scripts, { throwIfNoEntry: false })?.isDirectory() ||
      !lstatSync(exporter, { throwIfNoEntry: false })?.isFile()
    ) {
      return 'unknown (installed exporter is missing or not a regular file)';
    }
    const version = readFileSync(exporter, 'utf8').match(
      /^const PACKAGE_VERSION = ['"](?<version>[^'"\r\n]+)['"];$/mu,
    )?.groups.version;
    if (!version) return 'unknown (installed exporter version is missing)';
    if (version !== metadata.version) {
      return 'unknown (installation metadata disagrees with the installed exporter version)';
    }
    return metadata.version;
  } catch (error) {
    return `unknown (could not read installed exporter: ${error.code ?? 'read error'})`;
  }
}

function showStatus(destination, packageInfo) {
  console.log(`Installer version: ${packageInfo.version}`);
  console.log(`Installed version: ${installedVersion(destination, packageInfo.name)}`);
  console.log(`Skill path: ${destination}`);
}

function main() {
  let command;
  let values;
  try {
    const parsed = parseArgs({
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean' },
        target: { type: 'string' },
        dir: { type: 'string' },
        force: { type: 'boolean' },
      },
      allowPositionals: true,
    });
    values = parsed.values;
    command = parsed.positionals[0] ?? (values.version ? 'version' : 'help');
    if (
      parsed.positionals.length > 1 ||
      !['help', 'list', 'install', 'status', 'version'].includes(command) ||
      (values.version && parsed.positionals.length > 0)
    ) {
      throw new Error('Expected help, list, install, status, or --version with supported options.');
    }
    if (values.target !== undefined && !Object.hasOwn(TARGET_DIRS, values.target)) {
      throw new Error('Unknown --target. Choose claude, codex, or agents.');
    }
    if (values.dir !== undefined && values.dir.trim() === '') {
      throw new Error('--dir requires a nonempty destination.');
    }
    if (
      !['install', 'status'].includes(command) &&
      ['target', 'dir'].some((key) => key in values)
    ) {
      throw new Error('--target and --dir require the install or status command.');
    }
    if (command !== 'install' && values.force) {
      throw new Error('--force requires the install command.');
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
    const packageInfo = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
    );
    if (command === 'version') {
      console.log(`Installer version: ${packageInfo.version}`);
      return;
    }
    const source = join(import.meta.dirname, '..', 'skills', SKILL_NAME);
    readFileSync(join(source, 'SKILL.md'), 'utf8');
    if (command === 'list') {
      console.log(`Bundled InferenceX skill:\n  ${SKILL_NAME}`);
      return;
    }

    const root = resolve(values.dir ?? TARGET_DIRS[values.target ?? 'claude']);
    const destination = join(root, SKILL_NAME);
    if (command === 'status') {
      showStatus(destination, packageInfo);
      return;
    }
    const existing = lstatSync(destination, { throwIfNoEntry: false });
    if (existing && !values.force) {
      console.log(
        `Skipped ${SKILL_NAME}: already exists at ${destination}; use --force to overwrite.`,
      );
      showStatus(destination, packageInfo);
      return;
    }
    if (existing && !existing.isDirectory()) {
      throw new Error(`Cannot overwrite ${destination}: the existing skill is not a directory.`);
    }
    if (existing) {
      for (const path of [...readdirSync(source, { recursive: true }), INSTALL_METADATA]) {
        const target = join(destination, path);
        if (lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) {
          throw new Error(`Cannot overwrite symbolic link at ${target}.`);
        }
      }
    }
    const metadataPath = join(destination, INSTALL_METADATA);
    const metadataFile = lstatSync(metadataPath, { throwIfNoEntry: false });
    if (metadataFile && !metadataFile.isFile()) {
      throw new Error(
        `Cannot overwrite ${metadataPath}: installation metadata is not a regular file.`,
      );
    }
    mkdirSync(root, { recursive: true });
    // A failed overwrite must not leave a version stamp for partially replaced files.
    rmSync(metadataPath, { force: true });
    cpSync(source, destination, { recursive: true, force: true });
    writeFileSync(
      metadataPath,
      `${JSON.stringify({ package: packageInfo.name, version: packageInfo.version }, null, 2)}\n`,
      { flag: 'wx' },
    );
    console.log(`Installed ${SKILL_NAME} into ${destination}`);
    showStatus(destination, packageInfo);
  } catch (error) {
    console.error(`Could not ${command} the skill: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
