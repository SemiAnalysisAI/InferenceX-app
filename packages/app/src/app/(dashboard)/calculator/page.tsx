import type { Metadata } from 'next';

import ThroughputCalculatorDisplay from '@/components/calculator/ThroughputCalculatorDisplay';
import { resolveCalculatorUrlSeed } from '@/components/calculator/url-seed';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata: Metadata = tabMetadata('calculator');

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CalculatorPage({ searchParams }: Props) {
  const sp = await searchParams;
  const seed = resolveCalculatorUrlSeed(sp);
  return <ThroughputCalculatorDisplay urlSeed={seed} />;
}
