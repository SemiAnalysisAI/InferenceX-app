import type { Metadata } from 'next';

import CacheReuseDisplay from '@/components/calculator/CacheReuseDisplay';
import { resolveCalculatorUrlSeed } from '@/components/calculator/url-seed';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata: Metadata = tabMetadata('cache-reuse');

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CacheReusePage({ searchParams }: Props) {
  const sp = await searchParams;
  const seed = resolveCalculatorUrlSeed(sp);
  return <CacheReuseDisplay urlSeed={seed} />;
}
