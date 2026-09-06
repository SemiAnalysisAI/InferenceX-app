#!/usr/bin/env node

import {
  cpSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
  --json          Emit one JSON document (schema_version: 1), without prose
  --force         Install only: overwrite packaged files; retains obsolete files
  --dry-run       Install only: preview the same preflight without changing files

Existing skills are skipped unless --force is supplied.
Status reads local installation metadata without changing files or using the network.
--version reports the executing installer, not an installed skill.
Bundled skill: inferencex-api
`;

function unknownState(reason) {
  return { installation_state: 'unknown', installed_version: null, reason };
}

function installedState(destination, packageName) {
  const directory = lstatSync(destination, { throwIfNoEntry: false });
  if (!directory) {
    return { installation_state: 'not_installed', installed_version: null, reason: null };
  }
  if (!directory.isDirectory()) return unknownState('skill path is not a directory');
  const entry = lstatSync(join(destination, 'SKILL.md'), { throwIfNoEntry: false });
  if (!entry?.isFile()) return unknownState('SKILL.md is missing or not a regular file');

  let metadata;
  let versionMatch;
  try {
    const metadataPath = join(destination, INSTALL_METADATA);
    const file = lstatSync(metadataPath, { throwIfNoEntry: false });
    if (!file) return unknownState('no installation metadata; legacy or manually copied skill');
    if (!file.isFile()) return unknownState('installation metadata is not a regular file');
    metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
    versionMatch =
      typeof metadata?.version === 'string'
        ? /^(?<major>\d+)\.(?<minor>\d+)\.\d+(?:-[\dA-Za-z.-]+)?(?:\+[\dA-Za-z.-]+)?$/.exec(
            metadata.version,
          )
        : null;
    if (metadata?.package !== packageName || !versionMatch) {
      return unknownState('invalid installation metadata');
    }
  } catch (error) {
    return error instanceof SyntaxError
      ? unknownState('invalid installation metadata')
      : unknownState(`could not read installation metadata: ${error.code ?? 'read error'}`);
  }

  // Only require helpers shipped by the receipt's version. A forced downgrade
  // merges files and can retain newer helpers that the older package did not own.
  const exporters = [
    { file: 'export-powerx.mjs', name: 'exporter', minor: 0n },
    { file: 'export-agentx.mjs', name: 'AgentX exporter', minor: 4n },
    { file: 'investigate-result.mjs', name: 'provenance helper', minor: 5n },
    { file: 'compare-tco.mjs', name: 'TCO helper', minor: 6n },
    { file: 'compare-releases.mjs', name: 'release comparison helper', minor: 7n },
    { file: 'compare-collectivex.mjs', name: 'CollectiveX helper', minor: 8n },
  ].filter(
    ({ minor }) =>
      BigInt(versionMatch.groups.major) > 0n || BigInt(versionMatch.groups.minor) >= minor,
  );
  const scripts = join(destination, 'scripts');
  for (const exporter of exporters) {
    try {
      const path = join(scripts, exporter.file);
      if (
        !lstatSync(scripts, { throwIfNoEntry: false })?.isDirectory() ||
        !lstatSync(path, { throwIfNoEntry: false })?.isFile()
      ) {
        return unknownState(`installed ${exporter.name} is missing or not a regular file`);
      }
      const declarations = [
        ...readFileSync(path, 'utf8').matchAll(
          /^const PACKAGE_VERSION = ['"](?<version>[^'"\r\n]+)['"];$/gmu,
        ),
      ];
      if (declarations.length !== 1) {
        return unknownState(`installed ${exporter.name} version is missing`);
      }
      const version = declarations[0].groups.version;
      if (version !== metadata.version) {
        return unknownState(
          `installation metadata disagrees with the installed ${exporter.name} version`,
        );
      }
    } catch (error) {
      return unknownState(
        `could not read installed ${exporter.name}: ${error.code ?? 'read error'}`,
      );
    }
  }
  return { installation_state: 'installed', installed_version: metadata.version, reason: null };
}

function statusRecord(destination, packageInfo) {
  return {
    schema_version: 1,
    package: packageInfo.name,
    installer_version: packageInfo.version,
    skill_path: destination,
    ...installedState(destination, packageInfo.name),
  };
}

function showStatus(record) {
  const version =
    record.installation_state === 'unknown'
      ? `unknown (${record.reason})`
      : (record.installed_version ?? 'not installed');
  console.log(`Installer version: ${record.installer_version}`);
  console.log(`Installed version: ${version}`);
  console.log(`Skill path: ${record.skill_path}`);
}

function installationPlan(source, destination, force) {
  const existing = lstatSync(destination, { throwIfNoEntry: false });
  if (existing && !force) return { outcome: 'skipped', write_paths: [] };
  if (existing && !existing.isDirectory()) {
    throw new Error(`Cannot overwrite ${destination}: the existing skill is not a directory.`);
  }
  // An explicit skills root may live under a symlink to a directory. As with mkdir,
  // follow parent links, but require every existing ancestor to be a directory.
  for (let parent = dirname(destination); ; parent = dirname(parent)) {
    const entry = lstatSync(parent, { throwIfNoEntry: false });
    if (entry && !statSync(parent).isDirectory()) {
      throw new Error(`Cannot install beneath ${parent}: it is not a directory.`);
    }
    if (parent === dirname(parent)) break;
  }
  const paths = readdirSync(source, { recursive: true }).sort();
  const files = [];
  for (const path of [...paths, INSTALL_METADATA]) {
    const target = join(destination, path);
    const directory = path !== INSTALL_METADATA && lstatSync(join(source, path)).isDirectory();
    const entry = lstatSync(target, { throwIfNoEntry: false });
    if (entry?.isSymbolicLink()) {
      throw new Error(`Cannot overwrite symbolic link at ${target}.`);
    }
    if (entry && (directory ? !entry.isDirectory() : !entry.isFile())) {
      throw new Error(
        `Cannot overwrite ${target}: expected a ${directory ? 'directory' : 'regular file'}.`,
      );
    }
    if (!directory) files.push(path);
  }
  return { outcome: existing ? 'overwritten' : 'installed', write_paths: files.sort() };
}

function fail(error, exitCode, json, command) {
  const reason = error.message;
  if (json) {
    console.log(JSON.stringify({ schema_version: 1, outcome: 'failed', reason }));
  }
  console.error(
    exitCode === 2
      ? `${reason}\nRun inferencex-skills --help for usage.`
      : `Could not ${command} the skill: ${reason}`,
  );
  process.exitCode = exitCode;
}

function main() {
  let command;
  let values;
  const json = process.argv.slice(2).includes('--json');
  try {
    const parsed = parseArgs({
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean' },
        target: { type: 'string' },
        dir: { type: 'string' },
        force: { type: 'boolean' },
        json: { type: 'boolean' },
        'dry-run': { type: 'boolean' },
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
    if (command !== 'install' && (values.force || values['dry-run'])) {
      throw new Error('--force and --dry-run require the install command.');
    }
    if (values.json && (!['install', 'status'].includes(command) || values.help)) {
      throw new Error('--json requires install or status without --help.');
    }
  } catch (error) {
    fail(error, 2, json, command);
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
    let record = statusRecord(destination, packageInfo);
    if (command === 'status') {
      if (values.json) console.log(JSON.stringify(record));
      else showStatus(record);
      return;
    }
    const plan = installationPlan(source, destination, values.force);
    const dryRun = values['dry-run'] ?? false;
    if (!dryRun && plan.outcome !== 'skipped') {
      const metadataPath = join(destination, INSTALL_METADATA);
      mkdirSync(root, { recursive: true });
      // A failed overwrite must not leave a version stamp for partially replaced files.
      rmSync(metadataPath, { force: true });
      cpSync(source, destination, { recursive: true, force: true });
      writeFileSync(
        metadataPath,
        `${JSON.stringify({ package: packageInfo.name, version: packageInfo.version }, null, 2)}\n`,
        { flag: 'wx' },
      );
      record = statusRecord(destination, packageInfo);
    }
    const result = {
      ...record,
      dry_run: dryRun,
      outcome: dryRun
        ? { installed: 'would_install', overwritten: 'would_overwrite', skipped: 'would_skip' }[
            plan.outcome
          ]
        : plan.outcome,
      write_paths: plan.write_paths,
      preserves_extra_files: true,
    };
    if (values.json) {
      console.log(JSON.stringify(result));
      return;
    }
    if (dryRun) {
      console.log(
        `Dry run: would ${{ installed: 'install', overwritten: 'overwrite', skipped: 'skip' }[plan.outcome]} ${SKILL_NAME} at ${destination}.`,
      );
      showStatus(record);
      console.log(
        `Files to write (relative to skill path, including the installation record):\n${plan.write_paths.map((path) => `  ${path}`).join('\n') || '  (none)'}`,
      );
      console.log('Unrelated and obsolete files remain untouched. No files were changed.');
    } else {
      console.log(
        plan.outcome === 'skipped'
          ? `Skipped ${SKILL_NAME}: already exists at ${destination}; use --force to overwrite.`
          : `Installed ${SKILL_NAME} into ${destination}`,
      );
      showStatus(record);
    }
  } catch (error) {
    fail(error, 1, json, command);
  }
}

main();
