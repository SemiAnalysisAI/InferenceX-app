#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { parseArgs } from 'node:util';

import {
  COMMANDS,
  allCommandDescriptions,
  commandDescription,
  getOperation,
  parseOperation,
} from './commands.mjs';
import {
  CliError,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  argumentError,
  runCli,
  writeStdout,
} from './cli-contract.mjs';
import { reserveBundle } from './evidence-bundle.mjs';
import { createHttpClient } from './http-client.mjs';
import { verifyBundle, writeVerificationReport } from './verify-bundle.mjs';

const HELP = `inferencex — discover and verify existing InferenceX observations

Usage:
  inferencex discover <models|dates|datasets|configs> [options]
  inferencex <domain> <export|inspect|compare> [options] --output-dir <new-directory>
  inferencex verify <directory> [policy options]
  inferencex describe [command]
  inferencex schema <name>
  inferencex doctor [options]

${COMMANDS.map(({ command, description }) => `  ${command.padEnd(22)} ${description}`).join('\n')}

Help, version, describe, and schema work offline. Machine output and errors default to JSON.
Use --human for concise successful output or --error-format text for text errors.
The inferencex entry requires --output-dir for formal exports and never launches benchmarks.
`;

function helpFor(args) {
  const route = args.filter((arg) => !arg.startsWith('--'));
  if (route.length === 0) return HELP;
  const exact = COMMANDS.find(({ command }) => command === route.join(' '));
  const matches = exact ? [exact] : COMMANDS.filter(({ route: parts }) => parts[0] === route[0]);
  if (matches.length === 0)
    throw argumentError('Choose a supported command; see inferencex --help.');
  return `${matches
    .map(
      ({ command, description, options }) =>
        `inferencex ${command}\n  ${description}\n\nOptions:\n${options
          .map(
            ({ name, type, required, repeatable, default: defaultValue, description: detail }) =>
              `  ${name}${type === 'boolean' ? '' : ` <${type}>`}${required ? ' (required)' : ''}${repeatable ? ' (repeatable)' : ''}${defaultValue === undefined ? '' : ` (default: ${defaultValue})`}\n      ${detail}`,
          )
          .join('\n')}`,
    )
    .join('\n\n')}\n`;
}

function offlineRequest(args) {
  args = args.filter(
    (arg, index, all) =>
      arg !== '--error-format' &&
      !arg.startsWith('--error-format=') &&
      (index === 0 || all[index - 1] !== '--error-format'),
  );
  if (args.length === 0 || (args.length === 1 && args[0] === '--help')) {
    return { type: 'help', args: [] };
  }
  if (args.length === 1 && args[0] === '--version') return { type: 'version' };
  const help = args.indexOf('--help');
  if (help !== -1) {
    const withoutHelp = args.toSpliced(help, 1);
    return { type: 'help', args: withoutHelp };
  }
  const version = args.indexOf('--version');
  if (version !== -1) {
    const route = args.toSpliced(version, 1);
    if (route.length > 0) commandDescription(route);
    return { type: 'version' };
  }
  return null;
}

function textSummary(summary) {
  const directory = summary.output?.directory ?? summary.input?.directory;
  return `${summary.validity}: ${summary.kind}; coverage ${summary.coverage.status}; policy ${summary.policy.status}${directory ? `; ${directory}` : ''}\n`;
}

function errorWithDirectory(error, directory, completed) {
  if (error instanceof CliError) {
    return new CliError(error.code, error.message, {
      cause: error,
      httpStatus: error.httpStatus,
      details: {
        ...error.details,
        output_directory: directory,
        bundle_complete: completed,
      },
    });
  }
  return new CliError('INTERNAL_ERROR', error instanceof Error ? error.message : String(error), {
    cause: error,
    details: { output_directory: directory, bundle_complete: completed },
  });
}

async function emitSummary(summary, human, signal, completedDirectory) {
  try {
    await writeStdout(human ? textSummary(summary) : `${JSON.stringify(summary, null, 2)}\n`, {
      signal,
    });
  } catch (error) {
    throw completedDirectory === undefined
      ? error
      : errorWithDirectory(error, completedDirectory, true);
  }
  if (summary.policy.status === 'failed') process.exitCode = 3;
}

async function runFormal(parsed, signal) {
  const operation = await getOperation(parsed.kind);
  const options = await operation.normalizeArgs(parsed.args);
  const metadata = commandDescription(parsed.command.split(' '));
  const client = createHttpClient({
    ...metadata.network,
    signal,
    timeoutMs: parsed.timeoutMs,
    maxAttempts: parsed.maxAttempts,
  });
  const writer = await reserveBundle(parsed.outputDir);
  let saved;
  try {
    const generatedAt = new Date().toISOString();
    const built = await operation.collect(options, {
      get: (spec) => writer.get(spec, client),
      signal,
      producerVersion: PACKAGE_VERSION,
      generatedAt,
    });
    saved = await writer.complete({
      command: parsed.command,
      kind: parsed.kind,
      contractVersion: operation.contractVersion,
      options,
      policy: parsed.policy,
      producerVersion: PACKAGE_VERSION,
      generatedAt,
      built,
      signal,
    });
    const summary = {
      ...saved.manifest.summary,
      output: { ...saved.manifest.summary.output, directory: saved.directory },
    };
    // Once manifest.json exists, cancellation no longer turns the completed export into a failure.
    await emitSummary(summary, parsed.human, undefined, saved.directory);
  } catch (error) {
    throw errorWithDirectory(error, writer.directory, saved !== undefined);
  }
}

async function runVerification(parsed, signal) {
  let values;
  let positionals;
  try {
    let tokens;
    ({ values, positionals, tokens } = parseArgs({
      args: parsed.args,
      options: { report: { type: 'string' } },
      allowPositionals: true,
      strict: true,
      tokens: true,
    }));
    if (tokens.filter((token) => token.kind === 'option' && token.name === 'report').length > 1) {
      throw argumentError('Specify --report only once.');
    }
  } catch (error) {
    throw argumentError(error.message, error);
  }
  if (positionals.length !== 1) {
    throw argumentError('verify requires exactly one evidence directory.');
  }
  const summary = await verifyBundle(positionals[0], { signal, policy: parsed.policy });
  if (values.report !== undefined) {
    summary.output = {
      report: await writeVerificationReport(values.report, positionals[0], summary, { signal }),
    };
  }
  await emitSummary(summary, parsed.human, undefined);
}

async function runDiscovery(parsed, signal) {
  const { normalizeArgs, discover } = await import('./discover.mjs');
  const options = normalizeArgs(parsed.args);
  const metadata = commandDescription(['discover']);
  const client = createHttpClient({
    ...metadata.network,
    signal,
    timeoutMs: parsed.timeoutMs,
    maxAttempts: parsed.maxAttempts,
  });
  const document = await discover(options, { get: client.get, signal });
  const output = parsed.human
    ? `${options.resource}: ${document.items.length} item(s); coverage ${document.coverage.complete_for_scope ? 'complete' : 'limited'}\n`
    : `${JSON.stringify(document, null, 2)}\n`;
  await writeStdout(output, { signal });
}

async function runDoctor(parsed, signal) {
  const { diagnose } = await import('./doctor.mjs');
  const report = await diagnose(parsed.args, { signal });
  const output = parsed.human
    ? `healthy: ${report.checked_files} managed files; API ${report.api_check.status}\n`
    : `${JSON.stringify(report, null, 2)}\n`;
  await writeStdout(output, { signal });
}

const args = process.argv.slice(2);
await runCli({
  command: 'inferencex',
  packageVersion: PACKAGE_VERSION,
  args,
  textUsageExitCode: 2,
  defaultErrorFormat: 'json',
  run: async ({ signal }) => {
    const offline = offlineRequest(args);
    if (offline?.type === 'help') {
      await writeStdout(helpFor(offline.args), { signal });
      return;
    }
    if (offline?.type === 'version') {
      await writeStdout(`${PACKAGE_VERSION}\n`, { signal });
      return;
    }

    const parsed = parseOperation(args);
    if (parsed.command === 'doctor') {
      await runDoctor(parsed, signal);
      return;
    }
    if (Number(process.versions.node.split('.')[0]) < 24) {
      throw argumentError(`Node 24 or later is required; running ${process.versions.node}.`);
    }
    if (parsed.command === 'describe') {
      if (parsed.args.some((arg) => arg.startsWith('--'))) {
        throw argumentError('describe accepts only an optional command name.');
      }
      const operation = commandDescription(parsed.args);
      const document = {
        schema_version: 1,
        package: PACKAGE_NAME,
        package_version: PACKAGE_VERSION,
        kind: 'command_description',
        ...(operation === null ? { operations: allCommandDescriptions() } : { operation }),
      };
      await writeStdout(`${JSON.stringify(document, null, 2)}\n`, { signal });
      return;
    }
    if (parsed.command === 'schema') {
      if (parsed.args.length !== 1 || parsed.args[0].startsWith('--')) {
        throw argumentError('schema requires one public schema name.');
      }
      const schemas = JSON.parse(
        await readFile(new URL('../schemas.json', import.meta.url), 'utf8'),
      );
      const schema = schemas[parsed.args[0]];
      if (schema === undefined) {
        throw argumentError(`Choose a schema: ${Object.keys(schemas).join(', ')}.`);
      }
      await writeStdout(`${JSON.stringify(schema, null, 2)}\n`, { signal });
      return;
    }

    if (parsed.command === 'verify') {
      await runVerification(parsed, signal);
      return;
    }
    if (parsed.command === 'discover') {
      await runDiscovery(parsed, signal);
      return;
    }
    if (COMMANDS.some(({ command, formal }) => formal && command === parsed.command)) {
      await runFormal(parsed, signal);
      return;
    }

    throw argumentError(`${parsed.command} is registered but not available in this build.`);
  },
});
