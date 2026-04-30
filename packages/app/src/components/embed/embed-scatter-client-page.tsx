'use client';

import { useEffect, useState } from 'react';

import { EmbedScatterView } from '@/components/embed/embed-scatter-view';

export function EmbedScatterClientPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return <EmbedScatterView />;
}
