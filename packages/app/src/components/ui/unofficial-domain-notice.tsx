'use client';

import { useEffect, useState } from 'react';

import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { useLocale } from '@/lib/use-locale';

const OFFICIAL_HOSTNAME = new URL(SITE_URL).hostname;

const STRINGS = {
  en: {
    note: 'Note:',
    text: 'and is not affiliated with or endorsed by SemiAnalysis. Data shown here may be unofficial, modified, or out of date — visit the official site for authoritative InferenceX™ results.',
    notHosted: 'This deployment is not hosted at',
  },
  zh: {
    note: '注意：',
    text: '与 SemiAnalysis 无关联或背书。此处显示的数据可能为非官方、已修改或过期数据——请访问官方网站获取权威的 InferenceX™ 结果。',
    notHosted: '此部署未托管在',
  },
} as const;

export function UnofficialDomainNotice() {
  const [isUnofficial, setIsUnofficial] = useState(false);
  const t = STRINGS[useLocale()];

  useEffect(() => {
    setIsUnofficial(window.location.hostname !== OFFICIAL_HOSTNAME);
  }, []);

  if (!isUnofficial) return null;

  return (
    <p className="text-muted-foreground text-xs mt-2 border-l-2 border-amber-500 pl-2 bg-amber-500/5 py-1">
      <strong>{t.note}</strong> {t.notHosted}{' '}
      <a
        href={SITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-foreground"
      >
        {OFFICIAL_HOSTNAME}
      </a>{' '}
      {t.text}
    </p>
  );
}
