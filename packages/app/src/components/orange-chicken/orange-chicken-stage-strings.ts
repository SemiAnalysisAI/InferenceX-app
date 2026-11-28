/** Lines for the banner's serving line: the pans, Pei Pei and the Panda Cares register. */
export type DishId =
  | 'orange'
  | 'beijing'
  | 'broccoli'
  | 'shrimp'
  | 'kungpao'
  | 'teriyaki'
  | 'chow'
  | 'rice'
  | 'greens';

export type DishKind = 'chicken' | 'beef' | 'shrimp' | 'side' | 'veg';

export const DISHES: readonly { id: DishId; kind: DishKind }[] = [
  { id: 'chow', kind: 'side' },
  { id: 'rice', kind: 'side' },
  { id: 'orange', kind: 'chicken' },
  { id: 'beijing', kind: 'beef' },
  { id: 'broccoli', kind: 'beef' },
  { id: 'shrimp', kind: 'shrimp' },
  { id: 'kungpao', kind: 'chicken' },
  { id: 'teriyaki', kind: 'chicken' },
  { id: 'greens', kind: 'veg' },
];

export const STAGE = {
  en: {
    label: 'The serving line',
    sign: 'Chinese Kitchen',
    line: 'Walk the line and point',
    kinds: {
      chicken: 'Chicken',
      beef: 'Beef',
      shrimp: 'Shrimp',
      side: 'Side',
      veg: 'Veggie',
    } satisfies Record<DishKind, string>,
    names: {
      orange: 'The Original Orange Chicken',
      beijing: 'Beijing Beef',
      broccoli: 'Broccoli Beef',
      shrimp: 'Honey Walnut Shrimp',
      kungpao: 'Kung Pao Chicken',
      teriyaki: 'Grilled Teriyaki Chicken',
      chow: 'Chow Mein',
      rice: 'Fried Rice',
      greens: 'Super Greens',
    } satisfies Record<DishId, string>,
    short: {
      orange: 'Orange Chicken',
      beijing: 'Beijing Beef',
      broccoli: 'Broccoli Beef',
      shrimp: 'Honey Walnut Shrimp',
      kungpao: 'Kung Pao Chicken',
      teriyaki: 'Teriyaki Chicken',
      chow: 'Chow Mein',
      rice: 'Fried Rice',
      greens: 'Super Greens',
    } satisfies Record<DishId, string>,
    scoop: '{name}: one scoop, one request. The pan is the KV cache, at {level}%.',
    empty: 'The pan is empty. A fresh pan arrives from the wok: the cache is refilled.',
    fresh: 'A fresh pan of {name} is on the line.',
    pei: 'Pei Pei, the panda. Click to say hello.',
    peiLines: [
      'Sharing good fortune and giving: that is how Pei Pei greets the line.',
      'In person you watch the scoop. Online you get the claim. A benchmark should show the scoop.',
      'Family Meal: one batch, enough entrées for the whole table.',
      'No best, only better. Orange Chicken is about a third of every entrée sold.',
    ],
    bell: 'Round up for Panda Cares',
    bellShort: 'Round up',
    bellAsk: 'Would you like to round up for Panda Cares?',
    chit: ['Order chit 1 of 3: pin a dish on a chart', 'Chit 2 of 3: take it to About'] as const,
    bellThanks: 'Thank you. The bell rings at the register for every round-up ({n} so far).',
  },
  zh: {
    label: '出餐线',
    sign: '中式厨房',
    line: '沿着餐线，指一指',
    kinds: {
      chicken: '鸡肉',
      beef: '牛肉',
      shrimp: '虾',
      side: '配菜',
      veg: '蔬菜',
    } satisfies Record<DishKind, string>,
    names: {
      orange: '原味陈皮鸡',
      beijing: '北京牛肉',
      broccoli: '西兰花牛肉',
      shrimp: '蜜糖核桃虾',
      kungpao: '宫保鸡丁',
      teriyaki: '烤照烧鸡',
      chow: '炒面',
      rice: '炒饭',
      greens: '超级青菜',
    } satisfies Record<DishId, string>,
    short: {
      orange: '陈皮鸡',
      beijing: '北京牛肉',
      broccoli: '西兰花牛肉',
      shrimp: '核桃虾',
      kungpao: '宫保鸡丁',
      teriyaki: '照烧鸡',
      chow: '炒面',
      rice: '炒饭',
      greens: '青菜',
    } satisfies Record<DishId, string>,
    scoop: '{name}：一勺，一个请求。餐盘就是 KV 缓存，剩 {level}%。',
    empty: '餐盘空了。新的一盘从锅里端来：缓存已重新装满。',
    fresh: '新的一盘{name}已上线。',
    pei: 'Pei Pei，熊猫。点一下打个招呼。',
    peiLines: [
      '分享好运，乐于给予：Pei Pei 这样迎接餐线。',
      '当面能看到那一勺，线上只有说法。基准测试应该让人看到那一勺。',
      '家庭套餐：一个批次，够全桌人吃。',
      '没有最好，只有更好。陈皮鸡约占每份主菜的三分之一。',
    ],
    bell: '为熊猫关爱凑整',
    bellShort: '凑整捐款',
    bellAsk: '要为熊猫关爱凑整捐款吗？',
    chit: ['订单小票 1/3：在图表上钉住一个点', '小票 2/3：拿去关于页'] as const,
    bellThanks: '谢谢。每次凑整收银台都会响铃（目前 {n} 次）。',
  },
} as const;
