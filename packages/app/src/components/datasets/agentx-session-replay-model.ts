export const CONTEXT_CAP = 256_000;
export const WARM_PREFIX = 105_000;

export type StepNote = 'warmStart' | 'fanOut' | 'subagentsReturn';

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
  { kind: 'main', fresh: 21_600, output: 310 },
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

export type Phase = 'cached' | 'prefill' | 'decode';

export interface Frame {
  step: number;
  phase: Phase;
}

export const FIRST_FRAME: Frame = { step: 0, phase: 'cached' };
export const LAST_FRAME: Frame = { step: REPLAY.length - 1, phase: 'decode' };

const PHASE_MS: Record<Phase, number> = { cached: 220, prefill: 580, decode: 530 };
const LOOP_HOLD_MS = 2_800;

export function nextFrame(frame: Frame): Frame {
  if (frame.phase === 'cached') return { step: frame.step, phase: 'prefill' };
  if (frame.phase === 'prefill') return { step: frame.step, phase: 'decode' };
  return frame.step >= LAST_FRAME.step ? FIRST_FRAME : { step: frame.step + 1, phase: 'cached' };
}

export function frameDuration(frame: Frame): number {
  return frame.step === LAST_FRAME.step && frame.phase === 'decode'
    ? LOOP_HOLD_MS
    : PHASE_MS[frame.phase];
}

export function visibleTokens(
  row: ReplayRow,
  frame: Frame,
): Omit<ReplayRow, 'step' | 'lane'> | null {
  if (row.step > frame.step) return null;
  if (row.step < frame.step) return row;
  return {
    cached: row.cached,
    fresh: frame.phase === 'cached' ? 0 : row.fresh,
    output: frame.phase === 'decode' ? row.output : 0,
  };
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
