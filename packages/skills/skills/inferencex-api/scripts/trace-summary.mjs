import { parseArgs } from 'node:util';

import { argumentError, isMain, responseBoundary, runCli, writeStdout } from './cli-contract.mjs';
import { readBoundedRegular } from './local-files.mjs';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const integer = (value) => finite(value) && Number.isInteger(value);
const finiteOrNull = (value) => value === null || finite(value);
const series = [
  'kvCacheUsage',
  'prefixCacheHitRate',
  'queueDepth',
  'prefillTps',
  'decodeTps',
  'prefixCacheHitsTps',
  'hostKvCacheUsage',
  'kvCacheUsageByEngine',
];

export function validateTimeline(timeline) {
  if (
    !object(timeline) ||
    !integer(timeline.version) ||
    !integer(timeline.startNs) ||
    !integer(timeline.endNs) ||
    !finite(timeline.durationS) ||
    timeline.durationS < 0 ||
    !Array.isArray(timeline.requests) ||
    timeline.requests.some(
      (request) =>
        !object(request) ||
        typeof request.cid !== 'string' ||
        !integer(request.ti) ||
        typeof request.wid !== 'string' ||
        !integer(request.ad) ||
        typeof request.phase !== 'string' ||
        !Number.isSafeInteger(request.credit) ||
        !Number.isSafeInteger(request.start) ||
        request.start < 0 ||
        (request.ack !== null && !Number.isSafeInteger(request.ack)) ||
        !Number.isSafeInteger(request.end) ||
        request.end < request.start ||
        !finiteOrNull(request.ttftMs) ||
        !finiteOrNull(request.tpotMs) ||
        !finiteOrNull(request.isl) ||
        !finiteOrNull(request.osl) ||
        typeof request.cancelled !== 'boolean' ||
        (Object.hasOwn(request, 'ri') && !integer(request.ri)) ||
        (Object.hasOwn(request, 'srcTrace') && typeof request.srcTrace !== 'string') ||
        (Object.hasOwn(request, 'srcOuter') && !integer(request.srcOuter)) ||
        (Object.hasOwn(request, 'srcInner') && !integer(request.srcInner)) ||
        (Object.hasOwn(request, 'srcKind') && typeof request.srcKind !== 'string'),
    )
  ) {
    throw new Error('Unexpected request timeline response');
  }
}

function validateServerMetrics(metrics, id) {
  const points = (value) => Array.isArray(value) && value.every(object);
  if (
    !object(metrics) ||
    !object(metrics.meta) ||
    !integer(metrics.startNs) ||
    !integer(metrics.endNs) ||
    !finite(metrics.durationS) ||
    !integer(metrics.timeslicesCount) ||
    metrics.timeslicesCount < 0 ||
    series.some((key) => !points(metrics[key])) ||
    !object(metrics.promptTokensBySource) ||
    Object.values(metrics.promptTokensBySource).some((entries) => !points(entries)) ||
    metrics.kvCacheUsageByEngine.some(
      (entry) => typeof entry.engineLabel !== 'string' || !points(entry.points),
    ) ||
    !finiteOrNull(metrics.kvCachePoolTokens) ||
    !points(metrics.metricSources) ||
    (Object.hasOwn(metrics.meta, 'id') && metrics.meta.id !== Number(id))
  ) {
    throw new Error('Unexpected aggregate server metrics response');
  }
}

function sampleCounts(points, fields = ['value']) {
  return {
    sample_count: points.length,
    fields: Object.fromEntries(
      fields.map((field) => {
        const values = points.map((point) => point[field]).filter(finite);
        return [
          field,
          {
            finite_count: values.length,
            nonzero_count: values.filter((value) => value !== 0).length,
            missing_or_nonfinite_count: points.length - values.length,
          },
        ];
      }),
    ),
  };
}

function population(records, id, scope) {
  let cumulative = 0;
  let union = 0;
  let coveredEnd = 0;
  for (const {
    request: { start, end },
  } of [...records].sort((a, b) => a.request.start - b.request.start)) {
    cumulative += (end - start) / 1e9;
    union += Math.max(0, end - Math.max(start, coveredEnd)) / 1e9;
    coveredEnd = Math.max(coveredEnd, end);
  }
  let longest = null;
  for (const record of records) {
    const duration = record.request.end - record.request.start;
    // On ties retain the first request in the original timeline.
    if (longest === null || duration > longest.request.end - longest.request.start)
      longest = record;
  }
  return {
    request_count: records.length,
    cancelled_request_count: records.filter(({ request }) => request.cancelled).length,
    cumulative_request_latency_s: cumulative,
    request_inflight_union_s: union,
    longest_request:
      longest === null
        ? null
        : {
            scope,
            selected_result_id: id,
            phase: longest.request.phase,
            request_index: longest.index,
            duration: { value: (longest.request.end - longest.request.start) / 1e9, unit: 's' },
            request: { ...longest.request },
          },
  };
}

export function summarizeTrace(diagnostics) {
  const id = diagnostics?.metadata?.selected_result_id;
  const availability = diagnostics?.trace_availability;
  if (
    typeof id !== 'string' ||
    !/^[1-9]\d*$/u.test(id) ||
    !Number.isSafeInteger(Number(id)) ||
    String(Number(id)) !== id ||
    !object(diagnostics.selected_point) ||
    String(diagnostics.selected_point.id) !== id ||
    !object(availability) ||
    !object(availability.response) ||
    Object.entries(availability.response).some(
      ([key, value]) => key !== id || typeof value !== 'boolean',
    ) ||
    availability.key_present !== Object.hasOwn(availability.response, id) ||
    availability.available !== (availability.response[id] === true)
  ) {
    throw new Error('Invalid selected-point diagnostic scope or trace availability');
  }
  const common = {
    selected_result_id: id,
    scope: 'all_phases_including_cancelled',
  };
  if (!availability.available) {
    if (
      diagnostics.outcome !== 'trace_unavailable' ||
      diagnostics.timeline !== null ||
      diagnostics.histograms !== null ||
      diagnostics.server_metrics !== null
    ) {
      throw new Error('Invalid unavailable-trace diagnostics');
    }
    return {
      ...common,
      status: 'trace_unavailable',
      availability_key_present: availability.key_present,
      request_count: null,
      cancelled_request_count: null,
      cumulative_request_latency_s: null,
      request_inflight_union_s: null,
      longest_request: null,
      phases: [],
      server_metric_samples: null,
    };
  }
  if (diagnostics.outcome !== 'trace_diagnostics')
    throw new Error('Invalid trace diagnostic outcome');
  const { timeline, server_metrics: metrics } = diagnostics;
  validateTimeline(timeline);
  validateServerMetrics(metrics, id);
  const records = timeline.requests.map((request, index) => ({ request, index }));
  const phases = new Map();
  for (const record of records) {
    if (!phases.has(record.request.phase)) phases.set(record.request.phase, []);
    phases.get(record.request.phase).push(record);
  }
  const scalarSeries = series.filter(
    (key) => key !== 'queueDepth' && key !== 'kvCacheUsageByEngine',
  );
  return {
    ...common,
    status: records.length === 0 ? 'empty_timeline' : 'available',
    ...population(records, id, 'all_phases'),
    phases: [...phases].map(([phase, group]) => ({ phase, ...population(group, id, 'phase') })),
    server_metric_samples: {
      ...Object.fromEntries(scalarSeries.map((key) => [key, sampleCounts(metrics[key])])),
      queueDepth: sampleCounts(metrics.queueDepth, ['running', 'waiting', 'total']),
      promptTokensBySource: Object.fromEntries(
        Object.entries(metrics.promptTokensBySource).map(([source, points]) => [
          source,
          sampleCounts(points),
        ]),
      ),
      kvCacheUsageByEngine: metrics.kvCacheUsageByEngine.map(({ engineLabel, points }) => ({
        engineLabel,
        ...sampleCounts(points),
      })),
    },
  };
}

const quoted = (value) =>
  JSON.stringify(value).replaceAll(/[&<>`|]/gu, (character) => `&#${character.codePointAt(0)};`);

function describeLongest(longest) {
  const identity = Object.fromEntries(
    ['cid', 'ri', 'ti', 'wid', 'ad', 'srcTrace', 'srcOuter', 'srcInner', 'srcKind']
      .filter((key) => Object.hasOwn(longest.request, key))
      .map((key) => [key, longest.request[key]]),
  );
  return (
    `${longest.duration.value} ${longest.duration.unit}; phase ${quoted(longest.phase)}; ` +
    `result ${longest.selected_result_id}, request index ${longest.request_index} (zero-based), ` +
    `identity ${quoted(identity)}; cancelled ${longest.request.cancelled}`
  );
}

export function renderTraceSummary(summary) {
  if (summary.status === 'trace_unavailable') {
    return (
      `AgentX result ${summary.selected_result_id}: no stored trace in this response snapshot ` +
      `(${summary.availability_key_present ? 'explicit false' : 'response omitted the selected ID'}). ` +
      'Request populations and durations are unavailable, not an empty timeline.\n'
    );
  }
  const lines = [
    `AgentX result ${summary.selected_result_id}: selected-point trace.`,
    `Across all phases: ${summary.request_count} requests, including ${summary.cancelled_request_count} cancelled.`,
    summary.longest_request === null
      ? 'The returned timeline is empty; there is no longest request.'
      : `Longest request across all phases: ${describeLongest(summary.longest_request)}.`,
    ...summary.phases.map(
      (phase) =>
        `Phase ${quoted(phase.phase)}: ${phase.request_count} requests, ` +
        `${phase.cancelled_request_count} cancelled; longest request: ${describeLongest(phase.longest_request)}.`,
    ),
    `Cumulative request latency: ${summary.cumulative_request_latency_s} s; ` +
      `request in-flight interval union: ${summary.request_inflight_union_s} s.`,
    'Durations use end minus start from relative nanosecond offsets. Cumulative latency can exceed ' +
      'elapsed time when requests overlap; these durations are neither GPU utilization nor server busy time.',
    '',
    'Server metric sample coverage (each field uses its own finite-sample denominator):',
    '',
  ];
  const addSeries = (name, samples) => {
    for (const [field, counts] of Object.entries(samples.fields)) {
      const fraction =
        counts.finite_count === 0
          ? 'nonzero fraction unavailable'
          : `${counts.nonzero_count}/${counts.finite_count} finite samples nonzero`;
      lines.push(
        `- ${quoted(`${name}.${field}`)}: ${samples.sample_count} samples, ` +
          `${counts.finite_count} finite; ${fraction}; ` +
          `${counts.missing_or_nonfinite_count} missing or nonfinite.`,
      );
    }
  };
  for (const [name, samples] of Object.entries(summary.server_metric_samples)) {
    if (name === 'promptTokensBySource') {
      for (const [source, values] of Object.entries(samples))
        addSeries(`${name}[${quoted(source)}]`, values);
    } else if (name === 'kvCacheUsageByEngine') {
      for (const values of samples) addSeries(`${name}[${quoted(values.engineLabel)}]`, values);
    } else addSeries(name, samples);
  }
  return `${lines.join('\n')}\n`;
}

if (isMain(import.meta.url)) {
  await runCli({
    command: 'trace-summary',
    defaultErrorFormat: 'json',
    run: async ({ args, signal }) => {
      const { positionals } = parseArgs({
        args,
        options: { 'error-format': { type: 'string' } },
        allowPositionals: true,
        strict: true,
      });
      if (positionals.length !== 1)
        throw argumentError('Usage: trace-summary.mjs <selected-point.json>');
      const bytes = await readBoundedRegular(
        positionals[0],
        64 * 1024 * 1024,
        'Selected-point diagnostics',
        { signal },
      );
      const summary = await responseBoundary(
        () => summarizeTrace(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))),
        signal,
      );
      await writeStdout(
        `${JSON.stringify(
          {
            trace_summary: summary,
            trace_report_markdown: renderTraceSummary(summary),
          },
          null,
          2,
        )}\n`,
        { signal },
      );
    },
  });
}
