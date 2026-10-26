import data from './data/ascend-core-profiles.json';

export const CORE_PROFILE_GPU = 'Ascend 950PR_9579';
export interface CoreProfilePanel {
  readonly condition: string;
  readonly coreType: 'cube' | 'vector';
  readonly launchMode: 'isolated' | 'concurrent';
  readonly coreIds: readonly number[];
  readonly dieGroups: readonly string[];
  readonly matrix: readonly (readonly number[])[];
  readonly unit: 'SYS_CNT ticks';
  readonly stats: {
    readonly withinDieGroupMean: number | null;
    readonly betweenDieGroupMean: number | null;
  };
}

const mean = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summarizeCoreProfile(
  matrix: readonly (readonly number[])[],
  groups: readonly string[],
) {
  if (matrix.length !== groups.length || matrix.some((row) => row.length !== groups.length)) {
    throw new Error('Core profile dimensions do not match the ID groups');
  }
  const within: number[] = [],
    between: number[] = [];
  matrix.forEach((row, i) =>
    row.forEach((value, j) => {
      if (!Number.isFinite(value) || value < 0 || (i === j && value !== 0))
        throw new Error('Invalid profile distance');
      if (Math.abs(value - matrix[j][i]) > 1e-8)
        throw new Error('Profile matrix must be symmetric');
      if (i < j) (groups[i] === groups[j] ? within : between).push(value);
    }),
  );
  return { withinDieGroupMean: mean(within), betweenDieGroupMean: mean(between) };
}

export function coreMemoryProfiles() {
  const panels: CoreProfilePanel[] = data.panels.map((panel) => ({
    condition: panel.condition,
    coreType: panel.condition.includes('_cube_') ? 'cube' : 'vector',
    launchMode: panel.condition.endsWith('_isolated') ? 'isolated' : 'concurrent',
    coreIds: panel.coreids,
    dieGroups: panel.dieGroups,
    matrix: panel.matrix,
    unit: 'SYS_CNT ticks',
    stats: summarizeCoreProfile(panel.matrix, panel.dieGroups),
  }));
  return {
    gpu: CORE_PROFILE_GPU,
    metadata: data.metadata,
    panels,
    colorLimits: data.color_limits,
    sourceSha256: data.sourceSha256,
    sourceUrl:
      'https://github.com/SemiAnalysisAI/InferenceX-app/blob/1de1fe014f05cdfb4fd029f5bd6d547a0ffbbdc7/packages/app/src/components/ubenchx/data/ascend-core-profiles.json',
    metric:
      'Mean absolute difference between matched-address latency profiles after averaging six passes per address',
    limitations: [
      'Not core-to-core communication latency or geometric distance',
      'SYS_CNT ticks are not calibrated to clock64 cycles or nanoseconds',
      'Concurrent launches have no grid-wide starting barrier; their fine structure is less repeatable',
      'Runtime-ID die groups are not a recovered physical floorplan',
    ],
  };
}
