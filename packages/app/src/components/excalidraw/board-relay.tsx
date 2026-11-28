'use client';

import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import type { BoardAudio } from './board-audio';
import { readBoardSave, type BoardSave, writeBoardSave } from './board-save';
import {
  advance,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  boardNodes,
  createRelay,
  erased,
  inkUpgrades,
  jammed,
  type Mode,
  type NodeId,
  type NodeKind,
  nodeCost,
  placeables,
  type Placeable,
  placeNode,
  type Point,
  type Precision,
  readMetrics,
  type Relay,
  REVIEW_PHASE_GOALS,
  ROOMS,
  toggleWire,
  vent,
} from './relay-model';
import './board-relay.css';

const modes = [
  { id: 'campaign', label: ['Campaign', '战役'] },
  { id: 'endless', label: ['Endless', '无尽'] },
  { id: 'sandbox', label: ['Freehand', '自由绘制'] },
] as const;
const actorInk: Record<NodeKind, readonly [string, string]> = {
  queue: [
    'M14 25Q16 18 25 18L75 19Q84 20 84 29L85 46Q83 55 74 55L23 54Q13 54 13 45Z',
    'M23 12L74 13Q89 13 90 26L91 44M27 8L76 9Q96 8 96 25M27 29L56 28M27 36L63 36M28 43L52 42',
  ],
  prefill: [
    'M24 15L76 15L82 22L81 48L75 54L20 53L16 45L17 23Z',
    'M28 15V8M40 15V8M53 15V8M66 15V8M28 54V61M40 54V61M53 54V61M66 54V61M16 26H9M17 42H9M81 26H90M81 42H90M35 26L63 26L63 44L35 43Z',
  ],
  decode: [
    'M24 15L75 15L82 22L81 48L74 54L20 53L16 45L17 23Z',
    'M28 15V8M40 15V8M53 15V8M66 15V8M28 54V61M40 54V61M53 54V61M66 54V61M17 26H9M17 42H9M81 26H90M81 42H90M33 26H66V44H33ZM44 26V44M55 26V44M33 35H66',
  ],
  cache: [
    'M21 17Q21 8 49 8Q78 8 79 17L78 49Q77 59 49 59Q22 59 21 49Z',
    'M21 17Q22 27 49 27Q77 27 79 17M21 33Q24 43 49 43Q76 43 78 33',
  ],
  cool: [
    'M50 9Q76 9 78 34Q76 59 50 60Q24 59 22 35Q24 10 50 9Z',
    'M50 18V52M34 26L66 44M34 44L66 26M45 22L50 27L55 22M45 48L50 43L55 48',
  ],
  output: [
    'M15 25L60 25L60 13L88 34L61 56L61 44L14 44Z',
    'M8 29L12 29M6 35L11 35M8 41L12 41M29 35L71 34',
  ],
  router: ['M50 9L85 34L50 59L15 34Z', 'M50 26V46M39 29L50 37L61 29M45 26L50 21L55 26'],
  expert: ['M50 8L73 17L84 34L73 52L50 60L26 51L16 34L26 16Z', 'M50 20L64 32L51 47L37 33Z'],
  link: [
    'M14 23Q14 15 26 15H74Q86 15 86 24V44Q86 53 74 53H25Q14 53 14 43Z',
    'M40 31L34 39Q30 45 25 40Q21 36 26 32L35 25Q40 22 44 26M58 37L66 29Q71 25 75 30Q78 35 73 38L64 45Q59 48 55 44M38 40L61 28',
  ],
};
const pathOf = (points: Point[]) =>
  points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
type Tool = 'pen' | 'pan' | Placeable;

export default function BoardRelay({
  zh,
  audio,
  audible,
  toggleAudio,
}: {
  zh: boolean;
  audio: BoardAudio;
  audible: boolean;
  toggleAudio: () => void;
}) {
  const t = (en: string, cn: string) => (zh ? cn : en);
  const lang = zh ? 1 : 0;
  const [save, setSave] = useState(readBoardSave);
  const [relay, setRelay] = useState(() => createRelay('campaign', 0, save.upgrades));
  const current = useRef(relay);
  const [paused, setPaused] = useState(false);
  const [started, setStarted] = useState(false);
  const [help, setHelp] = useState(false);
  const [selected, setSelected] = useState<NodeId | null>(null);
  const [status, setStatus] = useState('');
  const [calm, setCalm] = useState(false);
  const [tool, setTool] = useState<Tool>('pen');
  const [zoomed, setZoomed] = useState(false);
  const [preview, setPreview] = useState<Point[]>([]);
  const viewport = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const suppressPointerClick = useRef(false);
  const gesture = useRef<
    | { type: 'pen'; from: NodeId; points: Point[]; moved: boolean; x: number; y: number }
    | { type: 'pan'; x: number; y: number; left: number; top: number }
    | null
  >(null);
  const [latest, setLatest] = useState<{ throughput: number; interaction: number }[]>([]);
  const modeStart = useRef<HTMLButtonElement>(null);
  const actionRef = useRef<(key: string) => void>(() => {});
  const lastSlaCue = useRef(0);
  const wasMissingSla = useRef(false);
  const shown = ROOMS[relay.room];
  const nodes = boardNodes(relay);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const extra = new Set([
    ...relay.wires,
    ...(relay.hazard?.type === 'erase' ? [relay.hazard.target] : []),
  ]);
  for (const { id } of shown.connections) extra.delete(id);
  const connections = [
    ...shown.connections,
    ...[...extra].map((id) => ({ id, edge: id.split(':') })),
  ];
  const metrics = readMetrics(relay);
  const scoring = started && !paused && !help && relay.state === 'active';
  const missingSla = scoring && metrics.slaMissed;
  const reviewing = relay.mode === 'campaign' && relay.room === 4;
  const activePath = metrics.path.slice(0, -1).map((a, i) => `${a}:${metrics.path[i + 1]}`);
  const firstUncleared = save.medals.indexOf(0);
  const unlocked = firstUncleared === -1 ? 4 : firstUncleared;

  function update(next: Relay) {
    current.current = next;
    setRelay(next);
  }
  function persist(next: BoardSave) {
    setSave(next);
    writeBoardSave(next);
  }
  function change(mode: Mode, room = 0, restore = false) {
    update(
      createRelay(
        mode,
        room,
        save.upgrades,
        restore ? save.blueprint : undefined,
        restore ? save.nodes : undefined,
        restore ? save.sketches : undefined,
      ),
    );
    setStarted(false);
    setPaused(false);
    setSelected(null);
    setStatus('');
    setLatest([]);
    setTool('pen');
    setZoomed(false);
    viewport.current?.scrollTo(0, 0);
  }
  function connect(id: NodeId) {
    if (relay.state !== 'active' || paused || help) return;
    if (!selected || selected === id) {
      setSelected(selected === id ? null : id);
      return;
    }
    commitWire(selected, id);
  }
  function commitWire(from: NodeId, id: NodeId, points?: Point[]) {
    const next = toggleWire(current.current, from, id, points);
    if (next === current.current) {
      audio.cue('danger');
      setStatus(
        t(
          'That route is unavailable, or needs more ink. Follow a guide or route through a sticky node.',
          '该线路不可用或墨水不足。请沿虚线连接，或经过便签节点。',
        ),
      );
    } else {
      audio.cue('route');
      update(next);
      setStatus(t('Wire updated.', '线路已更新。'));
    }
    setSelected(null);
  }
  function boardPoint(x: number, y: number): Point {
    const rect = surface.current?.getBoundingClientRect();
    return rect
      ? [
          Math.round(
            Math.max(0, Math.min(BOARD_WIDTH, ((x - rect.left) * BOARD_WIDTH) / rect.width)),
          ),
          Math.round(
            Math.max(0, Math.min(BOARD_HEIGHT, ((y - rect.top) * BOARD_HEIGHT) / rect.height)),
          ),
        ]
      : [0, 0];
  }
  function stamp(where: Point) {
    if (tool === 'pan' || tool === 'pen' || paused || help) return;
    const next = placeNode(current.current, tool, where);
    if (next === current.current) {
      setStatus(
        t(
          'Leave room between nodes. Check your ink and the four-sticky limit.',
          '请留出节点间距，并检查墨水与四张便签的上限。',
        ),
      );
      return;
    }
    audio.cue('route');
    update(next);
    setStatus(
      t('Sticky placed. Route through it with the pen.', '已放置便签。请用笔将它接入线路。'),
    );
    setTool('pen');
  }
  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary) return;
    const area = viewport.current;
    if (!area) return;
    suppressPointerClick.current = false;
    if (tool === 'pan' && zoomed) {
      gesture.current = {
        type: 'pan',
        x: event.clientX,
        y: event.clientY,
        left: area.scrollLeft,
        top: area.scrollTop,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (paused || help || relay.state !== 'active') return;
    const from = (event.target as HTMLElement).closest<HTMLElement>('[data-relay-port]')?.dataset
      .relayPort;
    if (tool !== 'pen') {
      if (!from) stamp(boardPoint(event.clientX, event.clientY));
      return;
    }
    if (!from) return;
    const start = nodeMap.get(from);
    if (!start) return;
    gesture.current = {
      type: 'pen',
      from,
      points: [[start.x, start.y]],
      moved: false,
      x: event.clientX,
      y: event.clientY,
    };
  }
  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || !event.isPrimary) return;
    if (active.type === 'pan') {
      viewport.current?.scrollTo(
        active.left + active.x - event.clientX,
        active.top + active.y - event.clientY,
      );
      return;
    }
    if (!active.moved && Math.hypot(active.x - event.clientX, active.y - event.clientY) < 7) return;
    if (!active.moved) event.currentTarget.setPointerCapture(event.pointerId);
    active.moved = true;
    const last = boardPoint(event.clientX, event.clientY);
    if (active.points.length < 64) active.points.push(last);
    setPreview([...active.points, last]);
  }
  function pointerEnd(event: ReactPointerEvent<HTMLDivElement>, cancel = false) {
    const active = gesture.current;
    if (!active || !event.isPrimary) return;
    gesture.current = null;
    setPreview([]);
    if (active.type !== 'pen' || !active.moved || cancel) return;
    suppressPointerClick.current = true;
    const to = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-relay-port]')?.dataset.relayPort;
    if (to && to !== active.from) commitWire(active.from, to, active.points.slice(1));
    else setStatus(t('End your sketch on a destination node.', '请在目标节点结束绘制。'));
  }
  function cool() {
    if (paused || help) return;
    const next = vent(current.current);
    if (next !== current.current) {
      audio.cue('vent');
      update(next);
      setStatus(t('Vented heat and cache pressure.', '已释放热量和缓存压力。'));
    }
  }
  function refund() {
    if (relay.mode === 'endless' && relay.tokens > save.best) {
      persist({ ...save, best: Math.floor(relay.tokens) });
    }
  }
  function startPause() {
    audio.unlock();
    if (started) {
      setPaused((open) => !open);
    } else {
      setStarted(true);
    }
  }
  actionRef.current = (key) => {
    const index = Number(key) - 1;
    if (index >= 0 && index < Math.min(9, nodes.length) && tool === 'pen') connect(nodes[index].id);
    if (key === 'v') cool();
    if (key === 'p' && relay.state === 'active' && !help) startPause();
  };

  useEffect(() => {
    modeStart.current?.focus();
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setCalm(preference.matches);
    sync();
    preference.addEventListener('change', sync);
    const key = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.target instanceof HTMLElement &&
          event.target.matches('select, input, textarea, [contenteditable]'))
      )
        return;
      actionRef.current(event.key.toLowerCase());
    };
    document.addEventListener('keydown', key);
    return () => {
      preference.removeEventListener('change', sync);
      document.removeEventListener('keydown', key);
    };
  }, []);

  useEffect(() => () => audio.game(false), [audio]);

  useEffect(() => {
    audio.game(
      true,
      Math.min(1, Math.max(relay.heat, relay.kv)),
      paused || help || !started || relay.state !== 'active',
    );
  }, [audio, help, paused, relay.heat, relay.kv, relay.state, started]);

  useEffect(() => {
    const now = Date.now();
    if (missingSla && !wasMissingSla.current && now - lastSlaCue.current >= 1200) {
      audio.cue('sla');
      lastSlaCue.current = now;
    }
    wasMissingSla.current = missingSla;
  }, [audio, missingSla]);

  useEffect(() => {
    if (!started || paused || help || relay.state !== 'active') return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      const previous = current.current;
      const next = advance(previous, 0.12);
      if (next.faults > previous.faults || next.hazard !== previous.hazard) audio.cue('danger');
      if (next.state === 'won') audio.cue('clear');
      if (Math.floor(next.elapsed) > Math.floor(previous.elapsed)) {
        const point = readMetrics(next);
        if (point.throughput > 0) setLatest((values) => [...values.slice(-24), point]);
      }
      if (next.state === 'won') {
        const medal = next.faults === 0 ? 3 : next.faults === 1 ? 2 : 1;
        const improvement = Math.max(0, medal - save.medals[next.room]);
        const record = {
          ...save,
          credits: save.credits + improvement,
          medals: save.medals.map((value, i) => (i === next.room ? Math.max(value, medal) : value)),
        };
        setSave(record);
        writeBoardSave(record);
      }
      if (
        next.mode === 'endless' &&
        Math.floor(next.tokens) > save.best &&
        (next.state === 'lost' || Math.floor(next.elapsed / 4) !== Math.floor(previous.elapsed / 4))
      ) {
        const record = { ...save, best: Math.floor(next.tokens) };
        setSave(record);
        writeBoardSave(record);
      }
      current.current = next;
      setRelay(next);
    }, 120);
    return () => clearInterval(timer);
  }, [audio, help, paused, relay.state, save, started]);

  const time =
    relay.mode === 'campaign'
      ? Math.max(0, Math.ceil(shown.limit - relay.elapsed))
      : Math.floor(relay.elapsed);
  const note =
    relay.mode === 'sandbox'
      ? t(
          'Use unlimited ink. Save a blueprint, then compare precision and batch settings on the trade-off plot.',
          '墨水不限。保存蓝图，并用权衡图比较精度和批量设置。',
        )
      : relay.mode === 'endless'
        ? t(
            'Survive escalating load. The run ends on your third fault; unjam by drawing a fallback.',
            '负载逐步加重。第三次故障会结束运行；可用备用线路绕过阻断。',
          )
        : shown.note[lang];

  return (
    <div
      className="excalidraw-relay"
      data-calm={calm || !started || paused || help || relay.state !== 'active'}
    >
      <div className="excalidraw-relay-tools" aria-label={t('Mode', '模式')}>
        {modes.map(({ id, label }) => (
          <button
            key={id}
            ref={id === 'campaign' ? modeStart : undefined}
            type="button"
            aria-pressed={relay.mode === id}
            onClick={() => {
              refund();
              change(id, id === 'endless' ? 4 : 0);
            }}
          >
            {label[lang]}
          </button>
        ))}
        <button type="button" aria-expanded={help} onClick={() => setHelp(!help)}>
          {t('How to play', '玩法说明')}
        </button>
        <button
          type="button"
          data-testid="excalidraw-relay-audio"
          aria-label={t('Mute Relay audio', '静音中继音频')}
          aria-pressed={!audible}
          onClick={toggleAudio}
        >
          {audible ? t('Mute audio', '静音') : t('Unmute audio', '取消静音')}
        </button>
      </div>
      {help && (
        <div className="excalidraw-relay-note">
          {t(
            'Drag the pen between two nodes, tap them in order, or use the numbered keys. Repeat a pair to erase it. To place a sticky, select its type and tap the sheet or choose Place at center. Pan mode opens the full board; Overview fits it back to the window. Press P to pause, V to vent. Larger batches can raise throughput at the cost of latency and VRAM.',
            '用笔在两个节点间拖画，依次点选节点，或按对应数字键。重复连接可擦除线路。选择便签类型后点击白板，或选“放在中央”。平移模式打开完整白板；“全览”恢复适配窗口。P 暂停，V 散热。较大的批量能提高吞吐，但会增加延迟和显存用量。',
          )}
        </div>
      )}
      <div
        className="excalidraw-relay-map"
        aria-label={t('Map of the five rooms', '五个房间的地图')}
      >
        {ROOMS.map((room, i) => (
          <button
            key={room.name[0]}
            type="button"
            aria-current={i === relay.room ? 'location' : undefined}
            aria-label={`${i + 1}. ${room.name[lang]} ${save.medals[i] ? '★'.repeat(save.medals[i]) : ''}`}
            disabled={relay.mode === 'endless' || (relay.mode === 'campaign' && i > unlocked)}
            onClick={() => change(relay.mode, i)}
          >
            <span>{String(i + 1).padStart(2, '0')}</span> {room.name[lang]}
            {save.medals[i] ? (
              <small aria-hidden="true"> {'★'.repeat(save.medals[i])}</small>
            ) : null}
          </button>
        ))}
      </div>
      <div className="excalidraw-relay-note">
        <strong>{shown.name[lang]}</strong> · {note}
      </div>
      <div className="excalidraw-relay-tools" aria-label={t('Board tools', '白板工具')}>
        <button
          type="button"
          aria-pressed={tool === 'pen'}
          onClick={() => {
            setTool('pen');
            setSelected(null);
          }}
        >
          {t('Pen', '画笔')}
        </button>
        <button
          type="button"
          aria-pressed={zoomed && tool === 'pan'}
          onClick={() => {
            setZoomed(true);
            setTool('pan');
            setSelected(null);
          }}
        >
          {t('Pan board', '平移白板')}
        </button>
        {zoomed && (
          <button
            type="button"
            onClick={() => {
              setZoomed(false);
              setTool('pen');
            }}
          >
            {t('Overview', '全览')}
          </button>
        )}
        <select
          aria-label={t('Place node', '放置节点')}
          value={tool === 'pen' || tool === 'pan' ? '' : tool}
          onChange={(event) => setTool((event.target.value || 'pen') as Tool)}
          disabled={paused || help || relay.state !== 'active'}
        >
          <option value="">{t('Place node…', '放置节点…')}</option>
          {Object.entries(placeables)
            .filter(([id]) => relay.mode === 'sandbox' || id === 'cache')
            .map(([id, title]) => (
              <option key={id} value={id}>
                {title[lang]}
                {relay.mode === 'sandbox' ? '' : ` · ${nodeCost(relay)} ${t('ink', '墨水')}`}
              </option>
            ))}
        </select>
        {tool !== 'pen' && tool !== 'pan' && (
          <button
            type="button"
            onClick={() => {
              const slots: Point[] = [
                [1200, 700],
                [820, 960],
                [1550, 440],
                [420, 260],
                [1970, 1120],
              ];
              const open = slots.find(([x, y]) =>
                nodes.every((node) => Math.hypot((node.x - x) / 340, (node.y - y) / 230) >= 1),
              );
              stamp(open ?? slots[0]);
            }}
          >
            {t('Place at center', '放在中央')}
          </button>
        )}
      </div>
      <div className="excalidraw-relay-layout">
        <div
          ref={viewport}
          className="excalidraw-relay-viewport"
          data-zoomed={zoomed}
          aria-label={t('Scrollable whiteboard', '可滚动白板')}
          tabIndex={zoomed ? 0 : undefined}
        >
          <div
            ref={surface}
            className="excalidraw-relay-board"
            data-tool={tool}
            style={{ '--room-ink': shown.color } as React.CSSProperties}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerEnd}
            onPointerCancel={(event) => pointerEnd(event, true)}
          >
            <svg
              viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
              aria-hidden="true"
              preserveAspectRatio="none"
            >
              <defs>
                <marker
                  id="excalidraw-wire-arrow"
                  markerWidth="6"
                  markerHeight="6"
                  refX="5"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0 0L5 3L0 6" />
                </marker>
              </defs>
              {connections.map(({ id, edge }) => {
                const from = nodeMap.get(edge[0]);
                const to = nodeMap.get(edge[1]);
                if (!from || !to) return null;
                const wired = relay.wires.includes(id);
                const [a, b, c, d] = [from.x, from.y, to.x, to.y];
                const curve = relay.sketches[id]?.length
                  ? pathOf([[a, b], ...relay.sketches[id], [c, d]])
                  : `M${a} ${b} Q${(a + c) / 2 - (a === c ? 105 : 0)} ${(b + d) / 2 - 54} ${c} ${d}`;
                const cut = erased(relay, id);
                return (
                  <g
                    key={id}
                    data-wire={
                      cut || jammed(relay, id)
                        ? 'jam'
                        : activePath.includes(id)
                          ? 'live'
                          : wired
                            ? 'drawn'
                            : 'guide'
                    }
                  >
                    <path d={curve} vectorEffect="non-scaling-stroke" />
                    {cut && (
                      <path
                        d={`M${(a + c) / 2 - 36} ${(b + d) / 2 - 36}l72 72m0 -72l-72 72`}
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    {wired && (
                      <path
                        d={curve}
                        transform="translate(8 10)"
                        vectorEffect="non-scaling-stroke"
                        className="excalidraw-relay-echo"
                      />
                    )}
                  </g>
                );
              })}
              {preview.length > 1 && (
                <path
                  data-testid="excalidraw-wire-preview"
                  d={pathOf(preview)}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
            {nodes.map((node, i) => (
              <button
                type="button"
                key={node.id}
                className="excalidraw-relay-node"
                style={{
                  left: `${(node.x / BOARD_WIDTH) * 100}%`,
                  top: `${(node.y / BOARD_HEIGHT) * 100}%`,
                }}
                aria-pressed={selected === node.id}
                onClick={(event) => {
                  if (tool === 'pen' && (!suppressPointerClick.current || event.detail === 0))
                    connect(node.id);
                  suppressPointerClick.current = false;
                }}
                disabled={relay.state !== 'active' || paused || help}
                data-routed={metrics.path.includes(node.id)}
                data-relay-port={node.id}
                data-sticky={node.id.startsWith('sticky')}
              >
                <svg className="excalidraw-relay-actor" aria-hidden="true" viewBox="0 0 100 66">
                  <path d={actorInk[node.kind][0]} />
                  <path d={actorInk[node.kind][1]} />
                </svg>
                {node.title[lang]}
                {i < 9 && <kbd aria-hidden="true">{i + 1}</kbd>}
              </button>
            ))}
            <div className="excalidraw-relay-board-label">
              {t('PATCH PANEL', '布线面板')} / {String(relay.room + 1).padStart(2, '0')}{' '}
              {relay.room === 4 &&
                relay.mode !== 'sandbox' &&
                `· ${t('Phase', '阶段')} ${relay.phase}/3 · ${['FP4', 'FP8', 'BF16'][relay.phase - 1]}+`}
            </div>
          </div>
        </div>
        <section className="excalidraw-relay-meter" aria-label={t('Live benchmark', '实时基准')}>
          <div className="excalidraw-relay-score">
            <span>
              {t('Raw', '原始')} <b>{metrics.throughput}</b> tok/s
            </span>
            <span data-verified-rate={scoring ? Math.round(metrics.verifiedRate) : 0}>
              {t('Verified', '通过校验')} <b>{scoring ? Math.round(metrics.verifiedRate) : 0}</b>{' '}
              tok/s
            </span>
            <span>
              <b>{metrics.interaction}</b> tok/s/{t('user', '用户')}
            </span>
            <span>
              <b>{metrics.ttft || '—'}</b> ms TTFT
            </span>
          </div>
          <div role="status" className="excalidraw-relay-validation">
            {missingSla ? (
              <span data-sla-state="missed">
                {t('SLA missed: no tokens counted.', '未达 SLA：词元不计分。')}
              </span>
            ) : scoring && metrics.precisionMissed ? (
              <span data-sla-state="precision">
                {t('This phase needs higher precision.', '此阶段需要更高精度。')}
              </span>
            ) : null}
          </div>
          {reviewing && (
            <ul className="excalidraw-relay-review" aria-label={t('Phase targets', '阶段目标')}>
              {REVIEW_PHASE_GOALS.map((goal, i) => {
                const earned = Math.floor(relay.reviewScores[i]);
                return (
                  <li
                    key={i}
                    aria-current={relay.phase === i + 1 ? 'step' : undefined}
                    data-review-phase={i + 1}
                    data-phase-score={earned}
                    data-phase-goal={goal}
                  >
                    {t('Phase', '阶段')} {i + 1}: {earned}/{goal}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="excalidraw-relay-plot">
            <svg
              viewBox="0 0 140 62"
              role="img"
              aria-label={t(
                'Recent points: throughput right, interactivity up',
                '近期数据点：向右为吞吐，向上为交互速率',
              )}
            >
              <path
                d="M8 4 V55 H136 M8 25 H136 M70 4 V55"
                fill="none"
                stroke="currentColor"
                strokeOpacity=".24"
                strokeDasharray="3 3"
              />
              {latest.map((dot, i) => {
                const frontier = !latest.some(
                  (other) =>
                    other.throughput >= dot.throughput &&
                    other.interaction >= dot.interaction &&
                    (other.throughput > dot.throughput || other.interaction > dot.interaction),
                );
                return (
                  <circle
                    key={i}
                    cx={Math.min(135, 8 + dot.throughput * 0.54)}
                    cy={Math.max(5, 55 - dot.interaction * 1.15)}
                    r={i === latest.length - 1 ? 4 : 2.6}
                    fill={frontier ? 'var(--primary)' : 'currentColor'}
                    opacity={frontier ? 0.9 : 0.32}
                  />
                );
              })}
            </svg>
            <small>{t('Pareto frontier in ink', '主题色标记帕累托前沿')}</small>
          </div>
          <label>
            {t('Heat', '热量')}{' '}
            <meter
              min={0}
              max={1}
              low={0.45}
              high={0.75}
              optimum={0}
              value={Math.min(1, relay.heat)}
            />{' '}
            {Math.round(relay.heat * 100)}%
          </label>
          <label>
            {t('VRAM', '显存')}{' '}
            <meter
              min={0}
              max={1}
              low={0.45}
              high={0.75}
              optimum={0}
              value={Math.min(1, relay.kv)}
            />{' '}
            {Math.round(relay.kv * 100)}%
          </label>
          <div>
            {t('Ink', '墨水')}: {relay.mode === 'sandbox' ? '∞' : Math.floor(relay.credits)} ·{' '}
            {t('Faults', '故障')}: {relay.faults}
            {relay.mode === 'sandbox' ? '' : '/3'}
            {relay.room === 2 && ` · Top-${metrics.topK}/2`}
            {metrics.sla !== undefined && ` · SLA ≤ ${metrics.sla} ms`}
            {!reviewing &&
              metrics.fidelity < 1 &&
              ` · ${t('Verified', '通过校验')} ${Math.round(metrics.fidelity * 100)}%`}
          </div>
        </section>
      </div>
      <div className="excalidraw-relay-tools">
        <label>
          {t('Batch', '批量')}{' '}
          <select
            aria-label={t('Batch size', '批量大小')}
            value={relay.batch}
            onChange={(event) => update({ ...current.current, batch: Number(event.target.value) })}
          >
            {[1, 2, 4, 6, 8, 12].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          {t('Precision', '精度')}{' '}
          <select
            value={relay.precision}
            onChange={(event) =>
              update({ ...current.current, precision: event.target.value as Precision })
            }
          >
            {['FP4', 'FP8', 'BF16'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={cool} disabled={paused || help || relay.state !== 'active'}>
          {t('Vent', '散热')} [V]
        </button>
        <button type="button" onClick={startPause} disabled={help || relay.state !== 'active'}>
          {started ? (paused ? t('Resume', '继续') : t('Pause', '暂停')) : t('Run', '运行')} [P]
        </button>
        <button
          type="button"
          onClick={() => {
            refund();
            change(relay.mode, relay.room);
          }}
        >
          {t('Restart', '重启')}
        </button>
      </div>
      <div className="excalidraw-relay-note excalidraw-relay-summary" data-run-state={relay.state}>
        <span>
          {time}s · {Math.floor(relay.tokens)}
          {relay.mode === 'campaign' ? `/${shown.goal}` : ''} {t('tokens', '词元')}
        </span>
        <span role="status">
          {relay.state === 'won'
            ? reviewing
              ? t('Campaign complete!', '战役已通关！')
              : t('Room cleared!', '房间已通关！')
            : relay.state === 'lost'
              ? relay.missedReviewPhase
                ? t(
                    `Phase ${relay.missedReviewPhase} missed its verified target. Rewire and try again.`,
                    `阶段 ${relay.missedReviewPhase} 未达到校验目标。请重新布线再试。`,
                  )
                : t('Run ended. Rewire and try again.', '运行已结束。请重新布线再试。')
              : paused
                ? t('Paused', '已暂停')
                : relay.hazard && relay.hazard.until > relay.elapsed
                  ? relay.hazard.type === 'jam'
                    ? t('Red wire jammed!', '红色线路被封锁！')
                    : relay.hazard.type === 'erase'
                      ? t(
                          'Review cut: red pen erased a live wire.',
                          '评审改动：红笔擦除了一条活动线路。',
                        )
                      : t('Incoming load surge!', '负载突增！')
                  : status}
        </span>
        {relay.state === 'won' && relay.room < 4 && (
          <button type="button" onClick={() => change('campaign', relay.room + 1)}>
            {t('Next room', '下一房间')} →
          </button>
        )}
      </div>
      <div className="excalidraw-relay-tools">
        {relay.mode === 'sandbox' ? (
          <>
            <button
              type="button"
              onClick={() => {
                persist({
                  ...save,
                  blueprint: relay.wires,
                  room: relay.room,
                  nodes: relay.nodes,
                  sketches: relay.sketches,
                });
                setStatus(t('Blueprint saved.', '蓝图已保存。'));
              }}
            >
              {t('Save blueprint', '保存蓝图')}
            </button>
            <button
              type="button"
              disabled={save.blueprint.length === 0 && save.nodes.length === 0}
              onClick={() => change('sandbox', save.room, true)}
            >
              {t('Load blueprint', '载入蓝图')}
            </button>
          </>
        ) : (
          <>
            <span>
              {t('Upgrade credits', '升级积分')}: {save.credits}
            </span>
            {(['heat', 'cache'] as const).map((id) => (
              <button
                type="button"
                key={id}
                disabled={save.credits < 3 || save.upgrades.includes(id)}
                onClick={() => {
                  persist({ ...save, credits: save.credits - 3, upgrades: [...save.upgrades, id] });
                  update({
                    ...current.current,
                    [id === 'heat' ? 'heatUpgrade' : 'cacheUpgrade']: true,
                  });
                }}
              >
                {id === 'heat' ? t('Ceramic cooler', '陶瓷冷却器') : t('Cache bank', '缓存组')}{' '}
                {save.upgrades.includes(id) ? '✓' : '· 3'}
              </button>
            ))}
            {inkUpgrades.map(({ id, title, detail, cost }) => (
              <button
                type="button"
                key={id}
                title={detail[lang]}
                aria-label={`${title[lang]}: ${detail[lang]}`}
                disabled={save.credits < cost || save.upgrades.includes(id)}
                onClick={() => {
                  const upgrades = [...save.upgrades, id];
                  persist({ ...save, credits: save.credits - cost, upgrades });
                  update({
                    ...current.current,
                    upgrades,
                    credits: current.current.credits + (id === 'reservoir' ? 4 : 0),
                  });
                }}
              >
                {title[lang]} {save.upgrades.includes(id) ? '✓' : `· ${cost}`}
              </button>
            ))}
            {Boolean(save.best) && (
              <span>
                {t('Endless best', '无尽纪录')}: {save.best}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
