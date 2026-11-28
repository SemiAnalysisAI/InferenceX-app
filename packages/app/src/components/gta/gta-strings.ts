import type { GtaArt, GtaCharacter, GtaStation, GtaWeather, LineId, SecretId } from './gta-store';

export type ZoneId =
  | 'home'
  | 'inference'
  | 'power'
  | 'quality'
  | 'micro'
  | 'compare'
  | 'strip'
  | 'hardware'
  | 'rankings'
  | 'overview'
  | 'press'
  | 'about'
  | 'glossary'
  | 'whitepaper'
  | 'model'
  | 'notFound'
  | 'other';

/**
 * Lines quoted from the games, word for word and in English in every locale; the translation
 * and the benchmark remix sit next to them in the strings. `source` is where the wording was
 * checked.
 */
export const QUOTES: Record<LineId, { quote: string; art?: GtaArt; source: string }> = {
  hereWeGo: {
    quote: 'Ah shit, here we go again. Worst place in the world. Rollin Heights Ballas country.',
    art: 'cj-alley',
    source: 'https://en.wikiquote.org/wiki/Grand_Theft_Auto:_San_Andreas',
  },
  grove: {
    quote: 'Grove Street - Home. At least it was before I fucked everything up.',
    art: 'grove-street',
    source: 'https://en.wikiquote.org/wiki/Grand_Theft_Auto:_San_Andreas',
  },
  train: {
    quote: 'All we had to do, was follow the damn train, CJ!',
    art: 'big-smoke',
    source: 'https://en.wikiquote.org/wiki/Grand_Theft_Auto:_San_Andreas',
  },
  order: {
    quote:
      "I'll have two number 9s, a number 9 large, a number 6 with extra dip, a number 7, two number 45s, one with cheese, and a large soda.",
    art: 'big-smoke',
    source: 'https://en.wikiquote.org/wiki/Grand_Theft_Auto:_San_Andreas',
  },
  wrongHouse: {
    quote: 'You picked the wrong house, fool!',
    art: 'big-smoke',
    source: 'https://en.wikiquote.org/wiki/Grand_Theft_Auto:_San_Andreas',
  },
  forget: {
    quote: "You forget a thousand things every day, pal. Make sure this is one of 'em.",
    art: 'michael-face',
    source: 'https://en.wikiquote.org/wiki/Grand_Theft_Auto_V',
  },
  yeeyee: {
    quote: 'Maybe if you got rid of that old yee-yee ass haircut you got…',
    art: 'lamar-face',
    source: 'https://www.grandtheftwiki.com/Franklin_and_Lamar/Script',
  },
  surviving: {
    quote: 'Surviving is winning, Franklin, everything else is bullshit.',
    art: 'michael-face',
    source: 'https://www.imdb.com/title/tt2103188/quotes/',
  },
  weather: {
    quote: 'Why did I move here? I guess it was the weather.',
    art: 'michael-face',
    source: 'https://www.grandtheftwiki.com/Trailers_of_GTA_V',
  },
  crib: {
    quote: 'Wassup, can a loc come up in your crib?',
    art: 'lamar-face',
    source: 'https://en.wikiquote.org/wiki/Grand_Theft_Auto_V',
  },
  kifflom: {
    quote: 'Kifflom!',
    source: 'https://en.wikiquote.org/wiki/Grand_Theft_Auto_V',
  },
  hipster: {
    quote: 'You... are a hipster!',
    art: 'michael-face',
    source: 'https://www.imdb.com/title/tt2103188/quotes/',
  },
  dark: {
    quote: 'What happens in the dark, comes out in the light.',
    art: 'trevor-face',
    source: 'https://en.wikiquote.org/wiki/Grand_Theft_Auto_V',
  },
};

export interface GtaStrings {
  splash: readonly string[];
  banner: {
    label: string;
    wanted: string;
    cash: string;
    cashHint: string;
    rank: string;
    ranks: readonly string[];
    heistTitle: string;
    heistStart: string;
    heistNone: string;
    heistRecord: string;
    phone: string;
    phoneHint: string;
    secrets: string;
    switchLabel: string;
    radar: string;
    health: string;
    armor: string;
    special: string;
  };
  characters: Record<GtaCharacter, { name: string; mood: string }>;
  stations: Record<GtaStation, { name: string; genre: string }>;
  weather: Record<GtaWeather, string>;
  /** Speaker, translation of the quoted line (empty in English) and the benchmark remix. */
  lines: Record<LineId, { speaker: string; gloss: string; remix: string }>;
  /** Area names shown bottom right on arrival, as the games name a district. */
  zones: Record<ZoneId, string>;
  toggles: {
    muteMusic: string;
    unmuteMusic: string;
    muteSound: string;
    unmuteSound: string;
    phone: string;
  };
  feed: {
    welcomeTitle: string;
    welcomeBody: string;
    cheatTitle: string;
    wantedTitle: string;
    wantedUp: string;
    wantedClear: string;
    bustedTitle: string;
    bustedBody: string;
    cashTitle: string;
    exportBody: string;
    frontierBody: string;
    /** Lester's stash, a chain across routes: the tip, the tagging and the drop. */
    stashTitle: string;
    stashClue: string;
    stashHint: string;
    stashTagged: string;
    stashPaid: string;
    heistBody: string;
    radioTitle: string;
    switchTitle: string;
    weatherTitle: string;
    emptyTitle: string;
    emptyBody: string;
    foundAll: string;
    trainTitle: string;
    trainNone: string;
    lamar: string;
    lamarBody: string;
    resprayTitle: string;
    resprayBody: string;
    hesoyamBody: string;
  };
  overlay: {
    passed: string;
    passedSub: string;
    exportSub: string;
    completeSub: string;
    busted: string;
    bustedSub: string;
    wasted: string;
    wastedSub: string;
    wastedEmptySub: string;
    respect: string;
  };
  phone: {
    title: string;
    description: string;
    close: string;
    tabs: { cheats: string; radio: string; switch: string; stats: string; jobs: string };
    mapIntro: string;
    mapLoading: string;
    mapError: string;
    jobNext: string;
    jobDone: string;
    jobLocked: string;
    garage: {
      title: string;
      intro: string;
      buy: string;
      owned: string;
      batch: string;
      precision: string;
      plan: string;
      thisTune: string;
      stock: string;
      planTake: string;
      planLaunch: string;
      planTop: string;
      planDamage: string;
      planRepair: string;
      hint: string;
      parts: Record<'fp8' | 'kv' | 'batch16' | 'fp4', { name: string; effect: string }>;
    };
    cheatsIntro: string;
    tryIt: string;
    locked: string;
    found: string;
    typeHint: string;
    statsCash: string;
    statsRank: string;
    statsSecrets: string;
    statsHeists: string;
    statsBest: string;
    statsTake: string;
    statsNone: string;
    radioOff: string;
    radioOn: string;
    nowPlaying: string;
    weatherLabel: string;
    resetWanted: string;
    audioNote: string;
    /** The two benchmark panels of the cover on the stats page. */
    cover: readonly [string, string];
  };
  secrets: Record<SecretId, { name: string; hint: string; code?: string }>;
  charts: {
    tooltip: string;
    empty: string;
    emptySub: string;
    loading: string;
    /** Radar sweep tab; `{count}` is the number of points on the chart. */
    sweep: string;
    /** PNG export stamp: title, and a line with `{count}` points. */
    stamp: string;
    stampSub: string;
  };
  notFound: string;
}

const en: GtaStrings = {
  splash: [
    'Go to the yellow blip: the Pareto frontier.',
    'Lose the cops. Keep the tokens per second.',
    'Steal a faster TTFT before the timer runs out.',
    'Five stars means your KV cache is full.',
    'Batch size up, interactivity down. Pick your crew.',
    'Lester says: benchmark first, heist later.',
    'This run is hotter than a stolen Adder.',
    'Respect + for every reproducible result.',
    'Mission: beat last month on the same hardware.',
    'Tail the H100. Do not get spotted.',
    'The frontier moved. Re-plan the getaway.',
    'FP8 is the quiet approach. BF16 is going in loud.',
    'Pay for throughput, not for idle GPUs.',
    'Cost per million tokens: the only take that counts.',
    'Speculative decoding: two drivers, one route.',
    'Franklin drives. Michael plans. Trevor sets concurrency to 512.',
    'No cheat code raises tokens per megawatt.',
    'Prefill is the setup. Decode is the score.',
    'Wanted level rises with p99 latency.',
    'Park the cache hit rate where the cops cannot see it.',
    'A tensor-parallel crew splits the take eight ways.',
    'Los Santos Customs: now tuning max batch tokens.',
    'Your GPS route follows the roofline.',
    'Every point on this map is a real run.',
    'Out of memory: you are WASTED.',
    'Open weights, open roads.',
    'The quiet racks make the most money.',
    'Stock tip from BAWSAQ: buy interactivity.',
    'Switch character, same benchmark, new palette.',
    'Radio on. Load test running. Windows down.',
    'Throughput is the getaway car. Latency is the traffic.',
    'Do not shoot the messenger. Read the error bars.',
  ],
  banner: {
    label: 'Grand Theft InferenceX theme banner',
    wanted: 'Wanted level: {n} of 5 stars',
    cash: 'Cash',
    cashHint: 'Earned by using the dashboard. Open the phone for stats.',
    rank: 'Rank',
    ranks: [
      'Street Hustler',
      'Getaway Driver',
      'Crew Member',
      'Heist Planner',
      'Kingpin',
      'Legend',
    ],
    heistTitle: 'LOS SANTOS 3D',
    heistStart: 'Start heist →',
    heistNone: 'No heist passed yet',
    heistRecord: 'Heists passed: {n} · Best {time} · Take {take}',
    phone: 'Phone',
    phoneHint: 'Open the phone: cheats, radio, character switch and stats',
    secrets: '{found}/{total} secrets',
    switchLabel: 'Switch character palette',
    radar: 'Radar: where you are on this page',
    health: 'Page progress',
    armor: 'Secrets found',
    special: 'Wanted heat',
  },
  characters: {
    franklin: { name: 'Franklin', mood: 'Vinewood Hills green' },
    michael: { name: 'Michael', mood: 'Rockford Hills blue hour' },
    trevor: { name: 'Trevor', mood: 'Blaine County dust' },
  },
  stations: {
    theme: { name: 'San Andreas Theme', genre: 'Recorded loop · Grove Street, 1992' },
    welcome: { name: 'Welcome to Los Santos', genre: 'Recorded loop · Los Santos, 2013' },
    lossantos: { name: 'Radio Los Inference', genre: 'West coast cruise' },
    nonstop: { name: 'Non-Stop-Tok FM', genre: 'Night drive synth' },
    blaine: { name: 'Blaine County Batch', genre: 'Desert rock stomp' },
  },
  weather: { clear: 'Clear', rain: 'Rain', smog: 'Smog' },
  lines: {
    hereWeGo: {
      speaker: 'CJ',
      gloss: '',
      remix: 'Same hood, new run. The frontier moved while you were away.',
    },
    grove: {
      speaker: 'CJ',
      gloss: '',
      remix: 'Home page. Every benchmark on this site starts on this block.',
    },
    train: {
      speaker: 'Big Smoke',
      gloss: '',
      remix: 'All you had to do was follow the damn Pareto frontier.',
    },
    order: {
      speaker: 'Big Smoke',
      gloss: '',
      remix:
        "I'll have two batch size 9s, a batch 9 large, a number 6 with extra KV cache, a number 7, two number 45s, one with FP8, and a large context window.",
    },
    wrongHouse: {
      speaker: 'Big Smoke',
      gloss: '',
      remix: 'Wrong door for this run. Pick another GPU, fool.',
    },
    forget: {
      speaker: 'Michael',
      gloss: '',
      remix: 'Dismissed. The KV cache evicted it too.',
    },
    yeeyee: {
      speaker: 'Lamar',
      gloss: '',
      remix: "…you'd get some tokens per second.",
    },
    surviving: {
      speaker: 'Michael',
      gloss: '',
      remix: 'Wanted level cleared. A run that finishes is a data point.',
    },
    weather: {
      speaker: 'Michael',
      gloss: '',
      remix: 'Forecast: scattered cold starts, clearing to steady throughput.',
    },
    crib: {
      speaker: 'Lamar',
      gloss: '',
      remix: 'Lamar wants a slot in your batch.',
    },
    kifflom: {
      speaker: 'Epsilon Program',
      gloss: '',
      remix: 'Secret found. Tithe your idle GPUs and the truth will be benchmarked.',
    },
    hipster: {
      speaker: 'Michael',
      gloss: '',
      remix: 'Trevor was running concurrency 512 before it was on the dashboard.',
    },
    dark: {
      speaker: 'Trevor',
      gloss: '',
      remix: 'Chart exported. Every run on it is out in the open now.',
    },
  },
  zones: {
    home: 'Grove Street',
    inference: 'Downtown Los Santos',
    power: 'Palmer-Taylor Power Station',
    quality: 'Vinewood Hills',
    micro: 'Humane Labs',
    compare: 'Los Santos Customs',
    strip: 'The Strip, Las Venturas',
    hardware: 'Mount Chiliad',
    rankings: 'Maze Bank Tower',
    overview: 'Sandy Shores',
    press: 'Weazel News',
    about: 'Rockford Hills',
    glossary: 'Del Perro Pier',
    whitepaper: 'Fort Zancudo',
    model: 'Vespucci Beach',
    notFound: 'Bolingbroke Penitentiary',
    other: 'Los Santos',
  },
  toggles: {
    muteMusic: 'Turn the GTA radio off',
    unmuteMusic: 'Turn the GTA radio on',
    muteSound: 'Mute GTA interface sounds',
    unmuteSound: 'Unmute GTA interface sounds',
    phone: 'Cash {cash}. Secrets {found} of {total}. Open the phone',
  },
  feed: {
    welcomeTitle: 'Welcome to Los Santos',
    welcomeBody: 'Open the phone for cheats and the radio.',
    cheatTitle: 'Cheat activated',
    wantedTitle: 'Wanted level',
    wantedUp: 'The LSPD noticed. {n} of 5 stars.',
    wantedClear: 'You lost the cops.',
    bustedTitle: 'Busted',
    bustedBody: 'Bail paid: {fine}.',
    cashTitle: 'Cash',
    exportBody: 'Chart lifted. Fence paid {amount}.',
    frontierBody: 'You touched the frontier. +{amount}.',
    stashTitle: 'Lester',
    stashClue: 'Tag three blips on the Inference radar, then come home. There is a drop in it.',
    stashHint: 'Lester: tag 3 blips on a chart, then come home.',
    stashTagged: 'Three tagged, {count} blips on the radar. The drop is at Grove Street: go home.',
    stashPaid: 'The drop: $100 a blip for {count} blips. +{amount}.',
    heistBody: 'Heist take wired: {amount}.',
    radioTitle: 'Radio',
    switchTitle: 'Switched to',
    weatherTitle: 'Weather',
    emptyTitle: 'Mission failed',
    emptyBody: 'No runs match these filters.',
    foundAll: '100% completion. Every secret found.',
    trainTitle: 'Wrong Side of the Tracks',
    trainNone: 'No frontier line on screen. Open a scatter chart, then try again.',
    lamar: 'Lamar',
    lamarBody: 'Franklin got the green palette. Tell him about the haircut.',
    resprayTitle: "Pay 'n' Spray",
    resprayBody: 'New paint, same benchmark. The LSPD forgot everything. GTA logic.',
    hesoyamBody: 'Health, armour and {amount}. The tokens per second stay the same.',
  },
  overlay: {
    passed: 'Mission passed!',
    passedSub: 'Theme unlocked: Grand Theft InferenceX',
    exportSub: 'Grand theft chart: PNG exported',
    completeSub: '100% completion',
    busted: 'Busted',
    bustedSub: 'Five stars. The benchmark goes on.',
    wasted: 'Wasted',
    wastedSub: 'This page is not on the map.',
    wastedEmptySub: 'No runs match these filters.',
    respect: 'Respect +',
  },
  phone: {
    title: 'iFruit: Grand Theft InferenceX',
    description: 'Cheats, radio stations, character switch and stats for the GTA theme.',
    close: 'Put the phone away',
    tabs: { cheats: 'Cheats', radio: 'Radio', switch: 'Switch', stats: 'Stats', jobs: 'Jobs' },
    mapIntro:
      'The five jobs of the heist on the flat map: three in the city, two down the freeway. Start the heist from the banner to drive them.',
    mapLoading: 'Loading the map…',
    mapError: 'The map did not load.',
    jobNext: 'Next',
    jobDone: 'Done',
    jobLocked: 'Later',
    garage: {
      title: 'Garage',
      intro:
        'Tune the heist car in the terms the charts measure. Parts cost site cash; the tune is used from the next run, and B changes the batch size between jobs.',
      buy: 'Buy',
      owned: 'Owned',
      batch: 'Batch size',
      precision: 'Precision',
      plan: 'The plan with this tune',
      thisTune: 'This tune',
      stock: 'Stock',
      planTake: 'Take for five jobs',
      planLaunch: 'First token (0-100 km/h)',
      planTop: 'Top speed',
      planDamage: 'Crash damage',
      planRepair: 'Health per delivery',
      hint: 'A bigger batch pays more and pulls away more slowly. Lower precision is faster and every crash costs more.',
      parts: {
        fp8: { name: 'FP8 tune', effect: 'Top speed +12%, crash damage +35%' },
        kv: { name: 'KV cache', effect: '+30 health at every delivery' },
        batch16: { name: 'Batch 16 intake', effect: 'Take x2.25, acceleration -30%' },
        fp4: { name: 'FP4 tune', effect: 'Top speed +25%, crash damage +80%' },
      },
    },
    cheatsIntro:
      'Type a code anywhere on the site, or tap Try it. Found secrets stay in this browser.',
    tryIt: 'Try it',
    locked: 'Not found yet',
    found: 'Found',
    typeHint: 'Type:',
    statsCash: 'Cash on hand',
    statsRank: 'Rank',
    statsSecrets: 'Secrets',
    statsHeists: 'Heists passed',
    statsBest: 'Best heist time',
    statsTake: 'Biggest take',
    statsNone: 'none yet',
    radioOff: 'Radio off',
    radioOn: 'Radio on',
    nowPlaying: 'Now playing',
    weatherLabel: 'Weather',
    resetWanted: 'Call Lester (clear wanted level)',
    cover: ['Throughput vs interactivity', 'Follow the Pareto frontier'],
    audioNote:
      'The two theme stations, stingers and quoted lines are short recordings from the games; the other stations and interface sounds are synthesized in the browser.',
  },
  secrets: {
    activate: { name: 'Welcome to Los Santos', hint: 'Turn the theme on.' },
    switch: { name: 'Character switch', hint: 'Switch to another character.' },
    radio: { name: 'Radio wheel', hint: 'Tune to a different station.' },
    fugitive: { name: 'Raise wanted level', hint: 'One more star.', code: 'FUGITIVE' },
    lawyerup: { name: 'Lower wanted level', hint: 'One star fewer.', code: 'LAWYERUP' },
    makeitrain: { name: 'Change weather', hint: 'Clear, rain, smog.', code: 'MAKEITRAIN' },
    slowmo: { name: 'Slow motion', hint: 'The scene slows for a while.', code: 'SLOWMO' },
    liquor: { name: 'Drunk mode', hint: 'The page sways for a moment.', code: 'LIQUOR' },
    buzzoff: { name: 'Spawn Buzzard', hint: 'A helicopter crosses the sky.', code: 'BUZZOFF' },
    skyfall: { name: 'Skyfall', hint: 'Drop back to the top of the page.', code: 'SKYFALL' },
    konami: { name: 'Old school', hint: 'Up up down down left right left right B A.' },
    export: { name: 'Grand theft chart', hint: 'Export a chart as PNG.' },
    frontier: { name: 'Blip hunter', hint: 'Inspect 25 chart points.' },
    busted: { name: 'Busted', hint: 'Reach five stars.' },
    heist: { name: 'The big score', hint: 'Pass a heist in Los Santos 3D.' },
    wordmark: { name: 'Vinewood sign', hint: 'Click the banner wordmark five times.' },
    train: {
      name: 'Follow the damn train',
      hint: 'A freight train runs a Pareto frontier line.',
      code: 'DAMNTRAIN',
    },
    order: {
      name: "Big Smoke's order",
      hint: 'Change five settings in a row, or type the code.',
      code: 'NUMBERNINE',
    },
    herewego: { name: 'Here we go again', hint: 'Reset a chart zoom, or turn the theme on again.' },
    hesoyam: {
      name: 'Health, armour, $250,000',
      hint: 'The old San Andreas code.',
      code: 'HESOYAM',
    },
    respray: {
      name: "Pay 'n' Spray",
      hint: 'Switch character while wanted: new paint, and the cops forget.',
    },
  },
  charts: {
    tooltip: 'Blip',
    empty: 'Mission Failed',
    emptySub: 'No blips on the radar',
    loading: 'Loading story mode',
    sweep: 'Radar updated · {count} blips',
    stamp: 'Mission Passed',
    stampSub: 'Grand Theft InferenceX · {count} blips on the radar',
  },
  notFound: 'Wasted',
};

const zh: GtaStrings = {
  splash: [
    '前往黄色标记：帕累托前沿。',
    '甩掉警察，保住每秒词元数。',
    '在倒计时结束前偷到更快的首词元延迟。',
    '五星通缉说明 KV 缓存已满。',
    '批量越大，交互性越低。选好你的团队。',
    '莱斯特说：先跑基准，再干大票。',
    '这次运行比偷来的 Adder 还烫。',
    '每个可复现的结果都加声望。',
    '任务：同样的硬件，超过上个月。',
    '跟踪那台 H100，别被发现。',
    '前沿移动了，重新规划逃跑路线。',
    'FP8 是潜入方案，BF16 是强攻方案。',
    '为吞吐量付钱，别为闲置 GPU 付钱。',
    '每百万词元成本：唯一算数的收获。',
    '推测解码：两个司机，一条路线。',
    '富兰克林开车，麦克策划，崔佛把并发调到 512。',
    '没有哪个作弊码能提高每兆瓦词元数。',
    '预填充是踩点，解码才是得手。',
    '通缉等级随 p99 延迟上升。',
    '把缓存命中率停在警察看不见的地方。',
    '张量并行的团队把收获分成八份。',
    '洛圣都改车王：现在调校最大批量词元数。',
    '你的导航路线沿着性能上限走。',
    '地图上的每个点都是一次真实运行。',
    '内存不足：你挂了。',
    '开放权重，开放道路。',
    '最安静的机柜最赚钱。',
    'BAWSAQ 内幕消息：买入交互性。',
    '切换角色，同一个基准，新的配色。',
    '打开电台，压测进行中，摇下车窗。',
    '吞吐量是逃跑车辆，延迟是堵车。',
    '别怪报信的人，先看误差线。',
  ],
  banner: {
    label: '侠盗猎车手 InferenceX 主题横幅',
    wanted: '通缉等级：{n} / 5 星',
    cash: '现金',
    cashHint: '使用仪表板即可赚取。打开手机查看统计。',
    rank: '等级',
    ranks: ['街头混混', '逃跑司机', '团队成员', '劫案策划', '大佬', '传奇'],
    heistTitle: 'LOS SANTOS 3D',
    heistStart: '开始驾驶 →',
    heistNone: '尚未完成劫案',
    heistRecord: '完成劫案：{n} 次 · 最快 {time} · 收获 {take}',
    phone: '手机',
    phoneHint: '打开手机：作弊码、电台、角色切换和统计',
    secrets: '{found}/{total} 个秘密',
    switchLabel: '切换角色配色',
    radar: '雷达：你在本页的位置',
    health: '页面进度',
    armor: '已发现秘密',
    special: '通缉热度',
  },
  characters: {
    franklin: { name: '富兰克林', mood: '好麦坞山绿' },
    michael: { name: '麦克', mood: '罗克福德山蓝调时刻' },
    trevor: { name: '崔佛', mood: '布雷恩郡沙尘' },
  },
  stations: {
    theme: { name: '圣安地列斯主题曲', genre: '录音循环 · 葛洛夫街，1992' },
    welcome: { name: 'Welcome to Los Santos', genre: '录音循环 · 洛圣都，2013' },
    lossantos: { name: '洛圣都推理电台', genre: '西海岸巡航' },
    nonstop: { name: '不间断词元 FM', genre: '夜驾合成器' },
    blaine: { name: '布雷恩郡批量台', genre: '沙漠摇滚' },
  },
  weather: { clear: '晴朗', rain: '下雨', smog: '雾霾' },
  lines: {
    hereWeGo: {
      speaker: 'CJ',
      gloss: '啊，该死，又来了。全世界最糟的地方。罗林高地，巴拉斯帮的地盘。',
      remix: '还是这个街区，新的一轮运行。你不在的时候，前沿又移动了。',
    },
    grove: {
      speaker: 'CJ',
      gloss: '葛洛夫街，家。至少在我把一切搞砸之前是。',
      remix: '首页。本站的每个基准测试都从这个街区出发。',
    },
    train: {
      speaker: '大烟鬼',
      gloss: '我们只要跟上那该死的火车就行了，CJ！',
      remix: '你只要跟上那该死的帕累托前沿就行了。',
    },
    order: {
      speaker: '大烟鬼',
      gloss:
        '我要两个 9 号餐，一个大份 9 号餐，一个 6 号餐多加蘸酱，一个 7 号餐，两个 45 号餐，其中一个加芝士，再来一大杯汽水。',
      remix:
        '我要两个批量 9，一个大份批量 9，一个 6 号多加 KV 缓存，一个 7 号，两个 45 号，其中一个用 FP8，再来一大份上下文窗口。',
    },
    wrongHouse: {
      speaker: '大烟鬼',
      gloss: '你进错门了，蠢货！',
      remix: '这次运行走错门了。换一块 GPU 吧。',
    },
    forget: {
      speaker: '麦克',
      gloss: '伙计，你每天都会忘掉一千件事。让这件事也成为其中之一。',
      remix: '已关闭。KV 缓存也把它淘汰了。',
    },
    yeeyee: {
      speaker: '拉玛',
      gloss: '也许你把那个土掉渣的破发型剪了……',
      remix: '……你就能有点每秒词元数了。',
    },
    surviving: {
      speaker: '麦克',
      gloss: '活下来就是赢，富兰克林，其他都是扯淡。',
      remix: '通缉已解除。跑完的运行才算一个数据点。',
    },
    weather: {
      speaker: '麦克',
      gloss: '我为什么搬来这儿？大概是因为天气吧。',
      remix: '天气预报：零星冷启动，随后转为稳定吞吐。',
    },
    crib: {
      speaker: '拉玛',
      gloss: '怎么样，兄弟能进你家坐坐吗？',
      remix: '拉玛想在你的批量里占个位置。',
    },
    kifflom: {
      speaker: '艾普西隆计划',
      gloss: 'Kifflom！（艾普西隆教的问候语）',
      remix: '发现一个秘密。献出你闲置的 GPU，真理自会被基准测试。',
    },
    hipster: {
      speaker: '麦克',
      gloss: '你……就是个文青！',
      remix: '并发 512 还没上仪表板的时候，崔佛就在跑了。',
    },
    dark: {
      speaker: '崔佛',
      gloss: '黑暗中发生的事，终会暴露在阳光下。',
      remix: '图表已导出。上面的每次运行现在都摆在明面上。',
    },
  },
  zones: {
    home: '葛洛夫街',
    inference: '洛圣都市中心',
    power: '帕默泰勒发电站',
    quality: '好麦坞山',
    micro: '人道实验室',
    compare: '洛圣都改车王',
    strip: '拉斯云祖华大道',
    hardware: '奇力耶德山',
    rankings: '花园银行大厦',
    overview: '沙滩海岸',
    press: '威泽新闻',
    about: '罗克福德山',
    glossary: '德尔佩罗码头',
    whitepaper: '赞库多堡垒',
    model: '维斯普奇海滩',
    notFound: '博林布鲁克监狱',
    other: '洛圣都',
  },
  toggles: {
    muteMusic: '关闭 GTA 电台',
    unmuteMusic: '打开 GTA 电台',
    muteSound: '关闭 GTA 界面音效',
    unmuteSound: '打开 GTA 界面音效',
    phone: '现金 {cash}。秘密 {found} / {total}。打开手机',
  },
  feed: {
    welcomeTitle: '欢迎来到洛圣都',
    welcomeBody: '打开手机查看作弊码和电台。',
    cheatTitle: '作弊码已激活',
    wantedTitle: '通缉等级',
    wantedUp: '洛圣都警察注意到你了。{n} / 5 星。',
    wantedClear: '你甩掉了警察。',
    bustedTitle: '被捕',
    bustedBody: '已付保释金：{fine}。',
    cashTitle: '现金',
    exportBody: '图表到手。销赃得 {amount}。',
    frontierBody: '你摸到了前沿。+{amount}。',
    stashTitle: '莱斯特',
    stashClue: '到 Inference 雷达上标记三个点，然后回家。有一笔货等着你。',
    stashHint: '莱斯特：到图表上标记 3 个点，然后回家。',
    stashTagged: '已标记三个，雷达上共 {count} 个标记。货在葛洛夫街：回家。',
    stashPaid: '到货：{count} 个标记，每个 $100。+{amount}。',
    heistBody: '劫案收获已到账：{amount}。',
    radioTitle: '电台',
    switchTitle: '已切换到',
    weatherTitle: '天气',
    emptyTitle: '任务失败',
    emptyBody: '没有符合这些筛选条件的运行。',
    foundAll: '100% 完成度。所有秘密均已发现。',
    trainTitle: '铁轨的另一边',
    trainNone: '屏幕上没有前沿线。先打开一张散点图再试。',
    lamar: '拉玛',
    lamarBody: '富兰克林换上了绿色配色。跟他说说那个发型。',
    resprayTitle: '喷漆店',
    resprayBody: '新漆，同一个基准。洛圣都警察全忘了。这就是 GTA 逻辑。',
    hesoyamBody: '生命、护甲和 {amount}。每秒词元数不变。',
  },
  overlay: {
    passed: '任务完成！',
    passedSub: '主题已解锁：侠盗猎车手 InferenceX',
    exportSub: '侠盗猎图：PNG 已导出',
    completeSub: '100% 完成度',
    busted: '被捕',
    bustedSub: '五星通缉。基准测试继续。',
    wasted: '挂了',
    wastedSub: '这个页面不在地图上。',
    wastedEmptySub: '没有符合这些筛选条件的运行。',
    respect: '声望 +',
  },
  phone: {
    title: 'iFruit：侠盗猎车手 InferenceX',
    description: 'GTA 主题的作弊码、电台、角色切换和统计。',
    close: '收起手机',
    tabs: { cheats: '作弊码', radio: '电台', switch: '切换', stats: '统计', jobs: '任务' },
    mapIntro: '平面地图上的五个劫案任务：三个在市区，两个沿高速南下。从横幅开始劫案即可驾车前往。',
    mapLoading: '正在加载地图…',
    mapError: '地图未能加载。',
    jobNext: '下一个',
    jobDone: '已完成',
    jobLocked: '稍后',
    garage: {
      title: '车库',
      intro:
        '用图表衡量的指标来改装劫案用车。零件用网站现金购买；改装从下一次行动起生效，任务之间按 B 可更换批量大小。',
      buy: '购买',
      owned: '已拥有',
      batch: '批量大小',
      precision: '精度',
      plan: '此改装下的计划',
      thisTune: '此改装',
      stock: '原厂',
      planTake: '五个任务的收益',
      planLaunch: '首 token（0-100 公里/时）',
      planTop: '极速',
      planDamage: '碰撞损伤',
      planRepair: '每次交付回复生命',
      hint: '批量越大，收益越高，起步越慢。精度越低，速度越快，每次碰撞的代价越大。',
      parts: {
        fp8: { name: 'FP8 改装', effect: '极速 +12%，碰撞损伤 +35%' },
        kv: { name: 'KV 缓存', effect: '每次交付 +30 生命' },
        batch16: { name: '批量 16 进气', effect: '收益 x2.25，加速 -30%' },
        fp4: { name: 'FP4 改装', effect: '极速 +25%，碰撞损伤 +80%' },
      },
    },
    cheatsIntro: '在网站任意位置输入作弊码，或点“试一试”。已发现的秘密保存在此浏览器。',
    tryIt: '试一试',
    locked: '尚未发现',
    found: '已发现',
    typeHint: '输入：',
    statsCash: '手头现金',
    statsRank: '等级',
    statsSecrets: '秘密',
    statsHeists: '完成劫案',
    statsBest: '最快劫案用时',
    statsTake: '最大收获',
    statsNone: '暂无',
    radioOff: '电台已关',
    radioOn: '电台已开',
    nowPlaying: '正在播放',
    weatherLabel: '天气',
    resetWanted: '打给莱斯特（清除通缉）',
    cover: ['吞吐量对交互性', '跟着帕累托前沿走'],
    audioNote:
      '两个主题曲电台、提示音和引用的台词是来自游戏的短录音；其他电台和界面音效在浏览器中合成。',
  },
  secrets: {
    activate: { name: '欢迎来到洛圣都', hint: '开启本主题。' },
    switch: { name: '角色切换', hint: '切换到另一个角色。' },
    radio: { name: '电台轮盘', hint: '换一个电台。' },
    fugitive: { name: '提高通缉等级', hint: '多一颗星。', code: 'FUGITIVE' },
    lawyerup: { name: '降低通缉等级', hint: '少一颗星。', code: 'LAWYERUP' },
    makeitrain: { name: '改变天气', hint: '晴朗、下雨、雾霾。', code: 'MAKEITRAIN' },
    slowmo: { name: '慢动作', hint: '场景放慢一会儿。', code: 'SLOWMO' },
    liquor: { name: '醉酒模式', hint: '页面摇晃片刻。', code: 'LIQUOR' },
    buzzoff: { name: '召唤秃鹰直升机', hint: '一架直升机飞过天空。', code: 'BUZZOFF' },
    skyfall: { name: '高空坠落', hint: '落回页面顶部。', code: 'SKYFALL' },
    konami: { name: '老派玩家', hint: '上上下下左右左右 B A。' },
    export: { name: '侠盗猎图', hint: '把图表导出为 PNG。' },
    frontier: { name: '标记猎人', hint: '查看 25 个图表数据点。' },
    busted: { name: '被捕', hint: '达到五星通缉。' },
    heist: { name: '惊天大案', hint: '在 Los Santos 3D 中完成一次劫案。' },
    wordmark: { name: '好麦坞标志', hint: '点击横幅标题五次。' },
    train: {
      name: '跟上那该死的火车',
      hint: '一列货运火车沿帕累托前沿线行驶。',
      code: 'DAMNTRAIN',
    },
    order: { name: '大烟鬼的点餐', hint: '连续更改五项设置，或输入作弊码。', code: 'NUMBERNINE' },
    herewego: { name: '又来了', hint: '重置图表缩放，或再次开启本主题。' },
    hesoyam: { name: '生命、护甲、$250,000', hint: '圣安地列斯的老作弊码。', code: 'HESOYAM' },
    respray: { name: '喷漆店', hint: '被通缉时切换角色：换了新漆，警察就忘了。' },
  },
  charts: {
    tooltip: '标记',
    empty: '任务失败',
    emptySub: '雷达上没有标记',
    loading: '正在载入故事模式',
    sweep: '雷达已更新 · {count} 个标记',
    stamp: '任务完成 · Mission Passed',
    stampSub: 'Grand Theft InferenceX · 雷达上有 {count} 个标记',
  },
  notFound: '挂了',
};

export const STRINGS: Record<'en' | 'zh', GtaStrings> = { en, zh };

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replaceAll(/\{(?<key>\w+)\}/gu, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}

export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
