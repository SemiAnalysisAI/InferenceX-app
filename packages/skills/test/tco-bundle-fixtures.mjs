const point = (hardware = 'b200', overrides = {}) => ({
  hardware,
  workload: '1024x1024',
  tier: 50,
  output_tput_per_gpu: 1000,
  boundary: 'interpolated',
  is_interpolated: true,
  frontier_points: 3,
  frontier_min_interactivity: 25,
  frontier_max_interactivity: 100,
  latest_date: '2026-09-05',
  oldest_frontier_date: '2026-09-01',
  evidence_date: { from: '2026-09-02', to: '2026-09-05' },
  ...overrides,
});

const feed = (rows, overrides = {}) => ({
  model: 'dsv4',
  db_model_keys: ['dsv4'],
  date: '2026-09-06',
  workloads: ['1024x1024'],
  tiers: [50],
  rows,
  ...overrides,
});

const args = [
  'tco',
  'compare',
  '--model',
  'dsv4',
  '--workloads',
  '1024x1024',
  '--target',
  '50',
  '--gpu-hourly-prices',
  'b200=3.6,mi355x=1.8',
  '--date',
  '2026-09-06',
];

const url =
  'https://inferencex.semianalysis.com/api/v1/tco-feed?model=dsv4&workloads=1024x1024&tiers=50&view=points&format=json&date=2026-09-06';

const fixture = (rows, expected, fixtureArgs = args) => ({
  args: fixtureArgs,
  responses: [{ operation: 'tco-feed', url, status: 200, body: feed(rows) }],
  expected,
});

export const TCO_BUNDLE_VARIANTS = {
  positive: fixture([point(), point('mi355x', { output_tput_per_gpu: 500 })], {
    costs: [1, 1],
    valid_hardware: ['b200', 'mi355x'],
  }),
  partial: fixture([point()], {
    costs: [1, null],
    valid_hardware: ['b200'],
  }),
  boundaries: fixture(
    [
      point('b200', {
        boundary: 'clamped_low',
        is_interpolated: false,
        frontier_min_interactivity: 75,
        evidence_date: { from: '2026-09-02', to: '2026-09-02' },
      }),
      point('mi355x', {
        boundary: 'unreachable',
        is_interpolated: false,
        frontier_max_interactivity: 40,
        output_tput_per_gpu: 0,
        evidence_date: null,
      }),
      point('h200_sxm', { output_tput_per_gpu: 0 }),
    ],
    { costs: [null, null, null], valid_hardware: [] },
    args.map((value) =>
      value === 'b200=3.6,mi355x=1.8' ? 'b200=3.6,mi355x=1.8,h200_sxm=2' : value,
    ),
  ),
};

export { args as TCO_BUNDLE_ARGS, feed as tcoFeed, point as tcoPoint, url as TCO_FEED_URL };
