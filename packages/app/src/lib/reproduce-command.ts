import { resolveFrameworkAlias } from '@semianalysisai/inferencex-constants';

/**
 * Pure description of a benchmark config — the bits that actually feed the
 * launch command. Everything is optional so callers can pass a partial
 * `InferenceData` row or a partial `AggDataEntry`; the generators read what
 * they need and emit a clear "missing field" comment for anything absent.
 */
export interface ReproduceConfig {
  framework: string;
  model?: string;
  precision?: string;
  tp?: number;
  ep?: number;
  dp_attention?: boolean;
  spec_decoding?: string;
  disagg?: boolean;
  prefill_tp?: number;
  prefill_ep?: number;
  prefill_dp_attention?: boolean;
  prefill_num_workers?: number;
  num_prefill_gpu?: number;
  decode_tp?: number;
  decode_ep?: number;
  decode_dp_attention?: boolean;
  decode_num_workers?: number;
  num_decode_gpu?: number;
  conc?: number;
  isl?: number;
  osl?: number;
  image?: string;
}

export type LaunchCommandKind = 'single' | 'disagg' | 'fallback';

/** Result of `buildLaunchCommand`. */
export interface LaunchCommandResult {
  /** "single", "disagg" (prefill + decode workers), or "fallback" (no recipe). */
  kind: LaunchCommandKind;
  /** The canonical framework key the command was built for. */
  framework: string;
  /** Single-command output (kind === 'single'). */
  command?: string;
  /** Disagg output: ordered list of stitched commands. */
  commands?: { label: string; command: string }[];
  /**
   * Fallback explanation shown in the drawer when we can't render a launch
   * command — typically because the framework is a multi-process orchestrator
   * (Dynamo, ATOM, MoRI) or the field set is missing.
   */
  fallbackReason?: string;
}

/** Frameworks that orchestrate multiple worker processes — too much to inline. */
const COMPOUND_FRAMEWORKS = new Set([
  'atom',
  'mori-sglang',
  'dynamo-vllm',
  'dynamo-trt',
  'dynamo-sglang',
]);

const FALLBACK_REASONS: Record<string, string> = {
  atom: 'ATOM orchestrates several worker processes — see the Config JSON tab for the full launch graph.',
  'mori-sglang':
    'MoRI SGLang spans prefill / decode / scheduler workers — see the Config JSON tab for the full launch graph.',
  'dynamo-vllm':
    'Dynamo vLLM is launched via the Dynamo runtime against multiple workers — see the Config JSON tab for the full launch graph.',
  'dynamo-trt':
    'Dynamo TRT is launched via the Dynamo runtime against multiple workers — see the Config JSON tab for the full launch graph.',
  'dynamo-sglang':
    'Dynamo SGLang is launched via the Dynamo runtime against multiple workers — see the Config JSON tab for the full launch graph.',
};

/** Format a single-line CLI command from an array of args, escaping where needed. */
const joinArgs = (args: string[]): string => args.filter(Boolean).map(quoteIfNeeded).join(' ');

const QUOTE_RE = /[^A-Za-z0-9._\-/=:,@%+]/;
const quoteIfNeeded = (s: string): string => {
  if (s === '') return "''";
  // Already a quoted block (e.g. a multi-flag chunk) — leave as-is.
  if (s.includes('\n') || s.startsWith('--')) return s;
  if (!QUOTE_RE.test(s)) return s;
  return `'${s.replaceAll("'", String.raw`'\''`)}'`;
};

/** Format a chunk of CLI args as one indented line per logical group. */
const formatChunks = (chunks: string[][]): string =>
  chunks.map((chunk, i) => (i === 0 ? joinArgs(chunk) : `  ${joinArgs(chunk)}`)).join(' \\\n');

const baseChunks = (cfg: ReproduceConfig): { precision: string; model: string } => ({
  precision: cfg.precision ?? '<precision>',
  model: cfg.model ?? '<model>',
});

const buildVllmCommand = (cfg: ReproduceConfig): string => {
  const { model, precision } = baseChunks(cfg);
  const tp = cfg.tp ?? 1;
  const flags: string[][] = [
    ['vllm', 'serve', model],
    ['--dtype', precision],
    ['--tensor-parallel-size', String(tp)],
  ];
  if (cfg.ep !== undefined && cfg.ep > 0) {
    flags.push(['--expert-parallel-size', String(cfg.ep)]);
  }
  if (cfg.dp_attention) flags.push(['--data-parallel-attention']);
  if (cfg.spec_decoding && cfg.spec_decoding !== 'none') {
    flags.push(['--speculative-config', JSON.stringify({ method: cfg.spec_decoding })]);
  }
  flags.push(['--max-num-seqs', String(cfg.conc ?? 256)]);
  if (cfg.isl !== undefined && cfg.osl !== undefined) {
    flags.push(['--max-model-len', String(cfg.isl + cfg.osl)]);
  }
  return formatChunks(flags);
};

const buildSglangCommand = (cfg: ReproduceConfig): string => {
  const { model, precision } = baseChunks(cfg);
  const tp = cfg.tp ?? 1;
  const flags: string[][] = [
    ['python', '-m', 'sglang.launch_server'],
    ['--model-path', model],
    ['--dtype', precision],
    ['--tp', String(tp)],
  ];
  if (cfg.ep !== undefined && cfg.ep > 0) {
    flags.push(['--ep-size', String(cfg.ep)]);
  }
  if (cfg.dp_attention) flags.push(['--enable-dp-attention']);
  if (cfg.spec_decoding && cfg.spec_decoding !== 'none') {
    flags.push(['--speculative-algorithm', cfg.spec_decoding.toUpperCase()]);
  }
  flags.push(['--max-running-requests', String(cfg.conc ?? 256)]);
  if (cfg.isl !== undefined && cfg.osl !== undefined) {
    flags.push(['--context-length', String(cfg.isl + cfg.osl)]);
  }
  return formatChunks(flags);
};

const buildTrtCommand = (cfg: ReproduceConfig): string => {
  const { model, precision } = baseChunks(cfg);
  const tp = cfg.tp ?? 1;
  const flags: string[][] = [
    ['trtllm-serve', model],
    ['--backend', 'pytorch'],
    ['--tp_size', String(tp)],
    ['--kv_cache_dtype', precision],
  ];
  if (cfg.ep !== undefined && cfg.ep > 0) {
    flags.push(['--ep_size', String(cfg.ep)]);
  }
  if (cfg.spec_decoding && cfg.spec_decoding !== 'none') {
    flags.push([`--speculative_config={"decoding_type":"${cfg.spec_decoding.toUpperCase()}"}`]);
  }
  flags.push(['--max_batch_size', String(cfg.conc ?? 256)]);
  if (cfg.isl !== undefined && cfg.osl !== undefined) {
    flags.push(['--max_seq_len', String(cfg.isl + cfg.osl)]);
  }
  return formatChunks(flags);
};

const SIMPLE_BUILDERS: Record<'vllm' | 'sglang' | 'trt', (cfg: ReproduceConfig) => string> = {
  vllm: buildVllmCommand,
  sglang: buildSglangCommand,
  trt: buildTrtCommand,
};

const buildDisaggCommands = (
  cfg: ReproduceConfig,
  framework: 'vllm' | 'sglang' | 'trt',
): { label: string; command: string }[] => {
  const prefill: ReproduceConfig = {
    ...cfg,
    tp: cfg.prefill_tp ?? cfg.tp,
    ep: cfg.prefill_ep ?? cfg.ep,
    dp_attention: cfg.prefill_dp_attention ?? cfg.dp_attention,
  };
  const decode: ReproduceConfig = {
    ...cfg,
    tp: cfg.decode_tp ?? cfg.tp,
    ep: cfg.decode_ep ?? cfg.ep,
    dp_attention: cfg.decode_dp_attention ?? cfg.dp_attention,
  };
  const builder = SIMPLE_BUILDERS[framework];
  // Disagg launch lines append a role flag so the user can paste both into
  // separate terminals — this matches how SGLang & vLLM disagg expects
  // prefill / decode workers to be tagged.
  const roleFlag = framework === 'trt' ? '--disaggregate_role' : '--disagg-role';
  const prefillWorkers = cfg.prefill_num_workers ?? 1;
  const decodeWorkers = cfg.decode_num_workers ?? 1;
  return [
    {
      label: `Prefill workers (×${prefillWorkers}, ${cfg.num_prefill_gpu ?? '?'} GPUs)`,
      command: `${builder(prefill)} \\\n  ${roleFlag} prefill`,
    },
    {
      label: `Decode workers (×${decodeWorkers}, ${cfg.num_decode_gpu ?? '?'} GPUs)`,
      command: `${builder(decode)} \\\n  ${roleFlag} decode`,
    },
  ];
};

/**
 * Pure function from `(framework, config)` → CLI launch command string.
 *
 * Returns one of three shapes:
 * - `kind: "single"` — a single command (most non-disagg runs).
 * - `kind: "disagg"` — two stitched commands for prefill / decode workers.
 * - `kind: "fallback"` — no launch command available; the drawer should
 *   point the user at the Config JSON tab. `fallbackReason` explains why.
 *
 * The function is intentionally side-effect-free so it can be unit-tested
 * per framework and reused for future diffing between runs.
 */
export function buildLaunchCommand(
  framework: string,
  cfg: Omit<ReproduceConfig, 'framework'>,
): LaunchCommandResult {
  const canonical = resolveFrameworkAlias(framework);

  if (COMPOUND_FRAMEWORKS.has(canonical)) {
    return {
      kind: 'fallback',
      framework: canonical,
      fallbackReason:
        FALLBACK_REASONS[canonical] ??
        'This framework orchestrates several worker processes — see the Config JSON tab.',
    };
  }

  if (canonical !== 'vllm' && canonical !== 'sglang' && canonical !== 'trt') {
    return {
      kind: 'fallback',
      framework: canonical,
      fallbackReason: `No launch-command recipe is registered for "${canonical}" yet — see the Config JSON tab.`,
    };
  }

  const fullCfg: ReproduceConfig = { ...cfg, framework: canonical };

  if (cfg.disagg) {
    return {
      kind: 'disagg',
      framework: canonical,
      commands: buildDisaggCommands(fullCfg, canonical),
    };
  }

  return {
    kind: 'single',
    framework: canonical,
    command: SIMPLE_BUILDERS[canonical](fullCfg),
  };
}
