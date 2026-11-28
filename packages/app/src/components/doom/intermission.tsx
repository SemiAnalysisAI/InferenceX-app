'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CANVAS_POINT_LAYER_SELECTOR as LAYER,
  canvasPointLayerOf,
} from '@/lib/d3-chart/layers/canvas-point-registry';

const slips = {
  boot: ['It Runs DOOM', '它能跑 DOOM', 'hangar', 'Knee-Deep in the Dead', '深陷亡者之中'],
  orders: [
    'Rip and Tear',
    '撕裂队列',
    'imp',
    'Rip and tear, until it is done.',
    '撕裂，直到完成。',
  ],
  riff: ['Soundtrack edit', '配乐剪辑', 'babel', 'Here comes the Night Train!', '夜班列车来了！'],
  god: [
    'IDDQD',
    'IDDQD 不死模式',
    'soul-orb',
    'The only thing they fear... is you.',
    '他们唯一畏惧的……就是你。',
  ],
  john: [
    'Repercussions of Evil',
    '邪恶的反响',
    'caco',
    'Sweet Christmas! Big-mouthed floating thingies!',
    '圣诞老天！大嘴巴的漂浮怪！',
  ],
  mars: [
    'Mars Core override',
    '火星核心越权',
    'phobos-cannon',
    "You can't just shoot a hole into the surface of Mars.",
    '你不能就这么在火星表面轰出一个洞。',
  ],
  print: [
    'Generic 2016 box art',
    '2016 年通用封面',
    'box-2016',
    "The UAC – we've got guts. HUGE guts!",
    '联合航天集团有胆量。天大的胆量！',
  ],
  fuel: [
    'Argent meter',
    '银色能源仪表',
    'tech-pillar',
    'The road to Hell is paved – by Argent Energy.',
    '通往地狱的道路由银色能源铺就。',
  ],
  arrival: [
    'Freight manifest',
    '货运清单',
    'card-blue',
    'Welcome to Hell! Brought to you by your friends at the UAC.',
    '欢迎来到地狱！由联合航天集团的朋友为您呈献。',
  ],
} as const;
type Id = keyof typeof slips;
interface Datum {
  x: number;
  y: number;
  precision: string;
  hw?: string;
  hwKey?: string;
  median_ttft?: number;
  output_tput_per_gpu?: number;
  conc?: number;
}
const metrics = () => {
  const layer = document.querySelector<SVGGElement>(`figure ${LAYER}`),
    pts = (canvasPointLayerOf<Datum>(layer)?.snapshot() ?? []).filter(
      (p) => p.interactive && p.opacity > 0.1,
    );
  const peak = pts.reduce(
    (a, b) => ((a?.datum.output_tput_per_gpu ?? 0) > (b.datum.output_tput_per_gpu ?? 0) ? a : b),
    pts[0],
  );
  return {
    layer,
    peak,
    n: pts.length,
    h: new Set(pts.map((p) => p.datum.hwKey ?? p.datum.hw)).size,
    ms: Math.round(1000 * Math.max(0, ...pts.map((p) => p.datum.median_ttft ?? 0))),
    batch: Math.max(0, ...pts.map((p) => p.datum.conc ?? 0)),
  };
};
const figure = 'figure[data-testid="chart-figure"]',
  empty = '[data-testid="scatter-empty-state"]';
export function Intermission({ path, zh }: { path: string; zh: boolean }) {
  const [host, setHost] = useState<HTMLElement | null>(null),
    [story, setStory] = useState<{ id: Id; text: string; value: string } | null>(null),
    [found, setFound] = useState<Id[]>([]),
    [hold, setHold] = useState(false);
  const fire = useRef<(id: Id) => void>(() => {}),
    cool = useRef(new Map<Id, number>());
  const L = (a: string, b: string) => (zh ? b : a);
  useEffect(() => {
    if (!/\/infx\/inference/.test(path)) return;
    let slot: HTMLElement | null = null,
      frame = 0,
      timer = 0,
      melt = 0,
      typed = '',
      known: Id[] = [];
    const pending = new Set<number>();
    const after = (f: () => void, ms: number) => {
      const n = window.setTimeout(() => {
        pending.delete(n);
        f();
      }, ms);
      pending.add(n);
    };
    try {
      known = JSON.parse(localStorage.getItem('doom-radio-index') || '[]');
      if (!Array.isArray(known)) known = [];
    } catch {
      known = [];
    }
    setFound(known);
    setHold(new URLSearchParams(location.search).get('uac_hold') === 'loading');
    const show = (id: Id) => {
      if (Date.now() - (cool.current.get(id) ?? 0) < 20000) return;
      const { n, h, ms, batch, peak } = metrics();
      if (!n && id !== 'arrival') return;
      const num = (x: number) => x.toLocaleString(zh ? 'zh' : 'en');
      const t = num(Math.round(peak?.datum.output_tput_per_gpu ?? 0)),
        hw = (peak?.datum.hw ?? 'GPU').toUpperCase();
      let finish = false;
      try {
        if (id === 'mars' && sessionStorage.getItem('doom-freight') === 'unsealed') {
          finish = true;
          sessionStorage.setItem('doom-freight', 'delivered');
        }
      } catch {
        /* optional */
      }
      const dispatch: Record<Id, [string, string, string]> = {
        boot: [
          `${num(n)} ${zh ? '次' : 'RUN'}`,
          `Terminal certification: ${num(n)} measured runs fit on this display. Yes, it runs DOOM. No, the terminal does not get its own GPU row.`,
          `终端认证：这个屏幕放得下 ${num(n)} 次实测。能跑 DOOM，但不给终端单列 GPU。`,
        ],
        orders: [
          `${h} / ${n}`,
          `Legend intermission: ${h} chip families survived the cut. Queue remaining: ${num(n)} measurements. Rip the queue, not the data.`,
          `图例结算：${h} 个芯片家族留下，队列中仍有 ${num(n)} 个测量。撕开队列，别撕数据。`,
        ],
        riff: [
          `${num(ms)} ms`,
          `Cue sheet: hold the opening riff for ${num(ms)} ms before the slowest first token drops. The Cyberdemon is not late; the request is.`,
          `配乐表：开场重奏持续 ${num(ms)} 毫秒，最慢的首词元才落下。迟到的不是机械巨魔，是请求。`,
        ],
        god: [
          `${t} tok/s`,
          `${hw} posts ${t} tok/s/GPU. IDDQD grants immunity to demons, not to the next benchmark.`,
          `每 GPU 每秒 ${t} 词元：${hw} 开启 IDDQD。恶魔伤不到它，下轮测试可不一定。`,
        ],
        john: [
          `×${batch}`,
          `“No, John. You are the demons.” The manifest says up to ${num(batch)} concurrent requests. The pinned dot is one measurement, not a monster.`,
          `“不，约翰。你就是恶魔。”清单最多有 ${num(batch)} 个并发请求。固定的是一个测量点，不是怪物。`,
        ],
        mars: [
          `${t} tok/s`,
          `${finish ? 'Freight delivered. ' : ''}Objective updated: put a hole in the frontier at ${hw}, ${t} tok/s/GPU. The automap marks the actual coordinate.`,
          `${finish ? '货物已签收。' : ''}目标更新：在 ${hw} 每 GPU 每秒 ${t} 词元处击穿前沿。地图标记真实坐标。`,
        ],
        print: [
          `${num(n)} ${zh ? '次' : 'RUN'}`,
          `Box-art printer: replace “armored marine” with “${hw} runs ${num(n)} measurements.” Marketing says the cover is now completely different.`,
          `封面打印：把“装甲陆战队员”换成“${hw}；${num(n)} 个实测点”。市场部坚称这是全新封面。`,
        ],
        fuel: [
          `${t} tok/s`,
          `Argent accounting corrected: ${t} tokens/second/GPU measures throughput, not watts. Facilities would like its lighting budget back.`,
          `银色能源账单已纠正：每 GPU 每秒 ${t} 个词元是吞吐量，不是瓦数。设施部要求归还照明预算。`,
        ],
        arrival: [
          'E1M1',
          'Freight slip received. Locate the peak on the frontier scanner to deliver the cargo to Mars Core.',
          '已收到货运单。在前沿扫描仪定位峰值，即可将货物送往火星核心。',
        ],
      };
      const [value, en, cn] = dispatch[id];
      if (!known.includes(id)) {
        known = [...known, id];
        setFound(known);
        try {
          localStorage.setItem('doom-radio-index', JSON.stringify(known));
        } catch {
          /* optional */
        }
      }
      cool.current.set(id, Date.now());
      setStory({ id, text: zh ? cn : en, value });
      clearTimeout(timer);
      timer = window.setTimeout(() => setStory(null), 5500);
    };
    fire.current = show;
    const mount = () => {
      frame = 0;
      const f = document.querySelector(figure) ?? document.querySelector(empty);
      if (f && (!slot?.isConnected || slot.previousElementSibling !== f)) {
        slot?.remove();
        slot = document.createElement('div');
        slot.className = 'uac-dispatch-slot no-export';
        f.after(slot);
        setHost(slot);
      }
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(mount);
    };
    const observer = new MutationObserver((rs) => {
      // Tooltip content can change on every pointer move. A connected dispatch
      // beside the same card needs no subtree search or paint.
      if (slot?.isConnected && slot.previousElementSibling?.matches(`${figure},${empty}`)) return;
      if (
        rs.some((r) =>
          [...r.addedNodes, ...r.removedNodes].some(
            (n) =>
              n instanceof Element &&
              (n.matches(`${figure},${empty}`) || n.querySelector(`${figure},${empty}`)),
          ),
        )
      )
        queue();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    queue();
    const animate = () => {
      const f = document.querySelector<HTMLElement>(figure);
      if (!f) return;
      f.dataset.uacUpdate = '';
      const paused = new URLSearchParams(location.search).get('uac_hold') === 'update';
      if (paused) f.dataset.uacMid = '';
      clearTimeout(melt);
      melt = window.setTimeout(
        () => {
          delete f.dataset.uacUpdate;
          delete f.dataset.uacMid;
        },
        paused ? 2300 : 495,
      );
    };
    const click = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (!el) return;
      if (el.closest('[data-testid="chart-legend"] label'))
        after(() => {
          animate();
          show('orders');
        }, 230);
      else if (el.closest('.dot-hit-area,.dot-group')) show('john');
      else if (el.closest('[data-testid="export-png-button"]')) show('print');
      else if (
        el.closest(
          '[role=option],[data-select-option],[data-slot=select-item],[data-testid^=quick-filter-]',
        )
      )
        after(() => {
          animate();
          show('fuel');
        }, 140);
      else if (el.closest('[data-uac-code]')) show('god');
    };
    const keydown = (e: KeyboardEvent) => {
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.key.length !== 1 ||
        (e.target instanceof Element &&
          e.target.closest('input,textarea,select,[contenteditable=true],[role=dialog]'))
      )
        return;
      typed = (typed + e.key.toLowerCase()).slice(-5);
      if (typed === 'iddqd') show('god');
    };
    const peak = () => show('mars');
    document.addEventListener('click', click, true);
    document.addEventListener('keydown', keydown);
    window.addEventListener('doom-peak', peak);
    try {
      if (sessionStorage.getItem('doom-freight') === 'ticket') {
        sessionStorage.setItem('doom-freight', 'unsealed');
        after(() => show('arrival'), 900);
      }
    } catch {
      /* optional */
    }
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      clearTimeout(melt);
      pending.forEach(clearTimeout);
      document.removeEventListener('click', click, true);
      document.removeEventListener('keydown', keydown);
      window.removeEventListener('doom-peak', peak);
      slot?.remove();
      setHost(null);
      setStory(null);
      const f = document.querySelector<HTMLElement>('[data-uac-update]');
      if (f) {
        delete f.dataset.uacUpdate;
        delete f.dataset.uacMid;
      }
    };
  }, [path, zh]);
  if (!host) return null;
  const pin = () => {
    if (!host.isConnected) return;
    const { layer, peak } = metrics(),
      hit = layer?.querySelector('path.dot-hit-area');
    if (!hit || !layer || !peak) return;
    layer.closest('svg')?.scrollIntoView({ block: 'center' });
    requestAnimationFrame(() => {
      const m = layer.getScreenCTM();
      if (!m) return;
      const p = new DOMPoint(peak.x, peak.y).matrixTransform(m);
      for (const type of ['mouseenter', 'mousemove', 'click'])
        hit.dispatchEvent(
          new MouseEvent(type, { bubbles: true, clientX: p.x, clientY: p.y, view: window }),
        );
    });
  };
  const s = story && slips[story.id];
  return createPortal(
    <section className="uac-dispatch">
      {hold && (
        <div>
          <small>{L('WAD loader / held signal', 'WAD 加载器 / 信号定格')}</small>
          <Skeleton className="uac-held-wad" />
        </div>
      )}
      {story && s && (
        <article className="uac-receipt" data-slip={story.id} role="status">
          <div className="uac-slip-image">
            <img src={`/decorative/doom/${s[2]}.webp`} alt="" />
            <b>{story.value}</b>
          </div>
          <div>
            <small>{L('PHOBOS / AFTER ACTION', '火卫一 / 战后记录')}</small>
            <strong>{s[zh ? 1 : 0]}</strong>
            <p>{story.text}</p>
            <b>
              {zh ? `${s[4]} / ` : ''}
              <span lang="en">{s[3]}</span>
            </b>
          </div>
        </article>
      )}
      <details>
        <summary>
          {L('Phobos radio dispatch', '火卫一无线电通讯')} · {found.length}/9
        </summary>
        <p>
          {L(
            'Read this chart’s measurements. Type IDDQD to audit the leader.',
            '读取本图的实测数据。输入 IDDQD 审核冠军。',
          )}
        </p>
        <div className="uac-dispatch-actions">
          <button type="button" data-uac-read="boot" onClick={() => fire.current('boot')}>
            {L('Certify this terminal', '认证本终端')}
          </button>
          <button type="button" data-uac-read="riff" onClick={() => fire.current('riff')}>
            {L('Score the slowest first token', '为最慢首词元配乐')}
          </button>
          <button type="button" data-uac-read="pin" onClick={pin}>
            {L('Pin the peak sample', '固定峰值样本')}
          </button>
          <button type="button" data-uac-code="iddqd">
            IDDQD
          </button>
        </div>
        <details>
          <summary>
            {L('Recovered radio lines', '已收集电台台词')} · {found.length}/9
          </summary>
          <ul>
            {Object.entries(slips).map(([id, r]) => (
              <li key={id}>
                {found.includes(id as Id)
                  ? zh
                    ? `${r[4]} / ${r[3]}`
                    : r[3]
                  : L('Signal unknown', '信号未知')}
              </li>
            ))}
          </ul>
        </details>
      </details>
    </section>,
    host,
  );
}
