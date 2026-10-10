import type {
  SubmissionSummaryRow,
  SubmissionVolumeRow,
} from '@semianalysisai/inferencex-db/queries/submissions';

export type { SubmissionSummaryRow, SubmissionVolumeRow };

export interface SubmissionsResponse {
  summary: SubmissionSummaryRow[];
  volume: SubmissionVolumeRow[];
}
