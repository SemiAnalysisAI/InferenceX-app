import type { AvailabilityRow, BenchmarkRow } from '@/lib/api';

export type TokenMetricType = 'total' | 'input' | 'output';

type PointTuple = readonly [
  tp: number,
  ep: number,
  chips: number,
  concurrency: number,
  totalThroughputPerGpu: number,
  outputThroughputPerGpu: number,
  inputThroughputPerGpu: number,
  medianInteractivity: number,
  medianTtft: number,
  medianE2el: number,
];

interface SupplementalDataset {
  id: string;
  model: string;
  modelAliases: readonly string[];
  date: string;
  hardware: string;
  framework: string;
  /** Framework reported by the source when a display-only snapshot key is used. */
  sourceFramework?: string;
  runUrl?: string;
  points: readonly PointTuple[];
  /** Omitted means the snapshot is valid for every token metric. */
  supportedTokenMetrics?: readonly TokenMetricType[];
}

const dsr1August17: readonly PointTuple[] = [
  [
    8, 1, 8, 1, 653.3902134366368, 72.99208842404813, 580.3981250125887, 701.906635545054,
    0.26185680300113745, 1.5685025695420336,
  ],
  [
    8, 1, 8, 2, 719.5361536453969, 80.74272299874106, 638.7934306466558, 403.43094610437316,
    0.5063663404725958, 2.8306995255115908,
  ],
  [
    8, 1, 8, 4, 898.0597363189065, 99.90203743397365, 798.1576988849329, 272.2814518471643,
    1.0072254485276062, 4.324981361016398,
  ],
  [
    8, 1, 8, 8, 1534.6072863182922, 172.51574204983257, 1362.0915442684595, 209.44326150211057,
    0.5763577754842117, 4.98794364547939,
  ],
  [
    8, 1, 8, 64, 5048.231029483235, 560.0571750236073, 4488.173854459627, 115.21578894050089,
    4.323833600996295, 12.300118638988351,
  ],
  [
    8, 1, 8, 128, 6709.483077637271, 743.1792481177831, 5966.303829519487, 91.24036469462176,
    8.597232194500975, 18.66097929701209,
  ],
  [
    8, 1, 8, 256, 8161.618704995656, 907.1073300236875, 7254.5113749719685, 66.7159336839182,
    17.12080494550173, 30.95121552349883,
  ],
  [
    8, 1, 8, 512, 9313.852074081971, 1034.864099128346, 8278.987974953625, 45.247588625114666,
    34.22868340747664, 54.62980595699628,
  ],
];

const dsr1August22: readonly PointTuple[] = [
  [
    8, 1, 8, 1, 628.9710598745098, 70.26415497877618, 558.7069048957336, 703.1202284701499,
    0.32318450049933745, 1.6413020644977223,
  ],
  [
    8, 1, 8, 2, 702.7172255982504, 78.8553876069523, 623.8618379912981, 404.3055549907138,
    0.5780675065034302, 2.9056949085061206,
  ],
  [
    32, 1, 32, 32, 1920.4598362575473, 214.7608426420231, 1705.6989936155242, 264.4765740689175,
    0.7742451535305008, 4.281998021528125,
  ],
  [
    32, 1, 32, 64, 3178.9840936206497, 352.68054106874285, 2826.3035525519067, 230.35672017720918,
    1.1666485004825518, 5.184136075986316,
  ],
  [
    32, 1, 32, 128, 5145.186589589582, 569.9091654052471, 4575.277424184334, 206.5912495153872,
    1.9487936009827536, 6.399220873485319,
  ],
  [
    32, 1, 32, 256, 7793.101906141766, 866.1492429627697, 6926.952663178997, 182.86398603089907,
    3.3710869964852463, 8.456233689998044,
  ],
  [
    32, 1, 32, 512, 10210.271688700279, 1134.465474536103, 9075.806214164175, 141.59599290224634,
    6.451180875505088, 12.923200229502982,
  ],
  [
    32, 1, 32, 1024, 12380.114048554029, 1375.8503936714096, 11004.26365488262, 101.64418129373612,
    12.28093515749788, 21.280333061004058,
  ],
  [
    32, 1, 32, 2048, 13748.393106670877, 1528.9868997017807, 12219.406206969097, 65.25477348593513,
    23.823017231508857, 38.11095889197895,
  ],
];

const gptOssAugust22: readonly PointTuple[] = [
  [
    4, 1, 4, 1, 2016.798016173172, 225.30227129616, 1791.4957448770122, 1462.120791184631,
    0.3949238510103896, 1.02815705849207,
  ],
  [
    2, 1, 2, 1, 2939.497127863335, 328.37962654921716, 2611.1175013141183, 1234.6147538275834,
    0.6590746759902686, 1.4149531370203476,
  ],
  [
    1, 1, 1, 1, 6503.9223998890475, 726.5717624065494, 5777.350637482498, 832.4994039144032,
    0.090197357989382, 1.1803411214932567,
  ],
  [
    1, 1, 1, 2, 10183.144438915819, 1142.7011784216138, 9040.443260494205, 694.4545223177703,
    0.18758124650048558, 1.5426225175178843,
  ],
  [
    1, 8, 8, 64, 19940.018979223085, 2212.1710821471593, 17727.847897075924, 431.06024646996104,
    0.9552501139987726, 3.103124447487062,
  ],
  [
    1, 8, 8, 128, 29671.80995053509, 3286.612866322006, 26385.197084213083, 370.35158862710585,
    1.7109653410152532, 4.182030279975152,
  ],
  [
    1, 8, 8, 256, 40678.2706249172, 4521.107734910936, 36157.162890006264, 304.44917501143885,
    3.126444708497729, 6.147738145489711,
  ],
  [
    1, 8, 8, 512, 50120.27941471215, 5568.87498233962, 44551.40443237253, 231.6343673144642,
    6.035206183005357, 10.032349768007407,
  ],
  [
    1, 8, 8, 1024, 56208.878247329485, 6246.712022289421, 49962.16622504006, 157.04782949676618,
    12.126750790514052, 17.998166643985314,
  ],
  [
    1, 8, 8, 2048, 59813.91166996877, 6652.027379034343, 53161.88429093443, 97.15511241159633,
    24.430557979969308, 33.96740277999197,
  ],
];

const kimiAugust22: readonly PointTuple[] = [
  [
    8, 1, 8, 1, 663.8650823392342, 74.1622659710108, 589.7028163682234, 694.585687233185,
    0.2223843564861454, 1.541665184951853,
  ],
  [
    8, 1, 8, 2, 717.1141136395695, 80.4709338686305, 636.643179770939, 392.84456394354004,
    0.4723154735402204, 2.8553318615304306,
  ],
  [
    8, 1, 8, 4, 906.2857383609748, 100.8171150515352, 805.4686233094396, 269.0823232269083,
    1.088551064953208, 4.511279692465905,
  ],
  [
    32, 1, 32, 64, 2882.197362494171, 319.75464341302455, 2562.4427190811466, 205.59720404498236,
    1.2084655475337058, 5.713703882531263,
  ],
  [
    32, 1, 32, 128, 4643.181506753474, 514.3043213812836, 4128.877185372191, 183.2102977635607,
    2.0762837954680435, 7.0896255720290355,
  ],
  [
    32, 1, 32, 256, 6999.716208139327, 777.9699236135996, 6221.746284525728, 160.5242615595079,
    3.6558798734331504, 9.40580550848972,
  ],
  [
    32, 1, 32, 512, 9340.25110530568, 1037.79730114271, 8302.453804162971, 127.58406890202056,
    6.881976359465625, 14.142705057514831,
  ],
  [
    32, 1, 32, 1024, 11341.76404400966, 1260.4545049971903, 10081.309539012469, 92.56077732029165,
    13.268606896046549, 23.27447518700501,
  ],
  [
    32, 1, 32, 2048, 12767.050719647294, 1419.8498069346924, 11347.2009127126, 60.27802288265687,
    25.96076739806449, 41.372758659534156,
  ],
];

const vrJuly: readonly PointTuple[] = [
  [72, 1, 72, 52, 2793, 4438.21, 0, 52, 0, 0],
  [72, 1, 72, 70, 2730, 4338.1, 0, 70, 0, 0],
  [72, 1, 72, 90, 2478, 3937.66, 0, 90, 0, 0],
  [72, 1, 72, 110, 2205, 3503.85, 0, 110, 0, 0],
  [72, 1, 72, 130, 1932, 3070.04, 0, 130, 0, 0],
  [72, 1, 72, 148, 1680, 2669.6, 0, 148, 0, 0],
  [72, 1, 72, 170, 1344, 2135.68, 0, 170, 0, 0],
  [72, 1, 72, 185, 1050, 1668.5, 0, 185, 0, 0],
  [72, 1, 72, 200, 630, 1001.1, 0, 200, 0, 0],
  [72, 1, 72, 215, 462, 734.14, 0, 215, 0, 0],
  [72, 1, 72, 235, 346.5, 550.605, 0, 235, 0, 0],
  [72, 1, 72, 270, 252, 400.44, 0, 270, 0, 0],
  [72, 1, 72, 320, 178.5, 283.645, 0, 320, 0, 0],
  [72, 1, 72, 400, 115.5, 183.535, 0, 400, 0, 0],
];

const DATASETS: readonly SupplementalDataset[] = [
  {
    id: 'jalapeno-dsr1-2026-08-17',
    model: 'dsr1',
    modelAliases: ['dsr1', 'DeepSeek-R1-0528'],
    date: '2026-08-17',
    hardware: 'jalapeno',
    framework: 'teacup',
    points: dsr1August17,
  },
  {
    id: 'jalapeno-dsr1-2026-08-22',
    model: 'dsr1',
    modelAliases: ['dsr1', 'DeepSeek-R1-0528'],
    date: '2026-08-22',
    hardware: 'jalapeno',
    framework: 'teacup',
    points: dsr1August22,
  },
  {
    id: 'jalapeno-gptoss-2026-08-22',
    model: 'gptoss120b',
    modelAliases: ['gptoss120b', 'gpt-oss-120b'],
    date: '2026-08-22',
    hardware: 'jalapeno',
    framework: 'teacup',
    points: gptOssAugust22,
  },
  {
    id: 'jalapeno-kimi-2026-08-22',
    model: 'kimik2.5',
    modelAliases: ['kimik2.5', 'Kimi-K2.5'],
    date: '2026-08-22',
    hardware: 'jalapeno',
    framework: 'teacup',
    points: kimiAugust22,
  },
  {
    id: 'vr200-dsr1-2026-07-01',
    model: 'dsr1',
    modelAliases: ['dsr1', 'DeepSeek-R1-0528'],
    date: '2026-07-01',
    hardware: 'vr200',
    // A snapshot-specific key keeps "(July)" attached only to these rows. A
    // later DB-ingested `coreweave-vera-rubin` run receives its own identity.
    framework: 'rubin-july',
    sourceFramework: 'coreweave-vera-rubin',
    runUrl:
      'https://www.coreweave.com/blog/nvidia-vera-rubin-nvl72-on-coreweave-10x-more-tokens-per-megawatt-than-blackwell',
    points: vrJuly,
    // This July snapshot published output throughput against interactivity. Its
    // stored total rate is not semantically comparable to the dashboard's total
    // or input-token metrics. New snapshots are unrestricted unless they opt in.
    supportedTokenMetrics: ['output'],
  },
];

function toBenchmarkRow(dataset: SupplementalDataset, point: PointTuple): BenchmarkRow {
  const [tp, ep, chips, conc, total, output, input, intvty, ttft, e2el] = point;
  const reciprocalLatency = intvty > 0 ? 1 / intvty : 0;
  return {
    id: 0,
    hardware: dataset.hardware,
    framework: dataset.framework,
    model: dataset.model,
    precision: 'fp4',
    spec_method: 'none',
    disagg: false,
    is_multinode: chips > 8,
    prefill_tp: tp,
    prefill_ep: ep,
    prefill_dp_attention: false,
    prefill_num_workers: 1,
    decode_tp: tp,
    decode_ep: ep,
    decode_dp_attention: false,
    decode_num_workers: 1,
    num_prefill_gpu: chips,
    num_decode_gpu: chips,
    benchmark_type: 'single_turn',
    isl: 8192,
    osl: 1024,
    conc,
    offload_mode: 'off',
    image: null,
    metrics: {
      tput_per_gpu: total,
      output_tput_per_gpu: output,
      input_tput_per_gpu: input,
      median_intvty: intvty,
      mean_intvty: intvty,
      p90_intvty: intvty,
      p95_intvty: intvty,
      p99_intvty: intvty,
      median_tpot: reciprocalLatency,
      mean_tpot: reciprocalLatency,
      p90_tpot: reciprocalLatency,
      p95_tpot: reciprocalLatency,
      p99_tpot: reciprocalLatency,
      median_ttft: ttft,
      mean_ttft: ttft,
      p90_ttft: ttft,
      p95_ttft: ttft,
      p99_ttft: ttft,
      median_e2el: e2el,
      mean_e2el: e2el,
      p90_e2el: e2el,
      p95_e2el: e2el,
      p99_e2el: e2el,
    },
    date: dataset.date,
    run_url: dataset.runUrl ?? null,
  };
}

export const SUPPLEMENTAL_BENCHMARK_ROWS: readonly BenchmarkRow[] = DATASETS.flatMap((dataset) =>
  dataset.points.map((point) => toBenchmarkRow(dataset, point)),
);

const benchmarkIdentity = (row: BenchmarkRow) =>
  [
    row.model,
    row.hardware,
    row.framework,
    row.precision,
    row.spec_method,
    row.date,
    row.isl,
    row.osl,
    row.conc,
    row.prefill_tp,
    row.prefill_ep,
    row.decode_tp,
    row.decode_ep,
  ].join('|');

function mergeUnique(rows: BenchmarkRow[], additions: readonly BenchmarkRow[]): BenchmarkRow[] {
  const identities = new Set(rows.map(benchmarkIdentity));
  const unique = additions.filter((row) => !identities.has(benchmarkIdentity(row)));
  return unique.length > 0 ? [...rows, ...unique] : rows;
}

function datasetsForLatestQuery(model: string, date: string, exact: boolean) {
  const matching = DATASETS.filter((dataset) => dataset.modelAliases.includes(model));
  if (exact && date) return matching.filter((dataset) => dataset.date === date);
  const eligible = date ? matching.filter((dataset) => dataset.date <= date) : matching;
  // Resolve each supplemental curve independently so a newer Jalapeño snapshot
  // never suppresses the older-but-still-current VR200 curve.
  const latestByCurve = new Map<string, SupplementalDataset>();
  for (const dataset of eligible) {
    const key = `${dataset.hardware}|${dataset.framework}`;
    const current = latestByCurve.get(key);
    if (!current || current.date < dataset.date) latestByCurve.set(key, dataset);
  }
  return [...latestByCurve.values()];
}

export function withSupplementalBenchmarks(
  rows: BenchmarkRow[],
  query: {
    model: string;
    date?: string;
    exact?: boolean;
    runId?: string;
    view?: { type: 'calculator'; sequence: string };
  },
): BenchmarkRow[] {
  if (query.runId || (query.view && query.view.sequence !== '8k/1k')) return rows;
  const datasets = datasetsForLatestQuery(query.model, query.date ?? '', query.exact ?? false);
  return mergeUnique(
    rows,
    datasets.flatMap((dataset) => dataset.points.map((point) => toBenchmarkRow(dataset, point))),
  );
}

export function withSupplementalBenchmarkHistory(
  rows: BenchmarkRow[],
  query: { model: string; isl: number; osl: number; benchmarkType?: 'agentic_traces' },
): BenchmarkRow[] {
  if (query.benchmarkType || query.isl !== 8192 || query.osl !== 1024) return rows;
  const datasets = DATASETS.filter((dataset) => dataset.modelAliases.includes(query.model));
  return mergeUnique(
    rows,
    datasets.flatMap((dataset) => dataset.points.map((point) => toBenchmarkRow(dataset, point))),
  );
}

const availabilityIdentity = (row: AvailabilityRow) =>
  [
    row.model,
    row.hardware,
    row.framework,
    row.precision,
    row.spec_method,
    row.isl,
    row.osl,
    row.benchmark_type,
    row.date,
  ].join('|');

export function withSupplementalAvailability(rows: AvailabilityRow[]): AvailabilityRow[] {
  const existing = new Set(rows.map(availabilityIdentity));
  const additions = DATASETS.map<AvailabilityRow>((dataset) => ({
    model: dataset.model,
    isl: 8192,
    osl: 1024,
    precision: 'fp4',
    hardware: dataset.hardware,
    framework: dataset.framework,
    spec_method: 'none',
    disagg: false,
    benchmark_type: 'single_turn',
    date: dataset.date,
  })).filter((row) => !existing.has(availabilityIdentity(row)));
  return additions.length > 0 ? [...rows, ...additions] : rows;
}

function capabilityFor(hardware: string, framework: string, date: string) {
  return DATASETS.find(
    (dataset) =>
      dataset.hardware === hardware &&
      dataset.date === date &&
      (dataset.framework === framework || dataset.sourceFramework === framework),
  )?.supportedTokenMetrics;
}

/** Snapshot-scoped capability check for raw rows (official and unofficial). */
export function supportsTokenMetric(row: BenchmarkRow, tokenType: TokenMetricType): boolean {
  return capabilityFor(row.hardware, row.framework, row.date)?.includes(tokenType) ?? true;
}

/** Snapshot-scoped capability check after a row has become chart data. */
export function supportsChartTokenMetric(
  hwKey: string,
  date: string,
  tokenType: TokenMetricType,
): boolean {
  const [hardware, ...frameworkParts] = hwKey.split('_');
  return capabilityFor(hardware, frameworkParts.join('_'), date)?.includes(tokenType) ?? true;
}
