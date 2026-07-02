import { useByIdQuery } from './benchmark-id-query';

export interface RequestRecord {
  /** Conversation id (groups turns of one agent session). */
  cid: string;
  /** Zero-based turn index within the conversation. */
  ti: number;
  /** Source trace id from the original raw dataset, when provided by AIPerf. */
  srcTrace?: string;
  /** Original raw top-level request index within srcTrace. */
  srcOuter?: number;
  /** Original nested request index within srcOuter, for subagent children. */
  srcInner?: number;
  /** Loader-specific source kind, e.g. weka_main or weka_flat. */
  srcKind?: string;
  /** Worker id (concurrency slot that handled this request). */
  wid: string;
  /** Sub-agent depth (0 = top-level). */
  ad: number;
  /** `warmup` or `profiling`. */
  phase: string;
  /** ns offset from timeline.startNs. Load gen decided to dispatch. */
  credit: number;
  /** ns offset from timeline.startNs. HTTP send started. */
  start: number;
  /** ns offset from timeline.startNs. First server acknowledgement (or null). */
  ack: number | null;
  /** ns offset from timeline.startNs. Last byte received. */
  end: number;
  ttftMs: number | null;
  /** Time per output token in ms. */
  tpotMs: number | null;
  isl: number | null;
  osl: number | null;
  cancelled: boolean;
}

export interface RequestTimeline {
  version: number;
  startNs: number;
  endNs: number;
  durationS: number;
  requests: RequestRecord[];
}

/**
 * Lazy-fetch the per-request Gantt timeline for one agentic point.
 * Enabled only when the caller opts in (e.g. the timeline view becomes
 * active), so the payload (~30 KB per point) isn't paid for every page load.
 */
export function useRequestTimeline(id: number | null, enabled = false) {
  return useByIdQuery<RequestTimeline>('request-timeline', id, enabled && Boolean(id));
}
