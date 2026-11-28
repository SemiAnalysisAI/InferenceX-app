import type {
  CanvasPointLayerElement,
  ScatterPointSnapshot,
} from '@/lib/d3-chart/layers/canvas-points';
import { COUNTY_LINES, recordLine, type CountyLine } from './county-lines';
import type { Clip } from './radio';

interface Datum {
  hw: string;
  hwKey: string;
  model: string;
  conc: number;
  tput_per_gpu: number;
  mean_ttft: number;
  tokensPerDollarH?: { y: number };
}
type Run = ScatterPointSnapshot<Datum>;
interface Story {
  tag: string;
  art: string;
  title: string;
  detail: string;
  line?: CountyLine;
}
const chart = 'figure[data-testid="chart-figure"],figure:has([data-testid="d3-chart-svg"])';
const empty = '[data-testid="scatter-empty-state"],[data-testid="chart-empty-state"]';
const art = '/decorative/south-park/art/';
const buttons = [
  ['pin', 'Pin sample', '固定样本'],
  ['scale', 'Weigh batch', '称量批次'],
  ['toll', 'Price the toll', '计算过路费'],
  ['profit', 'Audit phase 2', '审查第二步'],
  ['ski', 'Ski the delay', '滑过延迟'],
] as const;
function make<K extends keyof HTMLElementTagNameMap>(tag: K, name?: string, text?: string) {
  const e = document.createElement(tag);
  if (name) e.className = name;
  if (text) e.textContent = text;
  return e;
}
function noteEl() {
  const e = make('div', 'sp-wire-note no-export');
  e.setAttribute('role', 'status');
  e.setAttribute('aria-live', 'polite');
  return e;
}
export function mountCountyDesk(zh: boolean, voice: (clip: Clip) => void) {
  const tr = (a: string, b: string) => (zh ? b : a);
  const fmt = (v: number, places = 1) =>
    v.toLocaleString(zh ? 'zh-CN' : 'en-US', { maximumFractionDigits: places });
  const stop = new AbortController();
  const doc = document,
    timers = new Set<number>(),
    live = new Set<HTMLElement>();
  let current: HTMLElement | null = null,
    desk: HTMLElement | null = null,
    note: HTMLElement | null = null,
    frame = 0,
    expiry = 0;
  let lastSig = '',
    beforeChange = '',
    changeTimer = 0,
    armed = 0,
    exportUntil = 0,
    emptyShown: Element | null = null,
    watchedEmpty: Element | null = null,
    lastPanel: Element | null = null;
  let remembered: HTMLElement | null = null,
    proof: HTMLElement | null = null;
  const signal = stop.signal;
  function later(fn: () => void, ms: number) {
    const n = window.setTimeout(() => {
      timers.delete(n);
      fn();
    }, ms);
    timers.add(n);
    return n;
  }
  function reads(): Run[] {
    const layer = current?.querySelector<CanvasPointLayerElement>('.canvas-point-layer');
    return (
      (layer?.scatterPoints?.() as Run[] | undefined)?.filter(
        (r) => r.interactive && !r.faded && r.opacity > 0 && typeof r.datum.hw === 'string',
      ) ?? []
    );
  }
  function file(s: Story, host = note) {
    if (!host?.isConnected || doc.hidden) return;
    const id = s.line;
    if (id && !recordLine(id)) return;
    for (const h of live) {
      h.replaceChildren();
      delete h.dataset.spStory;
    }
    live.clear();
    if (expiry) {
      clearTimeout(expiry);
      timers.delete(expiry);
    }
    const img = make('img');
    img.alt = '';
    img.src = `${art}${s.art}.webp`;
    const copy = make('div', 'sp-wire-copy');
    copy.append(make('b', undefined, s.title), make('span', undefined, s.detail));
    if (id) {
      const [en, cn, clip] = COUNTY_LINES[id];
      const quote = make('q', undefined, tr(en, cn));
      if (zh) {
        const original = make('small', undefined, en);
        original.lang = 'en';
        quote.append(' ', original);
      }
      copy.append(quote);
      if (clip) voice(clip);
    }
    host.dataset.spStory = s.tag;
    host.replaceChildren(img, copy);
    live.add(host);
    expiry = later(() => {
      host.replaceChildren();
      delete host.dataset.spStory;
      live.delete(host);
      expiry = 0;
    }, 5300);
  }
  function action(kind: string) {
    const all = reads();
    if (all.length === 0) return;
    const max = (fn: (r: Run) => number) =>
      all
        .filter((r) => Number.isFinite(fn(r)) && fn(r) > 0)
        .reduce<Run | undefined>((a, b) => (!a || fn(b) > fn(a) ? b : a), undefined);
    const fast = max((r) => r.datum.tput_per_gpu),
      wide = max((r) => r.datum.conc),
      slow = max((r) => r.datum.mean_ttft),
      fare = max((r) => r.datum.tokensPerDollarH?.y ?? 0);
    if (kind === 'pin' && fast) {
      const path = current?.querySelector<SVGPathElement>('path.dot-hit-area');
      if (!path) return;
      const coord = { bubbles: true, view: window, clientX: fast.clientX, clientY: fast.clientY };
      path.dispatchEvent(new MouseEvent('mousemove', coord));
      path.dispatchEvent(new MouseEvent('click', coord));
      return;
    }
    if (kind === 'scale' && wide) {
      const { hw, conc } = wide.datum;
      file({
        tag: 'scale',
        art: 'cartman',
        title: tr('Cartman’s batch scale', '卡特曼的批次秤'),
        detail: tr(
          `${hw.toUpperCase()} • ${fmt(conc, 0)} simultaneous requests. That’s the batch, not his weight.`,
          `${hw.toUpperCase()} · ${fmt(conc, 0)} 个并发请求。那是批次，不是体重。`,
        ),
        line: 'scale',
      });
    }
    if (kind === 'toll' && fare) {
      const rate = fare.datum.tokensPerDollarH!.y;
      file({
        tag: 'toll',
        art: 'chef-dad',
        title: tr('Stark’s Pond • toll receipt', '斯塔克池塘 · 过路费收据'),
        detail: tr(
          `${fare.datum.hw.toUpperCase()} • ${fmt(rate, 0)} tok/$ × $3.50 = ${fmt(rate * 3.5, 0)} tokens for Nessie.`,
          `${fare.datum.hw.toUpperCase()} · ${fmt(rate, 0)} 词元/美元 × 3.50 美元 = 尼斯湖水怪的 ${fmt(rate * 3.5, 0)} 个词元。`,
        ),
        line: 'toll',
      });
    }
    if (kind === 'profit' && fast) {
      file({
        tag: 'profit',
        art: 'gnome-plan',
        title: tr('Underpants Gnomes • quarterly filing', '内裤侏儒 · 季度申报'),
        detail: tr(
          `① Collect ${fmt(all.length, 0)} plotted samples. ② ? ③ ${fast.datum.hw.toUpperCase()}: ${fmt(fast.datum.tput_per_gpu)} tok/s/GPU. Profit?`,
          `① 收集 ${fmt(all.length, 0)} 个图中样本。② ？ ③ ${fast.datum.hw.toUpperCase()}：${fmt(fast.datum.tput_per_gpu)} 词元/秒/GPU。盈利？`,
        ),
        line: 'lesson',
      });
    }
    if (kind === 'ski' && slow) {
      file({
        tag: 'ski',
        art: 'thumper',
        title: tr('Aspen • black-diamond queue', '阿斯彭 · 黑钻队列'),
        detail: tr(
          `Pizza when you should prefill? ${slow.datum.hw.toUpperCase()} has a ${fmt(slow.datum.mean_ttft, 3)} s mean wait for its first token. You’re gonna have a bad time.`,
          `该预填时却犁式刹车？${slow.datum.hw.toUpperCase()} 平均等 ${fmt(slow.datum.mean_ttft, 3)} 秒才出首个词元。你要倒霉了。`,
        ),
      });
    }
  }
  function claim() {
    if (!note || !desk || remembered === desk) return;
    let ready = false;
    try {
      ready = sessionStorage.getItem('south-park-berry-transfer') === 'punched';
    } catch {}
    if (!ready) return;
    const run = reads()[0];
    if (!run) return;
    remembered = desk;
    try {
      sessionStorage.removeItem('south-park-berry-transfer');
    } catch {}
    const d = run.datum;
    file({
      tag: 'berries',
      art: 'berries',
      title: tr('Transfer redeemed • Member Berries', '换乘票已兑付 · 回忆莓'),
      detail: tr(
        `’Member ${d.model}? ’Member ${d.hw.toUpperCase()} serving ${fmt(d.tput_per_gpu)} tok/s/GPU? Yeah, I ’member.`,
        `记得 ${d.model} 吗？记得 ${d.hw.toUpperCase()} 跑到每 GPU 每秒 ${fmt(d.tput_per_gpu)} 词元吗？记得呀。`,
      ),
    });
  }
  function onEmpty(el: HTMLElement) {
    if (emptyShown === el) return;
    emptyShown = el;
    let host = el.querySelector<HTMLElement>('.sp-wire-note');
    if (!host) {
      host = noteEl();
      el.append(host);
    }
    file(
      {
        tag: 'gone',
        art: 'banker',
        title: tr('Bank of South Park • balance: 0', '南方公园银行 · 余额：0'),
        detail: tr(
          'Your filters brought us a portfolio of measured runs. And it’s gone: 0 match.',
          '这些筛选条件带来一篮子实测结果。然后就没了：匹配数 0。',
        ),
        line: 'home',
      },
      host,
    );
  }
  const visible = new IntersectionObserver(
    (es) => {
      for (const e of es)
        if (e.isIntersecting) {
          if (e.target.matches(empty)) onEmpty(e.target as HTMLElement);
          else claim();
        }
    },
    { threshold: 0.15 },
  );
  function setup(el: HTMLElement) {
    const h = el.querySelector('figcaption');
    if (!h) return;
    const band = make('section', 'sp-wire-desk no-export');
    band.setAttribute('aria-label', tr('Park County chart desk', '南方公园县图表服务台'));
    const strip = make('div', 'sp-wire-strip');
    const mast = make(
      'b',
      'sp-wire-mast',
      tr('Park County / Field desk', '南方公园县 / 现场服务台'),
    );
    const tools = make('details', 'sp-wire-tools');
    const summary = make('summary', undefined, tr('Inspect samples', '检查样本'));
    summary.dataset.spInspect = '';
    tools.append(summary);
    const buttonsEl = make('div', 'sp-wire-buttons');
    for (const [kind, en, cn] of buttons) {
      const b = make('button', undefined, tr(en, cn));
      b.type = 'button';
      b.dataset.spRead = kind;
      buttonsEl.append(b);
    }
    tools.append(buttonsEl);
    strip.append(mast, tools);
    note = noteEl();
    band.append(strip, note);
    h.after(band);
    desk = band;
    visible.observe(band);
  }
  function recut() {
    if (!desk) return;
    const band = desk;
    band.dataset.spRecut = '';
    band.querySelector('.sp-wire-flip')?.remove();
    const flip = make('i', 'sp-wire-flip', tr('Re-cut • new chart sheet', '重新剪裁 · 新图纸'));
    band.prepend(flip);
    later(() => {
      flip.remove();
      if (!band.querySelector('.sp-wire-flip')) delete band.dataset.spRecut;
    }, 1950);
  }
  function scan() {
    frame = 0;
    const el =
      [...doc.querySelectorAll<HTMLElement>(chart)].find(
        (n) => !n.closest('[id$="-export"]') && n.querySelector('.canvas-point-layer'),
      ) ?? null;
    if (current !== el || !desk?.isConnected) {
      if (desk) {
        visible.unobserve(desk);
        desk.remove();
      }
      current = el;
      desk = null;
      note = null;
      if (el) setup(el);
    }
    const gone = doc.querySelector<HTMLElement>(empty);
    if (gone !== watchedEmpty) {
      if (watchedEmpty) visible.unobserve(watchedEmpty);
      watchedEmpty = gone;
      emptyShown = null;
      if (gone) visible.observe(gone);
    }
    const panel = doc.querySelector('[data-testid="point-details-panel"]');
    if (panel && panel !== lastPanel && note) {
      const value =
        panel.querySelector('p.text-sm.font-semibold')?.textContent?.trim() ||
        current?.querySelector('h2')?.textContent?.trim() ||
        '';
      file({
        tag: 'badge',
        art: 'cop',
        title: tr('Park County • pinned evidence', '南方公园县 · 已固定的证据'),
        detail: tr(`This run is on the record. ${value}`, `本次运行已记录。${value}`),
        line: 'badge',
      });
    }
    lastPanel = panel;
    if (el && desk) {
      const sig = `${location.search}|${el.querySelector<SVGGElement>('.canvas-point-layer')?.dataset.pointsJoined}|${el.querySelector('figcaption')?.textContent}`;
      if (beforeChange && sig !== beforeChange && armed > Date.now() && !changeTimer) {
        changeTimer = later(() => {
          changeTimer = 0;
          if (!desk?.isConnected || reads().length === 0) {
            schedule();
            return;
          }
          armed = 0;
          beforeChange = '';
          recut();
          // A layoff slip owns its own event; don't replace it with a generic revision.
          if (note?.dataset.spStory !== 'jobs')
            file({
              tag: 'okay',
              art: 'mackey',
              title: tr('Mr. Mackey • revised worksheet', '麦基老师 · 修订作业单'),
              detail: tr(
                'The plotted selection changed. Use the new sheet, children.',
                '图中的选择已改变。同学们，请使用新图纸。',
              ),
              line: 'okay',
            });
        }, 360);
      }
      lastSig = sig;
      if (
        !remembered &&
        desk.getBoundingClientRect().top < innerHeight &&
        desk.getBoundingClientRect().bottom > 60
      )
        claim();
    }
    if (
      !proof &&
      new URLSearchParams(location.search).get('sp_plate') === 'loading' &&
      (el || gone)
    ) {
      proof = make('section', 'sp-loading-proof no-export');
      proof.dataset.spLoadingProof = '';
      const sample = make('div', 'sp-bus-loading');
      sample.dataset.slot = 'skeleton';
      const label = make(
        'b',
        undefined,
        tr('Loading plate • held for inspection', '加载版画 · 暂停展示'),
      );
      proof.append(sample, label);
      (el || gone)?.before(proof);
    }
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(scan);
  }
  const audit = new MutationObserver((events) => {
    for (const e of events) {
      if (e.type === 'attributes') {
        if (armed > Date.now() || !desk) schedule();
        continue;
      }
      if (
        e.target instanceof Element &&
        (e.target.closest('.sp-wire-desk,.sp-wire-note,[id$="-export"]') ||
          (e.target instanceof SVGElement && !e.target.matches('svg')))
      )
        continue;
      if (
        (e.target instanceof Element && e.target.closest('figcaption')) ||
        [...e.addedNodes, ...e.removedNodes].some(
          (n) =>
            n instanceof Element &&
            (n.matches(
              `${chart},${empty},figcaption,.canvas-point-layer,[data-testid="point-details-panel"]`,
            ) ||
              (!n.closest('svg') &&
                n.querySelector(
                  'figure,.canvas-point-layer,[data-testid="scatter-empty-state"],[data-testid="point-details-panel"]',
                ))),
        )
      ) {
        schedule();
        break;
      }
    }
  });
  audit.observe(doc.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-points-joined'],
  });
  const interactions =
    '[role="option"],[role="menuitemradio"],[role="menuitemcheckbox"],[data-testid^="quick-filter-"],[data-testid^="scatter-empty-"],[data-testid="chart-legend"] input';
  function arm(e: Event) {
    if (!(e.target instanceof Element) || !e.target.closest(interactions)) return;
    beforeChange = lastSig;
    armed = Date.now() + 9000;
    for (const ms of [140, 650, 1500, 2800]) later(schedule, ms);
  }
  doc.addEventListener('pointerdown', arm, { capture: true, signal });
  doc.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') arm(e);
    },
    { capture: true, signal },
  );
  doc.addEventListener(
    'click',
    (e) => {
      const n = e.target;
      if (!(n instanceof Element)) return;
      const choice = n.closest<HTMLElement>('[data-sp-read]');
      if (choice) {
        action(choice.dataset.spRead!);
        return;
      }
      if (n.closest('[data-testid="export-png-button"]')) exportUntil = Date.now() + 30000;
      const input = n.closest<HTMLInputElement>(
        '[data-testid="chart-legend"] input[type=checkbox]',
      );
      if (input && !input.checked) {
        const runs = reads().filter((r) => input.id.endsWith(r.datum.hwKey));
        if (runs.length > 0)
          file({
            tag: 'jobs',
            art: 'darryl',
            title: tr('Goobacks • layoff notice', '未来移民 · 裁员通知'),
            detail: tr(
              `${runs[0].datum.hw.toUpperCase()} just lost ${fmt(runs.length, 0)} plotted shifts to the legend switch.`,
              `${runs[0].datum.hw.toUpperCase()} 被图例开关裁掉了 ${fmt(runs.length, 0)} 个样本班次。`,
            ),
            line: 'jobs',
          });
      }
      if (n.closest(interactions) && armed <= Date.now()) arm(e);
    },
    { capture: true, signal },
  );
  window.addEventListener(
    'inferencex:action',
    () => {
      if (exportUntil > Date.now() && doc.querySelector('[id$="-export"] .sp-export-id')) {
        exportUntil = 0;
        file({
          tag: 'towel',
          art: 'towelie',
          title: tr('Towelie • print room', '毛巾仔 · 印刷室'),
          detail: tr(
            'PNG sent to downloads. The paper copy is still wet.',
            'PNG 已送往下载。纸质副本的油墨还没干。',
          ),
          line: 'towel',
        });
      }
    },
    { signal },
  );
  let word = '';
  doc.addEventListener(
    'keydown',
    (e) => {
      if (
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        e.isComposing ||
        e.repeat ||
        e.key.length !== 1 ||
        (e.target instanceof Element &&
          e.target.closest('input,textarea,select,[contenteditable=true],[role=dialog]'))
      )
        return;
      word = (word + e.key.toLowerCase()).slice(-6);
      if (word === 'profit') action('profit');
    },
    { signal },
  );
  scan();
  return () => {
    stop.abort();
    audit.disconnect();
    visible.disconnect();
    timers.forEach(clearTimeout);
    cancelAnimationFrame(frame);
    desk?.remove();
    proof?.remove();
    doc.querySelectorAll('.sp-wire-note').forEach((n) => n.remove());
    live.clear();
  };
}
