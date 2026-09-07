import { parseArgs } from 'node:util';

import { argumentError } from './cli-contract.mjs';

function option(name, type, description, extra = {}) {
  return Object.freeze({ name, type, required: false, repeatable: false, ...extra, description });
}

const SHARED_OPTIONS = Object.freeze({
  output: option('--output-dir', 'path', 'New directory that will contain result and evidence.', {
    required: true,
  }),
  hardware: option(
    '--require-hardware',
    'string',
    'Require at least one valid selected result for this hardware key.',
    { repeatable: true },
  ),
  pairs: option(
    '--min-comparable-pairs',
    'integer',
    'Require at least this many eligible comparable pairs.',
  ),
  human: option('--human', 'boolean', 'Render a concise successful result.', { default: false }),
  error: option('--error-format', 'json|text', 'Render failures as JSON or text.', {
    default: 'json',
  }),
  attempts: option('--max-attempts', 'integer', 'Maximum GET attempts, from 1 to 3.', {
    default: 3,
  }),
});

function formalOptions(domain, { timeoutMs, policy, formats = ['json'] }) {
  return Object.freeze([
    ...domain,
    ...(formats.length > 1
      ? [option('--format', formats.join('|'), 'Result format.', { default: formats[0] })]
      : []),
    SHARED_OPTIONS.output,
    ...(policy === 'hardware' ? [SHARED_OPTIONS.hardware] : [SHARED_OPTIONS.pairs]),
    option('--timeout-ms', 'integer', 'Total operation deadline in milliseconds.', {
      default: timeoutMs,
    }),
    SHARED_OPTIONS.attempts,
    SHARED_OPTIONS.human,
    SHARED_OPTIONS.error,
  ]);
}

function operation(value) {
  return Object.freeze({
    ...value,
    route: Object.freeze(value.route),
    formats: Object.freeze(value.formats),
    policies: Object.freeze(value.policies),
    options: Object.freeze(value.options),
    network: value.network === null ? null : Object.freeze(value.network),
  });
}

export const FORMAL_OPERATIONS = Object.freeze([
  operation({
    command: 'powerx export',
    route: ['powerx', 'export'],
    kind: 'powerx',
    module: './export-powerx.mjs',
    description: 'Export measured PowerX observations with complete evidence.',
    formats: ['json', 'csv'],
    policies: ['require-hardware'],
    outputSchema: 'powerx',
    formal: true,
    contractVersion: 1,
    options: formalOptions(
      [
        option('--model', 'string', 'Public display-model selector.', { required: true }),
        option('--isl', 'integer', 'Input sequence length in tokens.', { required: true }),
        option('--osl', 'integer', 'Output sequence length in tokens.', { required: true }),
        option('--date', 'YYYY-MM-DD', 'As-of cutoff; omission selects the latest data.'),
        option('--raw-model', 'string', 'Exact returned model key within the display bucket.'),
      ],
      { timeoutMs: 30_000, policy: 'hardware', formats: ['json', 'csv'] },
    ),
    network: {
      responseBytes: 32 * 1024 * 1024,
      totalBytes: 32 * 1024 * 1024,
      timeoutMs: 30_000,
    },
  }),
  operation({
    command: 'agentx export',
    route: ['agentx', 'export'],
    kind: 'agentx',
    module: './export-agentx.mjs',
    description: 'Export AgentX benchmark summaries with complete evidence.',
    formats: ['json', 'csv'],
    policies: ['require-hardware'],
    outputSchema: 'agentx',
    formal: true,
    contractVersion: 1,
    options: formalOptions(
      [
        option('--model', 'string', 'Public display-model selector.', { required: true }),
        option('--date', 'YYYY-MM-DD', 'As-of cutoff; omission selects the latest data.'),
        option('--raw-model', 'string', 'Exact returned model key within the display bucket.'),
        option('--hardware', 'string', 'Exact returned hardware key.'),
        option('--framework', 'string', 'Exact returned framework key.'),
        option('--precision', 'string', 'Exact returned precision key.'),
        option('--spec-method', 'string', 'Exact returned speculative-method key.'),
        option('--offload-mode', 'string', 'Exact returned offload-mode key.'),
        option('--concurrency', 'integer', 'Exact positive concurrency.'),
      ],
      { timeoutMs: 120_000, policy: 'hardware', formats: ['json', 'csv'] },
    ),
    network: {
      responseBytes: 32 * 1024 * 1024,
      totalBytes: 128 * 1024 * 1024,
      timeoutMs: 120_000,
    },
  }),
  operation({
    command: 'result inspect',
    route: ['result', 'inspect'],
    kind: 'result',
    module: './investigate-result.mjs',
    description: 'Inspect one result and its bounded producer evidence.',
    formats: ['json'],
    policies: ['require-hardware'],
    outputSchema: 'result',
    formal: true,
    contractVersion: 1,
    options: formalOptions(
      [
        option('--id', 'string', 'Exact benchmark result ID.', { required: true }),
        option('--model', 'string', 'Public display-model selector.', { required: true }),
        option('--date', 'YYYY-MM-DD', 'As-of benchmark scope.'),
        option('--run-id', 'string', 'Exact logical run snapshot; cannot combine with date.'),
        option('--log-file', 'string', 'Exact artifact-relative log name.'),
        option('--log-offset', 'integer', 'Unicode-character offset.', { default: 0 }),
        option('--log-limit', 'integer', 'Maximum Unicode characters to inspect.', {
          default: 16_384,
        }),
      ],
      { timeoutMs: 120_000, policy: 'hardware' },
    ),
    network: {
      responseBytes: 16 * 1024 * 1024,
      totalBytes: 16 * 1024 * 1024,
      timeoutMs: 120_000,
    },
  }),
  operation({
    command: 'tco compare',
    route: ['tco', 'compare'],
    kind: 'tco',
    module: './compare-tco.mjs',
    description: 'Compare TCO using explicit workloads, targets, and GPU prices.',
    formats: ['json'],
    policies: ['require-hardware'],
    outputSchema: 'tco',
    formal: true,
    contractVersion: 1,
    options: formalOptions(
      [
        option('--model', 'string', 'Model key or public display-model selector.', {
          required: true,
        }),
        option('--workloads', 'ISLxOSL,...', 'Comma-separated workload shapes.', {
          required: true,
        }),
        option('--target', 'number', 'Target output tokens per second per user.', {
          required: true,
        }),
        option(
          '--gpu-hourly-prices',
          'hardware=USD,...',
          'Explicit case-sensitive GPU hourly prices.',
          { required: true },
        ),
        option('--date', 'YYYY-MM-DD', 'As-of cutoff; omission selects the latest data.'),
      ],
      { timeoutMs: 30_000, policy: 'hardware' },
    ),
    network: {
      responseBytes: 4 * 1024 * 1024,
      totalBytes: 4 * 1024 * 1024,
      timeoutMs: 30_000,
    },
  }),
  operation({
    command: 'releases compare',
    route: ['releases', 'compare'],
    kind: 'releases',
    module: './compare-releases.mjs',
    description: 'Compare matched observations across explicit releases.',
    formats: ['json'],
    policies: ['min-comparable-pairs'],
    outputSchema: 'releases',
    formal: true,
    contractVersion: 1,
    options: formalOptions(
      [
        option('--model', 'string', 'Public display-model selector.', { required: true }),
        option('--hardware', 'string', 'Exact returned hardware key.', { required: true }),
        option('--framework', 'vllm|sglang', 'Framework to compare.', { required: true }),
        option('--isl', 'integer', 'Input sequence length in tokens.', { required: true }),
        option('--osl', 'integer', 'Output sequence length in tokens.', { required: true }),
        option('--metric', 'string', 'Raw retained performance metric key.', { required: true }),
        option('--before-date', 'YYYY-MM-DD', 'Original observation date for the first side.', {
          required: true,
        }),
        option('--after-date', 'YYYY-MM-DD', 'Original observation date for the second side.', {
          required: true,
        }),
        option(
          '--before-image',
          'string',
          'Exact first-side image; required if run URL is absent.',
        ),
        option(
          '--after-image',
          'string',
          'Exact second-side image; required if run URL is absent.',
        ),
        option('--before-run-url', 'URL', 'Exact first-side producer run URL.'),
        option('--after-run-url', 'URL', 'Exact second-side producer run URL.'),
        option('--raw-model', 'string', 'Exact returned model key within the display bucket.'),
      ],
      { timeoutMs: 30_000, policy: 'pairs' },
    ),
    network: {
      responseBytes: 16 * 1024 * 1024,
      totalBytes: 16 * 1024 * 1024,
      timeoutMs: 30_000,
    },
  }),
  operation({
    command: 'collectivex compare',
    route: ['collectivex', 'compare'],
    kind: 'collectivex',
    module: './compare-collectivex.mjs',
    description: 'Compare two compatible CollectiveX runs.',
    formats: ['json'],
    policies: ['min-comparable-pairs'],
    outputSchema: 'collectivex',
    formal: true,
    contractVersion: 1,
    options: formalOptions(
      [
        option('--left', 'string', 'First measured run ID; supply together with --right.'),
        option('--right', 'string', 'Second measured run ID; supply together with --left.'),
      ],
      { timeoutMs: 120_000, policy: 'pairs' },
    ),
    network: {
      responseBytes: 32 * 1024 * 1024,
      totalBytes: 32 * 1024 * 1024,
      timeoutMs: 120_000,
    },
  }),
]);

const UTILITY_OPERATIONS = Object.freeze([
  operation({
    command: 'discover',
    route: ['discover'],
    kind: 'discovery',
    module: './discover.mjs',
    description: 'Discover capabilities, models, dates, datasets, and observed configs.',
    formats: ['json'],
    policies: [],
    outputSchema: 'discovery',
    formal: false,
    contractVersion: 1,
    options: Object.freeze([
      option('resource', 'capabilities|models|dates|datasets|configs', 'Discovery resource.', {
        required: true,
      }),
      option('--model', 'string', 'Model selector required for dates and configs.'),
      option('--date', 'YYYY-MM-DD', 'Optional configs as-of cutoff.'),
      option('--limit', 'integer', 'Local result limit, from 1 to 1000.', { default: 100 }),
      option('--offset', 'integer', 'Nonnegative local result offset.', { default: 0 }),
      option('--timeout-ms', 'integer', 'Total operation deadline in milliseconds.', {
        default: 120_000,
      }),
      SHARED_OPTIONS.attempts,
      SHARED_OPTIONS.human,
      SHARED_OPTIONS.error,
    ]),
    network: {
      responseBytes: 32 * 1024 * 1024,
      totalBytes: 128 * 1024 * 1024,
      timeoutMs: 120_000,
    },
  }),
  operation({
    command: 'verify',
    route: ['verify'],
    kind: 'verification',
    module: './verify-bundle.mjs',
    description: 'Verify a completed evidence directory without network access.',
    formats: ['json'],
    policies: ['require-hardware', 'min-comparable-pairs'],
    outputSchema: 'verification',
    formal: false,
    contractVersion: 1,
    options: Object.freeze([
      option('directory', 'path', 'Completed evidence directory to verify.', { required: true }),
      option('--report', 'path', 'New Markdown report path outside the evidence directory.'),
      SHARED_OPTIONS.hardware,
      SHARED_OPTIONS.pairs,
      SHARED_OPTIONS.human,
      SHARED_OPTIONS.error,
    ]),
    network: null,
  }),
  operation({
    command: 'describe',
    route: ['describe'],
    kind: 'description',
    module: null,
    description: 'Print fixed command metadata offline.',
    formats: ['json'],
    policies: [],
    outputSchema: 'summary',
    formal: false,
    contractVersion: 1,
    options: Object.freeze([
      option('command', 'string', 'Optional command whose metadata should be printed.'),
      SHARED_OPTIONS.error,
    ]),
    network: null,
  }),
  operation({
    command: 'schema',
    route: ['schema'],
    kind: 'schema',
    module: null,
    description: 'Print one public JSON Schema offline.',
    formats: ['json'],
    policies: [],
    outputSchema: 'summary',
    formal: false,
    contractVersion: 1,
    options: Object.freeze([
      option('name', 'string', 'Public JSON Schema name.', { required: true }),
      SHARED_OPTIONS.error,
    ]),
    network: null,
  }),
  operation({
    command: 'doctor',
    route: ['doctor'],
    kind: 'doctor',
    module: './doctor.mjs',
    description: 'Inspect the runtime and installed package; API check is opt-in.',
    formats: ['json'],
    policies: [],
    outputSchema: 'doctor',
    formal: false,
    contractVersion: 1,
    options: Object.freeze([
      option('--target', 'codex|claude|agents', 'Installed skill target to inspect.'),
      option('--dir', 'path', 'Explicit skills root to inspect.'),
      option('--check-api', 'boolean', 'Opt into one bounded OpenAPI request.', {
        default: false,
      }),
      SHARED_OPTIONS.human,
      SHARED_OPTIONS.error,
    ]),
    network: {
      responseBytes: 4 * 1024 * 1024,
      totalBytes: 4 * 1024 * 1024,
      timeoutMs: 10_000,
    },
  }),
]);

export const COMMANDS = Object.freeze([...FORMAL_OPERATIONS, ...UTILITY_OPERATIONS]);

const GLOBAL_OPTIONS = Object.freeze({
  'output-dir': { type: 'string' },
  'require-hardware': { type: 'string', multiple: true },
  'min-comparable-pairs': { type: 'string' },
  human: { type: 'boolean' },
  'error-format': { type: 'string' },
  'timeout-ms': { type: 'string' },
  'max-attempts': { type: 'string' },
});
const BOOLEAN_OPTIONS = new Set(['human']);
const REPEATABLE_OPTIONS = new Set(['require-hardware']);
const LEGACY_OUTPUTS = new Set(['output', 'evidence-dir']);

function cloneMetadata(entry) {
  return {
    command: entry.command,
    kind: entry.kind,
    description: entry.description,
    route: [...entry.route],
    formats: [...entry.formats],
    policies: [...entry.policies],
    output_schema: entry.outputSchema,
    requires_output_dir: entry.formal,
    formal: entry.formal,
    contract_version: entry.contractVersion,
    network: entry.network === null ? null : { ...entry.network },
    options: entry.options.map((value) => ({ ...value })),
  };
}

function findCommand(argv) {
  const matches = COMMANDS.filter(({ route }) =>
    route.every((part, index) => argv[index] === part),
  ).toSorted((left, right) => right.route.length - left.route.length);
  const found = matches[0];
  if (found === undefined) {
    throw argumentError('Choose a supported command; see inferencex --help.');
  }
  return found;
}

function positiveInteger(value, name, maximum) {
  if (!/^[1-9][0-9]*$/u.test(value ?? '')) {
    throw argumentError(`--${name} requires a positive integer.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > maximum) {
    throw argumentError(`--${name} must be at most ${maximum}.`);
  }
  return number;
}

function nonnegativeInteger(value, name, maximum) {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value ?? '')) {
    throw argumentError(`--${name} requires a nonnegative integer.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > maximum) {
    throw argumentError(`--${name} must be at most ${maximum}.`);
  }
  return number;
}

function splitGlobalArgs(args) {
  const globals = [];
  const domain = [];
  const counts = new Map();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const match = /^--(?<name>[^=]+)(?:=(?<inline>.*))?$/u.exec(arg);
    if (match === null) {
      domain.push(arg);
      continue;
    }
    const { name, inline } = match.groups;
    if (LEGACY_OUTPUTS.has(name)) {
      throw argumentError(`--${name} is a legacy helper option; use --output-dir with inferencex.`);
    }
    if (!Object.hasOwn(GLOBAL_OPTIONS, name)) {
      domain.push(arg);
      continue;
    }
    counts.set(name, (counts.get(name) ?? 0) + 1);
    if (!REPEATABLE_OPTIONS.has(name) && counts.get(name) > 1) {
      throw argumentError(`Specify --${name} only once.`);
    }
    globals.push(arg);
    if (inline === undefined && !BOOLEAN_OPTIONS.has(name)) {
      if (args[index + 1] === undefined) throw argumentError(`--${name} requires a value.`);
      globals.push(args[++index]);
    }
  }
  return { globals, domain };
}

export function commandDescription(route = []) {
  if (route.length === 0) return null;
  const command = route.join(' ');
  const found = COMMANDS.find((entry) => entry.command === command);
  if (found === undefined) throw argumentError(`Unknown command for describe: ${command}.`);
  return cloneMetadata(found);
}

export function allCommandDescriptions() {
  return COMMANDS.map(cloneMetadata);
}

export function parseOperation(argv) {
  if (!Array.isArray(argv)) throw new TypeError('argv must be an array');
  const entry = findCommand(argv);
  const { globals, domain } = splitGlobalArgs(argv.slice(entry.route.length));
  let values;
  try {
    ({ values } = parseArgs({
      args: globals,
      options: GLOBAL_OPTIONS,
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    throw argumentError(error.message, error);
  }

  const errorFormat = values['error-format'] ?? 'json';
  if (!['json', 'text'].includes(errorFormat)) {
    throw argumentError('--error-format must be json or text.');
  }
  const outputDir = values['output-dir'] ?? null;
  if (outputDir !== null && outputDir.trim() === '') {
    throw argumentError('--output-dir requires a non-empty directory.');
  }
  if (entry.formal && outputDir === null) {
    throw argumentError(`${entry.command} requires --output-dir <new-directory>.`);
  }
  if (!entry.formal && outputDir !== null) {
    throw argumentError(`--output-dir does not apply to ${entry.command}.`);
  }
  if (
    !entry.formal &&
    entry.command !== 'discover' &&
    (values['timeout-ms'] !== undefined || values['max-attempts'] !== undefined)
  ) {
    throw argumentError(`Network controls do not apply to ${entry.command}.`);
  }
  if (values.human && !entry.options.some(({ name }) => name === '--human')) {
    throw argumentError(`--human does not apply to ${entry.command}.`);
  }

  const requireHardware = values['require-hardware'] ?? [];
  if (requireHardware.some((value) => value.trim() === '')) {
    throw argumentError('--require-hardware requires a non-empty hardware key.');
  }
  if (new Set(requireHardware).size !== requireHardware.length) {
    throw argumentError('Specify each --require-hardware key only once.');
  }
  if (requireHardware.length > 0 && !entry.policies.includes('require-hardware')) {
    throw argumentError(`--require-hardware does not apply to ${entry.command}.`);
  }
  const minComparablePairs =
    values['min-comparable-pairs'] === undefined
      ? null
      : nonnegativeInteger(values['min-comparable-pairs'], 'min-comparable-pairs', 1_000_000);
  if (minComparablePairs !== null && !entry.policies.includes('min-comparable-pairs')) {
    throw argumentError(`--min-comparable-pairs does not apply to ${entry.command}.`);
  }

  return {
    command: entry.command,
    kind: entry.kind,
    args: domain,
    outputDir,
    policy: { requireHardware, minComparablePairs },
    human: values.human ?? false,
    errorFormat,
    timeoutMs: Math.min(
      entry.network?.timeoutMs ?? 120_000,
      values['timeout-ms'] === undefined
        ? 120_000
        : positiveInteger(values['timeout-ms'], 'timeout-ms', 120_000),
    ),
    maxAttempts:
      values['max-attempts'] === undefined
        ? 3
        : positiveInteger(values['max-attempts'], 'max-attempts', 3),
  };
}

export async function getOperation(kind) {
  const entry = FORMAL_OPERATIONS.find((candidate) => candidate.kind === kind);
  if (entry === undefined) throw argumentError(`Unknown operation kind: ${kind}.`);
  const loaded = await import(new URL(entry.module, import.meta.url));
  if (typeof loaded.normalizeArgs !== 'function' || typeof loaded.collect !== 'function') {
    throw new TypeError(`${entry.module} must export normalizeArgs() and collect().`);
  }
  return {
    normalizeArgs: loaded.normalizeArgs,
    collect: loaded.collect,
    contractVersion: entry.contractVersion,
    formats: [...entry.formats],
  };
}
