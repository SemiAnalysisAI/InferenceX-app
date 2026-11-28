import type { OcMode, SecretId, TrophyId } from './orange-chicken-store';

export type Locale = 'en' | 'zh';

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replaceAll(/\{(?<key>\w+)\}/gu, (_, key: string) => String(values[key] ?? ''));
}

interface Strings {
  toggles: {
    journal: string;
    muteMusic: string;
    unmuteMusic: string;
    muteSound: string;
    unmuteSound: string;
  };
  banner: {
    title: string;
    description: string;
    play: string;
    playHint: string;
    menu: string;
    modes: Record<OcMode, string>;
    sealLabel: string;
    orders: string;
    trophies: string;
    calm: string;
    calmOn: string;
    journal: string;
    sound: string;
    music: string;
  };
  trophies: Record<TrophyId, string>;
  journal: {
    title: string;
    intro: string;
    unknown: string;
    linesTitle: string;
    memesTitle: string;
    secrets: Record<SecretId, { name: string; hint: string }>;
  };
  toasts: {
    wok: string;
    konami: string;
    sesame: string;
    seal: string;
    bell: string;
    idle: string;
    chef: string;
    boss: string;
    allFound: string;
    modes: Record<OcMode, string>;
  };
  /** Panda Express wording: tier names, menu vocabulary and the lines the theme quotes. */
  ip: {
    kicker: string;
    descriptor: string;
    caption: string;
    photoAlt: string;
    logoAlt: string;
    plate: {
      label: string;
      tiers: { bowl: string; plate: string; bigger: string };
      entrees: { bowl: string; plate: string; bigger: string };
      sideLabel: string;
      sides: { chow: string; fried: string; half: string };
      pile: string;
      empty: string;
      status: string;
      note: string;
      full: string;
      scoop: string;
    };
    quotes: {
      think: string;
      keep: string;
      overflow: string;
      half: string;
      bone: string;
      rush: string;
      oom: string;
      audit: string;
      wokOn: string;
      best: string;
    };
    slipHeader: string;
  };
  /** Benchmark-flavoured fortune-cookie lines, one per click. */
  fortunes: string[];
  /** Slip-format fortunes ("Your ... shall lead you to ..."); the first is a printed Panda Express slip. */
  slips: string[];
}

export const STRINGS: Record<Locale, Strings> = {
  en: {
    toggles: {
      journal: 'Orders served: {n}. Secrets found: {found} of {total}. Open the journal.',
      muteMusic: 'Turn off the kitchen music',
      unmuteMusic: 'Turn on the kitchen music',
      muteSound: 'Mute kitchen sounds',
      unmuteSound: 'Turn on kitchen sounds',
    },
    banner: {
      title: 'Panda Express',
      description:
        'A Chinese kitchen serving line for every chart: Orange Chicken is the hero dish and the Wok Kitchen runs the line.',
      play: 'Open the Wok Kitchen',
      playHint: 'A Panda Express kitchen game about throughput, interactivity and KV cache',
      menu: 'Menu',
      modes: { glaze: 'The Original', jade: 'New leaf', chili: 'Hot', night: 'Night market' },
      sealLabel: 'Press the chop seal',
      orders: '{n} orders served',
      trophies: 'Kitchen trophies',
      calm: 'Calm',
      calmOn: 'Calm mode on',
      journal: 'Journal',
      sound: 'Sound',
      music: 'Music',
    },
    trophies: {
      prep: 'Prep cook',
      wok: 'Line cook',
      courier: 'Courier',
      chef: 'Head chef',
      golden: 'Golden wok',
    },
    journal: {
      title: 'Kitchen journal',
      intro: 'Every secret in this restaurant, and a fortune for each one you find.',
      unknown: 'Not found yet',
      linesTitle: 'Menu board: {n} of {total} lines',
      memesTitle: 'Jokes: {n} of {total} found',
      secrets: {
        wok: { name: 'Wok hei', hint: 'Type "wok" anywhere on the page.' },
        konami: {
          name: 'Chicken rain',
          hint: 'The classic code: up up down down, left right left right, B A.',
        },
        sesame: { name: 'Sesame shower', hint: 'Type "sesame".' },
        fortune: { name: 'Fortune cookie', hint: 'Crack the cookie on the banner.' },
        seal: { name: 'Red seal', hint: 'Press the chop seal beside the title.' },
        bell: { name: 'Order up', hint: 'Triple-click a chart title.' },
        idle: { name: 'Lucky cat', hint: 'Leave the page alone for a minute.' },
        chef: { name: 'Prep station cleared', hint: 'Clear Act 1 of the Wok Kitchen.' },
        boss: { name: 'Inspector served', hint: 'Beat the finale of the Wok Kitchen.' },
        box: { name: 'Keep it coming', hint: 'Pile the plate until the box will not close.' },
      },
    },
    toasts: {
      wok: 'Wok hei. The pan is hot.',
      konami: 'Chicken rain. Somebody ordered too many nuggets.',
      sesame: 'Sesame shower. Garnish for everyone.',
      seal: 'Stamped. Is it authentic? It is Chinese-American, and the data on this chart is real.',
      bell: 'Do you have orange chicken? Right here: the highest point on the chart.',
      idle: 'The lucky cat waves: Have You Eaten Yet? Nothing is running, the GPUs are idle too.',
      chef: 'Prep station cleared. OK, so there comes orange chicken.',
      boss: 'The inspector left a five-star review. No best, only better.',
      allFound: 'Every secret found. The journal is complete.',
      modes: {
        glaze: 'The Original Orange Chicken®.',
        jade: 'Orange Chicken has turned over a new leaf.',
        chili: 'Hot Orange Chicken. Yes, it is spicy.',
        night: 'Night market menu.',
      },
    },
    ip: {
      kicker: 'Have You Eaten Yet?',
      descriptor: 'Chinese Kitchen',
      caption: 'The Original Orange Chicken®',
      photoAlt: 'Orange chicken in a paper takeout carton',
      logoAlt: 'Panda Express Chinese Kitchen logo',
      plate: {
        label: 'Build your plate',
        tiers: { bowl: 'Bowl', plate: 'Plate', bigger: 'Bigger Plate' },
        entrees: { bowl: '1 entrée', plate: '2 entrées', bigger: '3 entrées' },
        sideLabel: 'Side',
        sides: { chow: 'Chow mein', fried: 'Fried rice', half: 'Half and half' },
        pile: 'Pile it on',
        empty: 'Empty the box',
        status: '{tier}, {entrees}: batch {batch}, KV cache {kv}%, {prec}',
        note: 'Illustration of batch size and KV cache, not benchmark data.',
        full: 'KV cache full',
        scoop: 'Extra scoop',
      },
      quotes: {
        think: 'Think inside the box. Batch 4 fits.',
        keep: 'Keep it coming.',
        overflow: 'KV cache full. The box will not close.',
        half: 'Half and half: FP8 and FP4 on one plate.',
        bone: 'Same flavor, do it without the bone. That is FP4: fewer bits, same dish.',
        rush: 'Lunch rush. Do you have orange chicken? Right here.',
        oom: 'Keep it coming, until the counter will not close: out of memory.',
        audit: 'Audit passed. No best, only better.',
        wokOn: 'Wok On.',
        best: 'Order up.',
      },
      slipHeader: 'Your fortune',
    },
    fortunes: [
      'Your throughput will rise, but so will your latency.',
      'A bigger batch feeds more tables and keeps each one waiting.',
      'FP4 is a smaller wok: more portions, a little less flavour.',
      'He who ignores the KV cache will find the counter full.',
      'The Pareto frontier is the only honest menu.',
      'Time to first token is the first bite. Make it quick.',
      'Tokens per second per user is how fast one table is served.',
      'A cold wok at batch size one wastes the whole kitchen.',
      'Prefill is chopping, decode is stir-frying. Do not mix the boards.',
      'The best GPU is the one with an empty queue.',
      'Interactivity is paid for in throughput, and the receipt is always honest.',
      'Out of memory is just the counter saying no more boxes.',
      'A model with fewer active experts cooks faster, if the sauce is ready.',
      'Speculative decoding: the sous chef guesses, the chef confirms.',
      'Tensor parallel splits one dish across many woks.',
      'Disaggregated serving gives prep and wok their own stations.',
      'Utilization is not the same as being useful.',
      'What you measure at concurrency 4 will not hold at concurrency 64.',
      'The cheapest token is the one nobody waits for.',
      'Good benchmarks are taste-tested at every sequence length.',
      'Long context is a long ticket rail. Mind the counter space.',
      'Cost per million tokens falls when the wok never stops.',
      'A tail latency of 99 percent is a table that left angry.',
      'Quantize with care: the glaze should not hide the burnt bits.',
      'Warm the wok before you count the orders.',
      'Same recipe, different stove. Compare them on the same menu.',
      'A fortune cookie is a very small, very honest benchmark.',
      'Throughput per GPU hides the price of the kitchen it sits in.',
      'Batch what you can, stream what you must.',
      'The queue is the real latency. The kernel is only part of it.',
      'Heat the oil, then the data. Never the other way around.',
      'Every point on the chart is a dish somebody had to cook.',
    ],
    slips: [
      'Your independence shall lead you to rewarding adventures.',
      'Your batch size shall lead you to rewarding throughput.',
      'Your prefill shall lead you to a faster first bite.',
      'Your quantization shall lead you to smaller plates and the same flavor.',
      'Your KV cache shall lead you to a very full box.',
      'Your Pareto frontier shall lead you to an honest menu.',
      'Your benchmark has one data point. The cookie is concerned.',
      'Your GPU is idle. So is your lunch.',
      'Your tail latency has been seen by the whole food court.',
      'Your interactivity shall lead you to a smaller plate. Choose with care.',
    ],
  },
  zh: {
    toggles: {
      journal: '已出餐 {n} 单，已发现 {found}/{total} 个彩蛋，点击打开日志。',
      muteMusic: '关闭厨房音乐',
      unmuteMusic: '开启厨房音乐',
      muteSound: '关闭厨房音效',
      unmuteSound: '开启厨房音效',
    },
    banner: {
      title: '熊猫快餐',
      description: '每张图表都是一条中式厨房出餐线：陈皮鸡是招牌菜，“炒锅厨房”负责整条餐线。',
      play: '打开炒锅厨房',
      playHint: '一个关于吞吐量、交互性与 KV 缓存的熊猫快餐厨房游戏',
      menu: '菜单',
      modes: { glaze: '原味', jade: '新叶', chili: '香辣', night: '夜市' },
      sealLabel: '盖下朱印',
      orders: '已出餐 {n} 单',
      trophies: '厨房奖杯',
      calm: '安静',
      calmOn: '安静模式已开启',
      journal: '日志',
      sound: '音效',
      music: '音乐',
    },
    trophies: {
      prep: '备菜学徒',
      wok: '炉台厨师',
      courier: '外卖骑手',
      chef: '主厨',
      golden: '金炒锅',
    },
    journal: {
      title: '厨房日志',
      intro: '这家餐厅里所有的彩蛋，每发现一个就送你一张签语。',
      unknown: '尚未发现',
      linesTitle: '菜单板：已见 {n}/{total} 句',
      memesTitle: '梗：已找到 {n}/{total} 个',
      secrets: {
        wok: { name: '锅气', hint: '在页面上输入 “wok”。' },
        konami: { name: '鸡块雨', hint: '经典秘技：上上下下左右左右 B A。' },
        sesame: { name: '芝麻雨', hint: '输入 “sesame”。' },
        fortune: { name: '幸运饼干', hint: '掰开横幅上的幸运饼干。' },
        seal: { name: '朱红印章', hint: '按下标题旁边的印章。' },
        bell: { name: '出餐啦', hint: '连续三次点击图表标题。' },
        idle: { name: '招财猫', hint: '一分钟不动页面。' },
        chef: { name: '备菜台通关', hint: '通关炒锅厨房第一幕。' },
        boss: { name: '检查员已招待', hint: '击败炒锅厨房的终章。' },
        box: { name: '再来一勺', hint: '把餐盘堆到盒子合不上。' },
      },
    },
    toasts: {
      wok: '锅气十足，炒锅烧热了。',
      konami: '鸡块雨：有人点多了鸡块。',
      sesame: '芝麻雨：人人有份。',
      seal: '盖章完成。正宗吗？它是美式中餐，但这张图上的数据是真的。',
      bell: '有陈皮鸡吗？这里就有：图上最高的那个点。',
      idle: '招财猫挥手：吃了吗？没有任务在跑，GPU 也在发呆。',
      chef: '备菜台已通关。好了，陈皮鸡来了。',
      boss: '检查员留下了五星好评。没有最好，只有更好。',
      allFound: '全部彩蛋已找到，日志完成。',
      modes: {
        glaze: '原味陈皮鸡。',
        jade: '陈皮鸡翻开了新的一页。',
        chili: '香辣陈皮鸡回来了，真的辣。',
        night: '夜市菜单。',
      },
    },
    ip: {
      kicker: '吃了吗？',
      descriptor: '中式厨房',
      caption: '原味陈皮鸡',
      photoAlt: '纸盒外卖里的陈皮鸡',
      logoAlt: '熊猫快餐中式厨房标志',
      plate: {
        label: '搭配你的餐盘',
        tiers: { bowl: '碗装', plate: '盘装', bigger: '大盘装' },
        entrees: { bowl: '1 份主菜', plate: '2 份主菜', bigger: '3 份主菜' },
        sideLabel: '配菜',
        sides: { chow: '炒面', fried: '炒饭', half: '各半' },
        pile: '再加一勺',
        empty: '清空餐盒',
        status: '{tier}，{entrees}：批量 {batch}，KV 缓存 {kv}%，{prec}',
        note: '批量与 KV 缓存的示意，不是基准测试数据。',
        full: 'KV 缓存已满',
        scoop: '加一勺',
      },
      quotes: {
        think: '想事情，先装进盒子里。批量 4 刚好放得下。',
        keep: '继续加，继续加。',
        overflow: 'KV 缓存已满，盒子合不上了。',
        half: '各半：FP8 和 FP4 装在同一个餐盘里。',
        bone: '味道不变，去掉骨头。这就是 FP4：位数更少，还是那道菜。',
        rush: '午餐高峰。有陈皮鸡吗？这里就有。',
        oom: '继续加，直到台面合不上：显存溢出。',
        audit: '检查通过。没有最好，只有更好。',
        wokOn: '继续开火。',
        best: '出餐啦。',
      },
      slipHeader: '你的签语',
    },
    fortunes: [
      '吞吐量会上去，延迟也会跟着上去。',
      '批量越大，喂饱的桌子越多，每一桌等得也越久。',
      'FP4 是小一号的炒锅：份数多，味道略淡。',
      '无视 KV 缓存的人，会发现柜台已经摆满。',
      '帕累托前沿是唯一诚实的菜单。',
      '首词元时间就是第一口，要快。',
      '每用户每秒词元数，就是一桌上菜有多快。',
      '批量为一的冷锅，浪费了整间厨房。',
      '预填充是切菜，解码是翻炒，别用同一块砧板。',
      '最好的 GPU，是队列为空的那一块。',
      '交互性用吞吐量来买，小票从不说谎。',
      '显存溢出，就是柜台说“再也放不下盒子了”。',
      '激活专家更少的模型炒得更快，前提是酱汁备好了。',
      '投机解码：副厨先猜，主厨来确认。',
      '张量并行：一道菜分给好几口锅。',
      '分离式推理：备菜和炒锅各有各的工位。',
      '利用率高，不等于有用。',
      '并发 4 测得的结果，到并发 64 就不一定成立。',
      '最便宜的词元，是没人等待的那一个。',
      '好的基准测试，每个序列长度都要试吃。',
      '长上下文就是一条很长的订单轨道，当心柜台空间。',
      '炒锅不停，百万词元的成本就会下降。',
      '百分之九十九的尾延迟，是一桌生气离席的客人。',
      '量化要小心：糖釉别盖住了烧焦的地方。',
      '先热锅，再数订单。',
      '同一份菜谱，不同的灶台，请放在同一张菜单上比较。',
      '幸运饼干是一个很小、很诚实的基准测试。',
      '每块 GPU 的吞吐量，藏着它所在厨房的价格。',
      '能批处理的就批处理，必须流式的就流式。',
      '队列才是真正的延迟，内核只是其中一部分。',
      '先热油，再热数据，顺序不能反。',
      '图上的每个点，都是有人亲手炒出来的一道菜。',
    ],
    slips: [
      '你的独立，将带你走向值得的冒险。',
      '你的批量，将带你走向可观的吞吐量。',
      '你的预填充，将带你更快吃到第一口。',
      '你的量化，将带你走向更小的餐盘和同样的味道。',
      '你的 KV 缓存，将带你走向一个很满的盒子。',
      '你的帕累托前沿，将带你走向一份诚实的菜单。',
      '你的基准测试只有一个数据点，饼干很担心。',
      '你的 GPU 在发呆，你的午饭也是。',
      '你的尾延迟，整个美食广场都看见了。',
      '你的交互性，将带你换一个小一点的餐盘，请谨慎选择。',
    ],
  },
};
