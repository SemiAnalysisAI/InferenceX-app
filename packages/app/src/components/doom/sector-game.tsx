'use client';
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useLocale } from '@/lib/i18n/use-locale';
import { changePass, readPass } from './pass';
import {
  campaigns,
  maps,
  rules,
  emitters,
  stats,
  makeWorld,
  availableSector,
  tick,
  action,
  routeStep,
  ready,
  type Action,
  type Mode,
} from './sector-world';
import { drawSector, loadSectorArt } from './sector-render';
import type { Mixer } from './signals';
import './sector-game.css';
const messages: Record<string, [string, string]> = {
  oom: ['KV overflow: batch reduced; vent to recover', '缓存溢出：已降低批量，请散热恢复'],
  entry: ['Telemetry online', '遥测已连接'],
  near: ['Move nearer to the terminal', '请靠近终端'],
  key: ['Keycard secured', '门卡已获取'],
  locked: ['Uplink sealed: check the objective', '上行链路封锁：请检查目标'],
  cooled: ['Coolant circulated', '冷却液已循环'],
  med: ['Integrity restored', '完整度已恢复'],
  secret: ['Secret cache found', '已发现秘密缓存'],
  shield: ['Overseer shield: ground relays; wait for a gap', '监工护盾：接地中继，等待空隙'],
  clear: ['Sector cleared', '扇区已清除'],
  cleared: ['Uplink confirmed', '上行链路已确认'],
  failed: ['Signal lost', '信号中断'],
  incoming: ['Overseer pulse inbound', '监工脉冲来袭'],
  overheat: ['Emitter stalled: vent or recharge', '发射器停滞：请散热或充能'],
  relay: ['KV relay grounded', '缓存中继已接地'],
  banish: ['Fault banished', '故障已驱散'],
  aim: ['Target acquired: fire emitter', '已锁定目标：发射脉冲'],
};
const mapKeys: Record<string, Action> = {
  w: 'forward',
  arrowup: 'forward',
  s: 'back',
  arrowdown: 'back',
  a: 'left',
  d: 'right',
  arrowleft: 'ccw',
  arrowright: 'cw',
  ' ': 'fire',
  e: 'use',
  r: 'vent',
};
interface RunSample {
  ttft: number;
  tps: number;
}
function RunFrontier({ points, zh }: { points: RunSample[]; zh: boolean }) {
  if (points.length === 0) return null;
  const ordered = [...points].sort((a, b) => a.ttft - b.ttft || b.tps - a.tps);
  const front: RunSample[] = [];
  for (const p of ordered) if (p.tps > (front.at(-1)?.tps ?? -Infinity)) front.push(p);
  const x0 = ordered[0].ttft,
    x1 = ordered.at(-1)!.ttft;
  const y0 = Math.min(...points.map((p) => p.tps)),
    y1 = Math.max(...points.map((p) => p.tps));
  const x = (p: RunSample) => 10 + (130 * (p.ttft - x0)) / Math.max(1, x1 - x0);
  const y = (p: RunSample) => 49 - (40 * (p.tps - y0)) / Math.max(1, y1 - y0);
  const label = zh ? '本局模拟：时延与吞吐量' : 'This simulation: latency vs throughput';
  return (
    <figure className="uac-run-plot">
      <svg viewBox="0 0 150 58" role="img" aria-label={label}>
        <path d="M6 5v48h139" fill="none" stroke="currentColor" />
        <polyline
          points={front.map((p) => `${x(p)},${y(p)}`).join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        {points.map((p, j) => (
          <circle key={j} cx={x(p)} cy={y(p)} r="2" fill="currentColor" />
        ))}
      </svg>
      <figcaption>
        <strong>{label}</strong>
        <span>
          TTFT: {x0}–{x1} ms · {zh ? '吞吐量' : 'Throughput'}: {y0}–{y1} {zh ? '词元/秒' : 'tok/s'}
        </span>
        <span>
          {zh ? '有效前沿点' : 'Efficient points'}: {front.length} / {points.length}
        </span>
      </figcaption>
    </figure>
  );
}
export default function SectorGame({ onClose, radio }: { onClose: () => void; radio: Mixer }) {
  const zh = useLocale() === 'zh',
    i = zh ? 1 : 0,
    L = (en: string, cn: string) => (zh ? cn : en);
  const [pass, setPass] = useState(readPass),
    [mode, setMode] = useState<Mode>('episode'),
    [zone, setZone] = useState(0),
    [wave, setWave] = useState(1),
    [kit, setKit] = useState(0),
    [phase, setPhase] = useState<'ready' | 'live' | 'pause' | 'win' | 'lost'>('ready'),
    [map, setMap] = useState(false),
    [steps, setSteps] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    [, refresh] = useState(0);
  const world = useRef<ReturnType<typeof makeWorld> | null>(null),
    art = useRef<ReturnType<typeof loadSectorArt> | null>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    keys = useRef(new Set<Action>()),
    phaseRef = useRef(phase),
    stepsRef = useRef(steps),
    mapRef = useRef(map),
    saved = useRef(false),
    drag = useRef<number | null>(null);
  const trace = useRef<RunSample[]>([]),
    lastSample = useRef(-1);
  phaseRef.current = phase;
  stepsRef.current = steps;
  mapRef.current = map;
  function keep(fn: Parameters<typeof changePass>[0]) {
    setPass(changePass(fn));
  }
  function paint() {
    const w = world.current,
      c = canvas.current,
      ctx = c?.getContext('2d', { alpha: false });
    if (w && ctx && art.current)
      drawSector(
        ctx,
        w,
        art.current,
        mapRef.current,
        zh,
        stepsRef.current,
        matchMedia('(forced-colors: active)').matches,
      );
  }
  function settle() {
    const w = world.current;
    if (!w) return;
    if (w.time - lastSample.current >= 0.5 || w.status !== 'live') {
      lastSample.current = w.time;
      const { tps, ttft } = stats(w);
      if (!trace.current.some((p) => p.tps === tps && p.ttft === ttft)) {
        if (trace.current.length === 64) trace.current.shift();
        trace.current.push({ tps, ttft });
      }
    }
    for (const c of w.cue.splice(0)) radio.cue(c);
    radio.game(
      true,
      w.heat,
      Math.min(
        1,
        w.mobs.filter((m) => m.hp > 0 && Math.hypot(m.x - w.player.x, m.y - w.player.y) < 5)
          .length / 3,
      ),
      w.zone,
    );
    if (w.status !== 'live' && !saved.current) {
      saved.current = true;
      setPhase(w.status);
      phaseRef.current = w.status;
      keys.current.clear();
      radio.game(false);
      if (w.status === 'win')
        keep((p) => {
          p.best = Math.max(p.best, w.score);
          w.salvage =
            w.mode === 'foundry' ? (p.commissioned & (1 << p.slot) ? 0 : 2) : 2 + w.secrets;
          if (w.mode === 'foundry') p.commissioned |= 1 << p.slot;
          p.scrap += w.salvage;
          if (w.mode === 'episode') {
            p.rank = Math.max(p.rank, w.zone + 1);
            p.keys |= 1 << (w.zone % 3);
            const seconds = Math.max(1, Math.ceil(w.time));
            p.records[w.zone] = Math.min(p.records[w.zone] || 99999, seconds);
          }
          if (w.mode === 'nightmare') p.waves = Math.max(p.waves, w.wave);
        });
    }
    paint();
  }
  function start(z = zone, n = wave, carry?: number) {
    radio.arm();
    radio.cue('door');
    const p = readPass();
    z = availableSector(z, p.rank);
    world.current = makeWorld(z, mode, p, n, kit, carry);
    trace.current = [];
    lastSample.current = -1;
    setZone(z);
    setWave(n);
    saved.current = false;
    phaseRef.current = 'live';
    setPhase('live');
    setMap(false);
    mapRef.current = false;
    keys.current.clear();
    paint();
    requestAnimationFrame(() => canvas.current?.focus());
  }
  function pause() {
    if (phaseRef.current === 'live') {
      keys.current.clear();
      phaseRef.current = 'pause';
      setPhase('pause');
      radio.game(false);
      radio.sleep();
    } else if (phaseRef.current === 'pause') {
      phaseRef.current = 'live';
      setPhase('live');
      radio.arm();
      canvas.current?.focus();
    }
  }
  function input(a: Action, hold = false) {
    if (phaseRef.current !== 'live' || !world.current) return;
    radio.arm();
    const w = world.current;
    if (a === 'use' || a === 'vent' || a === 'fire') action(w, a);
    if (stepsRef.current) {
      const s = new Set<Action>([a]);
      for (let j = 0; j < 4; j++) tick(w, s, 0.065);
    } else if (hold) keys.current.add(a);
    else if (!['fire', 'use', 'vent'].includes(a)) tick(w, new Set([a]), 0.11);
    settle();
    refresh((v) => v + 1);
  }
  function navigate() {
    if (phaseRef.current !== 'live' || !world.current) return;
    routeStep(world.current);
    if (steps) {
      for (let k = 0; k < 3; k++) tick(world.current, new Set(), 0.1);
    }
    settle();
    refresh((v) => v + 1);
  }
  useEffect(() => {
    document.documentElement.classList.add('uac-cartridge-open');
    art.current = loadSectorArt();
    if (!world.current) world.current = makeWorld(0, 'episode', readPass());
    let frame = 0,
      last = 0,
      hud = 0,
      accumulator = 0,
      windowStart = 0,
      windowTicks = 0,
      alive = true;
    const imgs = Object.values(art.current);
    const loaded = () => {
      if (alive) paint();
    };
    for (const im of imgs) im.addEventListener('load', loaded);
    const render = (ms: number) => {
      if (!alive) return;
      const dt = last ? Math.min(0.25, (ms - last) / 1000) : 0;
      last = ms;
      const w = world.current;
      if (w && phaseRef.current === 'live' && !document.hidden && !stepsRef.current) {
        // Catch up at 60 Hz through a 250 ms frame; bound work after longer stalls.
        accumulator += Math.max(0, dt);
        while (accumulator >= 1 / 60) {
          tick(w, keys.current, 1 / 60);
          accumulator -= 1 / 60;
          windowTicks++;
        }
        if (!windowStart) windowStart = ms - dt * 1000;
        if (ms - windowStart >= 1000) {
          if (canvas.current)
            canvas.current.dataset.simHz = String(
              Math.round((windowTicks * 1000) / (ms - windowStart)),
            );
          windowStart = ms;
          windowTicks = 0;
        }
        settle();
        if (ms - hud > 100) {
          hud = ms;
          refresh((v) => v + 1);
        }
      } else {
        accumulator = 0;
        windowStart = 0;
        windowTicks = 0;
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    const blur = () => {
      keys.current.clear();
      if (document.hidden && phaseRef.current === 'live') pause();
    };
    const release = () => keys.current.clear();
    document.addEventListener('visibilitychange', blur);
    window.addEventListener('blur', release);
    paint();
    return () => {
      alive = false;
      document.documentElement.classList.remove('uac-cartridge-open');
      cancelAnimationFrame(frame);
      for (const im of imgs) im.removeEventListener('load', loaded);
      document.removeEventListener('visibilitychange', blur);
      window.removeEventListener('blur', release);
      radio.game(false);
      radio.sleep();
      keys.current.clear();
    };
    // The renderer reads active controls through refs, not stale animation callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (phase === 'ready') {
      world.current = makeWorld(zone, mode, pass, wave, kit);
      refresh((v) => v + 1);
    }
    paint();
  }, [map, phase, zone, mode, pass, kit, wave, steps]);
  const w = world.current,
    hud = w ? stats(w) : { tps: 0, ttft: 0, kv: 0, perUser: 0 },
    live = phase === 'live',
    end = phase === 'win' || phase === 'lost',
    intro = phase === 'ready',
    status = w && (messages[w.notice]?.[i] || ''),
    boss = w?.mobs.find((m) => m.kind === 3),
    finale = boss ? (boss.hp <= 0 ? 3 : boss.hp <= boss.max / 2 ? 2 : 1) : 0;
  const switchKit = (k: number) => {
    setKit(k);
    if (w) w.kit = k;
    radio.cue('tick');
  };
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        overlayClassName="uac-sector-cover"
        className="uac-game"
        onKeyDown={(e) => {
          const k = e.key.toLowerCase();
          if (e.ctrlKey || e.metaKey || e.altKey || k === 'escape') return;
          if (k === 'p' && (live || phase === 'pause')) {
            e.preventDefault();
            if (!e.repeat) pause();
            return;
          }
          if (!live || e.target instanceof HTMLSelectElement) return;
          if ((k === 'tab' && e.target === canvas.current) || k === 'm') {
            if (k === 'tab' && e.shiftKey) return;
            if (k === 'm') e.preventDefault();
            if (!e.repeat) {
              setMap((v) => !v);
            }
            return;
          }
          if (
            e.target instanceof HTMLElement &&
            e.target.closest('button') &&
            (k === ' ' || k === 'enter')
          )
            return;
          if (k === 'n') {
            e.preventDefault();
            if (!e.repeat) navigate();
            return;
          }
          if (k >= '1' && k <= '4' && k.length === 1) {
            switchKit(Number(k) - 1);
            return;
          }
          if (mapKeys[k]) {
            e.preventDefault();
            if (!e.repeat) input(mapKeys[k], true);
          }
        }}
        onKeyUp={(e) => keys.current.delete(mapKeys[e.key.toLowerCase()])}
      >
        <header className="uac-game-head">
          <div>
            <small>UAC / {L('PHOBOS RESEARCH DIVISION', '火卫一研究部')}</small>
            <DialogTitle>{L('Tensor Hangar', '张量机库')}</DialogTitle>
            <DialogDescription>
              {L('Knee-deep in the benchmark', '深入基准测试核心')}
            </DialogDescription>
          </div>
          <span className="uac-stamp">
            E1<span>/</span>M{maps[zone]}
          </span>
        </header>
        {intro && (
          <div className="uac-modes" aria-label={L('Mode', '模式')}>
            {(['episode', 'nightmare', 'foundry'] as const).map((v, j) => (
              <button
                key={v}
                aria-pressed={mode === v}
                onClick={() => {
                  setMode(v);
                  setZone(v === 'foundry' ? availableSector(pass.bays[pass.slot], pass.rank) : 0);
                  setWave(1);
                }}
              >
                {
                  [
                    L('Episode', '战役'),
                    L('Nightmare', '无尽梦魇'),
                    L('Sector Foundry', '扇区工坊'),
                  ][j]
                }
              </button>
            ))}
          </div>
        )}
        <div className="uac-sector-title">
          <b>
            E1M{maps[zone]} / {campaigns[zone][i]}
          </b>
          <span>
            {mode === 'nightmare'
              ? `${L('SURGE', '浪潮')} ${wave}`
              : mode === 'foundry'
                ? L('SIMULATION', '模拟')
                : L('PHOBOS EPISODE', '火卫一战役')}
          </span>
        </div>
        <div className="uac-view">
          <canvas
            ref={canvas}
            width={660}
            height={260}
            tabIndex={0}
            aria-label={L(
              'First-person sector. Use arrow keys or the navigation controls below.',
              '第一人称扇区。使用方向键或下方导航按钮。',
            )}
            onPointerDown={(e) => {
              drag.current = e.clientX;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!live || steps || drag.current === null || !w) return;
              w.player.a += (e.clientX - drag.current) * 0.008;
              drag.current = e.clientX;
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          />
          {(phase === 'pause' || end) && (
            <div className="uac-intermission" role="status">
              <small>UAC / {L('DEBRIEF', '行动简报')}</small>
              <strong>
                {phase === 'pause'
                  ? L('Signal paused', '信号已暂停')
                  : phase === 'win'
                    ? L('Sector secure', '扇区已确保安全')
                    : L('Signal lost', '信号丢失')}
              </strong>
              {end && w && (
                <span>
                  {L('Kills', '击败')} {w.kills}/{w.total} · {L('Items', '物品')} {w.items}/
                  {w.props.length - 1} · {L('Secrets', '秘密')} {w.secrets}/1 · {Math.ceil(w.time)}s
                </span>
              )}
              {phase === 'win' && w && (
                <span className="uac-pay">
                  {L('Recovered', '回收')} +{w.salvage} {L('salvage', '零件')} ·{' '}
                  {mode === 'episode' && zone < 4
                    ? L('Unlocked: ', '已解锁：') + campaigns[zone + 1][i]
                    : L('Sector record saved', '扇区记录已保存')}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="uac-readouts">
          <div
            className="uac-combat-face"
            role="img"
            aria-label={L('Marine condition', '陆战队员状态')}
            data-expression={w?.hurt ? 'hurt' : w?.key ? 'grin' : 'watch'}
            style={{ backgroundPosition: `${w?.hurt ? 100 : w?.key ? 60 : 20}% bottom` }}
          />
          {[
            [L('Integrity', '完整度'), `${Math.ceil(w?.hp ?? 100)}%`],
            [L('Throughput', '吞吐量'), `${hud.tps} t/s`],
            ['TTFT', `${hud.ttft} ms`],
            [L('Argent heat', '银色热量'), `${Math.round(w?.heat || 0)}%`],
            [L('Charge', '电荷'), `${Math.round(w?.charge ?? 100)}%`],
          ].map(([k, val]) => (
            <div key={k}>
              <small>{k}</small>
              <b>{val}</b>
            </div>
          ))}
        </div>
        {intro ? (
          <div className="uac-prep">
            <p>
              {mode === 'nightmare'
                ? L(
                    'Integrity carries over. Medkits restore 10; incoming pulses grow stronger each surge.',
                    '完整度延续到下一波。医疗包恢复 10 点，脉冲伤害逐波提升。',
                  )
                : mode === 'foundry'
                  ? L(
                      'Each of the three blueprints pays 2 salvage once, including after edits. Ground every relay. E1M8 requires four campaign clears.',
                      '三份蓝图每份只发放一次 2 个零件，修改不会重置。接地所有中继。战役通关四个扇区后解锁 E1M8。',
                    )
                  : rules[zone][i]}
            </p>
            <div className="uac-route">
              {campaigns.map((z, j) => (
                <button
                  key={z[0]}
                  aria-label={z[i]}
                  disabled={
                    (mode === 'episode' && j > pass.rank) || availableSector(j, pass.rank) !== j
                  }
                  aria-pressed={zone === j}
                  onClick={() => {
                    setZone(j);
                    if (mode === 'foundry')
                      keep((p) => {
                        p.bays[p.slot] = j;
                      });
                  }}
                >
                  {String(j + 1).padStart(2, '0')} {pass.records[j] ? '✓' : ''}
                </button>
              ))}
              <span>
                {pass.rank}/5 {L('cleared', '已通关')}
              </span>
            </div>
            {mode === 'foundry' && (
              <div className="uac-lab">
                <label>
                  {L('Blueprint', '蓝图')}{' '}
                  <select
                    aria-label={L('Blueprint', '蓝图')}
                    value={pass.slot}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      keep((p) => {
                        p.slot = n;
                        p.lab = [...p.blueprints[n]];
                      });
                      setZone(availableSector(pass.bays[n], pass.rank));
                    }}
                  >
                    {[0, 1, 2].map((n) => (
                      <option key={n} value={n}>
                        {String(n + 1).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </label>
                {pass.lab.map((v, j) => (
                  <button
                    key={j}
                    onClick={() =>
                      keep((p) => {
                        p.lab[j] = (p.lab[j] + 1) % 4;
                      })
                    }
                  >
                    {j + 1} /{' '}
                    {
                      [
                        L('Coolant', '冷却'),
                        L('Rusher', '冲锋怪'),
                        L('Relay', '中继'),
                        L('Medkit', '医疗'),
                      ][v]
                    }
                  </button>
                ))}
              </div>
            )}
            <details>
              <summary>
                {L('Armory & controls', '军械库与操作')} · {pass.scrap} {L('salvage', '零件')}
              </summary>
              <div className="uac-pack">
                {[L('Cooling', '散热'), L('Armor', '护甲'), L('Emitter', '发射器')].map((a, j) => (
                  <button
                    key={a}
                    disabled={pass.scrap < 2 || pass.upgrades[j] >= 3}
                    onClick={() =>
                      keep((p) => {
                        if (p.scrap >= 2 && p.upgrades[j] < 3) {
                          p.scrap -= 2;
                          p.upgrades[j]++;
                        }
                      })
                    }
                  >
                    {a} {pass.upgrades[j]}/3 · 2
                  </button>
                ))}
              </div>
              {pass.upgrades.some(Boolean) && (
                <p className="uac-econ">
                  {L('Fitted', '已安装')} ·{' '}
                  {pass.upgrades
                    .map((n, j) =>
                      n
                        ? [
                            L(`Cryo loop +${2 * n}/s cooling`, `低温回路：每秒散热 +${2 * n}`),
                            L(`Ablative plate +${15 * n} HP`, `烧蚀装甲：完整度 +${15 * n}`),
                            L(`Emitter coil +${15 * n}% output`, `发射线圈：输出 +${15 * n}%`),
                          ][j]
                        : '',
                    )
                    .filter(Boolean)
                    .join(' / ')}
                </p>
              )}
              <p>
                {L(
                  'W/S move, A/D strafe, arrows turn, 1–4 emitter, Space fire, E use, R vent, M map, N assisted step, P pause, Esc close.',
                  'W/S 移动、A/D 平移、方向键转向、1–4 切换、空格发射、E 使用、R 散热、M 地图、N 导航步进、P 暂停、Esc 关闭。',
                )}
              </p>
            </details>
            <div className="uac-pack">
              <label>
                {L('Emitter', '发射器')}{' '}
                <select value={kit} onChange={(e) => switchKit(Number(e.target.value))}>
                  {emitters.map((a, j) => (
                    <option key={j} value={j}>
                      {a[i]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {L('Batch', '批量')}{' '}
                <select
                  value={pass.preset}
                  onChange={(e) =>
                    keep((p) => {
                      p.preset = Number(e.target.value);
                    })
                  }
                >
                  {[1, 2, 3].map((v) => (
                    <option key={v} value={v - 1}>
                      {v}×
                    </option>
                  ))}
                </select>
              </label>
              <button aria-pressed={steps} onClick={() => setSteps((v) => !v)}>
                {L('Step mode', '步进模式')} {steps ? '■' : '□'}
              </button>
            </div>
            <button className="uac-primary" onClick={() => start()}>
              {L('Enter sector', '进入扇区')} ▸
            </button>
          </div>
        ) : (
          <div className="uac-flight">
            <div className="uac-objective">
              <strong>
                {phase === 'win'
                  ? L('Sector secured', '扇区已安全')
                  : phase === 'lost'
                    ? L('Signal lost', '信号中断')
                    : ready(w!)
                      ? L('Exit online', '出口已启用')
                      : L('Objective', '目标')}
              </strong>{' '}
              {phase === 'win'
                ? L('Uplink confirmed.', '上行链路已确认。')
                : phase === 'lost'
                  ? L('Replay or return to the mission deck.', '可重试或返回任务面板。')
                  : ready(w!)
                    ? L('Activate the uplink.', '启动上行链路。')
                    : mode === 'foundry'
                      ? L(
                          'Recover the key, ground all relays and clear any Overseer.',
                          '取得门卡、接地全部中继并清除场上的监工。',
                        )
                      : rules[zone][i]}
            </div>
            {live ? (
              <>
                <div className="uac-commands">
                  {(
                    [
                      ['ccw', '↶'],
                      ['forward', '▲'],
                      ['cw', '↷'],
                      ['left', '◀'],
                      ['back', '▼'],
                      ['right', '▶'],
                    ] as const
                  ).map(([a, t], j) => (
                    <button
                      key={a}
                      aria-label={
                        [
                          L('Turn left', '左转'),
                          L('Forward', '前进'),
                          L('Turn right', '右转'),
                          L('Strafe left', '左移'),
                          L('Back', '后退'),
                          L('Strafe right', '右移'),
                        ][j]
                      }
                      onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        input(a, true);
                      }}
                      onPointerUp={() => keys.current.delete(a)}
                      onPointerCancel={() => keys.current.clear()}
                      onClick={(e) => {
                        if (e.detail === 0) input(a);
                      }}
                    >
                      {t}
                    </button>
                  ))}
                  <button className="uac-fire" onClick={() => input('fire')}>
                    {L('Fire', '发射')} ␣
                  </button>
                  <button onClick={() => input('use')}>{L('Use', '使用')} E</button>
                  <button onClick={() => input('vent')}>{L('Vent', '散热')} R</button>
                  <button onClick={navigate}>{L('Nav step', '导航步进')} N</button>
                </div>
                <div className="uac-pack">
                  <button onClick={() => switchKit((kit + 1) % 4)}>{emitters[kit][i]} ▸</button>
                  <button
                    onClick={() => {
                      w!.batch = (w!.batch % 3) + 1;
                      refresh((v) => v + 1);
                    }}
                  >
                    {L('Batch', '批量')} {w!.batch}×
                  </button>
                  <button aria-pressed={map} onClick={() => setMap((v) => !v)}>
                    {L('Automap', '自动地图')} M
                  </button>
                  <button onClick={pause}>{L('Pause', '暂停')} P</button>
                </div>
              </>
            ) : (
              <div className="uac-pack">
                <button
                  className="uac-primary"
                  onClick={() => {
                    if (phase === 'pause') pause();
                    else if (phase === 'win' && mode === 'nightmare')
                      start((zone + 1) % 5, wave + 1, w?.hp);
                    else if (phase === 'win' && mode === 'episode' && zone < 4)
                      start(zone + 1, 1, w?.hp);
                    else start();
                  }}
                >
                  {phase === 'pause'
                    ? L('Resume', '继续')
                    : phase === 'win' && (mode === 'nightmare' || (mode === 'episode' && zone < 4))
                      ? L('Next sector', '下一扇区')
                      : L('Replay', '重新开始')}{' '}
                  ▸
                </button>
                <button onClick={() => setPhase('ready')}>{L('Mission deck', '任务面板')}</button>
              </div>
            )}
            {end && <RunFrontier points={trace.current} zh={zh} />}
            <small role="status" className="uac-status">
              {w && w.noticeTime > 0 ? status : L('Link stable', '链路稳定')} · {L('Score', '得分')}{' '}
              {w?.score} · {w?.key ? '◆' : '◇'} {L('Keycard', '门卡')}
            </small>
          </div>
        )}
        {!intro && Boolean(finale) && (
          <div className="uac-condition" data-phase={finale}>
            {finale === 3
              ? L('Overseer offline · Uplink cleared', '监工已下线 · 上行就绪')
              : finale === 2
                ? L('Phase II / Surge · triple pulse', '第二阶段 / 过载 · 三连脉冲')
                : L('Phase I / Relay shield', '第一阶段 / 中继护盾')}{' '}
            · {Math.max(0, Math.ceil(boss!.hp))}/{boss!.max}
          </div>
        )}
        <footer className="uac-game-foot">
          <span>
            {w?.profile.live ? L('Chart seed', '图表种子') : L('Fixture seed', '样本种子')} /{' '}
            {w?.profile.sample.name || 'UAC'}
          </span>
          <span>
            {L('Sim.', '模拟')} · KV {hud.kv}% · {hud.perUser} {L('t/s/user', '词元/秒/用户')}
          </span>
          <span className="uac-game-mix">
            <button
              aria-pressed={radio.flags()[0]}
              onClick={() => {
                radio.switch();
                refresh((n) => n + 1);
              }}
            >
              {L('DOOM audio', 'DOOM 声音')}
            </button>
          </span>
          <span>
            {L('Personal best', '个人纪录')} {pass.best}
          </span>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
