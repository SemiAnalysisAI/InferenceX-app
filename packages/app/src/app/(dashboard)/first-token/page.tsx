import type { Metadata } from 'next';

import FirstTokenLimitsDisplay from '@/components/calculator/FirstTokenLimitsDisplay';
import { resolveCalculatorUrlSeed } from '@/components/calculator/url-seed';
import { tabMetadata } from '@/lib/tab-meta';

export const metadata: Metadata = tabMetadata('first-token');

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FirstTokenPage({ searchParams }: Props) {
  const sp = await searchParams;
  const seed = resolveCalculatorUrlSeed(sp);
  return <FirstTokenLimitsDisplay urlSeed={seed} />;
}
