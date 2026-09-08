import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { inspectInstallTransaction } from './install-transaction.mjs';
import { argumentError, CliError, PACKAGE_NAME, PACKAGE_VERSION } from './cli-contract.mjs';
import { createHttpClient } from './http-client.mjs';
import { readBoundedRegular } from './local-files.mjs';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const TARGETS = { codex: '.agents/skills', agents: '.agents/skills', claude: '.claude/skills' };
const SKILL_NAME = 'inferencex-api';
const RECEIPT = '.inferencex-skills.json';
const MANIFEST_LIMIT = 256 * 1024;
const RECEIPT_LIMIT = 64 * 1024;
const MANAGED_FILE_LIMIT = 2 * 1024 * 1024;
const API_LIMIT = 4 * 1024 * 1024;
const API_URL = 'https://inferencex.semianalysis.com/api/openapi.json';
const OPERATIONS = [
  '/api/v1/benchmarks',
  '/api/v1/benchmarks/history',
  '/api/v1/workflow-info',
  '/api/v1/server-log',
  '/api/v1/tco-feed',
  '/api/v1/agentic-aggregates',
  '/api/v1/derived-agentic-metrics',
  '/api/v1/trace-availability',
  '/api/v1/collectivex/runs',
  '/api/v1/collectivex/runs/{runId}',
];

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseJson(bytes, label) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8 JSON: ${error.message}`, { cause: error });
  }
}

function semver(value) {
  return (
    typeof value === 'string' &&
    /^\d+\.\d+\.\d+(?:-[\dA-Za-z.-]+)?(?:\+[\dA-Za-z.-]+)?$/u.test(value)
  );
}

function validateManifest(value) {
  if (
    !object(value) ||
    value.schema_version !== 1 ||
    !semver(value.package_version) ||
    !object(value.files)
  ) {
    throw new Error('Integrity manifest has an invalid header');
  }
  const paths = Object.keys(value.files);
  const sorted = [...paths].sort();
  if (
    paths.length === 0 ||
    paths.length > 512 ||
    paths.some((path, index) => path !== sorted[index])
  ) {
    throw new Error('Integrity manifest file paths are not deterministic');
  }
  for (const path of paths) {
    if (
      path === 'integrity.json' ||
      path === '' ||
      path.includes('\\') ||
      posix.isAbsolute(path) ||
      posix.normalize(path) !== path ||
      path === '..' ||
      path.startsWith('../') ||
      !/^[a-f0-9]{64}$/u.test(value.files[path])
    ) {
      throw new Error(`Integrity manifest contains an invalid managed-file identity: ${path}`);
    }
  }
  return value;
}

function transactionReport(transaction) {
  return {
    state:
      transaction.state === 'recoverable'
        ? 'recovery_needed'
        : transaction.state === 'busy'
          ? 'active'
          : transaction.state,
    phase: transaction.phase,
    had_destination: transaction.had_destination,
    reason: transaction.reason,
  };
}

function addFailure(failures, check, reason, nextAction, path = null) {
  failures.push({ check, path, reason, next_action: nextAction });
}

function rethrowCancellation(error) {
  if (error?.code === 'CANCELLED') throw error;
}

function normalizeArgs(args) {
  try {
    const parsed = parseArgs({
      args,
      tokens: true,
      options: {
        target: { type: 'string' },
        dir: { type: 'string' },
        'check-api': { type: 'boolean' },
        'error-format': { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    });
    const seen = new Set();
    for (const token of parsed.tokens.filter(({ kind }) => kind === 'option')) {
      if (seen.has(token.name)) throw new Error(`Specify --${token.name} only once`);
      seen.add(token.name);
    }
    const { values } = parsed;
    if (values.target !== undefined && !Object.hasOwn(TARGETS, values.target)) {
      throw new Error('Choose --target codex, claude or agents');
    }
    if (values.dir !== undefined && !values.dir.trim()) {
      throw new Error('--dir requires a skills-root directory');
    }
    if (values.dir !== undefined && values.target !== undefined) {
      throw new Error('Choose only one of --dir or --target');
    }
    const external = values.dir !== undefined || values.target !== undefined;
    const skillsRoot = values.dir ?? (values.target === undefined ? null : TARGETS[values.target]);
    return {
      root: external ? resolve(skillsRoot, SKILL_NAME) : ROOT,
      selection: external
        ? values.dir === undefined
          ? { mode: 'target', target: values.target }
          : { mode: 'directory', skills_root: resolve(values.dir) }
        : { mode: 'executing_package' },
      external,
      checkApi: values['check-api'] ?? false,
    };
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw argumentError(error.message, error);
  }
}

export async function diagnose(args, { signal, fetchImpl = globalThis.fetch } = {}) {
  const options = normalizeArgs(args);
  const failures = [];
  signal?.throwIfAborted();
  if (Number(process.versions.node.split('.')[0]) < 24) {
    addFailure(
      failures,
      'runtime',
      `Node 24 or later is required; running ${process.versions.node}`,
      'Run the command with a supported Node 24 or 26 runtime.',
    );
  }

  let transaction = { state: 'none', phase: null, had_destination: null, reason: null };
  if (options.external) {
    try {
      transaction = inspectInstallTransaction(options.root, PACKAGE_NAME, SKILL_NAME);
    } catch (error) {
      transaction = {
        state: 'blocked',
        phase: null,
        had_destination: null,
        reason: `Could not inspect installer transaction: ${error.message}`,
      };
    }
  }
  const selectedTransaction = transactionReport(transaction);
  if (selectedTransaction.state !== 'none') {
    addFailure(
      failures,
      'installer_transaction',
      selectedTransaction.reason ?? `Installer transaction is ${selectedTransaction.state}`,
      selectedTransaction.state === 'recovery_needed'
        ? 'Run inferencex-skills install for this destination to recover the interrupted transaction.'
        : 'Wait for the active installer or inspect the transaction before retrying.',
    );
  }

  let physicalRoot;
  try {
    const entry = await lstat(options.root);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error('Skill path must be a regular directory, not a symbolic link');
    }
    physicalRoot = await realpath(options.root);
  } catch (error) {
    rethrowCancellation(error);
    addFailure(
      failures,
      'installation_path',
      error.message,
      options.external
        ? 'Install the selected skill or choose the correct skills root.'
        : 'Reinstall the executing package.',
    );
  }

  let manifest;
  if (physicalRoot !== undefined) {
    try {
      manifest = validateManifest(
        parseJson(
          await readBoundedRegular(
            join(physicalRoot, 'integrity.json'),
            MANIFEST_LIMIT,
            'integrity manifest',
            { signal },
          ),
          'Integrity manifest',
        ),
      );
    } catch (error) {
      rethrowCancellation(error);
      addFailure(
        failures,
        'integrity_manifest',
        error.message,
        'Reinstall the selected package from the intended package archive.',
        'integrity.json',
      );
    }
  }

  let receipt = null;
  if (options.external && physicalRoot !== undefined) {
    try {
      const candidate = parseJson(
        await readBoundedRegular(join(physicalRoot, RECEIPT), RECEIPT_LIMIT, 'installer receipt', {
          signal,
        }),
        'Installer receipt',
      );
      if (!object(candidate) || candidate.package !== PACKAGE_NAME || !semver(candidate.version)) {
        throw new Error('Installer receipt has an invalid package or version');
      }
      if (manifest !== undefined && candidate.version !== manifest.package_version) {
        throw new Error('Installer receipt version disagrees with the selected integrity manifest');
      }
      receipt = candidate;
    } catch (error) {
      rethrowCancellation(error);
      addFailure(
        failures,
        'installer_receipt',
        error.message,
        'Reinstall the selected skill with inferencex-skills install --force.',
        RECEIPT,
      );
    }
  } else if (
    !options.external &&
    manifest !== undefined &&
    manifest.package_version !== PACKAGE_VERSION
  ) {
    addFailure(
      failures,
      'package_version',
      'Executing package version disagrees with its integrity manifest',
      'Reinstall the executing package.',
      'integrity.json',
    );
  }

  let checkedFiles = 0;
  if (physicalRoot !== undefined && manifest !== undefined) {
    for (const [relativePath, expected] of Object.entries(manifest.files)) {
      signal?.throwIfAborted();
      checkedFiles++;
      try {
        const path = join(physicalRoot, ...relativePath.split('/'));
        const physical = await realpath(path);
        if (physical !== path) throw new Error('Managed file has a symbolic-link ancestor or leaf');
        const bytes = await readBoundedRegular(
          path,
          MANAGED_FILE_LIMIT,
          `managed file ${relativePath}`,
          {
            signal,
          },
        );
        const actual = createHash('sha256').update(bytes).digest('hex');
        if (actual !== expected)
          throw new Error('Bytes differ from the selected integrity manifest');
      } catch (error) {
        rethrowCancellation(error);
        addFailure(
          failures,
          'managed_file',
          error.message,
          'Reinstall the selected skill from the intended package archive.',
          relativePath,
        );
      }
    }
  }

  let apiCheck = {
    status: 'not_requested',
    request_count: 0,
    scope: 'OpenAPI reachability and the required CLI GET operation declarations only.',
  };
  if (options.checkApi) {
    try {
      const client = createHttpClient({
        timeoutMs: 10_000,
        maxAttempts: 1,
        responseBytes: API_LIMIT,
        totalBytes: API_LIMIT,
        fetchImpl,
        signal,
      });
      const response = await client.get({
        operation: 'openapi',
        url: API_URL,
        allowedStatuses: [200],
      });
      if (!object(response.body) || typeof response.body.openapi !== 'string') {
        throw new Error('OpenAPI response is not an OpenAPI document');
      }
      if (!response.body.openapi.startsWith('3.')) {
        throw new Error('OpenAPI response does not declare OpenAPI 3');
      }
      for (const path of OPERATIONS) {
        if (!object(response.body.paths?.[path]?.get)) {
          throw new Error(`OpenAPI operation is missing or invalid: GET ${path}`);
        }
      }
      apiCheck = {
        status: 'passed',
        request_count: 1,
        scope: 'OpenAPI reachability and the required CLI GET operation declarations only.',
        url: API_URL,
        openapi: response.body.openapi,
      };
    } catch (error) {
      rethrowCancellation(error);
      apiCheck = {
        status: 'failed',
        request_count: 1,
        scope: 'OpenAPI reachability and the required CLI GET operation declarations only.',
        url: API_URL,
      };
      addFailure(
        failures,
        'api_contract',
        error.message,
        'Check API reachability and the published OpenAPI GET declarations, then retry.',
      );
    }
  }

  const version = receipt?.version ?? manifest?.package_version ?? null;
  const report = {
    schema_version: 1,
    healthy: failures.length === 0,
    executing_package: {
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
      skill_path: ROOT,
    },
    runtime: {
      node: process.versions.node,
      platform: process.platform,
      architecture: process.arch,
    },
    selected_installation: {
      ...options.selection,
      state: options.external
        ? selectedTransaction.state === 'none'
          ? failures.some(({ check }) =>
              ['installation_path', 'installer_receipt', 'integrity_manifest'].includes(check),
            )
            ? 'unknown'
            : 'installed'
          : selectedTransaction.state
        : 'executing_package',
      skill_path: options.root,
      package: PACKAGE_NAME,
      version,
      receipt: options.external
        ? {
            status: receipt === null ? 'invalid_or_missing' : 'present',
            package: receipt?.package ?? null,
            version: receipt?.version ?? null,
          }
        : { status: 'not_applicable', package: null, version: null },
      transaction: selectedTransaction,
      publisher_authenticity: 'not_established',
    },
    checked_files: checkedFiles,
    api_check: apiCheck,
    failures,
  };
  if (!report.healthy) {
    throw new CliError('INSTALLATION_UNHEALTHY', 'Installation diagnostics found failed checks.', {
      details: report,
    });
  }
  return report;
}
