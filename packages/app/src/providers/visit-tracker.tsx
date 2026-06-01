'use client';

import { useEffect } from 'react';

import { recordVisitIfNew } from '@/lib/visit-tracking';

export function VisitTracker() {
  useEffect(() => {
    recordVisitIfNew();
  }, []);
  return null;
}
