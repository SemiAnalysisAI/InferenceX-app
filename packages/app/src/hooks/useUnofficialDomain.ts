'use client';

import { useEffect, useState } from 'react';

import { isUnofficialHostname } from '@/lib/unofficial-domain';

export function useUnofficialDomain(): boolean | null {
  const [isUnofficial, setIsUnofficial] = useState<boolean | null>(null);

  useEffect(() => {
    setIsUnofficial(isUnofficialHostname(window.location.hostname));
  }, []);

  return isUnofficial;
}
