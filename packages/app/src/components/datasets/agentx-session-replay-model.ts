export const CONTEXT_CAP = 256_000;
export const WARM_PREFIX = 105_000;

/** The four sentences the replay shows. Each stays up until the next one starts. */
export type Caption = 'warmStart' | 'fanOut' | 'subagentsReturn' | 'mainTurns';

interface Request {
  fresh: number;
  output: number;
}

/** How one step is paced, in ms. `hold` is a pause before the next step. */
interface Pace {
  carry: number;
  prefill: number;
  decode: number;
  hold: number;
  /**
   * Whether the numbers under the chart follow the bar segment by segment. The quick run of
   * main turns sets them once per request instead, or they would flicker.
   */
  staged: boolean;
}

const PACE = {
  open: { carry: 350, prefill: 500, decode: 350, hold: 300, staged: true },
  turn: { carry: 350, prefill: 450, decode: 300, hold: 100, staged: true },
  fanOut: { carry: 400, prefill: 600, decode: 350, hold: 650, staged: true },
  return: { carry: 650, prefill: 500, decode: 350, hold: 1_100, staged: true },
} satisfies Record<string, Pace>;

/** The look-alike main turns: each a little quicker than the one before, down to a floor. */
function runPace(position: number): Pace {
  const total = Math.max(500, 900 - 100 * position);
  return {
    carry: Math.round(total * 0.45),
    prefill: Math.round(total * 0.33),
    decode: Math.round(total * 0.22),
    hold: 0,
    staged: false,
  };
}

type Step = { note?: Caption; pace: keyof typeof PACE | 'run' } & (
  | ({ kind: 'main' } & Request)
  | { kind: 'fanOut'; requests: Request[] }
);

const STEPS: Step[] = [
  { kind: 'main', note: 'warmStart', pace: 'open', fresh: 3_200, output: 444 },
  { kind: 'main', pace: 'turn', fresh: 14_800, output: 160 },
  { kind: 'main', pace: 'turn', fresh: 2_100, output: 620 },
  {
    kind: 'fanOut',
    note: 'fanOut',
    pace: 'fanOut',
    requests: [
      { fresh: 9_400, output: 280 },
      { fresh: 7_900, output: 350 },
      { fresh: 11_200, output: 190 },
    ],
  },
  {
    kind: 'fanOut',
    pace: 'fanOut',
    requests: [
      { fresh: 16_500, output: 1_100 },
      { fresh: 6_300, output: 930 },
      { fresh: 12_800, output: 1_420 },
    ],
  },
  { kind: 'main', note: 'subagentsReturn', pace: 'return', fresh: 4_300, output: 1_380 },
  { kind: 'main', note: 'mainTurns', pace: 'run', fresh: 21_600, output: 310 },
  { kind: 'main', pace: 'run', fresh: 3_300, output: 2_050 },
  { kind: 'main', pace: 'run', fresh: 1_100, output: 444 },
  { kind: 'main', pace: 'run', fresh: 17_200, output: 260 },
  { kind: 'main', pace: 'run', fresh: 9_700, output: 150 },
  { kind: 'main', pace: 'run', fresh: 2_400, output: 1_760 },
  { kind: 'main', pace: 'run', fresh: 24_100, output: 530 },
  { kind: 'main', pace: 'run', fresh: 4_100, output: 880 },
  { kind: 'main', pace: 'run', fresh: 12_900, output: 120 },
  { kind: 'main', pace: 'run', fresh: 1_600, output: 390 },
];

export interface ReplayRow {
  step: number;
  lane: number | null;
  cached: number;
  fresh: number;
  output: number;
}

export interface ReplayStep {
  note: Caption | undefined;
  pace: Pace;
  rows: ReplayRow[];
}

export function buildReplay(steps: Step[] = STEPS): ReplayStep[] {
  let mainContext = WARM_PREFIX;
  const subContext: number[] = [];
  let run = 0;
  return steps.map((step, index) => {
    const pace = step.pace === 'run' ? runPace(run++) : PACE[step.pace];
    if (step.kind === 'main') {
      const row = {
        step: index,
        lane: null,
        cached: mainContext,
        fresh: step.fresh,
        output: step.output,
      };
      mainContext += step.fresh + step.output;
      return { note: step.note, pace, rows: [row] };
    }
    const rows = step.requests.map((request, lane) => {
      const cached = subContext[lane] ?? 0;
      subContext[lane] = cached + request.fresh + request.output;
      return { step: index, lane, cached, ...request };
    });
    return { note: step.note, pace, rows };
  });
}

export const REPLAY = buildReplay();
/** Every request in the order it is sent. */
export const REPLAY_ROWS = REPLAY.flatMap((step) => step.rows);

/**
 * The order the rows are drawn in. Requests of consecutive fan-out steps are grouped by
 * subagent, so each subagent's second request sits directly under its first.
 */
function displayRows(replay: ReplayStep[]): ReplayRow[] {
  const rows: ReplayRow[] = [];
  let fanOut: ReplayRow[] = [];
  const flush = () => {
    rows.push(...fanOut.toSorted((a, b) => (a.lane ?? 0) - (b.lane ?? 0) || a.step - b.step));
    fanOut = [];
  };
  for (const step of replay) {
    if (step.rows.some((row) => row.lane === null)) {
      flush();
      rows.push(...step.rows);
    } else {
      fanOut.push(...step.rows);
    }
  }
  flush();
  return rows;
}

export const DISPLAY_ROWS = displayRows(REPLAY);

/**
 * How many drawn rows above `rows[index]` the previous request of the same agent sits. Its
 * whole context is this request's cached prefix, so the bar is carried down from there. 0 when
 * the agent has no earlier request in the replay.
 */
export function carryDistance(rows: ReplayRow[], index: number): number {
  for (let above = index - 1; above >= 0; above -= 1) {
    if (rows[above].lane === rows[index].lane) return index - above;
  }
  return 0;
}

/** The finished chart fades out for this long before a replay starts drawing. */
export const LEAD_OUT_MS = 250;

export interface StepTiming {
  /** The cached prefix starts arriving. */
  start: number;
  /** The uncached input starts growing. */
  prefill: number;
  /** The output starts growing. */
  decode: number;
  /** The next step starts (or the replay ends). */
  end: number;
}

function buildTimeline(replay: ReplayStep[]): StepTiming[] {
  let clock = LEAD_OUT_MS;
  return replay.map(({ pace }) => {
    const start = clock;
    const prefill = start + pace.carry;
    const decode = prefill + pace.prefill;
    clock = decode + pace.decode + pace.hold;
    return { start, prefill, decode, end: clock };
  });
}

/** When each step's segments start, in ms since the replay began. */
export const TIMELINE = buildTimeline(REPLAY);
export const DURATION_MS = TIMELINE.at(-1)?.end ?? LEAD_OUT_MS;

export interface Frame {
  /** `rest`: the finished chart. `out`: the finished chart fading away. `play`: drawing. */
  phase: 'rest' | 'out' | 'play';
  /** The step being drawn; the last step when not playing. */
  step: number;
  caption: Caption;
  /**
   * The numbers under the chart, always for the one step being drawn. On a staged step `fresh`
   * and `output` are null until their segment starts moving, so no number runs ahead of its bar.
   */
  cached: number;
  fresh: number | null;
  output: number | null;
  /** Session cache hit through the last request whose input is drawn; null before the first. */
  hit: number | null;
}

export function sessionCacheHit(rows: ReplayRow[], throughStep: number): number {
  let cached = 0;
  let input = 0;
  for (const row of rows) {
    if (row.step > throughStep) continue;
    cached += row.cached;
    input += row.cached + row.fresh;
  }
  return input > 0 ? cached / input : 0;
}

function stepTotal(step: number, key: 'cached' | 'fresh' | 'output'): number {
  return REPLAY[step].rows.reduce((sum, row) => sum + row[key], 0);
}

function captionAt(step: number): Caption {
  for (let index = step; index >= 0; index -= 1) {
    const { note } = REPLAY[index];
    if (note) return note;
  }
  return 'warmStart';
}

const LAST_STEP = REPLAY.length - 1;

export const REST_FRAME: Frame = {
  phase: 'rest',
  step: LAST_STEP,
  caption: captionAt(LAST_STEP),
  cached: stepTotal(LAST_STEP, 'cached'),
  fresh: stepTotal(LAST_STEP, 'fresh'),
  output: stepTotal(LAST_STEP, 'output'),
  hit: sessionCacheHit(REPLAY_ROWS, LAST_STEP),
};

/** What the replay shows `time` ms after it began. Anything outside the replay is the finished chart. */
export function frameAt(time: number): Frame {
  if (!(time >= 0 && time < DURATION_MS)) return REST_FRAME;
  if (time < LEAD_OUT_MS) return { ...REST_FRAME, phase: 'out' };
  const step = TIMELINE.findIndex((timing) => time < timing.end);
  const { staged } = REPLAY[step].pace;
  const inputDrawn = !staged || time >= TIMELINE[step].prefill;
  const outputDrawn = !staged || time >= TIMELINE[step].decode;
  const hitThrough = inputDrawn ? step : step - 1;
  return {
    phase: 'play',
    step,
    caption: captionAt(step),
    cached: stepTotal(step, 'cached'),
    fresh: inputDrawn ? stepTotal(step, 'fresh') : null,
    output: outputDrawn ? stepTotal(step, 'output') : null,
    hit: hitThrough < 0 ? null : sessionCacheHit(REPLAY_ROWS, hitThrough),
  };
}

const CHANGES = [
  ...new Set([
    LEAD_OUT_MS,
    ...TIMELINE.flatMap((timing, step) =>
      REPLAY[step].pace.staged ? [timing.start, timing.prefill, timing.decode] : [timing.start],
    ),
    DURATION_MS,
  ]),
].toSorted((a, b) => a - b);

/** The next moment `frameAt` returns something different, or null once the replay is over. */
export function nextChange(time: number): number | null {
  return CHANGES.find((change) => change > time) ?? null;
}
