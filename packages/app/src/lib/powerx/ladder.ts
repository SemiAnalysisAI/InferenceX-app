import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import {
  type BasisComponent,
  type BasisHardware,
  computeBasis,
  defaultBasisSelection,
  hardwareAllInWatts,
  hardwareTdp,
} from './power-basis';
import { snapTo } from './widget-hash';

/**
 * The power ladder: one GPU's measured watts extended through every modeled part to IT power,
 * then through PUE to facility power, with the rated marks (TDP, all-in provisioned) beside it.
 * The hero, the load strip and the worked example all draw from this one shape.
 */

export const LADDER_HARDWARE = [
  'b200',
  'gb200',
  'mi355x',
] as const satisfies readonly BasisHardware[];
export type LadderHardware = (typeof LADDER_HARDWARE)[number];
export const DEFAULT_LADDER_HARDWARE: LadderHardware = 'b200';

/** Interactivity the hero and the worked example pick their measured point around. */
export const LADDER_TARGET_INTERACTIVITY = 50;
/** When no validated point exists for a chip, the ladder runs on this share of TDP, labelled. */
export const LADDER_EXAMPLE_TDP_FRACTION = 0.6;

export const PART_GROUPS = [
  'cpu',
  'memory',
  'network',
  'nvswitch',
  'pcie',
  'storage',
  'fans',
  'psu',
  'other',
] as const;
export type PartGroup = (typeof PART_GROUPS)[number];

/** Buckets a power_model leaf component by name; names are the port's own identifiers. */
export function partGroup(name: string): PartGroup {
  if (/fan/iu.test(name)) return 'fans';
  if (/conversion|converter|loss|psu/iu.test(name)) return 'psu';
  if (/nvswitch/iu.test(name)) return 'nvswitch';
  if (/cpu/iu.test(name)) return 'cpu';
  if (/dimm|lpddr|memory|dram/iu.test(name)) return 'memory';
  if (/pex|retimer|pcie/iu.test(name)) return 'pcie';
  if (/nvme|ssd/iu.test(name)) return 'storage';
  if (/nic|transceiver|switch|ethernet/iu.test(name)) return 'network';
  return 'other';
}

export type LadderSegmentGroup = 'gpu' | 'grace' | PartGroup;

export interface LadderSegment {
  group: LadderSegmentGroup;
  /** Solid = measured telemetry, outlined = modeled by the power model. */
  kind: 'measured' | 'modeled';
  /** Watts per GPU. */
  watts: number;
}

export interface Ladder {
  hardware: LadderHardware;
  gpuCount: number;
  gpuWatts: number;
  /** GPU first, a measured Grace socket second, then modeled groups by size. */
  segments: LadderSegment[];
  itWatts: number;
  facilityWatts: number;
  pue: number;
  coolingMode: string;
  tdpWatts: number;
  allInWatts: number;
  gpusPerMw: number;
  percentOfTdp: number;
  modelVersion: string;
}

function groupComponents(components: BasisComponent[]): LadderSegment[] {
  const sums = new Map<LadderSegmentGroup, LadderSegment>();
  for (const component of components) {
    const group: LadderSegmentGroup = component.measured
      ? /grace/iu.test(component.name)
        ? 'grace'
        : 'gpu'
      : partGroup(component.name);
    const kind = component.measured ? 'measured' : 'modeled';
    const current = sums.get(group) ?? { group, kind, watts: 0 };
    current.watts += component.watts;
    sums.set(group, current);
  }
  const measured = ['gpu', 'grace'].flatMap((group) => {
    const segment = sums.get(group as LadderSegmentGroup);
    return segment ? [segment] : [];
  });
  const modeled = [...sums.values()]
    .filter((segment) => segment.kind === 'modeled' && segment.watts > 0)
    .toSorted((a, b) => b.watts - a.watts);
  return [...measured, ...modeled];
}

export function buildLadder(
  hardware: LadderHardware,
  gpuWatts: number,
  graceWatts: number | null = null,
): Ladder | null {
  const result = computeBasis({
    ...defaultBasisSelection(hardware),
    workload: 'agentic',
    gpuWatts,
    grace: graceWatts === null ? 'modeled' : 'measured',
    graceWatts: graceWatts ?? 0,
  });
  if (!result.ok) return null;
  const perGpu = (watts: number) => watts / result.gpuCount;
  return {
    hardware,
    gpuCount: result.gpuCount,
    gpuWatts,
    segments: groupComponents(result.components).map((segment) => ({
      ...segment,
      watts: perGpu(segment.watts),
    })),
    itWatts: result.perGpu.it,
    facilityWatts: result.perGpu.facility,
    pue: result.pue,
    coolingMode: result.coolingMode,
    tdpWatts: hardwareTdp(hardware),
    allInWatts: hardwareAllInWatts(hardware),
    gpusPerMw: result.gpusPerMw,
    percentOfTdp: result.percentOfTdp,
    modelVersion: result.modelVersion,
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
  hardware: LadderHardware;
  tdpWatts: number;
  /** GPU watts at each step, 0 … TDP inclusive. */
  gpuWatts: number[];
  /** Per-GPU watts of every segment at each step, in ladder order of the TDP step. */
  tracks: { group: LadderSegmentGroup; kind: 'measured' | 'modeled'; values: number[] }[];
}

/** Runs the model from idle to TDP so the load strip can show which parts follow the GPU. */
export function loadSweep(hardware: LadderHardware, steps = 20): LoadSweep {
  const tdpWatts = hardwareTdp(hardware);
  const gpuWatts = Array.from({ length: steps + 1 }, (_, index) =>
    Math.round((tdpWatts * index) / steps),
  );
  const ladders = gpuWatts.map((watts) => buildLadder(hardware, watts));
  const order = ladders.at(-1)?.segments.map((segment) => segment.group) ?? [];
  const tracks = order.map((group) => ({
    group,
    kind: group === 'gpu' || group === 'grace' ? ('measured' as const) : ('modeled' as const),
    values: ladders.map(
      (ladder) => ladder?.segments.find((segment) => segment.group === group)?.watts ?? 0,
    ),
  }));
  return { hardware, tdpWatts, gpuWatts, tracks };
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
