import type { BenchmarkRow } from '../../src/lib/api';

/** Aggregated best result for a GPU+precision+framework combination. */
export interface BestConfig {
  hardware: string;
  precision: string;
  framework: string;
  disagg: boolean;
  tputPerGpu: number;
  medianTtft: number;
  medianTpot: number;
  medianE2el: number;
  medianIntvty: number;
  conc: number;
  tp: number;
  date: string;
}

/** Per-model data grouped by sequence length. */
export interface ModelData {
  modelKey: string;
  displayName: string;
  rows: BenchmarkRow[];
  bestBySequence: Map<string, BestConfig[]>;
}

/** A single data point in a GPU config's performance history. */
export interface HistoryPoint {
  date: string;
  hardware: string;
  framework: string;
  precision: string;
  disagg: boolean;
  tputPerGpu: number;
  medianTtft: number;
  medianTpot: number;
  medianIntvty: number;
  conc: number;
}

/** A changelog entry associated with a benchmark date. */
export interface ChangelogEntry {
  date: string;
  description: string;
  prLink: string | null;
  configKeys: string[];
}

/** A notable performance improvement between two runs. */
export interface Improvement {
  model: string;
  hardware: string;
  framework: string;
  precision: string;
  disagg: boolean;
  oldTput: number;
  newTput: number;
  pctGain: number;
  oldDate: string;
  newDate: string;
  /** Changelog entries around the improvement date. */
  changelogs: ChangelogEntry[];
  /** Other configs on the same model for context in trend charts. */
  relatedHistory: Record<string, HistoryPoint[]>;
}

/** GPU-pair matchup data for head-to-head articles. */
export interface MatchupData {
  gpuA: string;
  gpuB: string;
  /** Models where both GPUs have data, with each GPU's best config. */
  sharedModels: {
    model: string;
    modelKey: string;
    tputA: number;
    tputB: number;
    costMtokA: number;
    costMtokB: number;
    intvtyA: number;
    intvtyB: number;
  }[];
  /** How many models gpuA wins on throughput. */
  winsA: number;
  /** How many models gpuB wins on throughput. */
  winsB: number;
  avgPctDiff: number;
}

/** A point on the throughput-vs-interactivity pareto frontier. */
export interface ParetoPoint {
  interactivity: number;
  throughput: number;
  conc: number;
}

/** FAQ question/answer pair for JSON-LD. */
export interface FaqEntry {
  question: string;
  answer: string;
}

/** CLI options for the generation script. */
export interface GenerateOptions {
  baseUrl: string;
  dryRun: boolean;
}
