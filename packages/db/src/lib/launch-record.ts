/**
 * Launch facts recorded in a benchmark's stored logs. srtctl writes every worker's
 * environment and exact command to its sweep log, and engines print their resolved
 * arguments and library versions at startup. Nothing here is inferred from the
 * benchmark config.
 */

export type LaunchStepKind = 'service' | 'worker' | 'frontend' | 'benchmark';

export interface LaunchStep {
  kind: LaunchStepKind;
  /** Worker role (prefill, decode, agg), frontend or service name, or `benchmark`. */
  role: string;
  index: number | null;
  hosts: string[];
  /** The `Env:` line exactly as logged, without the prefix. */
  env: string | null;
  command: string;
}

export interface SrtctlLaunch {
  container: string | null;
  srtctl_version: string | null;
  recipe: string | null;
  resources: { nodes: string | null; cpu: string | null; gpus: string | null };
  steps: LaunchStep[];
}

export type EngineArgsSource = 'vllm-non-default-args' | 'sglang-server-args';

export interface EngineLogFacts {
  engine_args: { source: EngineArgsSource; args: unknown } | null;
  versions: { nccl: string | null; cuda: string | null; tensorrt_llm: string | null };
}

// oxlint-disable-next-line no-control-regex -- terminal logs intentionally contain ANSI controls
const ANSI = /\u001B\[[0-9;]*m/gu;
const INFO = /^\S+ \S+ \[INFO\] (?<body>.*)$/u;
const WORKER =
  /^Starting (?<role>\w+) worker (?<index>\d+) on (?:\d+ nodes \((?<nodes>[^)]*)\).*|(?<host>\S+))$/u;
const SERVICE =
  /^Starting service (?<name>\S+) \((?<type>[^)]*)\) on (?<host>\S+): (?<command>.+)$/u;
const FRONTEND = /^Starting (?<name>.+?) (?<index>\d+) on (?<host>\S+): (?<command>.+)$/u;
// Monitoring sidecars do not affect the measured deployment.
const MONITORING_SERVICE = /exporter|otel-collector/u;

function capture(text: string, pattern: RegExp): string | null {
  return pattern.exec(text)?.groups?.v?.trim() || null;
}

/** Parse an srtctl sweep log. Returns null when the text has no srtctl launch lines. */
export function parseSrtctlSweepLog(text: string): SrtctlLaunch | null {
  const steps: LaunchStep[] = [];
  let pending: LaunchStep | null = null;
  let benchmarkStarted = false;
  for (const rawLine of text.split('\n')) {
    const body = INFO.exec(rawLine.replaceAll(ANSI, '').trimEnd())?.groups?.body;
    if (body === undefined) continue;
    if (body.startsWith('Env: ')) {
      if (pending) pending.env = body.slice(5);
      continue;
    }
    if (body.startsWith('Command: ')) {
      const command = body.slice(9);
      if (pending) {
        steps.push({ ...pending, command });
        pending = null;
      } else if (benchmarkStarted) {
        steps.push({
          kind: 'benchmark',
          role: 'benchmark',
          index: null,
          hosts: [],
          env: null,
          command,
        });
        benchmarkStarted = false;
      }
      continue;
    }
    const worker = WORKER.exec(body)?.groups;
    if (worker) {
      const hosts = worker.nodes
        ? worker.nodes.split(',').map((host) => host.trim())
        : [worker.host!];
      pending = {
        kind: 'worker',
        role: worker.role!,
        index: Number(worker.index),
        hosts,
        env: null,
        command: '',
      };
      continue;
    }
    const service = SERVICE.exec(body)?.groups;
    if (service) {
      if (!MONITORING_SERVICE.test(service.name!)) {
        steps.push({
          kind: 'service',
          role: service.name!,
          index: null,
          hosts: [service.host!],
          env: null,
          command: service.command!,
        });
      }
      continue;
    }
    const frontend = FRONTEND.exec(body)?.groups;
    if (frontend) {
      steps.push({
        kind: 'frontend',
        role: frontend.name!,
        index: Number(frontend.index),
        hosts: [frontend.host!],
        env: null,
        command: frontend.command!,
      });
      continue;
    }
    if (body === 'Starting benchmark') {
      benchmarkStarted = true;
      pending = null;
    }
  }
  if (!steps.some((step) => step.kind === 'worker')) return null;
  return {
    container: capture(text, /^Container: (?<v>.+)$/mu),
    srtctl_version: capture(text, /^ \+ srtctl==(?<v>\S+)/mu),
    recipe: capture(text, /\[INFO\] Loaded config: (?<v>.+)$/mu),
    resources: {
      nodes: capture(text, /^ {2}Nodes: (?<v>.+)$/mu),
      cpu: capture(text, /^ {2}CPU hardware: (?<v>.+)$/mu),
      gpus: capture(text, /^ {2}GPUs: (?<v>.+)$/mu),
    },
    steps,
  };
}

const ENGINE_ARGS: readonly { source: EngineArgsSource; prefix: RegExp }[] = [
  { source: 'vllm-non-default-args', prefix: /non-default args: (?=\{)/u },
  { source: 'sglang-server-args', prefix: /server_args=(?=\{|ServerArgs\()/u },
];

/** Read engine arguments and library versions from the start of an engine log. */
export function parseEngineLog(text: string): EngineLogFacts {
  const clean = text.replaceAll(ANSI, '');
  let engineArgs: EngineLogFacts['engine_args'] = null;
  for (const { source, prefix } of ENGINE_ARGS) {
    const match = prefix.exec(clean);
    if (!match) continue;
    const start = match.index + match[0].length;
    const end = clean.indexOf('\n', start);
    const args = parsePythonLiteral(clean.slice(start, end === -1 ? undefined : end));
    if (args !== undefined) {
      engineArgs = { source, args };
      break;
    }
  }
  const nccl = /NCCL version (?<version>\d[\w.]*)(?:\+cuda(?<cuda>\d[\d.]*))?/u.exec(clean)?.groups;
  return {
    engine_args: engineArgs,
    versions: {
      nccl: nccl?.version ?? null,
      cuda: nccl?.cuda ?? null,
      tensorrt_llm: capture(clean, /TensorRT[- ]LLM version: (?<v>\S+)/u),
    },
  };
}

class LiteralError extends Error {
  override name = 'LiteralError';
}

/**
 * Convert a Python `repr` of dicts, lists, tuples, strings, numbers, booleans, None,
 * and `Name(key=value)` constructor calls into JSON-compatible values. A call becomes
 * an object of its keyword arguments, or the bare value when it wraps one positional
 * argument (`PosixPath('/model')`). Returns undefined when the whole text does not parse.
 */
export function parsePythonLiteral(text: string): unknown {
  let i = 0;
  const skip = () => {
    while (i < text.length && /\s/u.test(text[i]!)) i++;
  };
  const expect = (char: string) => {
    skip();
    if (text[i] !== char) throw new LiteralError(`expected ${char} at ${i}`);
    i++;
  };
  const sequence = (close: string, item: () => void) => {
    skip();
    while (text[i] !== close) {
      item();
      skip();
      if (text[i] === ',') i++;
      else if (text[i] !== close) throw new LiteralError(`expected , or ${close} at ${i}`);
      skip();
    }
    i++;
  };
  const string = (): string => {
    const quote = text[i++]!;
    let out = '';
    while (i < text.length && text[i] !== quote) {
      if (text[i] === '\\') {
        const next = text[i + 1];
        const escapes: Record<string, string> = {
          n: '\n',
          t: '\t',
          r: '\r',
          '\\': '\\',
          "'": "'",
          '"': '"',
        };
        out += next !== undefined && next in escapes ? escapes[next] : `\\${next ?? ''}`;
        i += 2;
      } else {
        out += text[i++];
      }
    }
    if (text[i] !== quote) throw new LiteralError('unterminated string');
    i++;
    return out;
  };
  const value = (): unknown => {
    skip();
    const char = text[i];
    if (char === "'" || char === '"') return string();
    if (char === '{') {
      i++;
      const out: Record<string, unknown> = {};
      sequence('}', () => {
        const key = value();
        expect(':');
        out[String(key)] = value();
      });
      return out;
    }
    if (char === '<') {
      const close = text.indexOf('>', i);
      if (close === -1) throw new LiteralError('unterminated repr');
      const inner = text.slice(i + 1, close);
      i = close + 1;
      return inner.split(':')[0]!.trim();
    }
    if (char === '[' || char === '(') {
      i++;
      const out: unknown[] = [];
      sequence(char === '[' ? ']' : ')', () => out.push(value()));
      return out;
    }
    const number = /^-?(?:\d+\.?\d*(?:e[+-]?\d+)?|inf)/iu.exec(text.slice(i))?.[0];
    if (number) {
      i += number.length;
      const parsed = Number(number.replace(/inf/iu, 'Infinity'));
      return Number.isFinite(parsed) ? parsed : number;
    }
    const name = /^[A-Za-z_][\w.]*/u.exec(text.slice(i))?.[0];
    if (!name) throw new LiteralError(`unexpected ${char ?? 'end'} at ${i}`);
    i += name.length;
    if (name === 'True') return true;
    if (name === 'False') return false;
    if (name === 'None') return null;
    if (text[i] !== '(') return name;
    i++;
    const kwargs: Record<string, unknown> = {};
    const positional: unknown[] = [];
    sequence(')', () => {
      const keyword = /^(?<name>[A-Za-z_]\w*)\s*=(?!=)/u.exec(text.slice(i));
      if (keyword) {
        i += keyword[0].length;
        kwargs[keyword.groups!.name!] = value();
      } else {
        positional.push(value());
      }
    });
    if (Object.keys(kwargs).length === 0 && positional.length <= 1) return positional[0] ?? name;
    return positional.length > 0 ? { ...kwargs, args: positional } : kwargs;
  };
  try {
    const parsed = value();
    skip();
    return i === text.length ? parsed : undefined;
  } catch (error) {
    if (error instanceof LiteralError) return undefined;
    throw error;
  }
}
