import type { Metadata } from 'next';

import CacheReuseDisplay from '@/components/calculator/CacheReuseDisplay';
import { resolveCalculatorUrlSeed } from '@/components/calculator/url-seed';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('cache-reuse');

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ZhCacheReusePage({ searchParams }: Props) {
  const sp = await searchParams;
  const seed = resolveCalculatorUrlSeed(sp);
  return (
    <>
      <ZhTabIntro tab="cache-reuse" />
      <CacheReuseDisplay urlSeed={seed} />
    </>
  );
}
