'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useLocale } from '@/lib/i18n/use-locale';
import SouthParkToggles from './south-park-toggles';
import './channel-four.css';

const art = '/decorative/south-park/art/';
// Each button changes a local, explicitly fictional report, not a chart or benchmark setting.
const reports = [
  [
    'gnomes',
    'elementary',
    'Gnome economics',
    '内裤侏儒经济学',
    'Phase 1: Collect KV blocks. Phase 2: ? Phase 3: Profit.',
    '第一步：收集 KV 缓存块。第二步：？第三步：盈利。',
    'Audit phase two',
    '审查第二步',
    'They forgot to measure tokens per second. The chalkboard still says “?”.',
    '他们忘了测每秒词元数。黑板上依然只有一个问号。',
    'gnomes',
  ],
  [
    'banker',
    'main-street',
    'Bank of South Park',
    '南方公园银行',
    'The teller promises to roll your prompt into a diversified portfolio of KV blocks.',
    '柜员承诺把你的提示词放入多元化的 KV 缓存组合。',
    'Deposit 64 tokens',
    '存入 64 个词元',
    'And it’s gone!',
    '就这么没了！',
    'bank',
  ],
  [
    'darryl',
    'main-street',
    'Back to the pile',
    '回到队伍里',
    'One GPU now serves the whole batch. Darryl has called a town meeting.',
    '一块 GPU 就能处理整批请求。达里尔召集了镇民大会。',
    'Dispatch the batch',
    '调度这一批',
    'They took our jobs!',
    '他们抢走了我们的工作！',
    'jobs',
  ],
  [
    'chef-dad',
    'pond',
    'Toll at the pond',
    '池塘收费站',
    'A driver offers to clear the TTFT tollbooth. There is something odd about his fare.',
    '一位司机说他能帮你通过首词元收费站。可他的报价有点蹊跷。',
    'Ask the fare',
    '询问车费',
    'I need about treefiddy.',
    '我大概要三块五。',
    'toll',
  ],
  [
    'thumper',
    'pond',
    'Asspen ski school',
    '阿斯彭滑雪课',
    'Pizza for interactivity. French fries for throughput. Kyle is already pointing straight downhill.',
    '想要交互响应就用披萨式，想要吞吐量就用薯条式。凯尔已经朝着下坡冲了。',
    'Send the 64-batch downhill',
    '让批次 64 滑下山',
    'If you french fry when you should pizza, you’re gonna have a bad time!',
    '该用披萨式时却用了薯条式，你就要吃苦头了！',
    'ski',
  ],
  [
    'randy',
    'elementary',
    'Randy at the game',
    '兰迪在比赛现场',
    'The referee flagged Randy for comparing different input lengths on the Pareto frontier.',
    '裁判发现兰迪把输入长度不同的结果放在同一条帕累托前沿上。',
    'Call the foul',
    '吹罚犯规',
    'Oh, I’m sorry, I thought this was America.',
    '噢，对不起，我还以为这里是美国呢。',
    'foul',
  ],
  [
    'butters',
    'casa',
    'Birthday reservation',
    '生日订位',
    'Kyle needs four seats at Casa Bonita. Cartman calls the scheduler and puts Butters on standby.',
    '凯尔在波尼塔之家订了四个座位。卡特曼打给调度员，让巴特斯候补。',
    'Read the waitlist',
    '查看候补名单',
    'Oh, hamburgers!',
    '噢，汉堡包！',
    'wait',
  ],
  [
    'gamer',
    'elementary',
    'The Warcraft raid',
    '魔兽世界团本',
    'One player has the GPU all evening. The rest of the raid is waiting for its first token.',
    '一个玩家占用 GPU 一整晚，全团其他成员还在等首个词元。',
    'Cap the long request',
    '限制长请求的用量',
    'The party can finally enter the instance. The long prompt goes back in the queue.',
    '全团终于进了副本，长提示词回到队列里。',
    'raid',
  ],
  [
    'berries',
    'marsh',
    'The nostalgia cache',
    '怀旧缓存',
    'The berries remember a benchmark that fit in one GPU. Did anybody save the context length?',
    '怀旧莓果记得以前一块 GPU 就够跑分了。可有人记录了当时的上下文长度吗？',
    'Replay the old prompt',
    '重放旧提示词',
    'Member when the prompt was only 128 tokens?',
    '还记得提示词只有 128 个词元的时候吗？',
    'berry',
  ],
  [
    'farmer-randy',
    'tegridy-farms',
    'Live at Tegridy Farms',
    '诚信农场现场报道',
    'The farm’s last GPU timed out. Randy calls it a warm-up and demands one more run.',
    '农场最后一块 GPU 超时了。兰迪说那只是热身，还要再跑一次。',
    'Retry with a timeout',
    '设置超时后重试',
    'I didn’t hear no bell.',
    '我可没听见结束铃。',
    'bell',
  ],
  [
    'mackey',
    'elementary',
    'Counselor’s office',
    '辅导员办公室',
    'Mr. Mackey found three different prompt lengths in one class average. That comparison is not okay.',
    '麦基先生发现同一个班级平均值混用了三种提示词长度。这样比较可不行。',
    'Group by prompt length',
    '按提示词长度分组',
    'M’kay.',
    '嗯，懂了吧。',
    'counselor',
  ],
] as const;
const copy = {
  en: {
    title: 'Channel 4 Evening News',
    guide: 'Program guide',
    live: 'LIVE',
    field: 'Field report',
    air: 'On the air',
    return: 'Back to the studio',
    demo: 'Town desk simulation. No benchmark data is changed.',
    outcomes: [
      'Phase 2 remains unmeasured.',
      '64 cached tokens → 0 · eviction',
      '1 GPU · 64 requests dispatched',
      'TTFT toll · $3.50',
      'Batch 64 · more tokens/s, longer wait',
      'Cross-workload comparison disallowed.',
      'Butters · queued for the next batch.',
      'Raid queue · four requests admitted.',
      'Prompt length · 128 then, 8192 now.',
      'Retry budget · 1 run, 30 seconds.',
      'Class report · three comparable groups.',
    ],
  },
  zh: {
    title: '第 4 频道晚间新闻',
    guide: '节目单',
    live: '直播',
    field: '现场报道',
    air: '正在播出',
    return: '返回演播室',
    demo: '小镇新闻台模拟。不会更改跑分数据。',
    outcomes: [
      '第二步仍未测量。',
      '缓存词元 64 → 0 · 已逐出',
      '1 块 GPU · 已调度 64 个请求',
      '首词元收费 · 3.50 美元',
      '批次 64 · 吞吐更高，等待更久',
      '不能跨工作负载直接比较。',
      '巴特斯 · 等待下一批。',
      '团本队列 · 已接纳四个请求。',
      '提示词长度 · 当年 128，现在 8192。',
      '重试预算 · 1 次，限时 30 秒。',
      '课堂报告 · 三组可比结果。',
    ],
  },
} as const;
export default function ChannelFour({ onClose }: { onClose: () => void }) {
  const locale = useLocale(),
    t = copy[locale],
    zh = locale === 'zh';
  const [id, select] = useState(9),
    [aired, setAired] = useState(false);
  const r = reports[id];
  const frames: Record<string, string> = {
    gnomes: 'gnome-plan',
    bank: 'teller-lobby',
    foul: 'randy-foul',
    bell: 'randy-bell',
  };
  const frame = aired ? frames[r[10]] : null;
  function tune(i: number) {
    select(i);
    setAired(false);
  }
  function broadcast() {
    setAired(true);
    window.dispatchEvent(new CustomEvent('sp-news-cue', { detail: r[10] }));
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        className="sp-tv-room"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          document.querySelector<HTMLButtonElement>('[data-sp-news]')?.focus();
        }}
      >
        <header>
          <img src={`${art}show-logo.webp`} alt="" width="113" height="20" />
          <DialogTitle>{t.title}</DialogTitle>
          <span>{zh ? '第 04 频道' : 'CH 04'}</span>
          <SouthParkToggles room />
        </header>
        <section className="sp-tv-stage" aria-label={t.field}>
          <img
            className={`sp-tv-back${frame ? ' sp-tv-evidence' : ''}`}
            src={`${art}${frame || r[1]}.webp`}
            alt=""
          />
          <div className="sp-tv-location">
            <b>{t.live}</b>
            <span>
              {t.field} / {String(id + 1).padStart(2, '0')}
            </span>
          </div>
          {!frame && <img key={r[0]} className="sp-tv-guest" src={`${art}${r[0]}.webp`} alt="" />}
          <div className="sp-tv-anchor">
            <img
              src={`${art}${aired && r[10] === 'bank' ? 'bank-desk' : 'newsroom'}.webp`}
              alt=""
            />
            <span>{t.air}</span>
          </div>
          <div className="sp-chyron">
            <i>4</i>
            <h3>{r[zh ? 3 : 2]}</h3>
          </div>
        </section>
        <div className="sp-tv-desk">
          <div aria-live="polite" aria-atomic="true">
            <p>{aired ? r[zh ? 9 : 8] : r[zh ? 5 : 4]}</p>
            {aired && [1, 2, 3, 5, 6, 9, 10].includes(id) && (
              <small className="sp-closed-captions" lang={zh ? 'en' : 'zh'}>
                {r[zh ? 8 : 9]}
              </small>
            )}
            {aired && <strong>{t.outcomes[id]}</strong>}
          </div>
          <button type="button" onClick={() => (aired ? setAired(false) : broadcast())}>
            {aired ? t.return : r[zh ? 7 : 6]}
          </button>
        </div>
        <nav aria-label={t.guide}>
          <b>{t.guide}</b>
          <div>
            {reports.map((item, i) => (
              <button
                type="button"
                key={item[10]}
                data-program={i}
                aria-pressed={i === id}
                onClick={() => tune(i)}
              >
                <small>{String(i + 1).padStart(2, '0')}</small>
                {item[zh ? 3 : 2]}
              </button>
            ))}
          </div>
        </nav>
        <DialogDescription>{t.demo}</DialogDescription>
      </DialogContent>
    </Dialog>
  );
}
