import type { Locale } from './orange-chicken-strings';

/** Labels for the banner's drawer and its short buttons. */
export const BANNER: Record<
  Locale,
  {
    more: string;
    walk: string;
    closeMore: string;
    line: string;
    morePanel: string;
    story: string;
    motto: string;
  }
> = {
  en: {
    more: 'Menu & more',
    walk: 'Walk the line',
    closeMore: 'Close',
    line: 'Serving line',
    morePanel: 'Menu, palettes and sound',
    story: 'Panda Express, from 1973',
    motto: 'Family Meal feeds the whole table. No best, only better.',
  },
  zh: {
    more: '菜单与更多',
    walk: '走过餐线',
    closeMore: '收起',
    line: '出餐线',
    morePanel: '菜单、配色与声音',
    story: '熊猫快餐，始于 1973',
    motto: '家庭套餐，一桌共享。没有最好，只有更好。',
  },
};
