import type { Metadata } from 'next';

import FleetLifecycleDisplay from '@/components/calculator/FleetLifecycleDisplay';
import { resolveCalculatorUrlSeed } from '@/components/calculator/url-seed';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { tabMetadataZh } from '@/lib/tab-meta-zh';

export const metadata: Metadata = tabMetadataZh('fleet');

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ZhFleetPage({ searchParams }: Props) {
  const sp = await searchParams;
  const seed = resolveCalculatorUrlSeed(sp);
  return (
    <>
      <ZhTabIntro tab="fleet" />
      <FleetLifecycleDisplay urlSeed={seed} />
    </>
  );
}
