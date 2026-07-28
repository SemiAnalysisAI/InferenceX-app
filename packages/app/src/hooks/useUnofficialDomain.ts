'use client';

import { useEffect, useState } from 'react';

import { isUnofficialHostname } from '@/lib/unofficial-domain';

export function useUnofficialDomain(): boolean {
  const [isUnofficial, setIsUnofficial] = useState(false);

  useEffect(() => {
    setIsUnofficial(isUnofficialHostname(window.location.hostname));
  }, []);

  return isUnofficial;
}
