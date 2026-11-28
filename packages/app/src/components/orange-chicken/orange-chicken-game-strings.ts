import type { Labels } from './orange-chicken-render';
import type { Locale } from './orange-chicken-strings';

type ModeId = 'campaign' | 'endless' | 'sandbox' | 'challenge';
type UpgradeId = 'stove' | 'counter' | 'shoes' | 'hands' | 'sous';

export interface GameStrings {
  title: string;
  description: string;
  menu: {
    heading: string;
    sub: string;
    route: string;
    modes: Record<ModeId, { name: string; desc: string }>;
    acts: { name: string; brief: string }[];
    locked: string;
    best: string;
    loadout: string;
    precision: string;
    batch: string;
    preview: string;
    previewLine: string;
    previewForced: string;
    shop: string;
    wallet: string;
    buy: string;
    maxed: string;
    level: string;
    upgrades: Record<UpgradeId, { name: string; desc: string }>;
    start: string;
    howto: string;
    close: string;
    sandbox: {
      title: string;
      arrival: string;
      hw: string;
      oil: string;
      pigeons: string;
      fire: string;
      wind: string;
    };
    zoneLimits: string;
  };
  howto: { title: string; items: string[]; back: string };
  labels: Labels;
  controls: {
    pause: string;
    resume: string;
    restart: string;
    quit: string;
    mute: string;
    unmute: string;
    paused: string;
    leave: string;
    dash: string;
    act: string;
    stick: string;
    wokPanel: string;
    precision: string;
    batchDown: string;
    batchUp: string;
    calm: string;
    keys: string;
  };
  live: {
    pickup: string;
    load: string;
    serve: string;
    serveLate: string;
    walkout: string;
    burn: string;
    oom: string;
    extinguish: string;
    bump: string;
    steal: string;
    shoo: string;
    rushStart: string;
    rushEnd: string;
    auditStart: string;
    auditPass: string;
    auditFail: string;
    ready: string;
    refuse: string;
    first: string;
  };
  results: {
    win: string;
    lose: string;
    timeUp: string;
    boxMet: string;
    boxMissed: string;
    stars: string;
    served: string;
    tips: string;
    ttft: string;
    user: string;
    thr: string;
    ooms: string;
    inBox: string;
    walkouts: string;
    audits: string;
    score: string;
    newBest: string;
    retry: string;
    next: string;
    menu: string;
    earned: string;
    trophy: string;
    finale: string;
  };
}

export const GAME_STRINGS: Record<Locale, GameStrings> = {
  en: {
    title: 'The Wok Kitchen',
    description:
      'A takeout kitchen game about serving throughput against interactivity. Walk the kitchen, load orders into woks, and keep the operating point inside the target box.',
    menu: {
      heading: 'The Wok Kitchen',
      sub: 'Orders are requests. Woks are GPUs. Keep the kitchen on the Pareto frontier.',
      route: 'The route',
      modes: {
        campaign: {
          name: 'Campaign',
          desc: 'Five acts, each with new rules. Clear one to open the next.',
        },
        endless: {
          name: 'Endless Shift',
          desc: 'Every hazard, a rising rush. How many orders before reputation hits zero?',
        },
        sandbox: {
          name: 'Sandbox',
          desc: 'Tune arrival rate, hardware and hazards. Orders can still walk out, but reputation never ends the shift.',
        },
        challenge: {
          name: 'Pareto Rush',
          desc: 'Two minutes. The target box keeps moving along the frontier. Stay in it.',
        },
      },
      acts: [
        {
          name: 'Prep Station',
          brief: 'One wok, FP8 only. Learn the loop: ticket, wok, shelf, pass.',
        },
        {
          name: 'Wok Line',
          brief: 'Three woks, three precisions, oil and fire. Pick a point on the curve.',
        },
        {
          name: 'Night Market',
          brief: 'Wind, pigeons and a moving pass. The counter is small: mind the KV cache.',
        },
        {
          name: 'Rush Hour',
          brief:
            'Four woks and the health inspector. Pass three audits at three different targets.',
        },
        {
          name: 'Glendale Galleria',
          brief:
            'The 1983 food court: three woks, mall wind, pigeons and the inspector. The first audit comes early.',
        },
      ],
      locked: 'Clear the previous act to open this one.',
      best: 'Best',
      loadout: 'Starting loadout',
      precision: 'Precision',
      batch: 'Batch',
      preview: 'Frontier preview',
      previewLine: '{prec} at batch {batch}: {user} tok/s/user, {thr} tok/s per wok',
      previewForced: 'This act only allows {prec}.',
      shop: 'Pantry upgrades',
      wallet: 'Tips: {n}',
      buy: 'Buy {cost}',
      maxed: 'Max',
      level: 'Level {n}',
      upgrades: {
        stove: {
          name: 'Better stove',
          desc: 'Every step takes 8% less time: the whole frontier moves out.',
        },
        counter: {
          name: 'Bigger Plate',
          desc: '+10 counter space for weights and the KV cache.',
        },
        shoes: { name: 'Grippy shoes', desc: 'Faster feet, and oil costs less control.' },
        hands: { name: 'Extra hands', desc: 'Carry one more ticket or dish.' },
        sous: {
          name: 'Sous chef',
          desc: 'Hires a helper who runs tickets and plates on their own.',
        },
      },
      start: 'Start shift',
      howto: 'How to play',
      close: 'Close',
      sandbox: {
        title: 'Sandbox knobs',
        arrival: 'Arrival rate',
        hw: 'Hardware speed',
        oil: 'Oil',
        pigeons: 'Pigeons',
        fire: 'Fire',
        wind: 'Wind',
      },
      zoneLimits: 'Woks {woks}, up to batch {batch}, {prec}',
    },
    howto: {
      title: 'How to play',
      items: [
        'Walk with WASD or the arrow keys, or click the floor. Space or Shift dashes.',
        'E, Enter or J does the nearest thing: take a ticket from the rail, load it into a wok, take dishes off the shelf, or hand them in at the pass. Hold E at a burning wok to put it out.',
        'Each wok is a GPU. Its precision (1, 2, 3 for FP4, FP8, BF16) and batch size ([ and ] or Z and X) set where it sits on the Pareto curve: bigger batches mean more total tok/s but fewer tok/s per user.',
        'Lower precision is faster and uses less counter space, but tips are smaller. A wok must be empty to be reconfigured.',
        'The counter is your memory. Weights plus every order\u2019s KV cache have to fit, or the shift goes out of memory and you lose a batch.',
        'Customers only wait so long for the first bite (TTFT). Heavy batches delay the start of each dish, so a wok that is too full makes people leave.',
        'The shaded target box on the Pareto panel is what the kitchen should hit. Time spent inside it earns stars.',
        'P or Esc pauses, M mutes. The Act and Dash buttons work with a mouse or a finger, and touch screens also get a stick. Calm mode in the banner slows everything down and removes flashes.',
      ],
      back: 'Back',
    },
    labels: {
      zones: ['Prep Station', 'Wok Line', 'Night Market', 'Rush Hour', 'Glendale Galleria'],
      time: 'Time',
      tips: 'Tips',
      reputation: 'Rep',
      combo: 'Combo',
      orders: 'orders',
      counter: 'Counter',
      userAxis: 'tok/s/user →',
      thrAxis: 'tok/s →',
      target: 'Target',
      audit: 'Audit',
      rush: 'LUNCH RUSH',
      rail: 'Order rail',
      fire: 'FIRE: hold E',
      pass: 'PASS',
      empty: 'Empty',
      hint: 'E: ticket → wok → shelf → pass. Watch the Pareto box.',
      wok: 'Wok',
      sous: 'Sous',
      inspector: 'Inspector',
      oil: 'Oil!',
      full: 'FULL',
      sizes: ['Bowl', 'Plate', 'Bigger Plate'],
      line: 'PANDA EXPRESS',
    },
    controls: {
      pause: 'Pause',
      resume: 'Resume',
      restart: 'Restart',
      quit: 'Back to menu',
      mute: 'Mute game sound',
      unmute: 'Unmute game sound',
      paused: 'Paused',
      leave: 'Esc again closes the kitchen and returns to the page.',
      dash: 'Dash',
      act: 'Act',
      stick: 'Movement stick',
      wokPanel: 'Wok controls',
      precision: 'Precision',
      batchDown: 'Smaller batch',
      batchUp: 'Bigger batch',
      calm: 'Calm mode',
      keys: 'WASD move · E act · Space dash · 1 2 3 precision · [ ] batch · P pause',
    },
    live: {
      pickup: 'Ticket taken.',
      load: 'Wok loaded.',
      serve: 'Order served, {tip} tips.',
      serveLate: 'Order served late, {tip} tips.',
      walkout: 'A customer walked out.',
      burn: 'A wok caught fire.',
      oom: 'Out of memory: the counter overflowed and a batch was lost.',
      extinguish: 'Fire out.',
      bump: 'You slipped.',
      steal: 'A pigeon took a dish.',
      shoo: 'Pigeon shooed away.',
      rushStart: 'Lunch rush: orders surge.',
      rushEnd: 'The rush is over.',
      auditStart:
        'Inspector audit {n}: hold at least {user} tok/s/user and {thr} tok/s for 12 of 20 seconds. A failed audit comes back.',
      auditPass: 'Audit passed.',
      auditFail: 'Audit failed.',
      ready: 'A dish is ready on the shelf.',
      refuse: 'That wok cannot take that right now.',
      first: 'First bite.',
    },
    results: {
      win: 'Shift cleared',
      lose: 'Shift failed',
      timeUp: 'Time is up',
      boxMet: 'Target box met for {n}% of the shift.',
      boxMissed: 'Target box not met: 0% of the shift inside it. Orders and tips still scored.',
      stars: 'Stars',
      served: 'Orders served',
      tips: 'Tips',
      ttft: 'Avg time to first bite',
      user: 'Avg tok/s/user',
      thr: 'Avg tok/s',
      ooms: 'Out-of-memory events',
      inBox: 'Time in the target box',
      walkouts: 'Walk-outs',
      audits: 'Audits passed',
      score: 'Score',
      newBest: 'New best',
      retry: 'Try again',
      next: 'Next act',
      menu: 'Menu',
      earned: 'Tips banked: {n}',
      trophy: 'Trophy earned: {name}',
      finale: 'The kitchen is yours.',
    },
  },
  zh: {
    title: '炒锅厨房',
    description:
      '一个关于吞吐量与交互性取舍的外卖厨房游戏。在厨房里走动，把订单放进炒锅，并让运行点保持在目标框内。',
    menu: {
      heading: '炒锅厨房',
      sub: '订单就是请求，炒锅就是 GPU。让厨房始终贴着帕累托前沿。',
      route: '路线',
      modes: {
        campaign: { name: '主线', desc: '五幕，每幕规则不同。通关一幕才能开启下一幕。' },
        endless: { name: '无尽班次', desc: '所有危险都在，高峰不断升级。声誉归零前能出多少单？' },
        sandbox: {
          name: '沙盒',
          desc: '自由调整到单速率、硬件与危险。订单仍可能离开，但声誉不会让班次结束。',
        },
        challenge: { name: '帕累托冲刺', desc: '两分钟。目标框会沿着前沿移动，待在框里。' },
      },
      acts: [
        { name: '备菜台', brief: '一口锅，只能用 FP8。学会流程：小票、炒锅、出餐架、传菜口。' },
        { name: '炒锅线', brief: '三口锅、三种精度，还有油渍和起火。在曲线上选一个点。' },
        { name: '夜市', brief: '风、鸽子和会移动的传菜口。台面很小，注意 KV 缓存。' },
        { name: '高峰时段', brief: '四口锅加卫生检查员。在三个不同目标下通过三次检查。' },
        {
          name: '格伦代尔购物中心',
          brief: '1983 年的美食广场：三口锅、商场穿堂风、鸽子和检查员。第一次检查来得很早。',
        },
      ],
      locked: '通关上一幕后开启。',
      best: '最佳',
      loadout: '初始配置',
      precision: '精度',
      batch: '批量',
      preview: '前沿预览',
      previewLine: '{prec}，批量 {batch}：每用户 {user} tok/s，每口锅 {thr} tok/s',
      previewForced: '本幕只允许 {prec}。',
      shop: '储藏室升级',
      wallet: '小费：{n}',
      buy: '购买 {cost}',
      maxed: '已满级',
      level: '等级 {n}',
      upgrades: {
        stove: { name: '更好的灶台', desc: '每一步少花 8% 时间：整条前沿向外推。' },
        counter: { name: '大盘装', desc: '为权重和 KV 缓存增加 10 点台面空间。' },
        shoes: { name: '防滑鞋', desc: '走得更快，踩油时更不容易失控。' },
        hands: { name: '多一双手', desc: '多拿一张小票或一份菜。' },
        sous: { name: '副厨', desc: '雇一位帮手，自动跑小票和传菜。' },
      },
      start: '开始班次',
      howto: '玩法说明',
      close: '关闭',
      sandbox: {
        title: '沙盒参数',
        arrival: '到单速率',
        hw: '硬件速度',
        oil: '油渍',
        pigeons: '鸽子',
        fire: '起火',
        wind: '风',
      },
      zoneLimits: '{woks} 口锅，批量最大 {batch}，{prec}',
    },
    howto: {
      title: '玩法说明',
      items: [
        '用 WASD 或方向键行走，也可以点击地面。空格或 Shift 冲刺。',
        'E、回车或 J 执行最近的动作：从订单架取小票、把小票放进炒锅、从出餐架取菜，或在传菜口交菜。在着火的锅旁按住 E 灭火。',
        '每口锅就是一块 GPU。精度（1、2、3 对应 FP4、FP8、BF16）和批量（[ ] 或 Z、X）决定它在帕累托曲线上的位置：批量越大总 tok/s 越高，但每用户 tok/s 越低。',
        '精度越低越快、占台面越少，但小费也越少。锅必须是空的才能重新配置。',
        '台面就是显存。权重加上每个订单的 KV 缓存必须放得下，否则会爆显存，丢掉一整批。',
        '顾客等待首口的时间（TTFT）有限。批量太大会拖慢每道菜的开始，锅太满顾客就会走掉。',
        '帕累托面板上的阴影目标框就是厨房该达到的位置。待在框内的时间会换来星星。',
        'P 或 Esc 暂停，M 静音。“操作”和“冲刺”按钮可用鼠标或手指点按，触屏另有摇杆。横幅中的平静模式会减慢节奏并去掉闪光。',
      ],
      back: '返回',
    },
    labels: {
      zones: ['备菜台', '炒锅线', '夜市', '高峰时段', '格伦代尔购物中心'],
      time: '时间',
      tips: '小费',
      reputation: '声誉',
      combo: '连击',
      orders: '单',
      counter: '台面',
      userAxis: '每用户 tok/s →',
      thrAxis: 'tok/s →',
      target: '目标',
      audit: '检查',
      rush: '午市高峰',
      rail: '订单架',
      fire: '着火：按住 E',
      pass: '传菜口',
      empty: '空',
      hint: 'E：小票 → 炒锅 → 出餐架 → 传菜口。留意帕累托框。',
      wok: '锅',
      sous: '副厨',
      inspector: '检查员',
      oil: '油！',
      full: '已满',
      sizes: ['小份', '双拼', '大份'],
      line: '熊猫快餐',
    },
    controls: {
      pause: '暂停',
      resume: '继续',
      restart: '重新开始',
      quit: '回到菜单',
      mute: '静音游戏声音',
      unmute: '取消静音',
      paused: '已暂停',
      leave: '再按一次 Esc 关闭厨房，回到页面。',
      dash: '冲刺',
      act: '操作',
      stick: '移动摇杆',
      wokPanel: '炒锅控制',
      precision: '精度',
      batchDown: '减小批量',
      batchUp: '增大批量',
      calm: '平静模式',
      keys: 'WASD 移动 · E 操作 · 空格冲刺 · 1 2 3 精度 · [ ] 批量 · P 暂停',
    },
    live: {
      pickup: '已取小票。',
      load: '炒锅已装入。',
      serve: '订单送出，小费 {tip}。',
      serveLate: '订单送晚了，小费 {tip}。',
      walkout: '有顾客走了。',
      burn: '炒锅起火了。',
      oom: '显存溢出：台面爆了，丢掉一批。',
      extinguish: '火灭了。',
      bump: '你滑倒了。',
      steal: '鸽子叼走了一道菜。',
      shoo: '鸽子被赶走了。',
      rushStart: '午市高峰：订单激增。',
      rushEnd: '高峰结束。',
      auditStart:
        '检查员第 {n} 次检查：20 秒内至少有 12 秒保持 {user} tok/s/用户 和 {thr} tok/s。未通过会再来一次。',
      auditPass: '检查通过。',
      auditFail: '检查未通过。',
      ready: '出餐架上有菜了。',
      refuse: '这口锅现在不能这样操作。',
      first: '第一口。',
    },
    results: {
      win: '班次完成',
      lose: '班次失败',
      timeUp: '时间到',
      boxMet: '目标框达成：班次中 {n}% 的时间在框内。',
      boxMissed: '目标框未达成：框内时间为 0%。订单与小费仍计分。',
      stars: '星级',
      served: '送出订单',
      tips: '小费',
      ttft: '平均首口时间',
      user: '平均每用户 tok/s',
      thr: '平均 tok/s',
      ooms: '爆显存次数',
      inBox: '待在目标框内的时间',
      walkouts: '顾客走掉',
      audits: '通过检查',
      score: '得分',
      newBest: '新纪录',
      retry: '再来一次',
      next: '下一幕',
      menu: '菜单',
      earned: '存入小费：{n}',
      trophy: '获得奖杯：{name}',
      finale: '这间厨房归你了。',
    },
  },
};
