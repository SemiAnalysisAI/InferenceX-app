/**
 * How a case's op is split over the devices of one node: its `parallel` arg,
 * `{"tp", "dp", "ep", "dcp"}` with each axis defaulting to 1 (OperatorX
 * core/parallel.py). A case without it ran on one device.
 */

type Args = Record<string, unknown>;

const AXES = ['tp', 'dp', 'ep', 'dcp'] as const;
type Axis = (typeof AXES)[number];

const isObj = (v: unknown): v is Args => typeof v === 'object' && v !== null && !Array.isArray(v);

function axis(args: Args, name: Axis): number {
  const p = isObj(args.parallel) ? args.parallel : {};
  const v = p[name];
  return typeof v === 'number' && Number.isInteger(v) && v > 1 ? v : 1;
}

/**
 * Args with `parallel` spelled one way: only the axes above 1, dropped when none are,
 * so every spelling of one split is the same case.
 */
export function canonicalArgs(args: Args): Args {
  if (!('parallel' in args)) return args;
  const { parallel: _, ...rest } = args;
  const split = Object.fromEntries(
    AXES.flatMap((name) => (axis(args, name) > 1 ? [[name, axis(args, name)]] : [])),
  );
  return Object.keys(split).length > 0 ? { ...rest, parallel: split } : rest;
}

/** `tp8`, `dp8·ep8`, `tp8·dcp8`; empty for one device. */
export function parallelKey(args: Args): string {
  return AXES.flatMap((name) => (axis(args, name) > 1 ? [`${name}${axis(args, name)}`] : [])).join(
    '·',
  );
}

/** `TP8`, `DP8 · EP8`; `1 GPU` for one device. */
export function parallelLabel(key: string): string {
  return key ? key.toUpperCase().replaceAll('·', ' · ') : '1 GPU';
}

/** Ways along every axis, 1 where the case doesn't split. */
export function parallelAxes(args: Args): Record<Axis, number> {
  return {
    tp: axis(args, 'tp'),
    dp: axis(args, 'dp'),
    ep: axis(args, 'ep'),
    dcp: axis(args, 'dcp'),
  };
}

/** Devices a split key runs on: tensor × data parallel ways. */
function devices(key: string): number {
  const ways = (name: string) =>
    Number(new RegExp(`(?:^|·)${name}(\\d+)`, 'u').exec(key)?.[1] ?? 1);
  return ways('tp') * ways('dp');
}

/** Split keys in order: fewest devices first (one device leads), then by key. */
export function compareSplits(a: string, b: string): number {
  return devices(a) - devices(b) || a.localeCompare(b);
}
