#!/usr/bin/env node

import { lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import process from 'node:process';
import { parseArgs } from 'node:util';
import {
  argumentError,
  CliError,
  runCli,
  writeStdout,
} from '../skills/inferencex-api/scripts/cli-contract.mjs';

import {
  inspectInstallTransaction,
  runInstallTransaction,
} from '../skills/inferencex-api/scripts/install-transaction.mjs';
import { diagnose } from '../skills/inferencex-api/scripts/doctor.mjs';
import { readBoundedRegular } from '../skills/inferencex-api/scripts/local-files.mjs';

const SKILL_NAME = 'inferencex-api';
const ENTRYPOINT_NAME = 'inferencex';
const SHORTCUT_NAMES = ['inferencex-to-chart', 'inferencex-to-table'];
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
  --scope <name>  project (default) or user (available across projects)
                  user: ~/.claude/skills or ~/.agents/skills
  --dir <path>     Explicit skills directory, relative or absolute
                  Overrides --target; cannot combine with --scope
  --json          Emit one JSON document (schema_version: 1), without prose
  --force         Install only: overwrite packaged files; retains obsolete files
  --dry-run       Install only: preview the same preflight without changing files
  --error-format <mode> Failure diagnostics: text (default) or json

Existing skills are skipped unless --force is supplied.
Status identifies older installs from receipts and checks managed file integrity from 0.12.0 onward.
It never changes files or uses the network.
Interrupted owned installs recover on the next install; status and dry-run remain read-only.
Recovery covers process crashes, without an fsync or power-loss durability guarantee.
--version reports the executing installer, not an installed skill.
Bundled entries: inferencex, inferencex-to-chart, inferencex-to-table
Shared implementation and legacy entry: inferencex-api
`;

function unknownState(reason) {
  return { installation_state: 'unknown', installed_version: null, reason };
}

async function installedState(destination, packageName, signal, skillName) {
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
    metadata = JSON.parse(
      await readBoundedRegular(metadataPath, 64 * 1024, 'installer receipt', { signal }),
    );
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
    signal?.throwIfAborted();
    return error instanceof SyntaxError
      ? unknownState('invalid installation metadata')
      : unknownState(`could not read installation metadata: ${error.cause?.code ?? error.message}`);
  }

  if (BigInt(versionMatch.groups.major) >= 1n || BigInt(versionMatch.groups.minor) >= 12n) {
    try {
      await diagnose(['--dir', dirname(destination)], { signal, skillName });
    } catch (error) {
      if (error.code !== 'INSTALLATION_UNHEALTHY') throw error;
      const failure = error.details.failures[0];
      return unknownState(`${failure.path ? `${failure.path}: ` : ''}${failure.reason}`);
    }
  }
  return { installation_state: 'installed', installed_version: metadata.version, reason: null };
}

async function statusRecord(destination, packageInfo, signal, skillName = SKILL_NAME) {
  const transaction = await inspectInstallTransaction(destination, packageInfo.name, skillName);
  const installation =
    transaction.state === 'none'
      ? await installedState(destination, packageInfo.name, signal, skillName)
      : {
          ...unknownState(transaction.reason),
          transaction_state:
            transaction.state === 'recoverable' ? 'recovery_needed' : transaction.state,
          transaction_phase: transaction.phase,
          transaction_had_destination: transaction.had_destination,
          ...(transaction.cleanup_only
            ? {
                transaction_projected_destination_exists: transaction.projected_destination_exists,
              }
            : {}),
        };
  return {
    record: {
      schema_version: 1,
      package: packageInfo.name,
      installer_version: packageInfo.version,
      skill_path: destination,
      ...installation,
    },
    transaction,
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

function installationPlan(source, destination, force, existingRoot = destination) {
  const existing =
    existingRoot === null ? undefined : lstatSync(existingRoot, { throwIfNoEntry: false });
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
    const entry =
      existingRoot === null
        ? undefined
        : lstatSync(join(existingRoot, path), { throwIfNoEntry: false });
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

async function installTransaction(options) {
  try {
    return await runInstallTransaction(options);
  } catch (error) {
    // Protocol failures are internal errors; Node filesystem failures carry these fields.
    for (let cause = error; cause instanceof Error; cause = cause.cause) {
      if (
        Number.isInteger(cause.errno) &&
        typeof cause.code === 'string' &&
        typeof cause.syscall === 'string' &&
        typeof cause.path === 'string'
      ) {
        throw new CliError('OUTPUT_ERROR', error.message, { cause: error });
      }
    }
    throw error;
  }
}

async function main(args, signal) {
  let command;
  let values;
  try {
    const parsed = parseArgs({
      args,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean' },
        target: { type: 'string' },
        scope: { type: 'string' },
        dir: { type: 'string' },
        force: { type: 'boolean' },
        json: { type: 'boolean' },
        'dry-run': { type: 'boolean' },
        'error-format': { type: 'string' },
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
    if (values.scope !== undefined && !['project', 'user'].includes(values.scope)) {
      throw new Error('Unknown --scope. Choose project or user.');
    }
    if (values.dir !== undefined && values.scope !== undefined) {
      throw new Error('Choose only one of --dir or --scope.');
    }
    if (values.dir !== undefined && values.dir.trim() === '') {
      throw new Error('--dir requires a nonempty destination.');
    }
    if (
      !['install', 'status'].includes(command) &&
      ['target', 'dir', 'scope'].some((key) => key in values)
    ) {
      throw new Error('--target, --dir and --scope require the install or status command.');
    }
    if (command !== 'install' && (values.force || values['dry-run'])) {
      throw new Error('--force and --dry-run require the install command.');
    }
    if (values.json && (!['install', 'status'].includes(command) || values.help)) {
      throw new Error('--json requires install or status without --help.');
    }
  } catch (error) {
    throw argumentError(error.message, error);
  }

  if (command === 'help' || values.help) {
    await writeStdout(`${HELP}\n`, { signal });
    return;
  }

  if (Number(process.versions.node.split('.')[0]) < 24) {
    throw new Error('Node 24 or later is required.');
  }
  const packageInfo = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
  );
  if (command === 'version') {
    await writeStdout(`Installer version: ${packageInfo.version}\n`, { signal });
    return;
  }
  if (command === 'list') {
    await writeStdout(
      `Bundled InferenceX skills:\n  ${[ENTRYPOINT_NAME, ...SHORTCUT_NAMES].join('\n  ')}\n  ${SKILL_NAME} (shared implementation and legacy entry)\n`,
      { signal },
    );
    return;
  }

  const target = values.target ?? 'claude';
  const root =
    values.dir === undefined
      ? resolve(values.scope === 'user' ? homedir() : process.cwd(), TARGET_DIRS[target])
      : resolve(values.dir);
  const runtime = await processSkill(SKILL_NAME, root, packageInfo, command, values, signal);
  const entrypoint = await processSkill(
    ENTRYPOINT_NAME,
    root,
    packageInfo,
    command,
    values,
    signal,
  );
  const shortcuts = {};
  for (const name of SHORTCUT_NAMES) {
    shortcuts[name] = await processSkill(name, root, packageInfo, command, values, signal);
  }
  const ready = [runtime, entrypoint, ...Object.values(shortcuts)].every(
    (record) =>
      record.installation_state === 'installed' && record.installed_version === packageInfo.version,
  );
  const result = { ...runtime, entrypoint, shortcuts, ready };
  if (values.json) {
    await writeStdout(`${JSON.stringify(result)}\n`, {
      signal: values['dry-run'] ? signal : undefined,
    });
  } else {
    showSkillResult(runtime, SKILL_NAME, command);
    showSkillResult(entrypoint, ENTRYPOINT_NAME, command);
    for (const [name, record] of Object.entries(shortcuts)) showSkillResult(record, name, command);
    if (command === 'install' && !values['dry-run']) {
      if (ready) {
        console.log(
          target === 'claude'
            ? 'Next: open Claude Code and type /inferencex <your task>.'
            : 'Next: open Codex and select inferencex from /skills, or type $inferencex <your task>.',
        );
        console.log(
          target === 'claude'
            ? 'For AgentX outputs: /inferencex-to-chart <your task> or /inferencex-to-table <your task>.'
            : 'For AgentX outputs: $inferencex-to-chart <your task> or $inferencex-to-table <your task>.',
        );
        console.log(
          'Example: Compare the InferenceX TCO assumptions in my spreadsheet with the matching public observations.',
        );
        console.log(
          'Continue with normal follow-up questions; the skill chooses the CLI workflow. Restart the agent if the skill is not listed.',
        );
      } else {
        console.log(
          'Setup is incomplete or uses an older version. Check the skill paths above; rerun install --force with the same target and scope after saving local edits.',
        );
      }
    }
  }
}

async function processSkill(skillName, root, packageInfo, command, values, signal) {
  const source = join(import.meta.dirname, '..', 'skills', skillName);
  const destination = join(root, skillName);
  const initialStatus = await statusRecord(destination, packageInfo, signal, skillName);
  const { transaction } = initialStatus;
  let { record } = initialStatus;
  if (command === 'status') return record;
  const dryRun = values['dry-run'] ?? false;
  const recoveredDestinationExists = typeof transaction.recovery_source === 'string';
  const plan = dryRun
    ? record.transaction_state === undefined
      ? installationPlan(source, destination, values.force)
      : record.transaction_state === 'recovery_needed' &&
          (values.force || !recoveredDestinationExists)
        ? installationPlan(source, destination, true, transaction.recovery_source)
        : { outcome: 'skipped', write_paths: [] }
    : await installTransaction({
        source,
        destination,
        packageName: packageInfo.name,
        packageVersion: packageInfo.version,
        skillName,
        receiptName: INSTALL_METADATA,
        signal,
        prepare: () => installationPlan(source, destination, values.force),
      });
  if (!dryRun) {
    const installedStatus = await statusRecord(destination, packageInfo, undefined, skillName);
    record = installedStatus.record;
  }
  return {
    ...record,
    dry_run: dryRun,
    outcome: dryRun
      ? record.transaction_state === 'recovery_needed'
        ? `would_recover_then_${
            values.force
              ? recoveredDestinationExists
                ? 'overwrite'
                : 'install'
              : recoveredDestinationExists
                ? 'skip'
                : 'install'
          }`
        : record.transaction_state === 'busy'
          ? 'would_wait_for_install'
          : record.transaction_state === 'blocked'
            ? 'blocked_by_transaction'
            : {
                installed: 'would_install',
                overwritten: 'would_overwrite',
                skipped: 'would_skip',
              }[plan.outcome]
      : plan.outcome,
    write_paths: plan.write_paths,
    preserves_extra_files: true,
  };
}

function showSkillResult(result, skillName, command) {
  if (command === 'status') {
    showStatus(result);
    return;
  }
  const destination = result.skill_path;
  if (result.dry_run) {
    const description = {
      would_install: `would install ${skillName} at ${destination}`,
      would_overwrite: `would overwrite ${skillName} at ${destination}`,
      would_skip: `would skip ${skillName} at ${destination}`,
      would_recover_then_install: `would recover the interrupted transaction, then install ${skillName} at ${destination}`,
      would_recover_then_overwrite: `would recover the interrupted transaction, then overwrite ${skillName} at ${destination}`,
      would_recover_then_skip: `would recover the interrupted transaction, then skip ${skillName} at ${destination}`,
      would_wait_for_install: `would wait for the active installer transaction at ${destination}`,
      blocked_by_transaction: `is blocked by untrusted installer transaction data at ${destination}`,
    }[result.outcome];
    console.log(`Dry run: ${description}.`);
    showStatus(result);
    console.log(
      `Files to write (relative to skill path, including the installation record):\n${result.write_paths.map((path) => `  ${path}`).join('\n') || '  (none)'}`,
    );
    console.log('Unrelated and obsolete files remain untouched. No files were changed.');
  } else {
    console.log(
      result.outcome === 'skipped'
        ? `Skipped ${skillName}: already exists at ${destination}; use --force to overwrite.`
        : `Installed ${skillName} into ${destination}`,
    );
    showStatus(result);
  }
}

const args = process.argv.slice(2);
const command = args.find((arg) => ['install', 'status', 'list'].includes(arg)) ?? 'help';
await runCli({
  command: 'inferencex-skills',
  args,
  textUsageExitCode: 2,
  textError(error) {
    if (args.includes('--json')) {
      process.stdout.write(
        `${JSON.stringify({ schema_version: 1, outcome: 'failed', reason: error.message })}\n`,
      );
    }
    return error.code === 'INVALID_ARGUMENT'
      ? `${error.message}\nRun inferencex-skills --help for usage.`
      : `Could not ${command} the skill: ${error.message}`;
  },
  run: ({ args: cliArgs, signal }) => main(cliArgs, signal),
});
