'use client';

import { useEffect, useState } from 'react';

import { SITE_URL } from '@semianalysisai/inferencex-constants';

const OFFICIAL_HOSTNAME = new URL(SITE_URL).hostname;

export function UnofficialDomainNotice() {
  const [isUnofficial, setIsUnofficial] = useState(false);

  useEffect(() => {
    setIsUnofficial(window.location.hostname !== OFFICIAL_HOSTNAME);
  }, []);

  if (!isUnofficial) return null;

  return (
    <p className="text-muted-foreground text-xs mt-2 border-l-2 border-amber-500 pl-2 bg-amber-500/5 py-1">
      <strong>Note:</strong> This deployment is not hosted at{' '}
      <a
        href={SITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-foreground"
      >
        {OFFICIAL_HOSTNAME}
      </a>{' '}
      and is not affiliated with or endorsed by SemiAnalysis. Data shown here may be unofficial,
      modified, or out of date — visit the official site for authoritative InferenceX™ results.
    </p>
  );
}
