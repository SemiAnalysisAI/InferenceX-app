import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { gpusPerMegawatt } from '@/lib/power/power-basis';
import {
  estimateChassisPower,
  estimateRackPower,
  isRackPowerHardware,
  type RackPowerHardware,
  type SystemPowerCategory,
  type SystemPowerHardware,
  type SystemPowerOperatingState,
  systemUnitGpuCount,
} from '@/lib/power/system-power-model';

import { snapTo } from './widget-hash';

/**
 * The power ladder: one GPU's measured watts extended through every modeled part to IT power,
 * then through PUE to facility power, with the rated marks (TDP, all-in provisioned) beside it.
 * The hero, the load strip and the worked example all draw from this one shape.
 */

export const LADDER_HARDWARE = ['b200', 'gb200', 'mi355x'] as const satisfies readonly (
  | SystemPowerHardware
  | RackPowerHardware
)[];
export type LadderHardware = (typeof LADDER_HARDWARE)[number];
export const DEFAULT_LADDER_HARDWARE: LadderHardware = 'b200';

/** Interactivity the hero and the worked example pick their measured point around. */
export const LADDER_TARGET_INTERACTIVITY = 50;
/** When no validated point exists for a chip, the ladder runs on this share of TDP, labelled. */
export const LADDER_EXAMPLE_TDP_FRACTION = 0.6;

const AGENTIC: SystemPowerOperatingState = { workload: 'agentic', scaleOut: false };

/** The IT parts a ladder stacks; the facility overhead is the PUE step past IT. */
export type LadderCategory = Exclude<SystemPowerCategory, 'measuredCpu' | 'facility'>;

export interface LadderSegment {
  category: LadderCategory;
  /** Solid = measured telemetry, outlined = modeled by the power model. */
  kind: 'measured' | 'modeled';
  /** Watts per GPU. */
  watts: number;
}

/** The parts one board carries, kept adjacent at the start of the ladder. */
export interface LadderBoard {
  categories: readonly LadderCategory[];
  /** Watts per GPU of those parts. */
  watts: number;
}

export interface Ladder {
  hardware: LadderHardware;
  gpuWatts: number;
  /** GPU first, then the rest of its board, then the other modeled parts by size. */
  segments: LadderSegment[];
  /** NVL72's Bianca board: two GPUs with one Grace CPU and its LPDDR5X. */
  board: LadderBoard | null;
  itWatts: number;
  facilityWatts: number;
  pue: number;
  tdpWatts: number;
  allInWatts: number;
  gpusPerMw: number;
  percentOfTdp: number;
}

const MODELED_CATEGORIES = [
  'cpu',
  'memory',
  'nic',
  'nvswitch',
  'storage',
  'other',
  'fans',
  'psuLoss',
  'network',
] as const satisfies readonly LadderCategory[];

const BIANCA_BOARD = ['gpu', 'cpu', 'memory'] as const satisfies readonly LadderCategory[];

const hardwareTdp = (hardware: LadderHardware): number => HW_REGISTRY[hardware].tdp;

/** Runs the pinned power model in its agentic state with the Grace socket modeled. */
export function buildLadder(hardware: LadderHardware, gpuWatts: number): Ladder | null {
  const gpuCount = systemUnitGpuCount(hardware);
  const unit = isRackPowerHardware(hardware)
    ? estimateRackPower(hardware, gpuWatts, null, AGENTIC)
    : estimateChassisPower(hardware, gpuWatts * gpuCount, AGENTIC);
  if (!unit) return null;
  const perGpu = (watts: number) => watts / gpuCount;
  const boardCategories: readonly LadderCategory[] = isRackPowerHardware(hardware)
    ? BIANCA_BOARD
    : [];
  const boardRank = (category: LadderCategory) => {
    const index = boardCategories.indexOf(category);
    return index === -1 ? boardCategories.length : index;
  };
  const modeled = MODELED_CATEGORIES.map((category) => ({
    category,
    kind: 'modeled' as const,
    watts: perGpu(unit.breakdown[category]),
  }))
    .filter((segment) => segment.watts > 0)
    .toSorted((a, b) => boardRank(a.category) - boardRank(b.category) || b.watts - a.watts);
  const segments: LadderSegment[] = [
    { category: 'gpu', kind: 'measured', watts: perGpu(unit.breakdown.gpu) },
    ...modeled,
  ];
  const boardSegments = segments.filter((segment) => boardCategories.includes(segment.category));
  const itWatts = perGpu(unit.itWatts);
  return {
    hardware,
    gpuWatts,
    segments,
    board:
      boardSegments.length > 0
        ? {
            categories: boardSegments.map((segment) => segment.category),
            watts: boardSegments.reduce((sum, segment) => sum + segment.watts, 0),
          }
        : null,
    itWatts,
    facilityWatts: perGpu(unit.facilityWatts),
    pue: unit.pue,
    tdpWatts: hardwareTdp(hardware),
    allInWatts: HW_REGISTRY[hardware].power * 1000,
    gpusPerMw: gpusPerMegawatt(itWatts) ?? Number.POSITIVE_INFINITY,
    percentOfTdp: (gpuWatts / hardwareTdp(hardware)) * 100,
  };
}

export const ladderLabel = (hardware: LadderHardware): string => HW_REGISTRY[hardware].label;

export function exampleGpuWatts(hardware: LadderHardware): number {
  return Math.round(hardwareTdp(hardware) * LADDER_EXAMPLE_TDP_FRACTION);
}

export const encodeLadderHardware = (hardware: LadderHardware): string => hardware;
export const decodeLadderHardware = (raw: string | null): LadderHardware =>
  snapTo(raw ?? undefined, LADDER_HARDWARE, DEFAULT_LADDER_HARDWARE);

export interface LoadSweep {
  tdpWatts: number;
  /** Per-GPU watts of every segment at each step, in ladder order of the TDP step. */
  tracks: { category: LadderCategory; kind: 'measured' | 'modeled'; values: number[] }[];
}

/** Runs the model from idle to TDP so the load strip can show which parts follow the GPU. */
export function loadSweep(hardware: LadderHardware, steps = 20): LoadSweep {
  const tdpWatts = hardwareTdp(hardware);
  const gpuWatts = Array.from({ length: steps + 1 }, (_, index) =>
    Math.round((tdpWatts * index) / steps),
  );
  const ladders = gpuWatts.map((watts) => buildLadder(hardware, watts));
  const order = ladders.at(-1)?.segments ?? [];
  const tracks = order.map(({ category, kind }) => ({
    category,
    kind,
    values: ladders.map(
      (ladder) => ladder?.segments.find((segment) => segment.category === category)?.watts ?? 0,
    ),
  }));
  return { tdpWatts, tracks };
}

/** True when a track changes by more than one watt per GPU across the sweep. */
export function trackMoves(values: readonly number[]): boolean {
  return Math.max(...values) - Math.min(...values) > 1;
}

export function snapLoadWatts(raw: string | null, hardware: LadderHardware): number {
  const tdp = hardwareTdp(hardware);
  const parsed = Number(raw);
  if (raw === null || raw === '' || !Number.isFinite(parsed)) return exampleGpuWatts(hardware);
  return Math.min(tdp, Math.max(0, Math.round(parsed)));
}

export interface StaggerLabel {
  key: string;
  x: number;
  width: number;
  anchor: 'start' | 'middle' | 'end';
}

/** Left edge of a label given its anchor. */
export function labelLeft(label: StaggerLabel): number {
  return label.anchor === 'start'
    ? label.x
    : label.anchor === 'middle'
      ? label.x - label.width / 2
      : label.x - label.width;
}

/** Assigns each label the first row where it overlaps no earlier label; rows are 0-based. */
export function staggerLabels(labels: readonly StaggerLabel[], gap = 8): Map<string, number> {
  const rows = new Map<string, number>();
  const occupied: [number, number][][] = [];
  for (const label of [...labels].toSorted((a, b) => labelLeft(a) - labelLeft(b))) {
    const left = labelLeft(label);
    const right = left + label.width;
    let row = 0;
    while (occupied[row]?.some(([a, b]) => left < b + gap && right > a - gap)) row += 1;
    (occupied[row] ??= []).push([left, right]);
    rows.set(label.key, row);
  }
  return rows;
}
