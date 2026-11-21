'use client';

import { useSyncExternalStore } from 'react';

/**
 * Layout experiments for the SemiAnalysis theme. Each variant restructures the page chrome
 * differently; `?layout=<id>` picks one and remembers it, so a single preview can compare them.
 */
export const SA_LAYOUTS = [
  'keynote',
  'split',
  'zine',
  'billboard',
  'bento',
  'metro',
  'terminal',
  'newspaper',
  'dock',
] as const;
export type SaLayout = (typeof SA_LAYOUTS)[number];
export const DEFAULT_SA_LAYOUT: SaLayout = 'keynote';
const STORAGE_KEY = 'inferencex-sa-layout';

export const SA_LAYOUT_LABELS: Record<SaLayout, { en: string; zh: string }> = {
  keynote: { en: 'Keynote', zh: '演示' },
  split: { en: 'Split', zh: '分屏' },
  zine: { en: 'Zine', zh: '拼贴' },
  billboard: { en: 'Billboard', zh: '广告牌' },
  bento: { en: 'Bento', zh: '便当' },
  metro: { en: 'Metro', zh: '地铁' },
  terminal: { en: 'Terminal', zh: '终端' },
  newspaper: { en: 'Newspaper', zh: '报纸' },
  dock: { en: 'Dock', zh: '程序坞' },
};

/** Runs before paint so the chosen layout never flashes the default one. */
export const saLayoutPrepaintScript = `(()=>{var l=${JSON.stringify(SA_LAYOUTS)},d=${JSON.stringify(DEFAULT_SA_LAYOUT)},k=${JSON.stringify(STORAGE_KEY)},v=d;try{var q=new URLSearchParams(location.search).get('layout'),s=localStorage.getItem(k);if(q&&l.indexOf(q)>=0){localStorage.setItem(k,q);s=q}if(s&&l.indexOf(s)>=0)v=s}catch(e){}document.documentElement.dataset.saLayout=v})()`;

export function isSaLayout(value: unknown): value is SaLayout {
  return typeof value === 'string' && (SA_LAYOUTS as readonly string[]).includes(value);
}

function snapshot(): SaLayout {
  const value = document.documentElement.dataset.saLayout;
  return isSaLayout(value) ? value : DEFAULT_SA_LAYOUT;
}

function subscribe(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-sa-layout'],
  });
  return () => observer.disconnect();
}

export function useSaLayout(): SaLayout {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_SA_LAYOUT);
}

export function setSaLayout(layout: SaLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, layout);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  document.documentElement.dataset.saLayout = layout;
}
