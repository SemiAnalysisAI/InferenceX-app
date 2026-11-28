import type { Locale } from './orange-chicken-strings';

export interface MenuStrings {
  tabs: { plate: string; wok: string; orders: string; box: string };
  tablist: string;
  sandwich: { chip: string; status: string; quote: string };
  wok: {
    title: string;
    reveal: string;
    hide: string;
    items: readonly { name: string; role: string }[];
    steps: readonly string[];
    done: string;
    resultAlt: string;
    again: string;
    quotes: readonly string[];
    homeNote: string;
  };
  orders: {
    title: string;
    prompt: string;
    picks: readonly string[];
    defended: string;
    defendedPlain: string;
    tally: string;
    note: string;
  };
  box: {
    title: string;
    open: string;
    again: string;
    closed: string;
    found: string;
    figures: readonly { name: string; rarity: string }[];
    secret: string;
    note: string;
  };
  roasts: readonly string[];
  places: {
    title: string;
    items: readonly { year: string; place: string; fact: string; alt: string }[];
  };
  chartBadge: string;
}

export const MENU: Record<Locale, MenuStrings> = {
  en: {
    tablist: 'Counter menu',
    tabs: { plate: 'Plate', wok: 'Wok', orders: 'Orders', box: 'Box' },
    sandwich: {
      chip: 'Sandwich',
      status:
        'Sandwich: one patty, no sides. Batch 1, KV cache 8%, the lowest latency on the menu and the fewest plates per hour.',
      quote:
        'The chicken sandwich wars reach the benchmark: batch 1 answers fastest and serves the fewest people.',
    },
    wok: {
      title: 'What goes in the wok?',
      reveal: 'What goes in the wok?',
      hide: 'Close the wok',
      items: [
        { name: 'Battered chicken', role: 'the model weights, fried before they are sauced' },
        { name: 'Orange sauce', role: 'the KV cache that coats every piece' },
        { name: 'Wok heat', role: 'GPU power, hot enough to stay busy' },
        { name: 'The toss', role: 'batching, one move for the whole pan' },
      ],
      steps: ['Fry', 'Toss', 'Glaze'],
      resultAlt: 'Orange chicken over rice in a white takeout container',
      done: 'Glazed. Fried first, tossed second, the way the at-home recipe says.',
      again: 'Start over',
      quotes: [
        'Frying first keeps the crunch. Prefill first keeps the latency.',
        'One toss glazes every piece. One batch serves every request.',
        'Orange chicken, at home. Your kitchen, your tokens per second.',
      ],
      homeNote: 'Illustration of the order of cooking, not a benchmark result.',
    },
    orders: {
      title: 'Who is keeping Panda Express in business?',
      prompt: 'Name your exact order and defend it:',
      picks: [
        'Orange chicken + chow mein',
        'Orange chicken + fried rice',
        'Half and half, chow mein and rice',
        'Beijing beef, then orange chicken again',
      ],
      defended:
        'Defended: {pick}. On this page, {legend} is somebody’s exact order and nobody is changing it.',
      defendedPlain:
        'Defended: {pick}. Some orders never change, and every chart has its regulars too.',
      tally: 'Defenders at the counter: {n}',
      note: 'Fans reply with their exact orders. Nothing here is a vote count.',
    },
    box: {
      title: 'Pei Pei blind box',
      open: 'Open the box',
      again: 'Open another',
      closed: 'Shake it. Something small and orange is inside.',
      found: '{n} of {total} figures found',
      figures: [
        { name: 'Orange chicken', rarity: 'common' },
        { name: 'Takeout carton', rarity: 'common' },
        { name: 'Dumpling', rarity: 'common' },
        { name: 'Fortune cookie', rarity: 'uncommon' },
        { name: 'Pei Pei', rarity: 'secret' },
      ],
      secret: 'Secret figure: Pei Pei, the panda. Collectors call it a good fortune.',
      note: 'Collector idea after the Pei Pei blind-box campaign. The figures here are not Panda merchandise.',
    },
    roasts: [
      'You ran {model} at batch 1. One scoop of orange chicken, and a long line behind you.',
      'Your {model} plan is a Bigger Plate and your KV cache is a small box. This does not close.',
      'You shall lead a very confident presentation with one data point on the chart.',
      'Your fortune is the same as your chart: nobody asked, and everyone read it.',
      'You compared FP4 to FP8 and chose the one with the better slide. The cookie noticed.',
      'You will soon say “it works on my GPU” while the food court watches.',
    ],
    places: {
      title: 'Where it started',
      items: [
        {
          year: '1973',
          place: 'Panda Inn, Pasadena',
          fact: 'Andrew Cherng and his father open the first Panda Inn in Pasadena, California.',
          alt: 'Panda Inn, Pasadena: 1973, the sit-down restaurant that came before Panda Express',
        },
        {
          year: '1983',
          place: 'Glendale Galleria',
          fact: 'The first Panda Express opens in the Glendale Galleria food court.',
          alt: 'The Glendale Galleria entrance at sunset, where the first Panda Express opened in 1983',
        },
        {
          year: '1987',
          place: 'Ala Moana, Honolulu',
          fact: 'Chef Andy Kao creates orange chicken in Hawaii. Same flavor, without the bone.',
          alt: 'A Panda Express counter at Ala Moana Center in Honolulu, where orange chicken was created',
        },
        {
          year: 'Now',
          place: 'Your street',
          fact: 'More than 2,600 Panda Express restaurants. The red panda sign is the landmark.',
          alt: 'A Panda Express storefront at night with the red panda sign',
        },
      ],
    },
    chartBadge: 'Orange Chicken menu board',
  },
  zh: {
    tablist: '柜台菜单',
    tabs: { plate: '餐盘', wok: '炒锅', orders: '点单', box: '盲盒' },
    sandwich: {
      chip: '三明治',
      status: '三明治：一块鸡排，不配餐。批量 1，KV 缓存 8%，菜单上延迟最低，每小时出餐最少。',
      quote: '鸡肉三明治大战打到了基准测试：批量 1 最快，服务的人最少。',
    },
    wok: {
      title: '锅里放了什么？',
      reveal: '锅里放了什么？',
      hide: '盖上锅',
      items: [
        { name: '裹粉鸡块', role: '模型权重，先炸后裹酱' },
        { name: '橙味酱汁', role: '裹住每一块的 KV 缓存' },
        { name: '锅气', role: 'GPU 功率，热到不闲着' },
        { name: '翻炒', role: '批处理，一锅一个动作' },
      ],
      steps: ['炸', '翻炒', '挂汁'],
      resultAlt: '白色外卖盒里的陈皮鸡盖饭',
      done: '挂好汁了。先炸后翻，和在家做的步骤一样。',
      again: '重来',
      quotes: [
        '先炸才脆，先做预填充才低延迟。',
        '一次翻炒裹满每一块，一个批次服务所有请求。',
        '在家做陈皮鸡：你的厨房，你的每秒词元数。',
      ],
      homeNote: '烹饪顺序的示意，不是基准测试结果。',
    },
    orders: {
      title: '谁在养活熊猫快餐？',
      prompt: '报出你的固定点单并为它辩护：',
      picks: ['陈皮鸡 + 炒面', '陈皮鸡 + 炒饭', '一半炒面一半炒饭', '北京牛肉，再来一份陈皮鸡'],
      defended: '辩护成功：{pick}。这页上的 {legend} 也是有人雷打不动的固定点单。',
      defendedPlain: '辩护成功：{pick}。有些点单永远不变，每张图表也都有熟客。',
      tally: '柜台前的辩护者：{n}',
      note: '网友们纷纷晒出自己的固定点单。这里不是投票统计。',
    },
    box: {
      title: 'Pei Pei 盲盒',
      open: '拆开盲盒',
      again: '再拆一个',
      closed: '摇一摇，里面有个橙色的小东西。',
      found: '已收集 {n}/{total} 个',
      figures: [
        { name: '陈皮鸡', rarity: '常见' },
        { name: '外卖餐盒', rarity: '常见' },
        { name: '饺子', rarity: '常见' },
        { name: '幸运饼干', rarity: '少见' },
        { name: 'Pei Pei', rarity: '隐藏' },
      ],
      secret: '隐藏款：熊猫 Pei Pei。收藏家说这是好运。',
      note: '灵感来自 Pei Pei 盲盒活动。这里的小人不是官方周边。',
    },
    roasts: [
      '你把 {model} 的批量设成 1。只盛一勺陈皮鸡，身后的队伍很长。',
      '你的 {model} 方案是加大餐盘，KV 缓存却是个小盒子。盖不上了。',
      '你将带着图上唯一的一个数据点，做一场信心十足的汇报。',
      '你的签文和你的图表一样：没人问，所有人都读了。',
      '你对比了 FP4 和 FP8，选了幻灯片更好看的那个。饼干注意到了。',
      '你很快会说“在我的 GPU 上能跑”，而整个美食广场都在看。',
    ],
    places: {
      title: '一切从这里开始',
      items: [
        {
          year: '1973',
          place: '帕萨迪纳熊猫小馆',
          fact: '程正昌与父亲在加州帕萨迪纳开出第一家熊猫小馆。',
          alt: '帕萨迪纳熊猫小馆：1973 年，熊猫快餐之前的堂食餐厅',
        },
        {
          year: '1983',
          place: '格伦代尔购物中心',
          fact: '第一家熊猫快餐在格伦代尔购物中心美食广场开业。',
          alt: '日落时的格伦代尔购物中心入口，1983 年第一家熊猫快餐开在这里',
        },
        {
          year: '1987',
          place: '檀香山阿拉莫阿纳',
          fact: '主厨 Andy Kao 在夏威夷做出陈皮鸡，同样的味道，不带骨头。',
          alt: '檀香山阿拉莫阿纳中心的熊猫快餐柜台，陈皮鸡诞生于此',
        },
        {
          year: '现在',
          place: '你家街角',
          fact: '全球超过 2600 家熊猫快餐，红色熊猫招牌就是地标。',
          alt: '夜晚的熊猫快餐门店，红色熊猫招牌',
        },
      ],
    },
    chartBadge: '陈皮鸡菜单板',
  },
};
