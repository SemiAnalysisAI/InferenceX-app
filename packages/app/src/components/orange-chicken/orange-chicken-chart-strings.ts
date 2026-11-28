import type { ChartWords } from './orange-chicken-charts';
import type { Locale } from './orange-chicken-strings';

/** Wording drawn into the chart cards: the legend's menu key and the receipt around a PNG export. */
export const CHART_WORDS: Record<Locale, ChartWords> = {
  en: {
    keyTitle: 'Menu key: precision order',
    keyItems: ['1st: plate', '2nd: pail', '3rd: cookie', '4th: bowl'],
    receiptTitle: 'Panda Express Chinese Kitchen',
    receiptOrder: 'Order',
    receiptThanks: 'thank you · 谢谢惠顾 · come again',
    receiptStamp: 'Order up',
  },
  zh: {
    keyTitle: '菜单图例：精度顺序',
    keyItems: ['第 1：餐盘', '第 2：外卖盒', '第 3：饼干', '第 4：面碗'],
    receiptTitle: '熊猫快餐 中式厨房',
    receiptOrder: '订单',
    receiptThanks: '谢谢惠顾 · thank you · 欢迎再来',
    receiptStamp: '出餐啦',
  },
};

/** Captions shown with a line when a chart event fires it. */
export const CHART_EVENTS: Record<'empty' | 'export' | 'leader', { en: string; zh: string }> = {
  empty: {
    en: 'Sold out: no orders match these filters. Clear one and the line refills.',
    zh: '已售罄：没有符合筛选的订单。清除一个条件，餐线就会补满。',
  },
  export: {
    en: 'The chart left the counter as a receipt, every point still on it.',
    zh: '图表已打包成小票带走，每个点都还在上面。',
  },
  leader: {
    en: '{name} now leads this chart.',
    zh: '{name} 现在领先。',
  },
};
