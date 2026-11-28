export type Mode = 'campaign' | 'endless' | 'sandbox';
export type Precision = 'FP4' | 'FP8' | 'BF16';
export type NodeId = string;
type Edge = [NodeId, NodeId];
export type Copy = [string, string];
export type Point = readonly [number, number];
export type NodeKind =
  | 'queue'
  | 'prefill'
  | 'cache'
  | 'decode'
  | 'cool'
  | 'output'
  | 'router'
  | 'expert'
  | 'link';
export interface BoardNode {
  id: NodeId;
  title: Copy;
  kind: NodeKind;
  x: number;
  y: number;
}
export const BOARD_WIDTH = 2400;
export const BOARD_HEIGHT = 1400;
export const REVIEW_PHASE_GOALS = [240, 240, 160] as const;
export const placeables = {
  cache: ['KV buffer', 'KV 缓冲便签'],
  cool: ['Cooling tile', '散热模块'],
  prefill: ['Draft GPU', '草稿 GPU'],
} satisfies Record<string, Copy>;
export type Placeable = keyof typeof placeables;
export const inkUpgrades = [
  {
    id: 'reservoir',
    title: ['Ink tank', '储墨罐'],
    detail: ['+4 starting ink and capacity', '初始墨水与容量 +4'],
    cost: 2,
  },
  {
    id: 'refill',
    title: ['Ink pump', '补墨泵'],
    detail: ['+50% refill rate', '补墨速度 +50%'],
    cost: 3,
  },
  {
    id: 'nib',
    title: ['Fine nib', '细笔尖'],
    detail: ['Wires cost 1 ink', '每条线只需 1 墨水'],
    cost: 3,
  },
  {
    id: 'stamps',
    title: ['Sticky stack', '便签叠'],
    detail: ['Nodes cost 1 ink', '每个节点只需 1 墨水'],
    cost: 3,
  },
] as const;

export const edgeId = ([a, b]: Edge) => `${a}:${b}`;
const node = (
  id: string,
  kind: NodeKind,
  x: number,
  y: number,
  en: string,
  zh: string,
): BoardNode => ({ id, kind, x: x * 24, y: y * 14, title: [en, zh] });
const queue = (x: number, y: number) => node('in', 'queue', x, y, 'Queue', '队列');
const output = (x: number, y: number) => node('out', 'output', x, y, 'Output', '输出');
const pre = (x: number, y: number) => node('pre', 'prefill', x, y, 'Prefill', '预填充');
const gpu = (x: number, y: number, single = false) =>
  node('gpu', 'decode', x, y, single ? 'Single GPU' : 'Decode GPU', single ? '单 GPU' : '解码 GPU');
const cacheNode = (x: number, y: number) => node('cache', 'cache', x, y, 'KV cache', 'KV 缓存');
const cool = (x: number, y: number) => node('cool', 'cool', x, y, 'Cooler', '冷却器');
const connectEdges = (codes: string) =>
  codes.split(' ').map((id) => ({ id, edge: id.split(':') as Edge }));

export const ROOMS: {
  name: Copy;
  note: Copy;
  color: string;
  goal: number;
  limit: number;
  nodes: BoardNode[];
  connections: ReturnType<typeof connectEdges>;
}[] = [
  {
    name: ['Single GPU', '单 GPU'],
    note: [
      'Wire the queue to the GPU and then to output. Prefill runs on the same device.',
      '将队列接到 GPU，再接至输出。预填充在同一设备运行。',
    ],
    color: '#7957ce',
    goal: 360,
    limit: 28,
    nodes: [queue(15, 49), gpu(49, 49, true), output(84, 49)],
    connections: connectEdges('in:gpu gpu:out'),
  },
  {
    name: ['Prefill / Decode', '预填充 / 解码'],
    note: [
      'Long requests fill VRAM. Draw through the KV cache or reduce batch.',
      '长请求会占满显存。经过 KV 缓存布线，或减小批量。',
    ],
    color: '#087d75',
    goal: 640,
    limit: 31,
    nodes: [queue(13, 55), pre(35, 25), cacheNode(54, 77), gpu(67, 25), output(87, 55)],
    connections: connectEdges('in:pre pre:gpu pre:cache cache:gpu gpu:out'),
  },
  {
    name: ['MoE router', 'MoE 路由器'],
    note: [
      'Top-2 routing needs two expert branches back to decode. Vent with V if the experts overheat.',
      'Top-2 路由需要两条连接到解码端的专家支路。专家过热时按 V 散热。',
    ],
    color: '#9b5317',
    goal: 880,
    limit: 34,
    nodes: [
      queue(11, 51),
      node('router', 'router', 29, 51, 'Top-2 gate', 'Top-2 门控'),
      node('a', 'expert', 50, 19, 'Expert A', '专家 A'),
      node('b', 'expert', 50, 51, 'Expert B', '专家 B'),
      node('c', 'expert', 50, 82, 'Expert C', '专家 C'),
      gpu(72, 51),
      output(90, 51),
    ],
    connections: connectEdges('in:router router:a router:b router:c a:gpu b:gpu c:gpu gpu:out'),
  },
  {
    name: ['Multi-rack ring', '多机架环'],
    note: [
      'SLA: TTFT ≤ 260 ms. Tokens only count while the SLA is met.',
      'SLA：首词元延迟 ≤ 260 毫秒。只有达标的词元才计分。',
    ],
    color: '#284c9a',
    goal: 840,
    limit: 36,
    nodes: [
      queue(11, 52),
      pre(30, 24),
      cacheNode(67, 24),
      gpu(67, 76),
      node('link', 'link', 30, 76, 'Rack link', '机架链路'),
      output(89, 52),
    ],
    connections: connectEdges(
      'in:pre pre:cache cache:gpu gpu:link link:pre pre:link link:gpu gpu:out',
    ),
  },
  {
    name: ['Architecture review', '架构评审'],
    note: [
      'The red pen erases live wires as the SLA tightens. Draw fallbacks and verify fresh tokens in each phase with FP4, FP8, then BF16.',
      'SLA 收紧时，红笔会擦除活动线路。画好备用线路，并依次以 FP4、FP8、BF16 在每个阶段独立取得通过校验的词元。',
    ],
    color: '#a33258',
    goal: 1520,
    limit: 50,
    nodes: [
      queue(11, 52),
      pre(30, 33),
      cacheNode(46, 79),
      cool(48, 17),
      gpu(68, 50),
      node('gpu2', 'decode', 70, 83, 'Decode reserve', '备用解码'),
      output(89, 42),
    ],
    connections: connectEdges(
      'in:pre in:cache pre:gpu pre:cache pre:cool cache:gpu cache:gpu2 cool:gpu gpu:out gpu2:out',
    ),
  },
];

interface Hazard {
  target: string;
  until: number;
  type: 'jam' | 'surge' | 'erase';
}
export interface Relay {
  mode: Mode;
  room: number;
  elapsed: number;
  phase: number;
  burst: number;
  heat: number;
  kv: number;
  credits: number;
  tokens: number;
  reviewScores: [number, number, number];
  missedReviewPhase?: number;
  faults: number;
  batch: number;
  precision: Precision;
  wires: string[];
  sketches: Record<string, Point[]>;
  nodes: BoardNode[];
  upgrades: string[];
  hazard?: Hazard;
  state: 'active' | 'won' | 'lost';
  heatUpgrade: boolean;
  cacheUpgrade: boolean;
}

export function createRelay(
  mode: Mode,
  room: number,
  upgrades: string[],
  blueprint: string[] = [],
  nodes: BoardNode[] = [],
  sketches: Record<string, Point[]> = {},
): Relay {
  const relay: Relay = {
    mode,
    room,
    elapsed: 0,
    phase: 1,
    burst: 0,
    heat: 0.13,
    kv: 0.08,
    credits: 8 + (upgrades.includes('reservoir') ? 4 : 0),
    tokens: 0,
    reviewScores: [0, 0, 0],
    faults: 0,
    batch: 4,
    precision: 'FP8',
    wires: [],
    sketches,
    nodes,
    upgrades,
    state: 'active',
    heatUpgrade: upgrades.includes('heat'),
    cacheUpgrade: upgrades.includes('cache'),
  };
  relay.wires = blueprint.filter((id) => {
    const [a, b] = id.split(':');
    return canConnect(relay, a, b);
  });
  return relay;
}

export const boardNodes = (relay: Relay) => [...ROOMS[relay.room].nodes, ...relay.nodes];
export const inkCapacity = (relay: Relay) => (relay.upgrades.includes('reservoir') ? 16 : 12);
export const nodeCost = (relay: Relay) => (relay.upgrades.includes('stamps') ? 1 : 3);

export function placeNode(relay: Relay, kind: Placeable, [x, y]: Point): Relay {
  if (
    relay.state !== 'active' ||
    relay.nodes.length >= 4 ||
    (relay.mode !== 'sandbox' && (kind !== 'cache' || relay.credits < nodeCost(relay)))
  )
    return relay;
  x = Math.max(230, Math.min(BOARD_WIDTH - 230, x));
  y = Math.max(165, Math.min(BOARD_HEIGHT - 165, y));
  if (
    boardNodes(relay).some(
      (existing) => Math.hypot((existing.x - x) / 340, (existing.y - y) / 230) < 1,
    )
  )
    return relay;
  return {
    ...relay,
    credits: relay.mode === 'sandbox' ? relay.credits : relay.credits - nodeCost(relay),
    nodes: [
      ...relay.nodes,
      { id: `sticky${relay.nodes.length + 1}`, title: placeables[kind], kind, x, y },
    ],
  };
}

function canConnect(relay: Relay, from: NodeId, to: NodeId) {
  if (from === to || from === 'out' || to === 'in') return false;
  const nodes = boardNodes(relay);
  if (!nodes.some((n) => n.id === from) || !nodes.some((n) => n.id === to)) return false;
  return (
    relay.mode === 'sandbox' ||
    from.startsWith('sticky') ||
    to.startsWith('sticky') ||
    ROOMS[relay.room].connections.some(({ id }) => id === `${from}:${to}`)
  );
}

export const jammed = (relay: Relay, id: string) =>
  relay.hazard?.type === 'jam' && relay.hazard.target === id && relay.hazard.until > relay.elapsed;
export const erased = (relay: Relay, id: string) =>
  relay.hazard?.type === 'erase' &&
  relay.hazard.target === id &&
  relay.hazard.until > relay.elapsed;

function routes(relay: Relay) {
  const paths: NodeId[][] = [];
  const nodes = new Map(boardNodes(relay).map((n) => [n.id, n.kind]));
  const all = relay.wires.filter((id) => !jammed(relay, id)).map((id) => id.split(':'));
  let budget = 700;
  const has = (p: NodeId[], kind: NodeKind) => p.some((id) => nodes.get(id) === kind);
  function trace(path: NodeId[]) {
    if (--budget < 0) return;
    const last = path.at(-1);
    if (last === 'out') {
      if (has(path, 'decode') && (relay.room !== 2 || has(path, 'expert'))) paths.push(path);
      return;
    }
    for (const [a, b] of all) {
      if (a === last && !path.includes(b)) trace([...path, b]);
    }
  }
  trace(['in']);
  const value = (p: NodeId[]) =>
    Number(has(p, 'cool')) * relay.heat * 11 +
    Number(has(p, 'cache')) * (1.2 + relay.kv * 10) -
    p.length * 0.65;
  const activeExperts = new Set(paths.flat().filter((id) => nodes.get(id) === 'expert'));
  return {
    paths: paths.sort((a, b) => value(b) - value(a)),
    topK: Math.min(2, activeExperts.size),
    nodes,
  };
}

export function readMetrics(relay: Relay) {
  const { paths, topK, nodes } = routes(relay);
  const path = paths[0] ?? [];
  const cache = path.some((id) => nodes.get(id) === 'cache');
  const cooling = path.some((id) => nodes.get(id) === 'cool');
  const prefill =
    relay.room === 0 || relay.room === 2 || path.some((id) => nodes.get(id) === 'prefill');
  const precision = relay.precision === 'FP4' ? 1.38 : relay.precision === 'BF16' ? 0.73 : 1;
  const bound = Math.max(0.28, 1 - Math.max(0, relay.heat - 0.53) * 1.55);
  const throughput =
    path.length > 0
      ? Math.round(
          (20 + relay.batch * 12) *
            precision *
            bound *
            (prefill ? 1 : 0.65) *
            (relay.room === 2 && topK < 2 ? 0.4 : 1),
        )
      : 0;
  const interaction = Math.round((throughput / Math.max(1, relay.batch)) * (cache ? 1.2 : 1));
  const ttft = throughput
    ? Math.round(
        105 +
          relay.batch * 28 +
          relay.heat * 155 +
          (prefill ? 0 : 93) +
          (cooling ? 38 : 0) -
          (cache ? 48 : 0) -
          (path.some((id) => id.startsWith('sticky') && nodes.get(id) === 'prefill') ? 28 : 0),
      )
    : 0;
  // The finale validates the output of increasingly demanding workloads.
  const precisionTarget = relay.room === 4 && relay.mode !== 'sandbox' ? relay.phase : 1;
  const precisionTier = relay.precision === 'FP4' ? 1 : relay.precision === 'FP8' ? 2 : 3;
  const fidelity =
    precisionTier >= precisionTarget ? 1 : precisionTier + 1 === precisionTarget ? 0.55 : 0.24;
  const sla =
    relay.room === 3 ? 260 : relay.room === 4 ? [420, 345, 280][relay.phase - 1] : undefined;
  const slaMissed = throughput > 0 && sla !== undefined && ttft > sla;
  const review = relay.mode === 'campaign' && relay.room === 4;
  const precisionMissed = review && throughput > 0 && fidelity < 1;
  const verifiedRate = slaMissed || precisionMissed ? 0 : throughput * fidelity;
  return {
    path,
    cache,
    cooling,
    throughput,
    interaction,
    ttft,
    fidelity,
    topK,
    sla,
    slaMissed,
    precisionMissed,
    verifiedRate,
  };
}

export function toggleWire(relay: Relay, from: NodeId, to: NodeId, points?: Point[]): Relay {
  if (!canConnect(relay, from, to) || relay.state !== 'active') return relay;
  const id = edgeId([from, to]);
  if (erased(relay, id)) return relay;
  if (relay.wires.includes(id))
    return {
      ...relay,
      credits: Math.min(inkCapacity(relay), relay.credits + 1),
      wires: relay.wires.filter((wire) => wire !== id),
      sketches: Object.fromEntries(Object.entries(relay.sketches).filter(([key]) => key !== id)),
    };
  const price = relay.upgrades.includes('nib') ? 1 : 2;
  if ((relay.credits < price && relay.mode !== 'sandbox') || relay.wires.length >= 32) return relay;
  return {
    ...relay,
    credits: Math.max(0, relay.credits - price),
    wires: [...relay.wires, id],
    sketches: points?.length ? { ...relay.sketches, [id]: points } : relay.sketches,
  };
}

export function vent(relay: Relay): Relay {
  if (relay.state !== 'active' || (relay.mode !== 'sandbox' && relay.credits < 2)) return relay;
  return {
    ...relay,
    heat: Math.max(0, relay.heat - 0.41),
    kv: relay.kv * 0.65,
    credits: Math.max(0, relay.credits - 2),
  };
}

export function advance(relay: Relay, dt: number): Relay {
  if (relay.state !== 'active') return relay;
  const { mode, room } = relay;
  const elapsed = relay.elapsed + dt;
  const tier = mode === 'endless' ? Math.floor(elapsed / 23) : 0;
  const phase = room === 4 ? 1 + Number(elapsed >= 10) + Number(elapsed >= 21) : 1;
  const review = mode === 'campaign' && room === 4;
  if (review && phase !== relay.phase) {
    const previous = relay.phase - 1;
    if (relay.reviewScores[previous] < REVIEW_PHASE_GOALS[previous]) {
      return { ...relay, elapsed, missedReviewPhase: relay.phase, state: 'lost' };
    }
  }
  const cycle = room === 4 ? 7 - phase : 9 - Math.min(tier, 3);
  const burst = Math.floor(elapsed / cycle);
  let hazard = relay.hazard;
  if (mode !== 'sandbox' && (room > 0 || mode === 'endless') && burst !== relay.burst) {
    const { path } = readMetrics(relay);
    const active = path.slice(0, -1).map((a, i) => `${a}:${path[i + 1]}`);
    const targets = active.filter((id) => !id.startsWith('in:'));
    const type =
      room === 4 && targets.length > 0
        ? 'erase'
        : room === 1 || (burst + phase) % 3 === 0
          ? 'surge'
          : 'jam';
    const target = targets[burst % targets.length] ?? 'pre:gpu';
    hazard = { type, target, until: elapsed + (phase === 3 ? 2.4 : 1.6) };
  }
  const cut = hazard !== relay.hazard && hazard?.type === 'erase' ? hazard.target : undefined;
  const wires = cut ? relay.wires.filter((id) => id !== cut) : relay.wires;
  const metrics = readMetrics({ ...relay, elapsed, phase, hazard, wires });
  const running = metrics.throughput > 0;
  const surge = hazard?.type === 'surge' && hazard.until > elapsed ? 0.06 : 0;
  const fg = relay.precision === 'BF16' ? 1.25 : relay.precision === 'FP4' ? 0.62 : 0.95;
  let heat = Math.min(
    1.2,
    Math.max(
      0,
      relay.heat +
        dt *
          ((running
            ? (0.016 +
                relay.batch * 0.012 * fg +
                (room === 2 ? 0.049 : 0) +
                tier * 0.004 +
                (phase - 1) * 0.019) *
              (relay.heatUpgrade ? 0.8 : 1)
            : 0) +
            surge -
            (metrics.cooling ? 0.135 : 0.034) -
            (running ? 0 : 0.065)),
    ),
  );
  let kv = Math.max(
    0,
    relay.kv +
      dt *
        ((running ? relay.batch * 0.012 * fg + (room === 1 ? 0.04 : 0) : 0) +
          surge * 0.75 -
          (metrics.cache ? 0.088 : 0.028) -
          (running ? 0 : 0.04) -
          (relay.cacheUpgrade ? 0.02 : 0)),
  );
  const fault = heat >= 1 || kv >= 1;
  if (fault) {
    heat *= 0.61;
    kv *= 0.56;
  }
  const faults = relay.faults + Number(fault);
  const earned = fault ? 0 : metrics.verifiedRate * dt;
  const tokens = relay.tokens + earned;
  const reviewScores: Relay['reviewScores'] = review ? [...relay.reviewScores] : relay.reviewScores;
  if (review) reviewScores[phase - 1] += earned;
  const credits = Math.min(
    inkCapacity(relay),
    relay.credits + dt * (running ? 0.48 : 0.72) * (relay.upgrades.includes('refill') ? 1.5 : 1),
  );
  let state: Relay['state'] = 'active';
  if (
    mode === 'campaign' &&
    faults < 3 &&
    tokens >= ROOMS[room].goal &&
    (!review || (earned > 0 && REVIEW_PHASE_GOALS.every((goal, i) => reviewScores[i] >= goal)))
  )
    state = 'won';
  else if (
    (mode !== 'sandbox' && faults >= 3) ||
    (mode === 'campaign' && elapsed >= ROOMS[room].limit)
  )
    state = 'lost';
  return {
    ...relay,
    elapsed,
    phase,
    burst,
    heat,
    kv,
    tokens,
    reviewScores,
    credits,
    faults,
    hazard,
    state,
    wires,
  };
}
