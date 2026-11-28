'use client';
import { useEffect, useState } from 'react';
import type { Mixer } from './signals';
import { sampleFromChart } from './benchmark';
const root = '/decorative/doom/';
// Quoted English comes from the game, store description, episode title or licensed comic.
// The benchmark dispatch is ours; the translation is not a claim about official subtitles.
const files = [
  {
    id: 'hangar',
    sig: 'E1M1',
    image: 'hangar',
    monster: '',
    name: ['Hangar entry', '机库入口'],
    line: 'Knee-Deep in the Dead',
    sub: '深陷亡者之中',
    body: [
      'Boot the little terminal. If it runs DOOM, can it fit the KV cache?',
      '启动这台小终端。它能跑 DOOM，可装得下 KV 缓存吗？',
    ],
    action: ['Enter Hangar', '进入机库'],
  },
  {
    id: 'orders',
    sig: 'E1M8',
    image: 'titlepic',
    monster: 'imp',
    name: ['Phobos Anomaly', '火卫一异常区'],
    line: 'Rip and tear, until it is done.',
    sub: '撕裂，直到完成。',
    body: [
      'Clear the warmup queue before timing the next batch. The intermission tally counts finished runs, not estimates.',
      '先清空预热队列，再为下一批计时。过关统计只算已完成的运行。',
    ],
    action: ['Clear the queue', '清空队列'],
  },
  {
    id: 'babel',
    sig: 'E2M8',
    image: 'babel',
    monster: 'cyber',
    name: ['Tower of Babel', '巴别塔'],
    line: 'Here comes the Night Train!',
    sub: '夜班列车来了！',
    body: [
      'That footfall is the Cyberdemon. Inspect the long tail before declaring a latency victory.',
      '脚步声来自机械巨魔。宣布延迟达标之前，先检查长尾。',
    ],
    action: ['Open the encounter', '打开遭遇档案'],
  },
  {
    id: 'caco',
    sig: 'BESTIARY',
    image: 'titlepic',
    monster: 'caco',
    name: ['Cacodemon encounter', '遭遇巨脑魔'],
    line: 'Sweet Christmas! Big-mouthed floating thingies!',
    sub: '圣诞老天！大嘴巴的漂浮怪！',
    body: [
      'A floating red outlier is still a measurement. No, marine, you are not the data.',
      '漂浮的红色离群点也是测量值。陆战队员，你不是数据本身。',
    ],
    action: ['Inspect the outlier', '检查离群点'],
  },
  {
    id: 'argent',
    sig: 'UAC / 2016',
    image: 'slayer',
    monster: '',
    name: ['Argent safety briefing', '银色能源安全简报'],
    line: 'The road to Hell is paved – by Argent Energy.',
    sub: '通往地狱的道路由银色能源铺就。',
    body: [
      'The UAC filed GPU power under “facility lighting.” Request the watts per token before approving the cover sheet.',
      'UAC 把 GPU 功耗列在「设施照明」下。批准封面之前，请索取每词元功耗。',
    ],
    action: ['Stamp the cover', '盖章归档'],
  },
  {
    id: 'mars',
    sig: 'MARS CORE',
    image: 'mars',
    monster: '',
    name: ['Mars Core override', '火星核心越权'],
    line: "You can't just shoot a hole into the surface of Mars.",
    sub: '你不能就这么在火星表面轰出一个洞。',
    body: [
      'The safety notice says not to cut through the Pareto frontier. Locate peak on a real chart to plot the breach coordinate.',
      '安全公告要求不要击穿帕累托前沿。用真实图表的「定位峰值」绘出突破坐标。',
    ],
    action: ['Override the notice', '越过安全警告'],
  },
  {
    id: 'eternal',
    sig: 'CODEX / 2020',
    image: 'eternal',
    monster: 'marauder',
    name: ['Marauder window', '掠夺者时机窗口'],
    line: 'The only thing they fear... is you.',
    sub: '他们唯一恐惧的……是你。',
    body: [
      'Wait for the green window. A burst of tokens is not the same as a short time to first token.',
      '等待绿色窗口。短时间内大量输出不等于首词元延迟低。',
    ],
    action: ['Open the weakness entry', '打开弱点档案'],
  },
  {
    id: 'fortress',
    sig: 'FORTRESS',
    image: 'fortress',
    monster: '',
    name: ['Fortress terminal', '要塞终端'],
    line: 'Welcome to Hell! Brought to you by your friends at the UAC.',
    sub: '欢迎来到地狱！由 UAC 的朋友们为您呈现。',
    body: [
      'There is a smaller game inside the big game. Load the cartridge only when you are ready; the dashboard keeps its own memory.',
      '大游戏里还有一台小游戏机。准备好再载入卡带；仪表盘保留自己的内存。',
    ],
    action: ['Boot classic display', '启动经典画面'],
  },
  {
    id: 'shift',
    sig: 'UAC / PA',
    image: 'doom-hell-mobile',
    monster: '',
    name: ['Public address', '公共广播'],
    line: "The UAC – we've got guts. HUGE guts!",
    sub: 'UAC 有胆量。天大的胆量！',
    body: [
      'The soundtrack editor wants a metal drop at every throughput spike. Operations requests one per completed batch.',
      '配乐师想让每个吞吐量尖峰都响起重金属。运维要求每个完成批次只播一次。',
    ],
    action: ['Cue the riff', '播放吉他段落'],
  },
  {
    id: 'iddqd',
    sig: 'IDDQD',
    image: 'titlepic',
    monster: '',
    name: ['Gold visor audit', '金色面罩审计'],
    line: 'Can someone kill this idiot, please?!',
    sub: '能不能请谁干掉这个蠢货？！',
    body: [
      'God mode changes the visor, not the measured tokens per second. Compare like precision before calling it a miracle.',
      '无敌模式改变面罩，不改实测速率。先核对精度，再谈奇迹。',
    ],
    action: ['Inspect service code', '查看维护代码'],
  },
  {
    id: 'shelf',
    sig: 'SECRET',
    image: 'shelf',
    monster: '',
    name: ['The Slayer’s bookshelf', '毁灭战士的书架'],
    line: 'Knee-Deep in the Dead',
    sub: '深陷亡者之中',
    body: [
      'One quiet batch for Daisy. Isabelle can take the next shift while the GPU cools down.',
      '让这一批为黛西安静运行。显卡降温时，让西施惠接下一班。',
    ],
    action: ['Find Daisy', '寻找黛西'],
  },
] as const;
export function FieldGuide({ zh, radio }: { zh: boolean; radio: Mixer | null }) {
  const [index, setIndex] = useState(0),
    [open, setOpen] = useState(false),
    [reading, setReading] = useState('');
  const row = files[index],
    i = Number(zh);
  useEffect(() => {
    const tune = (n: number) => {
      const feed = sampleFromChart();
      setReading(
        feed.live
          ? `${feed.sample.name} · ${Math.round(feed.sample.tps).toLocaleString()} tok/s · ${feed.count}`
          : '',
      );
      setIndex(n);
      setOpen(true);
    };
    const peak = () => tune(5);
    const change = (e: Event) => {
      if (!(e.target instanceof Element)) return;
      const el = e.target;
      if (el.closest('.uac-keypad button')) tune(9);
      else if (el.closest('.uac-dials button:nth-of-type(2)')) tune(4);
      else if (el.closest('.uac-dials button:nth-of-type(3)')) tune(6);
      else if (el.closest('.uac-dials button:nth-of-type(1)')) tune(0);
    };
    try {
      const channel = localStorage.getItem('doom-channel');
      if (channel === 'argent' || channel === 'inferno') setIndex(channel === 'argent' ? 4 : 6);
    } catch {
      /* storage is optional */
    }
    window.addEventListener('doom-peak', peak);
    document.addEventListener('click', change);
    return () => {
      window.removeEventListener('doom-peak', peak);
      document.removeEventListener('click', change);
    };
  }, []);
  const classic = row.id === 'hangar' || (row.id === 'fortress' && open);
  return (
    <section className="uac-field-guide" aria-label={zh ? 'UAC 战地档案' : 'UAC field archive'}>
      <div className="uac-viewport" aria-hidden="true">
        <img
          className="uac-location"
          src={`${root}${classic ? 'hangar' : open && row.id === 'shelf' ? 'daisy' : row.id === 'orders' && !open ? 'box-1993' : row.id === 'argent' && !open ? 'box-2016' : row.id === 'mars' && !open ? 'phobos-cannon' : row.image}.webp`}
          alt=""
        />
        {row.monster && (open || row.id !== 'babel') && (
          <img className="uac-specimen" src={`${root}${row.monster}.webp`} alt="" />
        )}
        {classic && (
          <>
            <img className="uac-view-logo" src={`${root}doom-logo.webp`} alt="" />
            <img className="uac-view-imp" src={`${root}imp.webp`} alt="" />
            <img className="uac-view-shotgun" src={`${root}shotgun.webp`} alt="" />
            <img className="uac-view-status" src={`${root}status-bar.webp`} alt="" />
            <i className="uac-stface" />
            {open && <img className="uac-card-pickup" src={`${root}card-blue.webp`} alt="" />}
          </>
        )}
      </div>
      <div className="uac-entry-copy">
        <small>
          {zh ? '联合航天集团 · 战地档案' : 'UNION AEROSPACE / FIELD ARCHIVE'} <b>{row.sig}</b>
        </small>
        <div className="uac-entry-title">{row.name[i]}</div>
        <p>{row.body[i]}</p>
        {open && (
          <small className="uac-index">
            {row.id === 'mars'
              ? zh
                ? '已授权 · 等待实测坐标'
                : 'OVERRIDE ACCEPTED / AWAITING SCANNER'
              : row.id === 'babel'
                ? zh
                  ? '发现机械巨魔'
                  : 'CONTACT / CYBERDEMON'
                : row.id === 'shelf'
                  ? zh
                    ? '发现秘密 · 黛西'
                    : 'SECRET FOUND / DAISY'
                  : row.id === 'fortress'
                    ? zh
                      ? '已载入经典画面'
                      : 'CLASSIC DISPLAY ONLINE'
                    : row.id === 'hangar'
                      ? zh
                        ? '已获得蓝色门卡'
                        : 'BLUE KEYCARD ACQUIRED'
                      : zh
                        ? '档案已解锁'
                        : 'CODEX ENTRY UNLOCKED'}
          </small>
        )}
        {open && reading && (
          <small className="uac-live-reading">
            {zh ? '当前图表 / 样本' : 'LIVE CHART / SAMPLES'} · {reading}
          </small>
        )}
        <div className="uac-quotation" aria-live="polite">
          {zh ? (
            <>
              {row.sub} <span lang="en">{row.line}</span>
            </>
          ) : (
            row.line
          )}
        </div>
      </div>
      <div className="uac-codex-controls">
        <div className="uac-sector-plate" aria-hidden="true">
          <img
            src={`${root}${row.id === 'hangar' ? 'box-1993' : classic ? 'phobos-map' : row.id === 'eternal' ? 'meathook' : row.id === 'argent' ? 'box-2016' : row.image}.webp`}
            alt=""
          />
        </div>
        <label>
          {zh ? '索引 / 条目' : 'CODEX / INDEX'}
          <select
            value={row.id}
            onChange={(e) => {
              setIndex(files.findIndex((v) => v.id === e.target.value));
              setOpen(false);
            }}
          >
            {files.map((v, n) => (
              <option value={v.id} key={v.id}>
                {String(n + 1).padStart(2, '0')} / {v.name[i]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          aria-pressed={open}
          onClick={() => {
            const feed = sampleFromChart();
            setReading(
              feed.live
                ? `${feed.sample.name} · ${Math.round(feed.sample.tps).toLocaleString()} tok/s · ${feed.count}`
                : '',
            );
            setOpen(!open);
            if (row.id === 'hangar' || row.id === 'shift') radio?.station('gate');
            else {
              if (row.id === 'babel') radio?.station('tower');
              if (row.id === 'argent') radio?.station('division');
              if (row.id === 'eternal') radio?.station('complex');
              radio?.cue(row.id === 'mars' ? 'burst' : row.id === 'babel' ? 'alarm' : 'door');
            }
          }}
        >
          {open ? '■' : '▸'} {row.action[i]}
        </button>
      </div>
    </section>
  );
}
