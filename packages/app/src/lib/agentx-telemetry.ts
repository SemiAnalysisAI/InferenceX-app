/**
 * AgentX detailed-telemetry tutorial — how to read the per-point views that
 * sit behind every dot on an AgentX Pareto curve.
 *
 * English content lives here; the Simplified Chinese port is a 1:1 mirror in
 * `agentx-telemetry-zh.ts`, keyed by the same section ids.
 * `agentx-telemetry.test.ts` enforces that the two stay structurally
 * identical, so a section added here without a translation fails CI.
 *
 * The counts in `highlights` describe the live UI, not the screenshots: the
 * test asserts them against `AGENTIC_DETAIL_SURFACE`, which mirrors what
 * `components/inference/agentic-point/agentic-point-detail.tsx` renders. If a
 * chart or view is added there, update both and the copy that cites them.
 */

/**
 * What the per-point detail page actually ships, as a machine-checkable
 * record. Keeps the tutorial's numeric claims from drifting once the page
 * grows another chart.
 */
export const AGENTIC_DETAIL_SURFACE = {
  /** SegmentedToggle options: per-point, request timeline, aggregates. */
  views: 3,
  /** Cards in the per-point grid, in render order. */
  perPointCharts: [
    'input-sequence-length',
    'output-sequence-length',
    'interactivity-over-time',
    'ttft-over-time',
    'kv-cache-utilization',
    'request-queue-depth',
    'prefix-cache-hit-rate',
    'throughput',
    'prompt-token-source',
    'cumulative-unique-input-tokens',
    'inflight-unique-input-tokens',
  ],
  /** Replay stages the Stage toggle switches between. */
  stages: ['profiling', 'warmup'],
  /** Request-timeline groupings. */
  timelineGroupings: ['by conversation', 'by worker'],
} as const;

/** Figures exported from the source document, served from /public. */
export const TELEMETRY_FIGURES = {
  perPointOverview: {
    src: '/images/agentx-telemetry/per-point-overview.png',
    width: 1110,
    height: 687,
  },
  chartPointTooltip: {
    src: '/images/agentx-telemetry/chart-point-tooltip.png',
    width: 2048,
    height: 1256,
  },
  pointDetailFull: {
    src: '/images/agentx-telemetry/point-detail-full.png',
    width: 1001,
    height: 2048,
  },
  requestTimeline: {
    src: '/images/agentx-telemetry/request-timeline.png',
    width: 2048,
    height: 1097,
  },
  flamegraph: {
    src: '/images/agentx-telemetry/flamegraph.png',
    width: 2048,
    height: 879,
  },
} as const;

export type TelemetryFigureKey = keyof typeof TELEMETRY_FIGURES;

/** Prose that a translation replaces; the asset itself is language-neutral. */
export interface TelemetryFigureCopy {
  alt: string;
  caption: string;
}

export interface TelemetryFigure extends TelemetryFigureCopy {
  key: TelemetryFigureKey;
}

export interface TelemetryLink {
  href: string;
  label: string;
}

export interface TelemetrySection {
  /** Anchor id — stable across languages, so deep links survive a locale switch. */
  id: string;
  heading: string;
  paragraphs: readonly string[];
  figure?: TelemetryFigure;
  /** Bulleted detail, used where the source document enumerates rather than argues. */
  bullets?: readonly string[];
  links?: readonly TelemetryLink[];
}

export interface TelemetryHighlight {
  value: string;
  label: string;
}

export interface TelemetryGuide {
  eyebrow: string;
  title: string;
  lead: string;
  intro: readonly string[];
  highlights: readonly TelemetryHighlight[];
  sections: readonly TelemetrySection[];
  /** Chrome around the article: back links, figure CTA, section nav. */
  ui: {
    backToAgentX: string;
    onThisPage: string;
    figureCta: string;
    readMore: string;
    openResults: string;
  };
}

export const AGENTX_TELEMETRY_GUIDE: TelemetryGuide = {
  eyebrow: 'AgentX tutorial',
  title: 'Exploring Agentic Workloads: Detailed Telemetry',
  lead: 'A single AgentX datapoint represents thousands of requests across growing conversations, subagents, warmup periods, cache states, and dynamically changing in-flight load. This is how to open one up.',
  intro: [
    'AgentX required more than a new benchmark harness and dataset. We also spent some time rebuilding parts of the InferenceX visualization to make agentic results easier to explore and digest. A single point on a Pareto curve can hide a lot of useful information, so every point on an AgentX chart is now a doorway into the run behind it.',
    'This tutorial walks through what that doorway leads to: how the curves themselves are constructed, what the point tooltip exposes, the eleven per-point telemetry charts on the detail page, the request timeline, and the per-conversation flamegraph on the AgentX dataset pages.',
  ],
  highlights: [
    { value: '11', label: 'per-point telemetry charts' },
    { value: '3', label: 'views per point' },
    { value: '2', label: 'replay stages' },
    { value: '1', label: 'curve per model, SKU, and engine' },
  ],
  sections: [
    {
      id: 'why-per-point-telemetry',
      heading: 'Why a single point is not enough',
      paragraphs: [
        'A fixed-sequence benchmark point is a summary of a homogeneous workload: every request has the same input and output length, so an aggregate throughput number describes the run fairly. An AgentX point is not that. It aggregates thousands of requests whose input lengths grow as conversations extend, whose subagents arrive in bursts, and whose cache state changes throughout the replay.',
        'Two points with nearly identical aggregate throughput can therefore behave very differently under the hood — one sustaining a steady prefix-cache hit rate, the other repeatedly evicting and recomputing. Per-point telemetry is what makes that difference visible.',
      ],
      figure: {
        key: 'perPointOverview',
        alt: 'The per-point detail view showing input and output sequence length distributions above interactivity-over-time and TTFT-over-time charts, with Per-point, Request timeline, and Aggregates across configs tabs and a Profiling / Warmup stage toggle.',
        caption:
          'The per-point view. Three tabs select the view, a Stage toggle switches between the warmup and profiling phases, and each chart expands to full width.',
      },
    },
    {
      id: 'one-curve-per-stack',
      heading: 'One curve per model, SKU, and inference engine',
      paragraphs: [
        'One of our major changes is how we construct the curves themselves. In previous versions of InferenceX, configurations with speculative decoding enabled and disabled were often displayed as separate curves. We are now moving away from this approach. The frontend combines allowed inference optimizations and displays the best available curve for each model, SKU, and inference engine combination.',
        'Because of this, individual points along a single curve may use different optimization techniques and configurations, including speculative decoding, disaggregation, or KV cache offload. Our goal is to show the best production performance available from each hardware and software stack, rather than creating a separate curve for every possible combination of optimizations.',
        'We still expose the underlying configuration and provenance for every point. Clicking a point shows a tooltip with a detailed view showing exactly which configuration produced it, along with the run metadata, links to the publicly viewable CI provenance, and AgentX specific statistics. From there, the "View charts" link opens the full point-detail page.',
      ],
      figure: {
        key: 'chartPointTooltip',
        alt: 'An AgentX Pareto curve of token throughput per chip against P90 interactivity, with a pinned tooltip listing the image, interactivity, throughput, chip count, parallelism, precision, cache hit rates, speculative decoding, and token counts for the selected point, plus a GitHub Actions run link and a View charts button.',
        caption:
          'The point tooltip. Every claim on the curve is traceable: container image, parallelism, precision, cache-hit rates, the speculator in use, and a link to the CI run that produced the numbers.',
      },
    },
    {
      id: 'point-detail-page',
      heading: 'The point-detail page',
      paragraphs: [
        'The detailed point view provides a much deeper look into the selected AgentX run. These metrics make it easier to understand why two points with similar aggregate throughput may behave differently throughout the replay.',
        'The page also separates warmup and profiling data. Readers can switch between the two phases to inspect how the system behaves while its cache state is being established and during the profiling period used for the benchmark run. Reported results cover the profiling window only, so the warmup stage is where cache-fill behavior — and the cost of establishing it — becomes visible.',
      ],
      bullets: [
        'Input and output sequence length distributions, as a histogram or as an in-flight average.',
        'Interactivity over time, at P75 or P90, against its cumulative value.',
        'Time to first token (TTFT) over time, switchable between TTFT and end-to-end latency.',
        'KV cache utilization over time, broken out by engine where more than one reports it.',
        'Request queue depth, alongside the count of requests completed.',
        'Prefix cache hit rate per interval.',
        'Input and decode throughput.',
        'Cumulative prompt-token source breakdown — how much of the prompt came from cache versus recomputation.',
        'Total unique input tokens over time, and unique input tokens in flight against the KV cache pool size.',
      ],
      figure: {
        key: 'pointDetailFull',
        alt: 'The full point-detail page for a B200 MiniMax-M3 FP4 vLLM point, showing eleven stacked telemetry charts from sequence-length distributions through KV cache utilization, queue depth, prefix cache hit rate, throughput, prompt-token source breakdown, and unique input tokens.',
        caption:
          'The full detail page for one point. The header carries the SKU, precision, and engine, a sibling navigator moves between configurations in the same SKU, and every chart honors the selected stage.',
      },
    },
    {
      id: 'kv-offload',
      heading: 'Reading KV cache offload points',
      paragraphs: [
        'Points using KV cache offload are surrounded by an additional dotted circle on the main chart, which is used to distinguish points with KV offload enabled. When one of these points is selected, the detail page shows the offload type, KV offload engine, chip cache-hit rate, and CPU cache-hit rate.',
        'This makes it possible to see where KV offload contributes to the best curve without creating a separate curve for every offload configuration — the same principle behind combining optimizations into a single curve, applied to the one optimization whose effect is easiest to miss.',
      ],
    },
    {
      id: 'request-timeline',
      heading: 'The request timeline',
      paragraphs: [
        'Another new feature is the request timeline. This view shows the individual requests replayed during a selected AgentX run and can be organized either by conversation or by worker. The conversation view groups subagents underneath their corresponding root conversation, making it easy to see when conversations and subagents overlap. Warmup and profiling requests can also still be viewed separately.',
        'Each request in the timeline is clickable and links directly to the corresponding conversation and turns on the InferenceX datasets page. This allows readers to move from an aggregate point on the Pareto curve to the exact anonymized request that was replayed.',
      ],
      figure: {
        key: 'requestTimeline',
        alt: 'The request timeline view, with one row per conversation and indented subagent rows beneath their root conversation, each row showing colored bars for the individual requests replayed over the run duration.',
        caption:
          'The request timeline, grouped by conversation. Subagent rows sit under their root conversation, so overlapping subagent activity is visible as vertical alignment.',
      },
    },
    {
      id: 'flamegraph',
      heading: 'The per-conversation flamegraph',
      paragraphs: [
        'The AgentX page also includes a flamegraph for visualizing the structure of an individual conversation. Each bar represents one turn and is scaled relative to the largest turn in that conversation. The bar is divided into cached prefix tokens, uncached input tokens, and generated output tokens.',
        'This gives a visual representation of how the context grows throughout a conversation and how much of each request can be reused from KV cache. Subagent groups are collapsed by default and expand on click; a colored bracket on the left groups requests in the same main-agent or subagent scope whose original execution intervals overlapped, so parallel work reads as parallel.',
      ],
      figure: {
        key: 'flamegraph',
        alt: 'A conversation flamegraph with one bar per turn, each split into cached prefix, uncached input, and output segments, with collapsed subagent groups interleaved between turns and elapsed timestamps beside each row.',
        caption:
          'A conversation flamegraph. Turn 1 is almost entirely uncached input; by turn 8 the bar is mostly cached prefix — the KV-reuse pattern AgentX is built to measure.',
      },
    },
  ],
  ui: {
    backToAgentX: '← AgentX datasets',
    onThisPage: 'On this page',
    figureCta: 'Open full size',
    readMore: 'Read the telemetry tutorial',
    openResults: 'Explore an AgentX point',
  },
};

/** Section ids, for the on-this-page nav and the parity test. */
export const AGENTX_TELEMETRY_SECTION_IDS = AGENTX_TELEMETRY_GUIDE.sections.map(
  (section) => section.id,
);
