import {
  OVERVIEW_SCENARIOS,
  OVERVIEW_TIERS,
  type OverviewConfigView,
  type OverviewHistoricalStatus,
  type OverviewHistoricalWindow,
  type OverviewMissingReason,
  type OverviewPageData,
  type OverviewScenario,
} from '@/lib/overview/overview-data';

export interface OverviewViewCellConfig {
  framework: string;
  frameworkLabel: string;
  precision: string;
  specMethod: string;
  specLabel: string;
  disagg: boolean;
  multinode: boolean;
  latestDate: string;
}

export interface OverviewViewHistory {
  status: OverviewHistoricalStatus;
  baselineCostPerMtok: number | null;
  costDeltaPct: number | null;
  baselineDate: string | null;
}

export interface OverviewViewCell {
  hardware: string;
  hardwareLabel: string;
  costPerMtok: number | null;
  throughputPerGpu: number | null;
  estimated: boolean;
  deltaVsRefPct: number | null;
  missingReason: OverviewMissingReason | null;
  config: OverviewViewCellConfig | null;
  history?: OverviewViewHistory;
}

export interface OverviewViewRow {
  model: string;
  modelLabel: string;
  category: string;
  scenario: OverviewScenario;
  cells: OverviewViewCell[];
}

export interface OverviewViewPayload {
  tiers: readonly number[];
  scenarios: readonly OverviewScenario[];
  referenceHardware: string;
  historicalWindow: OverviewHistoricalWindow | null;
  unchangedRowCount: number;
  emptyRowCount: number;
  rows: OverviewViewRow[];
}

function projectConfig(config: OverviewConfigView | null): OverviewViewCellConfig | null {
  if (!config) return null;
  return {
    framework: config.framework,
    frameworkLabel: config.frameworkLabel,
    precision: config.precision,
    specMethod: config.specMethod,
    specLabel: config.specLabel,
    disagg: config.disagg,
    multinode: config.isMultinode,
    latestDate: config.latestDate,
  };
}

export function projectOverviewView(data: OverviewPageData): OverviewViewPayload {
  return {
    tiers: OVERVIEW_TIERS,
    scenarios: OVERVIEW_SCENARIOS,
    referenceHardware: data.referenceHardware,
    historicalWindow: data.historicalWindow,
    unchangedRowCount: data.unchangedRowCount,
    emptyRowCount: data.emptyRowCount,
    rows: data.models.map((summary) => ({
      model: summary.model,
      modelLabel: summary.modelLabel,
      category: summary.category,
      scenario: summary.scenario,
      cells: summary.platforms.map((platform) => ({
        hardware: platform.hardware,
        hardwareLabel: platform.hardwareLabel,
        costPerMtok: platform.costPerMtok,
        throughputPerGpu: platform.read.value,
        estimated: platform.read.estimated,
        deltaVsRefPct: platform.costVsReferencePct,
        missingReason: platform.missingReason,
        config: projectConfig(platform.read.config),
        ...(platform.historicalComparison
          ? {
              history: {
                status: platform.historicalComparison.status,
                baselineCostPerMtok: platform.historicalComparison.baselineCostPerMtok,
                costDeltaPct: platform.historicalComparison.costDeltaPct,
                baselineDate: platform.historicalComparison.baselineDate,
              },
            }
          : {}),
      })),
    })),
  };
}

export function overviewViewGeneratedAt(data: OverviewPageData): string | null {
  let latest: string | null = null;
  for (const summary of data.models) {
    for (const platform of summary.platforms) {
      const date = platform.read.config?.latestDate;
      if (date && (latest === null || date > latest)) latest = date;
    }
  }
  return latest ?? data.historicalWindow?.snapshotDate ?? null;
}

export function overviewViewCsvRows(
  payload: OverviewViewPayload,
  tier: number,
): Record<string, unknown>[] {
  return payload.rows.flatMap((row) =>
    row.cells.map((cell) => ({
      model: row.model,
      scenario: row.scenario,
      tier,
      hardware: cell.hardware,
      cost_per_mtok: cell.costPerMtok,
      throughput_per_gpu: cell.throughputPerGpu,
      estimated: cell.estimated,
      delta_vs_ref_pct: cell.deltaVsRefPct,
      missing_reason: cell.missingReason,
      framework: cell.config?.frameworkLabel ?? null,
      precision: cell.config?.precision ?? null,
      spec_method: cell.config?.specMethod ?? null,
      disagg: cell.config?.disagg ?? null,
      multinode: cell.config?.multinode ?? null,
      history_status: cell.history?.status ?? null,
      baseline_cost_per_mtok: cell.history?.baselineCostPerMtok ?? null,
      history_delta_pct: cell.history?.costDeltaPct ?? null,
      baseline_date: cell.history?.baselineDate ?? null,
    })),
  );
}
