import type { Metadata } from 'next';

import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { buildCanonicalHref } from '@/lib/embed-params';
import type { UrlStateParams } from '@/lib/url-state';

import EmbedScatterClient from './embed-scatter-client';

export const metadata: Metadata = {
  title: 'InferenceX — Embedded Chart',
  robots: { index: false, follow: false },
};

export default async function EmbedScatterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const flat: UrlStateParams & { i_chart?: string } = {};
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val !== undefined) {
      (flat as Record<string, string>)[k] = val;
    }
  }
  const canonicalHref = buildCanonicalHref(flat, SITE_URL);
  return <EmbedScatterClient params={flat} canonicalHref={canonicalHref} />;
}
