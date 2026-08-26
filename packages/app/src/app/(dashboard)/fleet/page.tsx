import type { Metadata } from 'next';

import FleetLifecycleDisplay from '@/components/calculator/FleetLifecycleDisplay';
import { resolveCalculatorUrlSeed } from '@/components/calculator/url-seed';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata: Metadata = tabMetadata('fleet');

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FleetPage({ searchParams }: Props) {
  const sp = await searchParams;
  const seed = resolveCalculatorUrlSeed(sp);
  return <FleetLifecycleDisplay urlSeed={seed} />;
}
