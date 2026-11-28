import type { Locale } from '@/lib/i18n/i18n';

export interface CsgoCopy {
  dust: string;
  word: string;
  tag: string;
  play: string;
  rank: string;
  stars: string;
  best: string;
  sides: { ct: string; t: string; night: string; day: string };
  sound: string;
  music: string;
  splash: string[];
  eggAce: string;
  eggRush: string;
  eggBomb: string;
  step: (n: number) => string;
  empty: string;
  gameTitle: string;
  gameHelp: string;
  campaign: string;
  endless: string;
  sandbox: string;
  howto: string;
  pause: string;
  resume: string;
  restart: string;
  quit: string;
  close: string;
  buy: string;
  plant: string;
  smoke: string;
  flash: string;
  hp: string;
  money: string;
  kv: string;
  throughput: string;
  interactivity: string;
  pareto: string;
  act: string;
  boss: string;
  win: string;
  dead: string;
  howLines: string[];
  zones: string[];
  objectives: string[];
  kits: string;
  bench: string;
  benchHint: string;
  kitArmor: string;
  kitLight: string;
  kitVent: string;
  sandboxBots: string;
  sandboxWave: string;
  sandboxCash: string;
  sandboxKv: string;
}

const EN: CsgoCopy = {
  dust: 'DUST II',
  word: 'INFERENCEX',
  tag: 'Retake the Pareto frontier. Five sites. One bomb timer.',
  play: 'Queue retake',
  rank: 'Rank',
  stars: 'op stars',
  best: 'Endless best',
  sides: { ct: 'CT', t: 'T', night: 'Night', day: 'Day' },
  sound: 'Sound',
  music: 'Music',
  splash: [
    'Rush B, but B is batch size.',
    'Eco round: FP4 pistol only.',
    'KV cache is a smoke you forgot to throw.',
    'AWP the outlier. Rifle the frontier.',
    'TTFT is the peek. Do not wide-swing it.',
    'Global Elite is a Pareto medal.',
    'Bomb planted on the throughput knee.',
    'Flash the prefill, smoke the decode.',
    'EZ4ENCE. The chant, not the scoreboard.',
    'The Major is an OOM boss.',
    'Hold the angle. Drop the p99.',
    'IWNL. Hold the p99. Do not drop the round.',
    'Do not camp. Camping fills KV.',
    'Buy menu is a precision dial.',
    'Ace is four nines and a leftover.',
    'Radar green means the run is live.',
    'Defuse before interactivity hits zero.',
    'Long doors are a prefill corridor.',
    'Mid doors slam when the cache is full.',
    'Tunnels tax movement for batch.',
    'Shots 1-5: clearly missed. The batch never landed.',
    'DOOR STUCK. Mid doors. KV will not open.',
    'Plant only if both axes stay hot.',
    'Admin, he is doing it sideways. The batch is the strafe.',
    'Fnatic manager here. Please delete this outlier.',
    'Dust II redraw. B tunnels, fan geometry.',
  ],
  eggAce: 'ACE. Four trades and a leftover.',
  eggRush: 'Rush B. Batch lane is open.',
  eggBomb: 'Bomb tick. +80 operation XP.',
  step: (n) => `ROUND ${n}`,
  empty: 'NO CONTACT. Radar is clear. Widen the filters.',
  gameTitle: 'Operation Pareto',
  gameHelp: 'Dust II retake. Throughput versus interactivity, with a bomb timer.',
  campaign: 'Campaign',
  endless: 'Endless',
  sandbox: 'Sandbox',
  howto: 'How to play',
  pause: 'Paused',
  resume: 'Resume',
  restart: 'Restart',
  quit: 'Leave match',
  close: 'Close',
  buy: 'Buy',
  plant: 'Plant / defuse',
  smoke: 'Smoke (vent KV)',
  flash: 'Flash (stun TTFT)',
  hp: 'HP',
  money: 'Cash',
  kv: 'KV cache',
  throughput: 'tok/s',
  interactivity: 'tok/s/user',
  pareto: 'Pareto',
  act: 'Site',
  boss: 'The Major',
  win: 'Retake complete',
  dead: 'You are down',
  howLines: [
    'WASD or arrows move. Mouse aims. Hold click or Space to shoot.',
    '1–4 weapons: FP4 pistol, FP8 SMG, BF16 rifle, speculative AWP.',
    'Q smoke vents KV cache. E flash stuns. F plants when both meters are hot. B buys.',
    'Camping fills KV and slams mid doors. Bigger batch raises tok/s and TTFT lag.',
    'Campaign: five sites, then The Major. Endless: waves. Sandbox: toggle bots, waves, cash, and KV doors.',
    'Touch: left stick moves, right drag aims and fires.',
    'G at a kit bench between sites buys armor, lighter feet, or a wider smoke. Kits stay on the banner.',
  ],
  zones: ['Long Prefill', 'Mid KV Doors', 'A Pareto', 'B Batch Tunnels', 'Major Bombsite'],
  objectives: [
    'Clear four holders. Prefill bots peek late.',
    'Cross mid before the KV doors slam. Smoke vents the cache.',
    'Plant on the frontier: keep tok/s and tok/s/user both above 40.',
    'Tunnel eco. The rifle is faster damage and slower feet.',
    'Boss: dodge the radar, vent the OOM, retake the core.',
  ],
  kits: 'Kits',
  bench: 'Kit bench',
  benchHint: 'G kit bench',
  kitArmor: 'Kevlar +25 HP',
  kitLight: 'Light kit, faster feet',
  kitVent: 'Vent kit, wider smoke',
  sandboxBots: 'Bots live',
  sandboxWave: 'Spawn wave',
  sandboxCash: 'Cash +1600',
  sandboxKv: 'KV doors',
};

const ZH: CsgoCopy = {
  ...EN,
  dust: '炙热沙城 II',
  word: 'INFERENCEX',
  tag: '夺回帕累托前沿。五个点位，一个炸弹计时。',
  play: '排队回防',
  rank: '段位',
  stars: '行动星',
  best: '无尽最高',
  sides: { ct: '警', t: '匪', night: '夜战', day: '白昼' },
  sound: '音效',
  music: '音乐',
  splash: [
    'Rush B，但 B 是批大小。',
    '经济局：只准 FP4 手枪。',
    'KV 缓存是你忘扔的烟雾。',
    'AWP 打离群点，步枪守前沿。',
    'TTFT 是探头，别大拉。',
    '全球精英是一枚帕累托奖牌。',
    '炸弹下在吞吐拐点上。',
    '闪光打预填充，烟雾打解码。',
    'EZ4ENCE。是口号，不是计分板。',
    'Major 是一场 OOM 首领战。',
    '架枪，压下 p99。',
    'IWNL。守住 p99。这一回合别丢。',
    '别蹲点。蹲点会灌满 KV。',
    '购买菜单是精度旋钮。',
    'ACE 是四个九再加一个零头。',
    '雷达绿，说明这轮还活着。',
    '交互性归零前拆弹。',
    '长廊门是预填充走廊。',
    '缓存满了，中路门会关上。',
    '隧道用移速换批大小。',
    '第 1–5 枪：明显打空。这一批没有落地。',
    'DOOR STUCK。中路门。KV 开不了。',
    '两轴都热，才许下包。',
    '管理员，他在横着走。批处理就是这下平移。',
    'Fnatic 经理来了。请删掉这个离群点。',
    '沙城重画。B 通道，粉丝几何。',
  ],
  eggAce: 'ACE。四次交换，还剩一个。',
  eggRush: 'Rush B。批处理通道已开。',
  eggBomb: '炸弹滴答。行动经验 +80。',
  step: (n) => `第 ${n} 回合`,
  empty: '无接触。雷达是空的。放宽筛选。',
  gameTitle: '帕累托行动',
  gameHelp: '沙城回防。吞吐对交互，外加一个炸弹计时。',
  campaign: '战役',
  endless: '无尽',
  sandbox: '沙盒',
  howto: '怎么玩',
  pause: '已暂停',
  resume: '继续',
  restart: '重开',
  quit: '离开对局',
  close: '关闭',
  buy: '购买',
  plant: '下包 / 拆包',
  smoke: '烟雾（排出 KV）',
  flash: '闪光（眩晕 TTFT）',
  hp: '生命',
  money: '现金',
  kv: 'KV 缓存',
  throughput: 'tok/s',
  interactivity: 'tok/s/用户',
  pareto: '帕累托',
  act: '点位',
  boss: 'Major',
  win: '回防完成',
  dead: '你倒下了',
  howLines: [
    'WASD 或方向键移动。鼠标瞄准。按住点击或空格射击。',
    '1–4 武器：FP4 手枪、FP8 冲锋枪、BF16 步枪、投机 AWP。',
    'Q 烟雾排出 KV。E 闪光眩晕。两表都高于 40 时按 F 下包。B 购买。',
    '蹲点会灌满 KV 并关上中路门。更大的批提高 tok/s，也拉长 TTFT。',
    '战役五个点位，最后打 Major。无尽是波次。沙盒可开关机器人、波次、现金和 KV 门。',
    '触屏：左摇杆移动，右侧拖动瞄准并开火。',
    '点位之间的套件台按 G 购买护甲、轻装或更宽的烟雾。套件会留在横幅上。',
  ],
  zones: ['长廊预填充', '中路 KV 门', 'A 点帕累托', 'B 区批处理隧道', 'Major 包点'],
  objectives: [
    '清掉四个架枪的人。预填充机器人探头很慢。',
    '在 KV 门关上前穿过中路。烟雾能排出缓存。',
    '在前沿下包：tok/s 和 tok/s/用户都要高于 40。',
    '隧道经济局。步枪伤害高，脚步慢。',
    '首领：躲开雷达，排出 OOM，夺回核心。',
  ],
  kits: '套件',
  bench: '套件台',
  benchHint: 'G 套件台',
  kitArmor: '防弹衣 +25 生命',
  kitLight: '轻装，脚步更快',
  kitVent: '通风套件，烟雾更宽',
  sandboxBots: '机器人交火',
  sandboxWave: '生成一波',
  sandboxCash: '现金 +1600',
  sandboxKv: 'KV 门',
};

export function csgoCopy(locale: Locale): CsgoCopy {
  return locale === 'zh' ? ZH : EN;
}
