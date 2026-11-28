'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useTheme } from 'next-themes';
import { useLocale } from '@/lib/i18n/use-locale';
import { useClientPathname } from '@/hooks/useClientPathname';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { haloWrite, useHaloValue, type HaloMode } from './halo-state';
import { HALO_DUCK, HALO_MUSIC_KEY, haloMusicEnabled } from './halo-music';
import {
  HALO_ART,
  HALO_FRONTIER,
  HALO_TRACE,
  lines,
  playHaloClip,
  stopHaloClip,
  type HaloClip,
} from './halo-archive';
import { HaloToggles } from './halo-toggles';
import {
  canonicalLines,
  haloLineJournal,
  haloReconStage,
  recordHaloLine,
  type CanonicalLine,
} from './halo-telemetry';

const modes: [HaloMode, string, string][] = [
  ['zeta', 'Zeta Halo', '泽塔环带'],
  ['reach', 'Reach', '致远星'],
  ['reclaim', 'Reclaimer', '回收者'],
];
const visorMission: Record<HaloMode, readonly [string, string]> = {
  zeta: ['NIGHT SCAN · RING ACQUIRED', '夜间扫描 · 已发现环带'],
  reach: ['REACH · DUSK WATCH', '致远星 · 暮色警戒'],
  reclaim: ['CARTOGRAPHER · DAYLIGHT LANDING', '制图师 · 日间登陆'],
} as const;
const crewStates: Record<string, readonly (readonly [string, string])[]> = {
  'spartan-117': [
    ['VISOR READY', '护目镜待命'],
    ['COVERING THE FLANK', '掩护侧翼'],
    ['GUARD POSITION', '进入警戒位置'],
  ],
  'cortana-echo': [
    ['DORMANT', '待唤醒'],
    ['SCANNING', '正在扫描'],
    ['LINKED', '已连接'],
  ],
  arbiter: [
    ['STANDING BY', '待命'],
    ['ACTIVE CAMO', '主动伪装'],
    ['BACK ON COMMS', '已回到频道'],
  ],
};
const castPoses: Record<string, readonly [string, string, string]> = {
  'spartan-117': ['spartan-117', 'chief-flank', 'chief-guard'],
  'cortana-echo': ['cortana-echo', 'cortana-scan', 'cortana-linked'],
};
const roster = [
  ['spartan-117', 'Master Chief', '士官长'],
  ['cortana-echo', 'Cortana', '科塔娜'],
  ['arbiter', 'The Arbiter', '神风烈士'],
  ['johnson', 'Avery Johnson', '埃弗里·约翰逊'],
  ['noble-six', 'Noble Six', '贵族六号'],
] as const;
const exchanges = [
  {
    en: 'Bridge',
    zh: '舰桥',
    crew: [0, 1],
    line: 'together',
    note: [
      'Chief passes visor control to Cortana for the approach.',
      '士官长把护目镜的航路控制权交给科塔娜。',
    ],
  },
  {
    en: 'Loadout dispute',
    zh: '配置争论',
    crew: [0, 2],
    line: 'weapon',
    note: [
      'Chief: “more gpu = more fast.” Arby: “Only if you normalize by GPU count first.”',
      '士官长：“GPU 越多就越快。”神风烈士：“先按 GPU 数量归一化再说。”',
    ],
  },
  {
    en: 'Cryosleep',
    zh: '冷冻休眠',
    crew: [0, 1],
    line: 'sleep',
    note: [
      'Chief hands the watch to Cortana and goes into cryosleep.',
      '士官长让科塔娜值守，自己进入冷冻休眠。',
    ],
  },
  {
    en: 'Rear guard',
    zh: '后卫部队',
    crew: [3, 4],
    line: 'promise',
    note: [
      'Johnson relays Cortana’s warning. Noble Six holds the channel while the squad leaves.',
      '约翰逊转达科塔娜的警告。小队撤离时，贵族六号维持通讯。',
    ],
  },
] as const;
const dispatches = [
  [
    'First-token time matters when a pilot is waiting for clearance.',
    '飞行员等待许可时，首词元时延尤其重要。',
  ],
  [
    'A larger batch clears the queue. It can also keep a pilot waiting.',
    '更大的批次可以清空队列，也可能让飞行员等得更久。',
  ],
  [
    'Cortana’s cache is warm. Your next decode just got cheaper.',
    '科塔娜的缓存已预热，下一次解码的成本更低。',
  ],
  [
    'Two plots, one frontier: compare throughput with interactivity.',
    '两张图，一条前沿：比较吞吐量与交互性。',
  ],
  [
    'Reach telemetry online. Watch KV pressure before the next jump.',
    '致远星遥测在线。下次跃迁前留意 KV 压力。',
  ],
  [
    'Cooling buys time; efficient scheduling keeps the relay online.',
    '冷却争取时间，高效调度让中继保持在线。',
  ],
  ['A fast decode does not erase a slow prefill.', '解码再快，也无法抵消缓慢的预填充。'],
  ['Longer prompts fill the relay’s KV stores sooner.', '提示词越长，中继的 KV 存储就越早被填满。'],
  [
    'Plot the same sequence lengths before comparing two fleets.',
    '比较两支舰队前，先统一序列长度。',
  ],
  [
    'Spartan teams report both per-user speed and fleet throughput.',
    '斯巴达小队同时报告单用户速度和舰队吞吐量。',
  ],
  ['High throughput can coexist with a long queue.', '高吞吐量也可能伴随长队列。'],
  ['Check the precision marker before following the signal.', '追踪信号前，先确认精度标记。'],
  [
    'A smaller weight footprint leaves room for more cache.',
    '模型权重占用越小，留给缓存的空间就越多。',
  ],
  [
    'A warm cache helps repeated prefixes, not every prompt.',
    '热缓存有益于重复前缀，但并非每条提示都能受益。',
  ],
  [
    'The uplink stalled; compare network and compute timings.',
    '上行链路停滞；请比较网络耗时与计算耗时。',
  ],
  [
    'Measure decode over enough tokens to smooth out a burst.',
    '测量解码时采样足够多的词元，以平滑瞬时波动。',
  ],
  ['Power and throughput belong in the same debrief.', '请在同一份简报中汇报功耗和吞吐量。'],
  [
    'Normalize by accelerator count before comparing fleet size.',
    '比较舰队规模之前，按加速器数量归一化。',
  ],
  ['A smaller batch may meet the response target.', '较小的批次也可能达到响应时间目标。'],
  [
    'Track stalls in the tail; the median may not show them.',
    '留意尾部延迟；中位数不一定能反映卡顿。',
  ],
  ['The ring is quiet. Take an idle power reading.', '环带已平静，记录一次空闲功耗。'],
  ['A saturated link can leave the accelerators idle.', '链路饱和时，加速器可能仍在空转。'],
  [
    'Compare runs under the same workload before changing course.',
    '改变航线前，请比较相同工作负载下的运行结果。',
  ],
  [
    'Twenty-four channels logged. File the Cortana debrief.',
    '二十四个频道已记录，请归档科塔娜的简报。',
  ],
];

const signals: Record<
  number,
  {
    name: readonly [string, string];
    note: readonly [string, string];
    art?: string;
    quote?: keyof typeof lines;
    clip?: HaloClip;
  }
> = {
  0: {
    name: ['Cortana · UNSC uplink', '科塔娜 · UNSC 上行链路'],
    note: [
      'One crew, two clocks: TTFT measures the wait before the first token.',
      '同一小队，两种计时：TTFT 衡量首词元的等待时间。',
    ],
    quote: 'wake',
    art: 'cortana-echo',
  },
  1: {
    name: ['Wort! Wort! Wort!', '沃特！沃特！沃特！'],
    note: [
      'Go, go, go: a bigger batch clears more of the queue, not necessarily faster for each pilot.',
      '冲冲冲：更大的批次能清理更多队列，但不一定让每位飞行员更快收到回复。',
    ],
    clip: 'wort-wort-wort',
    art: 'arbiter',
  },
  2: {
    name: ['Crow’s Nest · KV anomaly', '鸦巢 · KV 异常'],
    note: [
      'The Halo 3 Rat is already in the cache. It only helps when the next prompt reuses its prefix.',
      '《光环 3》的老鼠已经进了缓存。只有下条提示复用该前缀时，它才有用。',
    ],
    art: 'crows-nest-rat',
  },
  3: {
    name: ['Craig reads the dashboard', '克雷格查看仪表板'],
    note: [
      'The throughput doubled. TTFT doubled too. Craig’s expression did not change.',
      '吞吐量翻了一倍。首词元时延也翻了一倍。克雷格面不改色。',
    ],
    art: 'craig',
  },
  4: {
    name: ['Noble Six · CURRENT OBJECTIVE: SURVIVE', '贵族六号 · 当前目标：生存'],
    note: [
      'Your accelerator fits the weights. Can it survive the KV pressure at longer context?',
      '加速器能容纳模型权重，但能否撑住长上下文的 KV 压力？',
    ],
    art: 'noble-six',
    quote: 'promise',
  },
  5: {
    name: ['Energy Sword Sunday', '能量剑星期日'],
    note: [
      'Bring a matched pair to Quick Filters: same GPU count, precision and input/output lengths.',
      '在快速筛选中选择可比的两组：GPU 数量、精度和输入输出长度都要一致。',
    ],
    quote: 'weapon',
    art: 'energy-sword',
  },
  6: {
    name: [
      'Master Chief, you mind telling me what you’re doing on that ship?',
      '士官长，能告诉我你在那艘船上干什么吗？',
    ],
    note: [
      'Sir. Comparing throughput per GPU against per-user speed.',
      '长官。正在比较单卡吞吐量和单用户速率。',
    ],
    art: 'autumn-arrival',
    quote: 'finish',
  },
  8: {
    name: ['Blood Gulch · red vs blue', '血峡谷 · 红队对蓝队'],
    note: [
      'Match prompt length before calling a winner. Both squads work from the same map.',
      '先统一提示长度，再判断胜负。两支小队使用同一张地图。',
    ],
    art: 'blood-gulch',
  },
  9: {
    name: ['Pretty Cool GPU', '挺酷的 GPU'],
    note: [
      'eh renders tokens and doesnt afraid of anything. Except a different workload; keep those runs separate.',
      '这块 GPU 会生成词元，什么都不怕。除了不同的工作负载，请分开比较。',
    ],
    art: 'spartan-117',
  },
  12: {
    name: ['Arby ’n’ the Chief · loadout dispute', '神风烈士与士官长 · 配置争论'],
    note: [
      'Chief: “more gpu = more fast.” Arby: “Only if you normalize by GPU count first.”',
      '士官长：“GPU 越多就越快。”神风烈士：“先按 GPU 数量归一化再说。”',
    ],
    art: 'arbiter',
  },
  14: {
    name: ['Avery Johnson · shield check', '埃弗里·约翰逊 · 护盾检查'],
    note: [
      'If the link stalls, check network time before promising compute is the bottleneck.',
      '链路卡住时，先检查网络耗时，不要急着判定算力是瓶颈。',
    ],
    quote: 'together',
    clip: 'shield-recharge',
    art: 'johnson',
  },
  19: {
    name: ['Grunt Birthday Party · tail check', '野猪兽生日派对 · 尾部检查'],
    note: [
      'Confetti for checking p99 before calling the run a success, not for beating the median alone.',
      '检查 p99 后再庆祝测试成功，光跑赢中位数还不够。',
    ],
    clip: 'grunt-birthday',
  },
  23: {
    name: ['What are you doing on that ship?', '你在那艘船上干什么？'],
    note: [
      'Submitting the final throughput / interactivity comparison, sir.',
      '长官，正在提交最后一组吞吐量与交互性对比。',
    ],
    quote: 'finish',
  },
};

function HaloQuote({ id, zh }: { id: keyof typeof lines; zh: boolean }) {
  const [en, cn] = lines[id];
  return (
    <p className="halo-quote" data-halo-line={id} data-halo-quote={id} lang={zh ? 'zh' : 'en'}>
      <q>{zh ? cn : en}</q>
      {zh && <small lang="en">{en}</small>}
    </p>
  );
}

function focusHaloDestination() {
  const destination =
    document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('main');
  if (!destination) return;
  if (!destination.hasAttribute('tabindex')) {
    destination.tabIndex = -1;
    destination.addEventListener(
      'blur',
      () => {
        if (destination.getAttribute('tabindex') === '-1') destination.removeAttribute('tabindex');
      },
      { once: true },
    );
  }
  destination.focus({ preventScroll: true });
}

export function HaloThemeBanner() {
  const { resolvedTheme } = useTheme();
  const zh = useLocale() === 'zh';
  const pathname = useClientPathname(usePathname());
  const compact = pathname !== '/' && pathname !== '/zh';
  const chartPage = pathname.includes('/infx/inference');
  const isArchive = pathname === '/about' || pathname === '/zh/about';
  const [mounted, setMounted] = useState(false);
  const [relayPath, setRelayPath] = useState<string | null>(null);
  const [Relay, setRelay] = useState<ComponentType<{ zh: boolean }> | null>(null);
  const [relayLoadFailed, setRelayLoadFailed] = useState(false);
  const relayLaunchPath = useRef<string>(null);
  const relayRouteExit = useRef(false);
  const relayTrigger = useRef<HTMLButtonElement>(null);
  const open = relayPath !== null && relayPath === pathname;
  const [login, setLogin] = useState(false);
  const selected = useHaloValue('halo-mode', 'zeta');
  const chapter = useHaloValue('halo-relay-chapter', '0');
  const lastBank = useHaloValue('halo-relay-last-bank', '0');
  const campaign = Number(useHaloValue('halo-relay-best-campaign', '0'));
  const endless = Number(useHaloValue('halo-relay-best-endless', '0'));
  const logs = Number(useHaloValue('halo-dispatches', '0'));
  const spartan = useHaloValue('halo-spartan-117', '0') === '1';
  const recon = useHaloValue(haloReconStage, '');
  const journal = useHaloValue(haloLineJournal, '').split(',').filter(Boolean);
  const [liveLine, setLiveLine] = useState<{
    id: CanonicalLine;
    slot: 'banner' | 'signal' | 'fireteam' | 'archive';
  } | null>(null);
  const lineTimer = useRef<number>(undefined);
  const [dispatch, setDispatch] = useState(-1);
  const [trace, setTrace] = useState(false);
  const [arrival, setArrival] = useState(0);
  const [showCrew, setShowCrew] = useState(false);
  const [homeConsoleOpen, setHomeConsoleOpen] = useState(false);
  const [exchange, setExchange] = useState(0);
  const [crewBeat, setCrewBeat] = useState(0);
  const [crewManual, setCrewManual] = useState(false);
  const [frontier, setFrontier] = useState(0);
  const channel = useRef<HTMLAudioElement>(null);
  const [launchEffect, setLaunchEffect] = useState(0);
  const compactConsole = useRef<HTMLDetailsElement>(null);
  const homeConsoleToggle = useRef<HTMLButtonElement>(null);
  const copy = (en: string, chinese: string) => (zh ? chinese : en);
  const effects = useHaloValue(HALO_MUSIC_KEY, 'true') !== 'false';
  const sendLine = (id: CanonicalLine, slot: NonNullable<typeof liveLine>['slot']) => {
    if (!recordHaloLine(id)) return;
    window.clearTimeout(lineTimer.current);
    setLiveLine({ id, slot });
    lineTimer.current = window.setTimeout(() => setLiveLine(null), 5_250);
  };
  const signal = signals[dispatch];
  const decoded = logs.toString(2).replaceAll('0', '').length;
  const homeBackdrop =
    arrival === 1
      ? 'autumn-arrival'
      : arrival === 2
        ? 'installation-04'
        : decoded >= 4
          ? 'blood-gulch'
          : Number(chapter) > 0 || selected === 'reclaim'
            ? 'cartographer-beach'
            : selected === 'reach'
              ? 'noble-six'
              : 'installation-04';
  const hogDeployed = Number(chapter) > 0 && homeBackdrop === 'cartographer-beach';
  useEffect(() => setMounted(true), []);
  useEffect(() => () => window.clearTimeout(lineTimer.current), []);
  useEffect(() => {
    if (!isArchive || !recon.startsWith('mapped:')) return;
    haloWrite(haloReconStage, recon.replace('mapped:', 'complete:'));
    if (recordHaloLine('finish')) {
      window.clearTimeout(lineTimer.current);
      setLiveLine({ id: 'finish', slot: 'archive' });
      lineTimer.current = window.setTimeout(() => setLiveLine(null), 5_250);
    }
  }, [isArchive, recon]);
  useEffect(() => {
    if (!effects) stopHaloClip(channel);
    return () => stopHaloClip(channel);
  }, [effects]);
  useEffect(() => {
    let focusFrame: number | undefined;
    if (relayLaunchPath.current && relayLaunchPath.current !== window.location.pathname) {
      relayRouteExit.current = true;
      relayLaunchPath.current = null;
      focusFrame = requestAnimationFrame(focusHaloDestination);
    }
    setRelayPath((current) => (current === pathname ? current : null));
    setTrace(false);
    setHomeConsoleOpen(false);
    setDispatch(-1);
    return () => {
      if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
    };
  }, [pathname]);
  useEffect(() => {
    if (chartPage && recon === 'briefed' && compactConsole.current)
      compactConsole.current.open = true;
  }, [chartPage, recon]);
  useEffect(() => {
    if (
      !showCrew ||
      compact ||
      crewManual ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const interval = window.setInterval(() => setCrewBeat((beat) => (beat + 1) % 3), 1700);
    return () => window.clearInterval(interval);
  }, [showCrew, compact, exchange, crewManual]);
  useEffect(() => {
    if (!trace) {
      setFrontier(0);
      return;
    }
    const arrived = (event: Event) => {
      const count = (event as CustomEvent<number>).detail;
      setFrontier(count);
      if (count > 0 && chartPage && recon === 'briefed')
        haloWrite(haloReconStage, `mapped:${count}`);
    };
    window.addEventListener(HALO_FRONTIER, arrived);
    window.dispatchEvent(new CustomEvent(HALO_TRACE, { detail: true }));
    return () => {
      window.removeEventListener(HALO_FRONTIER, arrived);
      window.dispatchEvent(new CustomEvent(HALO_TRACE, { detail: false }));
    };
  }, [trace, chartPage, recon]);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.haloMode = selected;
    return () => {
      delete root.dataset.haloMode;
    };
  }, [selected]);
  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent(HALO_DUCK, { detail: true }));
    return () => {
      window.dispatchEvent(new CustomEvent(HALO_DUCK, { detail: false }));
    };
  }, [open]);
  useEffect(() => {
    if (!mounted || resolvedTheme !== 'halo') return;
    let sequence = '';
    let lastPress = 0;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !open) {
        if (compactConsole.current?.open) {
          compactConsole.current.open = false;
          compactConsole.current.querySelector('summary')?.focus();
          return;
        }
        if (homeConsoleOpen && homeConsoleToggle.current?.getClientRects().length) {
          setHomeConsoleOpen(false);
          setShowCrew(false);
          homeConsoleToggle.current.focus();
          return;
        }
      }
      if (
        open ||
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        (event.target instanceof Element &&
          event.target.closest(
            'input, textarea, select, [contenteditable], [role="textbox"], [role="dialog"]',
          ))
      ) {
        sequence = '';
        return;
      }
      const now = performance.now();
      if (now - lastPress > 900) sequence = '';
      lastPress = now;
      sequence = /^[17aortw]$/.test(event.key.toLowerCase())
        ? (sequence + event.key.toLowerCase()).slice(-4)
        : '';
      if (sequence.endsWith('rat') || sequence.endsWith('wort')) {
        const next = sequence.endsWith('rat') ? 2 : 1;
        sequence = '';
        setDispatch(next);
        setLiveLine((line) => (line?.slot === 'signal' ? null : line));
        haloWrite('halo-dispatches', String(logs | (1 << next)));
        if (compactConsole.current) compactConsole.current.open = true;
        else setHomeConsoleOpen(true);
        if (next === 1 && haloMusicEnabled()) playHaloClip('wort-wort-wort', channel);
        return;
      }
      if (!sequence.endsWith('117')) return;
      sequence = '';
      if (compactConsole.current) compactConsole.current.open = true;
      else setHomeConsoleOpen(true);
      haloWrite('halo-spartan-117', '1');
      setLaunchEffect((n) => n + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [homeConsoleOpen, logs, mounted, open, resolvedTheme]);
  if (!mounted || resolvedTheme !== 'halo') return null;

  const rank =
    Number(chapter) >= 5
      ? copy('◆ RING RECLAIMED', '◆ 已收复环带')
      : Number(chapter) > 0
        ? copy('◆ RELAY PILOT', '◆ 中继飞行员')
        : copy('◈ CADET', '◈ 学员');
  const consolePanel = (
    <div className="halo-console">
      <div className="halo-console-label">
        <span>{copy('VISOR PROFILE', '护目镜配置')}</span>
        <i className="halo-tracker" aria-hidden="true" />
        {copy(...(visorMission[selected as HaloMode] ?? visorMission.zeta))}
      </div>
      <div
        className="halo-visor-controls"
        role="group"
        aria-label={copy('Visor profile', '护目镜配置')}
      >
        {modes.map(([id, en, cn]) => (
          <button
            key={id}
            type="button"
            aria-pressed={selected === id}
            onClick={() => {
              haloWrite('halo-mode', id);
              setLaunchEffect((n) => n + 1);
            }}
          >
            {copy(en, cn)}
          </button>
        ))}
      </div>
      <div className="halo-console-actions">
        <Dialog
          open={open}
          onOpenChange={(next) => {
            relayRouteExit.current = false;
            relayLaunchPath.current = next ? window.location.pathname : null;
            setRelayPath(next ? pathname : null);
            if (next && !Relay) {
              setRelayLoadFailed(false);
              void import('./halo-relay')
                .then(({ default: component }) => setRelay(() => component))
                .catch(() => setRelayLoadFailed(true));
            }
          }}
        >
          <DialogTrigger asChild>
            <button className="halo-launch" type="button" ref={relayTrigger}>
              {copy('Launch Ring Relay', '启动环带中继')} <span aria-hidden="true">▲</span>
            </button>
          </DialogTrigger>
          <DialogContent
            className="halo-relay-dialog"
            overlayClassName="halo-relay-overlay"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (
                relayRouteExit.current ||
                (relayLaunchPath.current && relayLaunchPath.current !== window.location.pathname)
              )
                focusHaloDestination();
              else relayTrigger.current?.focus({ preventScroll: true });
            }}
          >
            <DialogTitle>
              {copy('Ring Relay · Flight Operations', '环带中继 · 飞行控制')}
            </DialogTitle>
            <DialogDescription>
              {copy(
                'Recover the interactivity signal across five ring sectors.',
                '穿越五个环带扇区，恢复交互性信号。',
              )}
            </DialogDescription>
            {open &&
              (Relay ? (
                <Relay zh={zh} />
              ) : (
                <p role="status">
                  {relayLoadFailed
                    ? copy(
                        'Could not load Ring Relay. Close the dialog and try opening it again.',
                        '无法加载环带中继。请关闭后重试。',
                      )
                    : copy('Loading Ring Relay…', '正在加载环带中继…')}
                </p>
              ))}
          </DialogContent>
        </Dialog>
        <button
          type="button"
          className="halo-transmission"
          data-halo-transmission
          onClick={() => {
            const next = (dispatch + 1) % dispatches.length;
            setDispatch(next);
            setLaunchEffect((n) => n + 1);
            haloWrite('halo-dispatches', String(logs | (1 << next)));
            const clip = signals[next]?.clip;
            if (clip && haloMusicEnabled()) playHaloClip(clip, channel);
            if (next === 0) sendLine('wake', 'signal');
            else setLiveLine((line) => (line?.slot === 'signal' ? null : line));
          }}
        >
          {copy('Intercept signal', '截获信号')}
        </button>
        {compact && (
          <button
            type="button"
            className="halo-transmission"
            aria-pressed={trace}
            onClick={() => setTrace(!trace)}
          >
            {copy('Cartographer trace', '制图师轨迹')}
          </button>
        )}
        {!compact && (
          <>
            <button
              type="button"
              onClick={() => {
                const next = (arrival + 1) % 3;
                setArrival(next);
                if (next === 1) sendLine('started', 'banner');
                else setLiveLine((line) => (line?.slot === 'banner' ? null : line));
              }}
            >
              {arrival === 0
                ? copy('Exit slipspace', '离开跃迁空间')
                : arrival === 1
                  ? copy('Approach ring', '驶近环带')
                  : copy('Reset approach', '重置进场')}
            </button>
            <button
              type="button"
              aria-expanded={showCrew}
              onClick={() => {
                setCrewBeat(0);
                setCrewManual(false);
                setShowCrew(!showCrew);
                if (!showCrew && exchange === 0) sendLine('together', 'fireteam');
              }}
            >
              {copy('Fireteam channels', '火力小队频道')}
            </button>
          </>
        )}
      </div>
      <p className="halo-reward">
        {rank}
        {' · '}
        {copy('Sectors', '扇区')} {chapter}/5 · {copy('Best', '最佳')}{' '}
        {Math.max(campaign, endless).toLocaleString()}
        {Number(lastBank) > 0 && (
          <span data-halo-played-record="">
            {' '}
            · {copy('Last bank', '上次提交')} {lastBank}
          </span>
        )}
      </p>
      <div className="halo-mobile-audio">
        <HaloToggles />
      </div>
      <div className="halo-console-log-row">
        <p className="halo-reward">
          {copy('SIGNALS DECODED', '已解码信号')} {decoded}/{dispatches.length}
        </p>
        <details className="halo-comms-log">
          <summary>
            {copy('Comms log', '通讯日志')} · {journal.length}/{canonicalLines.length}
          </summary>
          <ol>
            {canonicalLines.map((id) => (
              <li key={id} data-found={journal.includes(id)}>
                {journal.includes(id) ? (
                  <HaloQuote id={id} zh={zh} />
                ) : (
                  <span>{copy('Transmission not yet received', '尚未收到通讯')}</span>
                )}
              </li>
            ))}
          </ol>
        </details>
      </div>
      {chartPage && recon === 'briefed' && (
        <p className="halo-recon-step">
          {copy(
            '2 / 3 · Use Cartographer trace to lock the measured frontier.',
            '2 / 3 · 使用制图师轨迹锁定已测前沿。',
          )}
        </p>
      )}
      {trace && (
        <div className="halo-signal halo-cartographer">
          <img src={`${HALO_ART}map-room.webp`} alt="" width={128} height={72} />
          <div role="status">
            <strong>{copy('THE SILENT CARTOGRAPHER · MAP ROOM', '寂静制图师 · 地图室')}</strong>
            <HaloQuote id="map" zh={zh} />
            <p>
              {copy(
                'The visor copies visible frontier geometry into the chart frame. Your chart stays unchanged.',
                '护目镜会将可见前沿的形状复制到图表边框，原图保持不变。',
              )}
            </p>
            {frontier > 0 && (
              <div className="halo-frontier-confirm" data-halo-frontier={frontier}>
                <img src={`${HALO_ART}craig.webp`} width={36} height={36} alt="" />
                <p>
                  {copy(
                    `CRAIG · ${frontier} frontiers in the visor. Still waiting on the first token.`,
                    `克雷格 · 护目镜里有 ${frontier} 条前沿曲线。他还在等首词元。`,
                  )}
                </p>
              </div>
            )}
            {chartPage && recon.startsWith('mapped:') && (
              <Link className="halo-recon-link" href={zh ? '/zh/about' : '/about'}>
                {copy('3 / 3 · Debrief at the UNSC Archive', '3 / 3 · 前往 UNSC 档案库汇报')}
              </Link>
            )}
          </div>
        </div>
      )}
      {dispatch >= 0 && (
        <div className="halo-signal">
          {signal?.art && (
            <img src={`${HALO_ART}${signal.art}.webp`} alt="" width={76} height={66} />
          )}
          <div role="status" className="halo-transmission-line">
            {signal && <strong>{copy(...signal.name)}</strong>}
            {liveLine?.slot === 'signal' && <HaloQuote id={liveLine.id} zh={zh} />}
            <p>
              {dispatch === 1
                ? copy(
                    `Wort ×3. One shout per queue clock: prefill, decode, and the ${lastBank} shards last banked by your relay.`,
                    `沃特三连。每段队列喊一声：预填充、解码，还有你的中继上次提交的 ${lastBank} 枚碎片。`,
                  )
                : dispatch === 2
                  ? copy(
                      `The Halo 3 Rat hoards reusable prefixes. Your relay cache has banked ${lastBank} shards in its last report.`,
                      `《光环 3》的老鼠囤积可复用前缀。你的中继上次报告提交了 ${lastBank} 枚碎片。`,
                    )
                  : dispatch === 3
                    ? copy(
                        `Craig watched ${decoded} signals arrive and the face stayed exactly the same. First-token time is a separate metric.`,
                        `克雷格看完 ${decoded} 个信号，依然面不改色。首词元时延是另一项指标。`,
                      )
                    : signal
                      ? copy(...signal.note)
                      : copy(...(dispatches[dispatch] as [string, string]))}
            </p>
          </div>
        </div>
      )}
      {spartan && (
        <p className="halo-spartan-status" role="status">
          <span>117</span>{' '}
          {copy(
            'SPARTAN CHANNEL OPEN · Chief, you’re on the net.',
            '斯巴达频道已开启 · 士官长，你已接入。',
          )}
        </p>
      )}
      {logs === (1 << dispatches.length) - 1 && (
        <button
          type="button"
          className="halo-transmission"
          aria-pressed={login}
          data-halo-transmission
          onClick={() => setLogin(!login)}
        >
          {login
            ? copy('CORTANA: HUMAN IN THE LOOP', '科塔娜：人类仍在回路中')
            : copy('Open classified epilogue', '打开机密后记')}
        </button>
      )}
    </div>
  );

  return (
    <div className="container mx-auto px-4 lg:px-8" data-testid="halo-theme-banner">
      <div
        className="halo-theme-banner"
        data-compact={compact}
        data-halo-arrival={compact ? undefined : arrival}
        data-halo-scene-stage={compact ? undefined : homeBackdrop}
      >
        <picture
          className="halo-banner-art"
          aria-hidden="true"
          key={compact ? 'compact' : homeBackdrop}
        >
          <source
            media="(max-width: 640px)"
            srcSet={
              compact
                ? `${HALO_ART}ring-vista-mobile.webp`
                : `${HALO_ART}${homeBackdrop === 'installation-04' ? 'installation-04-mobile' : homeBackdrop}.webp`
            }
          />
          <img
            src={compact ? `${HALO_ART}ring-vista.webp` : `${HALO_ART}${homeBackdrop}.webp`}
            alt=""
            width={compact ? 1600 : 1580}
            height={compact ? 861 : 889}
            fetchPriority={compact ? 'auto' : 'high'}
            draggable={false}
          />
        </picture>
        <div className="halo-banner-shade" aria-hidden="true" />
        <div key={launchEffect} className="halo-banner-sweep" aria-hidden="true" />
        {compact ? (
          <details className="halo-compact-console" ref={compactConsole}>
            <summary>
              <span className="halo-helm-slot" aria-hidden="true">
                <img src={`${HALO_ART}spartan-117.webp`} alt="" width={36} height={50} />
              </span>
              <img
                className="halo-logo"
                src="/decorative/halo/halo-logo.webp"
                alt="Halo"
                width={720}
                height={103}
                decoding="async"
              />
              <span className="halo-compact-status">{rank}</span>
              <span>
                {copy('Console', '控制台')} <span aria-hidden="true">⌄</span>
              </span>
            </summary>
            {consolePanel}
          </details>
        ) : (
          <>
            <div className="halo-banner-title">
              <img
                className="halo-logo"
                src="/decorative/halo/halo-logo.webp"
                alt="Halo"
                width={720}
                height={103}
                decoding="async"
              />
              <p className="halo-wordmark">InferenceX</p>
              <p className="halo-tagline">
                {copy('Inference Evolved', 'Inference Evolved · 基准测试永无止境')}
              </p>
              <p className="halo-banner-mission">
                {arrival === 1
                  ? copy('PILLAR OF AUTUMN / BLIND JUMP COMPLETE', '秋风之墩号 / 盲跃完成')
                  : homeBackdrop === 'blood-gulch'
                    ? copy('BLOOD GULCH / FIRETEAM SIGNAL ACQUIRED', '血峡谷 / 已收到小队信号')
                    : hogDeployed
                      ? copy('BEACHHEAD / WARTHOG DEPLOYED', '滩头阵地 / 疣猪号已部署')
                      : copy(...(visorMission[selected as HaloMode] ?? visorMission.zeta))}
              </p>
              {liveLine?.slot === 'banner' ? (
                <HaloQuote id={liveLine.id} zh={zh} />
              ) : (
                <Link
                  className="halo-recon-link"
                  href={`${zh ? '/zh' : ''}/infx/inference?g_model=DeepSeek-R1-0528`}
                  onClick={() => haloWrite(haloReconStage, 'briefed')}
                >
                  {copy('1 / 3 · Recon: trace the frontier', '1 / 3 · 侦察：追踪前沿曲线')}
                </Link>
              )}
            </div>
            <img
              className="halo-spartan-art"
              src={`${HALO_ART}spartan-117.webp`}
              alt={copy(
                'Master Chief in olive armor and a gold visor',
                '身穿橄榄色盔甲、佩戴金色护目镜的士官长',
              )}
              width={709}
              height={1000}
              fetchPriority="high"
            />
            {hogDeployed && (
              <img
                className="halo-home-warthog"
                src={`${HALO_ART}m12-warthog.webp`}
                width={630}
                height={405}
                alt=""
                decoding="async"
                data-halo-earned-warthog=""
              />
            )}
            <div className="halo-home-console" data-expanded={homeConsoleOpen}>
              <button
                className="halo-home-console-toggle"
                type="button"
                ref={homeConsoleToggle}
                aria-expanded={homeConsoleOpen}
                aria-controls="halo-home-console-panel"
                onClick={() => {
                  setHomeConsoleOpen(!homeConsoleOpen);
                  if (homeConsoleOpen) setShowCrew(false);
                }}
              >
                <span>{copy('Console', '控制台')}</span>
                <span className="halo-home-console-rank">{rank}</span>
                <span aria-hidden="true">{homeConsoleOpen ? '▴' : '▾'}</span>
              </button>
              <div id="halo-home-console-panel">{consolePanel}</div>
            </div>
          </>
        )}
      </div>
      {isArchive && recon.startsWith('complete:') && (
        <div className="halo-recon-debrief" data-halo-recon-complete role="status">
          <img src={`${HALO_ART}autumn-arrival.webp`} alt="" width={68} height={34} />
          <div>
            <strong>
              {copy(
                'Master Chief, you mind telling me what you’re doing on that ship?',
                '士官长，能告诉我你在那艘船上干什么吗？',
              )}
            </strong>
            <p>
              {copy(
                `UNSC debrief: ${recon.slice(9)} benchmark frontiers recovered. Chief was comparing throughput, not stealing the ship.`,
                `UNSC 汇报：已恢复 ${recon.slice(9)} 条基准测试前沿。士官长是在比较吞吐量，没打算偷走飞船。`,
              )}
            </p>
            {liveLine?.slot === 'archive' && <HaloQuote id={liveLine.id} zh={zh} />}
          </div>
        </div>
      )}
      {!compact && showCrew && (
        <section className="halo-fireteam" aria-label={copy('Fireteam channels', '火力小队频道')}>
          <div
            role="group"
            className="halo-fireteam-controls"
            aria-label={copy('Choose a fireteam scene', '选择小队场景')}
          >
            {exchanges.map((item, index) => (
              <button
                key={item.en}
                type="button"
                aria-pressed={exchange === index}
                onClick={() => {
                  setCrewBeat(0);
                  setCrewManual(false);
                  setExchange(index);
                  if (index === 0) sendLine('together', 'fireteam');
                  if (index === 1) sendLine('weapon', 'fireteam');
                  if (index === 2) sendLine('sleep', 'fireteam');
                }}
              >
                {copy(item.en, item.zh)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setCrewManual(true);
                setCrewBeat((beat) => (beat + 1) % 3);
              }}
            >
              {copy('Next pose', '下一个姿势')}
            </button>
          </div>
          <div className="halo-fireteam-cast">
            {roster.map(([file, en, cn], index) => {
              const active = exchanges[exchange].crew.some((member) => member === index);
              const phase = crewStates[file]?.[crewBeat];
              const pose = active ? castPoses[file]?.[crewBeat] : undefined;
              return (
                <figure
                  key={file}
                  data-halo-speaking={active || undefined}
                  data-halo-cast={file}
                  data-halo-crew-beat={active ? crewBeat : undefined}
                >
                  <img src={`${HALO_ART}${pose ?? file}.webp`} width={160} height={154} alt="" />
                  <figcaption>{copy(en, cn)}</figcaption>
                  <small>{active && phase ? copy(...phase) : copy('STANDBY', '待命')}</small>
                </figure>
              );
            })}
          </div>
          <div role="status" className="halo-fireteam-caption">
            {liveLine?.slot === 'fireteam' && <HaloQuote id={liveLine.id} zh={zh} />}
            <p>{exchanges[exchange].note[zh ? 1 : 0]}</p>
            {exchange === 1 && (
              <p data-halo-meme="arby">
                {copy(
                  `Arby checks the denominator: ${lastBank} shards banked last run, not a per-GPU speed.`,
                  `神风烈士检查分母：上次提交了 ${lastBank} 枚碎片，这不是单卡速度。`,
                )}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export function HaloDecorations() {
  const [active, setActive] = useState(false);
  const scene = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const check = () =>
      setActive(root.classList.contains('halo') && !Object.hasOwn(root.dataset, 'inferencexEmbed'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'data-inferencex-embed'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = scene.current;
    if (!active || !host) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let ducked = false;
    const update = () => {
      frame = 0;
      if (ducked || document.querySelector('.halo-relay-dialog[data-state="open"]')) return;
      const offset = reduced.matches ? 0 : Math.min(68, Math.max(0, window.scrollY * 0.09));
      host.style.setProperty('--halo-scroll', `${offset.toFixed(1)}px`);
    };
    const schedule = () => {
      if (!ducked && !frame) frame = requestAnimationFrame(update);
    };
    const duck = (event: Event) => {
      ducked = (event as CustomEvent<boolean>).detail;
      if (!ducked) schedule();
    };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener(HALO_DUCK, duck);
    reduced.addEventListener('change', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener(HALO_DUCK, duck);
      reduced.removeEventListener('change', schedule);
      cancelAnimationFrame(frame);
    };
  }, [active]);

  if (!active) return null;

  return (
    <div ref={scene} className="halo-scene" data-testid="halo-scene" aria-hidden="true">
      <picture>
        <source media="(max-width: 640px)" srcSet="/decorative/halo/zeta-halo-mobile.webp" />
        <img
          className="halo-scene-image"
          src="/decorative/halo/zeta-halo.webp"
          alt=""
          width={1920}
          height={975}
          decoding="async"
          draggable={false}
        />
      </picture>
      <div className="halo-scene-shade" />
      <div className="halo-scene-orbit" />
      <div className="halo-scene-scan" />
      <div className="halo-scene-dust" />
      <svg className="halo-scene-corners" viewBox="0 0 240 100" preserveAspectRatio="none">
        <path d="M 2 20 V 4 H 23 M 217 4 H 238 V 20 M 2 80 V 96 H 23 M 217 96 H 238 V 80" />
      </svg>
    </div>
  );
}
