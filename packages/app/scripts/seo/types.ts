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
