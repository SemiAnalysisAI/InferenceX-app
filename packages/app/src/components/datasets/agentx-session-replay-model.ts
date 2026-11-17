export const CONTEXT_CAP = 256_000;
export const WARM_PREFIX = 105_000;

export type StepNote = 'warmStart' | 'fanOut' | 'subagentsReturn' | 'mainTurns';

interface Request {
  fresh: number;
  output: number;
}

type Step =
  | ({ kind: 'main'; note?: StepNote } & Request)
  | { kind: 'fanOut'; note?: StepNote; requests: Request[] };

const STEPS: Step[] = [
  { kind: 'main', note: 'warmStart', fresh: 3_200, output: 444 },
  { kind: 'main', fresh: 14_800, output: 160 },
  { kind: 'main', fresh: 2_100, output: 620 },
  {
    kind: 'fanOut',
    note: 'fanOut',
    requests: [
      { fresh: 9_400, output: 280 },
      { fresh: 7_900, output: 350 },
      { fresh: 11_200, output: 190 },
    ],
  },
  {
    kind: 'fanOut',
    requests: [
      { fresh: 16_500, output: 1_100 },
      { fresh: 6_300, output: 930 },
      { fresh: 12_800, output: 1_420 },
    ],
  },
  { kind: 'main', note: 'subagentsReturn', fresh: 4_300, output: 1_380 },
  { kind: 'main', note: 'mainTurns', fresh: 21_600, output: 310 },
  { kind: 'main', fresh: 3_300, output: 2_050 },
  { kind: 'main', fresh: 1_100, output: 444 },
  { kind: 'main', fresh: 17_200, output: 260 },
  { kind: 'main', fresh: 9_700, output: 150 },
  { kind: 'main', fresh: 2_400, output: 1_760 },
  { kind: 'main', fresh: 24_100, output: 530 },
  { kind: 'main', fresh: 4_100, output: 880 },
  { kind: 'main', fresh: 12_900, output: 120 },
  { kind: 'main', fresh: 1_600, output: 390 },
];

export interface ReplayRow {
  step: number;
  lane: number | null;
  cached: number;
  fresh: number;
  output: number;
}

export interface ReplayStep {
  note: StepNote | undefined;
  rows: ReplayRow[];
}

export function buildReplay(steps: Step[] = STEPS): ReplayStep[] {
  let mainContext = WARM_PREFIX;
  const subContext: number[] = [];
  return steps.map((step, index) => {
    if (step.kind === 'main') {
      const row = { step: index, lane: null, cached: mainContext, ...step };
      mainContext += step.fresh + step.output;
      return { note: step.note, rows: [row] };
    }
    const rows = step.requests.map((request, lane) => {
      const cached = subContext[lane] ?? 0;
      subContext[lane] = cached + request.fresh + request.output;
      return { step: index, lane, cached, ...request };
    });
    return { note: step.note, rows };
  });
}

export const REPLAY = buildReplay();
export const REPLAY_ROWS = REPLAY.flatMap((step) => step.rows);

/** The note showing at each step: a step without one keeps the note before it. */
export const NOTES = REPLAY.map(
  (_, step) => REPLAY.findLast((other, index) => index <= step && other.note)?.note ?? 'warmStart',
);
const FAN_OUT = NOTES.indexOf('fanOut');
const RUN = NOTES.indexOf('mainTurns');

/**
 * Rows in drawing order, each subagent's second request under its first. `carry` is how many
 * rows up the same agent's previous request sits (0 for none): that whole bar is this row's
 * cached prefix.
 */
export const DISPLAY_ROWS = REPLAY_ROWS.toSorted(
  (a, b) =>
    (a.lane === null ? a.step : FAN_OUT) - (b.lane === null ? b.step : FAN_OUT) ||
    (a.lane ?? 0) - (b.lane ?? 0) ||
    a.step - b.step,
).map((row, index, rows) => {
  const from = rows.findLastIndex((other, at) => at < index && other.lane === row.lane);
  return { ...row, carry: from === -1 ? 0 : index - from };
});

/** The finished chart fades out for this long before a replay draws. */
export const LEAD_OUT_MS = 250;

/** Carry, prefill, decode and hold time of a step under each note, in ms. */
const PACE: Record<StepNote, number[]> = {
  warmStart: [350, 450, 300, 200],
  fanOut: [400, 600, 350, 650],
  subagentsReturn: [650, 500, 350, 1_100],
  // Shares of a turn that shortens from 900 ms to 500 ms through the look-alike main turns.
  mainTurns: [0.45, 0.33, 0.22, 0],
};

let clock = LEAD_OUT_MS;
/** When each step's cached prefix, prefill and output start, and when it is drawn and over. */
export const TIMELINE = NOTES.map((note, step) => {
  const turn = Math.max(500, 900 - 100 * (step - RUN));
  const [carry, prefill, decode, hold] =
    note === 'mainTurns' ? PACE.mainTurns.map((share) => Math.round(share * turn)) : PACE[note];
  const start = clock;
  clock += carry + prefill + decode + hold;
  return {
    start,
    prefill: start + carry,
    decode: start + carry + prefill,
    drawn: clock - hold,
    end: clock,
  };
});
export const DURATION_MS = clock;

export interface Frame {
  /** `rest` is the finished chart, `out` is that chart fading away, `play` is drawing. */
  phase: 'rest' | 'out' | 'play';
  step: number;
  /** The numbers under the chart for `step`; null until that bar segment starts moving. */
  cached: number;
  fresh: number | null;
  output: number | null;
  /** Session cache hit through the last request whose input is drawn. */
  hit: number | null;
}

function drawing(time: number): Frame {
  const step = TIMELINE.findIndex((timing) => time < timing.end);
  const total = (key: 'cached' | 'fresh' | 'output') =>
    REPLAY[step].rows.reduce((sum, row) => sum + row[key], 0);
  // The quick main turns set every number at once, or they would flicker.
  const quick = step >= RUN;
  const input = quick || time >= TIMELINE[step].prefill;
  return {
    phase: 'play',
    step,
    cached: total('cached'),
    fresh: input ? total('fresh') : null,
    output: quick || time >= TIMELINE[step].decode ? total('output') : null,
    hit: input || step > 0 ? sessionCacheHit(REPLAY_ROWS, input ? step : step - 1) : null,
  };
}

export const REST_FRAME: Frame = { ...drawing(DURATION_MS - 1), phase: 'rest' };

/** What the replay shows `time` ms after it began; outside a replay, the finished chart. */
export function frameAt(time: number): Frame {
  if (!(time >= 0 && time < DURATION_MS)) return REST_FRAME;
  return time < LEAD_OUT_MS ? { ...REST_FRAME, phase: 'out' } : drawing(time);
}

/** The next moment `frameAt` can change, or null once the replay is over. */
export function nextChange(time: number): number | null {
  return (
    TIMELINE.flatMap((timing) => Object.values(timing)).find((moment) => moment > time) ?? null
  );
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
