'use client';

import { useEffect, useState } from 'react';
import type { CanvasPointLayerElement } from '@/lib/d3-chart/layers/canvas-points';
import { ART } from './strings';

// A rerun is an editorial cutaway, never a computed benchmark claim. Keep the quoted
// line separate from our technical caption; Chinese subtitles retain the original line.
const reels = [
  {
    id: 'couch',
    pic: 'couch-family',
    after: 'couch-heads',
    title: ['The couch gag', '沙发笑料'],
    cue: ['Roll opening', '播放片头'],
    quote: 'Woo Hoo!',
    sub: '太棒了！',
    deck: [
      'Five seats on the couch. A whole GPU batch in one take.',
      '沙发上五个座位，一整个 GPU 批次入镜。',
    ],
    sound: 'opening-loop',
  },
  {
    id: 'hedge',
    pic: 'hedge',
    after: 'retreat',
    title: ['The disappearing baseline', '消失的基线'],
    cue: ['Back into hedge', '退进树篱'],
    quote: "D'oh!",
    sub: '哎呀！',
    deck: [
      'Hide a series in the legend and Homer slips out of sight. The run is still in the chart.',
      '在图例中隐藏系列，霍默就退进树篱。数据仍在图表里。',
    ],
    sound: 'doh',
  },
  {
    id: 'hams',
    pic: 'hams',
    after: 'kitchen-story',
    title: ['Steamed batches', '蒸制批次'],
    cue: ['Inspect the oven', '检查烤箱'],
    quote: 'Aurora borealis.',
    sub: '北极光。',
    deck: [
      'Skinner calls it thermal headroom. Chalmers would like to see the GPU temperature.',
      '斯金纳说显卡还有散热余量，查尔默斯想亲眼看看温度。',
    ],
    sound: 'aurora',
  },
  {
    id: 'overlords',
    pic: 'overlords',
    after: 'anchor-desk',
    title: ['Channel 6: GPU overlords', '第六频道：GPU 新主宰'],
    cue: ['Go live to Kent', '连线肯特'],
    quote: 'And I, for one, welcome our new insect overlords.',
    sub: '而我个人，欢迎我们的新昆虫霸主。',
    deck: [
      'Kent declares allegiance to a new accelerator after one chart. Lisa asks for a second batch size.',
      '肯特看了一张图，就宣布效忠新加速器。莉萨要求再测一种批大小。',
    ],
    sound: '',
  },
  {
    id: 'cloud',
    pic: 'cloud',
    title: ['Springfield Shopper', '春田购物报'],
    cue: ['File a headline', '刊发头条'],
    quote: 'Old Man Yells at Cloud',
    sub: '老翁朝云怒吼',
    deck: [
      'Abe disputes cloud GPU pricing. The editor asks for cost per million tokens.',
      '爷爷质疑云端 GPU 定价，编辑请他补上每百万词元成本。',
    ],
    sound: '',
  },
  {
    id: 'skinner',
    pic: 'skinner',
    title: ['The precision committee', '精度评审会'],
    cue: ['Check the baseline', '核对基线'],
    quote: 'Am I so out of touch?',
    sub: '难道是我跟不上时代了？',
    deck: [
      'Before blaming the new GPU, compare the precision settings on both runs.',
      '别急着怪新 GPU，先核对两次运行的精度设置。',
    ],
    sound: '',
  },
  {
    id: 'maggie',
    pic: 'plaque',
    after: 'register',
    title: ['Do it for her', '为了她'],
    cue: ['Pin the first token', '钉上首词元'],
    quote: 'Do it for her',
    sub: '为了她',
    deck: [
      'Homer keeps one number beside Maggie’s photos: time to first token. Someone is waiting.',
      '霍默把首词元延迟贴在玛吉的照片旁。屏幕那头，有人在等。',
    ],
    sound: 'pacifier',
  },
  {
    id: 'lisa',
    pic: 'lab',
    after: 'rehearsal',
    title: ['Lisa has the floor', '莉萨上台'],
    cue: ['Show the next slide', '放下一张幻灯片'],
    quote: "If anyone wants me, I'll be in my room.",
    sub: '如果有人找我，我在房间里。',
    deck: [
      'Lisa’s slide: throughput is not interactivity. Both axes belong on the Pareto frontier.',
      '莉萨的幻灯片：吞吐量不是交互速度。帕累托前沿需要两个坐标轴。',
    ],
    sound: 'sax',
  },
  {
    id: 'dental',
    pic: 'braces',
    title: ['Dental plan', '牙科保险'],
    cue: ['Call the next response', '听下一句回应'],
    quote: 'Dental plan!',
    sub: '牙科保险！',
    deck: [
      'The union calls “KV cache”; the scheduler answers “batch size.” Try the call and response.',
      '工会喊「KV 缓存」，调度器答「批大小」。试试这组一呼一应。',
    ],
    sound: '',
  },
  {
    id: 'chalk',
    pic: 'after-school',
    title: ['Detention log', '留堂记录'],
    cue: ['Write another line', '再抄一行'],
    quote: "I didn't do it!",
    sub: '不是我干的！',
    deck: [
      'Bart will not erase the latency outlier. He will write down the sample size.',
      '巴特不会擦掉延迟异常值。他得把样本量写下来。',
    ],
    sound: 'bart-laugh',
  },
  {
    id: 'skate',
    pic: 'after-school',
    after: 'town',
    title: ['Skate the frontier', '滑上性能前沿'],
    cue: ['Cue the board', '准备滑板'],
    quote: '¡Ay, caramba!',
    sub: '哎呀！',
    deck: [
      'At the chart, cue Bart for a replay of the visible frontier. Its bends come from the benchmark.',
      '在图表旁让巴特滑上当前前沿。弯道来自基准测试曲线。',
    ],
    sound: 'ay-caramba',
  },
  {
    id: 'shift',
    pic: 'plant-shift',
    after: 'burns',
    title: ['Sector 7G shift log', '七区值班日志'],
    cue: ['Clear the checklist', '核对检查表'],
    quote: 'Excellent...',
    sub: '好极了！',
    deck: [
      'Burns wants the throughput figure. Smithers brings the precision and batch size with it.',
      '伯恩斯要吞吐量，史密瑟斯连同精度和批大小一起呈上。',
    ],
    sound: '',
  },
  {
    id: 'milhouse',
    pic: 'milhouse',
    title: ['Flood pants forecast', '短裤避水预报'],
    cue: ['Is this even a meme?', '这也算梗？'],
    quote: "Everything's coming up Milhouse!",
    sub: '好事全都轮到米尔豪斯了！',
    deck: [
      'Warm KV cache, shorter TTFT, dry cuffs. Milhouse asks whether the cold run was measured too.',
      '热 KV 缓存，首词元延迟更低，裤脚也干着。米尔豪斯还想看冷启动数据。',
    ],
    sound: '',
  },
  {
    id: 'ralph',
    pic: 'bus-seat',
    title: ['Bus to the memory limit', '开往内存上限的校车'],
    cue: ['Check the batch forecast', '查看批次预报'],
    quote: "I'm in danger.",
    sub: '我有危险了。',
    deck: [
      'Ralph sees the batch grow before anyone checks the remaining GPU memory.',
      '拉尔夫看见批次在变大，可还没人检查 GPU 剩余显存。',
    ],
    sound: '',
  },
  {
    id: 'flanders',
    pic: 'neighbor',
    after: 'ski-flash',
    title: ['Stupid sexy quantization', '可恶的量化滑雪服'],
    cue: ['Inspect the footprint', '检查内存占用'],
    quote: 'Hi-diddly-ho, neighborino',
    sub: '邻居好呀好！',
    deck: [
      'The compressed weights feel like nothing at all. Flanders still packs the KV cache for the downhill run.',
      '压缩权重轻得像什么都没穿。弗兰德斯滑下坡前仍要装上 KV 缓存。',
    ],
    sound: '',
  },
  {
    id: 'moe',
    pic: 'bar-door',
    after: 'bar-return',
    title: ['Moe evicts the cache', '莫赶走缓存'],
    cue: ['Clear the cache again', '再清一次缓存'],
    quote: 'Cache entry evicted.',
    sub: '缓存条目已逐出。',
    deck: [
      'Moe throws out a stale entry. Toggle the replay: Barney returns when the next request fills the cache.',
      '莫把旧条目扔出去。再按一次重播：下一次请求填满缓存，巴尼又回来了。',
    ],
    sound: '',
  },
  {
    id: 'prank',
    pic: 'prank-line',
    after: 'plant-shift',
    title: ['A call for Mr. Simpson', '找辛普森先生的电话'],
    cue: ['Put Homer on the line', '转接霍默'],
    quote: 'Eat my shorts',
    sub: '吃我的短裤吧！',
    deck: [
      'Bart phones 7G to ask for a Mr. Long Queue. Homer finally gets the joke when the first token arrives.',
      '巴特打给七区，说要找「排长龙先生」。等到首词元抵达，霍默才反应过来。',
    ],
    sound: 'bart-laugh',
  },
  {
    id: 'review',
    pic: 'critic',
    after: 'market',
    title: ['The one-sample review', '只有一个样本的影评'],
    cue: ['Inspect the receipts', '检查收据'],
    quote: '...Worst. Episode. Ever.',
    sub: '史上……最糟……一集。',
    deck: [
      'Comic Book Guy rates an entire GPU from one sample. At the Kwik-E-Mart till, Lisa asks for the rest of the receipts.',
      '漫画男只看一个样本，就给整款 GPU 打分。在便利店收银台，莉萨要求看其余收据。',
    ],
    sound: '',
  },
  {
    id: 'spell',
    pic: 'plant-shift',
    after: 'duff',
    title: ['The 7G spelling test', '七区拼写测验'],
    cue: ['Spell the metric', '拼出指标名称'],
    quote: 'S-M-R-T; I mean, S-M-A-R-T!',
    sub: '聪、明！我是说，真聪明！',
    deck: [
      'Homer spells the metric twice. Lisa checks whether his units are tokens per second or seconds per token.',
      '霍默把指标拼了两遍。莉萨查查他说的是每秒词元，还是每词元秒数。',
    ],
    sound: '',
  },
] as const;
type ReelId = (typeof reels)[number]['id'];
const featured: ReelId[] = [
  'couch',
  'hams',
  'overlords',
  'cloud',
  'milhouse',
  'ralph',
  'hedge',
  'flanders',
  'skinner',
];
const listings = [
  ...featured.map((id) => reels.find((r) => r.id === id)!),
  ...reels.filter((r) => !featured.includes(r.id)),
];
export function ChannelSix({
  zh,
  home,
  reward,
  play,
}: {
  zh: boolean;
  home: boolean;
  reward: boolean;
  play: (clip: string) => void;
}) {
  const [id, setId] = useState<ReelId>('couch'),
    [beat, setBeat] = useState(false),
    [special, setSpecial] = useState(false),
    [counts, setCounts] = useState<[number, number] | null>(null);
  const i = zh ? 1 : 0,
    reel = reels.find((v) => v.id === id) ?? reels[0];
  const tune = (key: ReelId, on = false) => {
    setSpecial(false);
    setId(key);
    setBeat(on);
    if (key === 'ralph' || key === 'milhouse') {
      const svg = document.querySelector('svg[data-testid="d3-chart-svg"]');
      const paths =
        svg &&
        [...svg.querySelectorAll<SVGPathElement>('path.roofline-path')].filter(
          (p) => p.checkVisibility({ checkOpacity: true }) && p.getTotalLength() > 0,
        );
      const layer = svg?.querySelector<CanvasPointLayerElement>('.canvas-point-layer');
      const samples =
        layer?.scatterPoints?.().filter((p) => p.interactive && p.opacity > 0.5).length ??
        svg?.querySelectorAll('.dot-group').length ??
        0;
      setCounts(paths && (paths.length > 0 || samples > 0) ? [paths.length, samples] : null);
    } else setCounts(null);
  };
  useEffect(() => {
    // Restore the programme with its dial, but never start audio on restoration.
    try {
      const prior = localStorage.getItem('simpsons-channel');
      if (prior === 'plant') tune('shift', true);
      if (prior === 'tavern') tune('moe');
    } catch {
      /* storage optional */
    }
    const relay = (e: Event) => {
      if (!(e.target instanceof Element)) return;
      const el = e.target;
      if (
        el.closest(
          '[data-testid="chart-legend"] label,[data-testid="chart-legend"] [role="checkbox"],[data-testid="chart-legend"] input',
        )
      )
        tune('hedge', true);
      else if (el.closest('[data-testid="precision-multiselect"]')) tune('skinner');
      else if (el.closest('.simpsons-chart-cue')) tune('skate', true);
      else if (el.closest('.sp-chalk-next')) tune('chalk', true);
      else if (el.closest('.sp-channel-dial button:nth-of-type(2)')) tune('shift', true);
      else if (el.closest('.sp-channel-dial button:nth-of-type(3)')) tune('moe');
      else if (el.closest('.sp-channel-dial button:first-of-type')) tune('couch');
      else if (el.closest('[data-testid="export-png-button"]')) tune('maggie', true);
      else if (el.closest('[data-testid="yaxis-metric-selector"]')) tune('lisa');
    };
    document.addEventListener('click', relay, true);
    return () => document.removeEventListener('click', relay, true);
  }, []);
  const replies: Partial<Record<ReelId, readonly [string, string]>> = {
    dental: ['Lisa needs braces.', '莉萨得戴牙套。'],
    prank: ['Why you little—!', '你这小子……！'],
    chalk: ['Eat my shorts', '吃我的短裤吧！'],
    skate: ["Don't have a cow, man!", '别大惊小怪，伙计！'],
    milhouse: [
      'Milhouse is not a meme. A warm-cache run is not a cold-start baseline.',
      '米尔豪斯不是梗。热缓存运行不是冷启动基线。',
    ],
    skinner: ["No. It's the children who are wrong.", '不。错的是孩子们。'],
    flanders: ['Nothing at all!', '什么都没有！'],
    moe: ['Barney, how do you keep getting back in?', '巴尼，你怎么又进来了？'],
    hams: ['Aurora borealis?!', '北极光？！'],
  };
  const reply = special
    ? home
      ? ['Five seats. Eight stamps. One last rerun.', '五个座位，八枚邮戳，最后一场重播。']
      : [
          'Two axes, two questions. Check both before calling a winner.',
          '两个坐标轴，两个问题。宣布赢家前，两项都要看。',
        ]
    : beat
      ? replies[id]
      : undefined;
  const quote = reply?.[0] ?? reel.quote,
    translation = reply?.[1] ?? reel.sub;
  const pic = special
    ? home
      ? 'couch-heads'
      : 'rehearsal'
    : beat && 'after' in reel
      ? reel.after
      : reel.pic;
  return (
    <section
      className="sp-receiver-desk"
      data-home={home}
      data-scene={special ? 'special' : id}
      aria-label={zh ? '第六频道重播台' : 'Channel 6 rerun desk'}
    >
      {home && (
        <div className="sp-family-set" aria-hidden="true">
          {id === 'couch' && !special ? (
            <>
              <img className="sp-family-title" src={`${ART}gold-title.webp`} alt="" />
              <img className="sp-family-portrait" src={`${ART}family-portrait.webp`} alt="" />
            </>
          ) : (
            <img className="sp-episode-frame" src={`${ART}${pic}.webp`} alt="" />
          )}
        </div>
      )}
      <div className="sp-receiver" aria-hidden="true">
        <img className="sp-receiver-frame" src={`${ART}receiver.webp`} alt="" />
        <img
          className="sp-receiver-shot"
          src={`${ART}${pic}.webp`}
          style={
            ['burns', 'ralph', 'milhouse', 'critic', 'neighbor', 'duff'].includes(pic)
              ? { objectFit: 'contain', backgroundColor: '#9acedb' }
              : undefined
          }
          alt=""
        />
        <img className="sp-station-bug" src={`${ART}six.webp`} alt="" />
      </div>
      <div className="sp-episode">
        <div className="sp-episode-id">
          <img src={`${ART}gold-title.webp`} alt="The Simpsons" />
          <span>{zh ? '春田镇 · 重播' : 'Springfield reruns'}</span>
        </div>
        <div className="sp-episode-title">
          {special
            ? home
              ? zh
                ? '晚安，春田镇'
                : 'Goodnight, Springfield'
              : zh
                ? '莉萨的现场报道'
                : 'Lisa files from the frontier'
            : reel.title[i]}
        </div>
        <p>
          {special
            ? home
              ? zh
                ? '春田镇收播，沙发上还留着一个位置。'
                : 'Channel 6 signs off from Evergreen Terrace. There’s still room on the couch.'
              : zh
                ? '莉萨从图表发回报道：每位用户的响应速度和系统吞吐量是两回事。'
                : 'Lisa reports from the chart: one user’s token rate and the whole system’s throughput are different stories.'
            : reel.deck[i]}
        </p>
        {counts && (id === 'milhouse' || id === 'ralph') && (
          <p className="sp-field-reading">
            {zh
              ? `当前图表 · ${counts[0]} 条前沿 · ${counts[1]} 个数据点`
              : `Current chart · ${counts[0]} frontiers · ${counts[1]} samples`}
          </p>
        )}
        {special && (
          <div className="sp-tour-special">
            <img src={`${ART}${home ? 'couch-heads' : 'rehearsal'}.webp`} alt="" />
            <strong>{zh ? '八枚邮戳 · 特别放送' : 'Eight-stamp special broadcast'}</strong>
          </div>
        )}
        {!special && beat && (id === 'moe' || id === 'hams') && (
          <div className="sp-contact-print" aria-live="polite">
            {[reel.pic, pic].map((frame, ix) => (
              <div key={frame}>
                <img src={`${ART}${frame}.webp`} alt="" />
                <small>
                  {
                    (id === 'moe'
                      ? zh
                        ? ['01 · 门外', '02 · 又回来了']
                        : ['01 · Out the door', '02 · Behind Moe']
                      : zh
                        ? ['01 · 午餐', '02 · 厨房起火']
                        : ['01 · Luncheon', '02 · Kitchen fire']
                    )[ix]
                  }
                </small>
              </div>
            ))}
          </div>
        )}
        <div aria-live="polite" className="sp-transcript">
          {beat && <img src={`${ART}task-tick.webp`} alt="" />}
          {zh ? (
            <>
              {translation} <small lang="en">{quote}</small>
            </>
          ) : (
            quote
          )}
        </div>
      </div>
      <div className="sp-remote">
        <label>
          {zh ? '节目指南' : 'TV listings'}
          <select
            aria-label={zh ? '重播节目' : 'Rerun listing'}
            value={id}
            onChange={(e) => tune(e.target.value as ReelId)}
          >
            {listings.map((r, n) => (
              <option key={r.id} value={r.id}>
                {String(n + 1).padStart(2, '0')} · {r.title[i]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          data-simpsons-control=""
          onClick={() => {
            tune(id, !beat);
            if (reel.sound) play(reel.sound);
          }}
        >
          {reel.cue[i]}
        </button>
        {id !== 'overlords' && (
          <button type="button" className="sp-news-flash" onClick={() => tune('overlords')}>
            {zh ? '新闻插播 · 肯特直播' : 'News flash · Kent live'}
          </button>
        )}
        {reward && (
          <button
            type="button"
            className="sp-tour-air"
            aria-pressed={special}
            onClick={() => {
              setSpecial(!special);
              if (!special) play(home ? 'pacifier' : 'sax');
            }}
          >
            {zh ? '播放集邮特辑' : 'Air the stamp special'}
          </button>
        )}
      </div>
    </section>
  );
}
