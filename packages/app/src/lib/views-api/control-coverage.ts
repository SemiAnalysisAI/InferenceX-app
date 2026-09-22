import type { UrlStateKey } from '@/lib/url-state';
import type { ReadonlyView } from './registry';

type Control =
  | { view: ReadonlyView; param: string; note?: string }
  | { rendering: string }
  | { derived: string };
const rendering = { rendering: 'Presentation only; returned values are unchanged.' } as const;
const inference = (param: string): Control => ({ view: 'inference', param });
const fleet = (param: string): Control => ({ view: 'fleet', param });

/**
 * Audit of every persisted frontend control, not just top-level routes.
 * API lists use their own vocabulary; these mappings are not a URL translator.
 * Transient controls and off-dashboard drilldowns are recorded in the audit doc.
 */
export const SHARE_CONTROL_COVERAGE = {
  g_model: inference('model'),
  g_rundate: inference('date'),
  g_runid: inference('runId'),
  g_tco: inference('tcoBasis'),
  i_seq: inference('sequence'),
  i_prec: inference('precisions'),
  i_metric: inference('metric'),
  i_revenue: inference('priceSource'),
  i_pctl: inference('percentile'),
  i_xmetric: inference('xmetric'),
  i_e2e_xmetric: inference('xmetric'),
  i_xmode: inference('xmode'),
  i_scale: rendering,
  i_gpus: inference('gpus'),
  i_dates: inference('dates'),
  i_dstart: inference('start'),
  i_dend: inference('end'),
  i_optimal: inference('optimal'),
  i_allpoints: inference('allPoints'),
  i_best: inference('best'),
  i_label: rendering,
  i_nolabel: rendering,
  i_hc: rendering,
  i_log: rendering,
  i_legend: rendering,
  i_advlabel: rendering,
  i_conclabel: rendering,
  i_gradlabel: rendering,
  i_frontier: {
    derived:
      'Use /api/v1/pareto for frontier boundaries and membership; opacity is rendering state.',
  },
  i_linelabel: rendering,
  i_active: {
    derived:
      'Exact legend visibility is a local subset of returned series.hwKey; do not rerun best/frontier selection after hiding a line.',
  },
  i_vendor: inference('vendors'),
  i_fw: inference('frameworks'),
  i_disagg: inference('deployment'),
  i_spec: inference('spec'),
  i_power: inference('power'),
  i_overview_current: inference('currentConfig'),
  i_overview_baseline: inference('baselineConfig'),
  e_rundate: { view: 'evaluation', param: 'date' },
  e_bench: { view: 'evaluation', param: 'benchmark' },
  e_hc: rendering,
  e_labels: rendering,
  e_legend: rendering,
  e_active: { view: 'evaluation', param: 'gpus' },
  r_range: { view: 'reliability', param: 'range' },
  r_pct: {
    derived:
      'The reliability view returns counts and rates together; choose the corresponding field.',
  },
  r_hc: rendering,
  r_legend: rendering,
  r_active: { view: 'reliability', param: 'gpus' },
  c_mw: fleet('mw'),
  c_costcap: { view: 'calculator', param: 'costcap' },
  c_price: fleet('price'),
  c_oprice: fleet('oprice'),
  c_ramp: fleet('ramp'),
  c_cache: fleet('cache'),
  c_ly: fleet('metric'),
  c_mtbi: fleet('mtbi'),
  c_rec: fleet('recovery'),
  c_life: fleet('horizon'),
  c_power: { view: 'profit-estimator-per-gigawatt', param: 'powerBasis' },
  c_ivmin: { view: 'first-token', param: 'minInteractivity' },
  c_ttft: { view: 'first-token', param: 'caps' },
  c_cfg: { view: 'cache-reuse', param: 'config' },
} satisfies Record<UrlStateKey, Control>;
