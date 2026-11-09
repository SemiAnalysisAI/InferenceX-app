import type { RequestRecord, RequestTimeline } from '@/hooks/api/use-request-timeline';

export interface InterTurnGaps {
  unit: 'seconds';
  definition: 'next_send_start_minus_previous_response_end';
  profiling: number[];
  warmup: number[];
}

/** Observed idle gaps, preserving replay and exact session identity (including child lanes). */
export function interTurnGaps(timeline: RequestTimeline): InterTurnGaps {
  const result: InterTurnGaps = {
    unit: 'seconds',
    definition: 'next_send_start_minus_previous_response_end',
    profiling: [],
    warmup: [],
  };
  const lanes = new Map<string, RequestRecord[]>();
  for (const request of timeline.requests) {
    // A source conversation alone cannot distinguish repeated, concurrent replays.
    if (!Number.isInteger(request.ri) || !request.cid) continue;
    const key = JSON.stringify([request.ri, request.cid]);
    const lane = lanes.get(key) ?? [];
    lane.push(request);
    lanes.set(key, lane);
  }
  for (const lane of lanes.values()) {
    lane.sort((a, b) => a.start - b.start);
    for (let i = 1; i < lane.length; i++) {
      const previous = lane[i - 1]!;
      const next = lane[i]!;
      if (
        previous.cancelled ||
        next.cancelled ||
        previous.phase !== next.phase ||
        (next.phase !== 'profiling' && next.phase !== 'warmup') ||
        !Number.isInteger(previous.ti) ||
        next.ti !== previous.ti + 1 ||
        ![previous.start, previous.end, next.start, next.end].every(Number.isFinite) ||
        previous.end < previous.start ||
        next.end < next.start ||
        next.start < previous.end
      )
        continue;
      result[next.phase].push((next.start - previous.end) / 1e9);
    }
  }
  return result;
}
