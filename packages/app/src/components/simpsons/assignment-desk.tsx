'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  canvasPointLayerOf,
  CANVAS_POINT_LAYER_SELECTOR as LAYER,
} from '@/lib/d3-chart/layers/canvas-point-registry';
import { Skeleton } from '@/components/ui/skeleton';
import { ART } from './strings';

const wires = {
  hams: ['Steamed Hams', '蒸火腿', 'hams', '¡Ay, caramba!', '哎呀，天哪！', 'ay-caramba'],
  overlords: [
    'Our new GPU overlords',
    '我们的新 GPU 霸主',
    'anchor-desk',
    'Excellent...',
    '好极了……',
    '',
  ],
  cloud: [
    'Old Man Yells at Cloud',
    '老翁朝云怒吼',
    'cloud',
    '...Worst. Episode. Ever.',
    '……史上最烂的一集。',
    '',
  ],
  milhouse: ['Milhouse is not a meme', '米尔豪斯不是梗', 'milhouse', 'Ha-ha!', '哈！哈！', 'ha-ha'],
  ralph: [
    "I'm in danger",
    '我有危险了',
    'bus-seat',
    "Don't have a cow, man!",
    '别大惊小怪，伙计！',
    '',
  ],
  hedge: ['Back into the hedge', '退进树篱', 'retreat', "D'oh!", '哎呀！', 'doh'],
  slate: [
    'Detention replay',
    '留堂重播',
    'bart-board',
    'Eat my shorts',
    '吃我的短裤吧！',
    'shorts',
  ],
  units: [
    'Lisa checks the units',
    '莉萨核对单位',
    'lisa-sax',
    'S-M-R-T; I mean, S-M-A-R-T!',
    '聪、明！我是说，真聪明！',
    '',
  ],
  neighbor: [
    '742 → Channel 6',
    '742 号 → 第六频道',
    'neighbor',
    'Hi-diddly-ho, neighborino',
    '嗨咿呀嗨，邻居伙计！',
    '',
  ],
  outage: ['No signal', '没有信号', 'homer', "D'oh!", '哎呀！', 'doh'],
} as const;
type Story = keyof typeof wires;
interface Row {
  x: number;
  y: number;
  precision: string;
  hw?: string;
  hwKey?: string;
  output_tput_per_gpu?: number;
  median_ttft?: number;
  conc?: number;
}
function reading() {
  const graph = document.querySelector<SVGSVGElement>('figure svg[data-testid="d3-chart-svg"]');
  const layers = graph ? [...graph.querySelectorAll(LAYER)] : [];
  const rows = layers.flatMap((el) =>
    (canvasPointLayerOf<Row>(el)?.snapshot() ?? [])
      .filter((p) => p.interactive && p.opacity > 0.1)
      .map((p) => ({ el, p })),
  );
  const fastest = rows.reduce(
    (a, b) =>
      (a?.p.datum.output_tput_per_gpu ?? -1) > (b.p.datum.output_tput_per_gpu ?? -1) ? a : b,
    rows[0],
  );
  const slow = rows.reduce(
    (a, b) => ((a?.p.datum.median_ttft ?? -1) > (b.p.datum.median_ttft ?? -1) ? a : b),
    rows[0],
  );
  const batch = rows.reduce((n, b) => Math.max(n, b.p.datum.conc ?? 0), 0);
  return {
    fastest,
    slow,
    batch,
    count: rows.length,
    series: new Set(rows.map(({ p }) => p.datum.hwKey ?? p.datum.hw)).size,
  };
}
export function SpringfieldDesk({
  zh,
  path,
  play,
}: {
  zh: boolean;
  path: string;
  play: (s: string) => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null),
    [card, setCard] = useState<{ id: Story; text: string } | null>(null);
  const [index, setIndex] = useState<string[]>([]),
    [hold, setHold] = useState(false);
  const fire = useRef<(id: Story) => void>(() => {}),
    send = useRef(play),
    cooldown = useRef(new Map<string, number>());
  send.current = play;
  const L = (a: string, b: string) => (zh ? b : a);
  useEffect(() => {
    if (!/\/infx\/inference/.test(path)) return;
    let slot: HTMLElement | null = null,
      frame = 0,
      clock = 0,
      late = 0,
      update = 0,
      typed = '',
      seen: string[] = [];
    const last = cooldown.current;
    const during = new Set<number>();
    const after = (cb: () => void, ms: number) => {
      const n = window.setTimeout(() => {
        during.delete(n);
        cb();
      }, ms);
      during.add(n);
    };
    try {
      seen = JSON.parse(localStorage.getItem('simpsons-line-index') || '[]');
      if (!Array.isArray(seen)) seen = [];
    } catch {
      seen = [];
    }
    setIndex(seen);
    setHold(new URLSearchParams(location.search).get('sp_hold') === 'loading');
    const fireStory = (id: Story) => {
      const now = Date.now(),
        row = wires[id];
      if (now - (last.get(row[3]) ?? 0) < 20000) return;
      const r = reading(),
        p = r.fastest?.p.datum,
        slow = r.slow?.p.datum;
      if (!r.count && !['outage', 'neighbor'].includes(id)) return;
      const count = r.count.toLocaleString(zh ? 'zh' : 'en'),
        tps = Math.round(p?.output_tput_per_gpu ?? 0).toLocaleString(zh ? 'zh' : 'en'),
        ms = Math.round((slow?.median_ttft ?? 0) * 1000).toLocaleString(zh ? 'zh' : 'en');
      const name = (p?.hw ?? p?.hwKey ?? 'GPU').toUpperCase();
      const words: Record<Story, [string, string]> = {
        hams: [
          `Skinner’s order ticket: ${r.batch} concurrent requests. Steamed in one batch? Chalmers demands to see the kitchen.`,
          `斯金纳的订单：${r.batch} 个并发请求。一锅蒸完？查尔默斯坚持要看厨房。`,
        ],
        overlords: [
          `Kent interrupts this broadcast to welcome ${name}, our ${tps} tok/s/GPU overlord. Allegiance valid until the next filter.`,
          `肯特插播：欢迎每 GPU 每秒 ${tps} 词元的 ${name} 新霸主。效忠有效期至下次筛选。`,
        ],
        cloud: [
          `EXTRA! Local man spent ${ms} ms waiting for his first token. The cloud declined to comment.`,
          `号外！本地老翁等首个词元用了 ${ms} 毫秒。云端拒绝置评。`,
        ],
        milhouse: [
          `Census: ${count} plotted measurements. Verified Milhouses: zero. His application to be a benchmark is denied.`,
          `普查：图上 ${count} 个测量点，认证米尔豪斯零个。他的基准申请被驳回。`,
        ],
        ralph: [
          `Ralph’s bus ticket: up to ${r.batch} requests aboard. “I’m in danger.” The emergency exit is the table view.`,
          `拉尔夫的车票：最多 ${r.batch} 个请求挤上车。“我有危险了。”紧急出口是数据表。`,
        ],
        hedge: [
          `Homer backs away from the legend. ${r.series} chip families and ${count} samples are still on air.`,
          `霍默从图例退进树篱。仍在播出：${r.series} 个芯片家族、${count} 个样本。`,
        ],
        slate: [
          `Bart borrowed a frontier made of ${count} live samples. Principal Skinner wants the board back.`,
          `巴特借走了由 ${count} 个实测样本组成的前沿。斯金纳校长要求归还滑板。`,
        ],
        units: [
          `Lisa’s unit check: ${tps} tokens/second/GPU is throughput; ${ms} milliseconds is first-token latency. They do not share an axis.`,
          `莉萨核对：每 GPU 每秒 ${tps} 个词元是吞吐量；${ms} 毫秒是首词元时延。两者不能混用坐标轴。`,
        ],
        neighbor: [
          `Ned passed along the cable from 742. The station’s next clue: call the frontier leader from this assignment desk.`,
          `内德从 742 号接来了电缆。下一条线索：在此采访台呼叫前沿冠军。`,
        ],
        outage: [
          `Zero matching measurements. Homer has eaten the last data point. The stock filter controls below will bring it back.`,
          `符合条件的测量为零。霍默吃掉了最后一个数据点。请用原有筛选控件恢复。`,
        ],
      };
      let text = words[id][zh ? 1 : 0];
      try {
        if (id === 'overlords' && sessionStorage.getItem('sp-cable-trail') === 'patched') {
          text =
            (zh
              ? '742 号信号接通！沙发全家上镜。'
              : '742 feed restored! The whole couch is on air. ') + text;
          sessionStorage.setItem('sp-cable-trail', 'aired');
        }
        if (!seen.includes(row[3])) {
          seen = [...seen, row[3]];
          localStorage.setItem('simpsons-line-index', JSON.stringify(seen));
          setIndex(seen);
        }
      } catch {
        /* optional */
      }
      last.set(row[3], now);
      setCard({ id, text });
      clearTimeout(clock);
      clock = window.setTimeout(() => setCard(null), 5600);
      if (row[5] && navigator.userActivation.hasBeenActive) send.current(row[5]);
    };
    fire.current = fireStory;
    const empty = '[data-testid="scatter-empty-state"],[data-testid="chart-empty-state"]';
    const sync = () => {
      frame = 0;
      const f =
        document.querySelector('figure[data-testid="chart-figure"]') ??
        document.querySelector(empty);
      if (f && (!slot?.isConnected || slot.previousElementSibling !== f)) {
        slot?.remove();
        slot = document.createElement('div');
        slot.className = 'sp-desk-slot no-export';
        f.after(slot);
        setHost(slot);
      }
      if (document.querySelector(empty) && !reading().count) fireStory('outage');
    };
    const scan = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };
    scan();
    const obs = new MutationObserver((rs) => {
      if (
        rs.some((r) =>
          [...r.addedNodes, ...r.removedNodes].some(
            (n) =>
              n instanceof Element &&
              (n.matches(`figure,${empty}`) || n.querySelector(`figure,${empty}`)),
          ),
        )
      )
        scan();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    const pulse = () => {
      const f = document.querySelector<HTMLElement>('figure[data-testid="chart-figure"]');
      if (!f) return;
      f.dataset.spTune = 'on';
      const freeze = new URLSearchParams(location.search).get('sp_hold') === 'update';
      if (freeze) f.dataset.spMidframe = '';
      clearTimeout(update);
      update = window.setTimeout(
        () => {
          delete f.dataset.spTune;
          delete f.dataset.spMidframe;
        },
        freeze ? 2400 : 500,
      );
    };
    const act = (ev: MouseEvent) => {
      if (!(ev.target instanceof Element)) return;
      const el = ev.target;
      if (el.closest('.simpsons-chart-cue')) {
        after(() => fireStory('slate'), 110);
      } else if (
        el.closest('[data-testid="chart-legend"] label,[data-testid="chart-legend"] input')
      ) {
        clearTimeout(late);
        late = window.setTimeout(() => {
          pulse();
          fireStory('hedge');
        }, 250);
      } else if (el.closest('.dot-hit-area,.dot-group')) fireStory('ralph');
      else if (
        el.closest(
          '[role=option],[data-select-option],[data-slot=select-item],[data-testid^=quick-filter-], [data-testid=scatter-empty-clear-filters]',
        )
      ) {
        after(() => {
          pulse();
          if (!document.querySelector(empty)) fireStory('units');
        }, 200);
      }
    };
    const type = (e: KeyboardEvent) => {
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.key.length !== 1 ||
        (e.target instanceof Element &&
          e.target.closest('input,textarea,select,[contenteditable=true]'))
      )
        return;
      typed = (typed + e.key.toLowerCase()).slice(-10);
      if (typed.endsWith('milhouse')) fireStory('milhouse');
    };
    document.addEventListener('click', act, true);
    document.addEventListener('keydown', type);
    try {
      if (sessionStorage.getItem('sp-cable-trail') === 'clue') {
        sessionStorage.setItem('sp-cable-trail', 'patched');
        after(() => fireStory('neighbor'), 1000);
      }
    } catch {
      /* optional */
    }
    return () => {
      obs.disconnect();
      document.removeEventListener('click', act, true);
      document.removeEventListener('keydown', type);
      cancelAnimationFrame(frame);
      clearTimeout(clock);
      clearTimeout(late);
      clearTimeout(update);
      during.forEach(clearTimeout);
      slot?.remove();
      setHost(null);
      setCard(null);
      const target = document.querySelector<HTMLElement>('[data-sp-tune]');
      if (target) {
        delete target.dataset.spTune;
        delete target.dataset.spMidframe;
      }
    };
  }, [path, zh]);
  if (!host) return null;
  const pin = () => {
    if (!host.isConnected) return;
    const r = reading(),
      target = r.fastest;
    if (!target) return;
    const graph = target.el.closest('svg'),
      hit = target.el.querySelector('path.dot-hit-area');
    if (!graph || !hit) return;
    graph.scrollIntoView({ block: 'center' });
    requestAnimationFrame(() => {
      const point = new DOMPoint(target.p.x, target.p.y).matrixTransform(
        (target.el as SVGGraphicsElement).getScreenCTM()!,
      );
      for (const type of ['mouseenter', 'mousemove', 'click'])
        hit.dispatchEvent(
          new MouseEvent(type, { bubbles: true, clientX: point.x, clientY: point.y, view: window }),
        );
    });
  };
  const actions: [Story, string, string][] = [
    ['hams', 'Check the largest batch', '查最大批次'],
    ['overlords', 'Call the throughput leader', '呼叫吞吐冠军'],
    ['cloud', 'Print slowest first token', '刊印最慢首词元'],
    ['ralph', 'Inspect the bus manifest', '查阅校车名单'],
    ['milhouse', 'Count the plotted samples', '清点样本'],
    ['units', 'Check the two units', '核对两个单位'],
  ];
  const w = card && wires[card.id];
  return createPortal(
    <section className="sp-assignment-desk">
      {hold && (
        <div className="sp-standby-hold">
          <small>{L('Signal hold · station preview', '信号定格 · 电台预览')}</small>
          <Skeleton className="sp-held-skeleton" />
        </div>
      )}
      {card && w && (
        <article className="sp-wire-story" data-story={card.id} role="status">
          <div className="sp-wire-still">
            <img src={`${ART}${w[2]}.webp`} alt="" />
            {card.id === 'hams' && <img src={`${ART}kitchen-story.webp`} alt="" />}
            {card.id === 'overlords' && card.text.startsWith('742') && (
              <img src={`${ART}couch-family.webp`} alt="" />
            )}
          </div>
          <div>
            <small>{L('CHANNEL 6 • FIELD COPY', '第六频道 · 现场稿')}</small>
            <strong>{w[zh ? 1 : 0]}</strong>
            <p>{card.text}</p>
            <b>
              {zh ? `${w[4]}  /  ` : ''}
              <span lang="en">{w[3]}</span>
            </b>
          </div>
        </article>
      )}
      <details>
        <summary>
          {L('Channel 6 assignment desk', '第六频道采访台')} · {index.length}/9
        </summary>
        <p>
          {L(
            'Work from this plot’s measurements. Tip: type MILHOUSE for a recount.',
            '用本图实测数据写报道。提示：键入 MILHOUSE 可重新普查。',
          )}
        </p>
        <div className="sp-desk-actions">
          {actions.map(([id, en, cn]) => (
            <button key={id} type="button" data-sp-desk={id} onClick={() => fire.current(id)}>
              {L(en, cn)}
            </button>
          ))}
          <button type="button" data-sp-desk="pin" onClick={pin}>
            {L('Pin the leading sample', '固定领先样本')}
          </button>
        </div>
        <details>
          <summary>
            {L('Found lines', '已收集台词')} · {index.length}/9
          </summary>
          <ul>
            {[...new Set(Object.values(wires).map((x) => x[3]))].map((s) => (
              <li key={s}>
                {index.includes(s)
                  ? zh
                    ? `${Object.values(wires).find((x) => x[3] === s)?.[4]} / ${s}`
                    : s
                  : L('Unheard line', '待发现台词')}
              </li>
            ))}
          </ul>
        </details>
      </details>
    </section>,
    host,
  );
}
