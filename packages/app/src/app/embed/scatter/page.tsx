import type { Metadata } from 'next';

import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { buildCanonicalHref, readEmbedParams } from '@/lib/embed-params';

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
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) {
    flat[k] = Array.isArray(v) ? v[0] : v;
  }
  const params = readEmbedParams(flat);
  const canonicalHref = buildCanonicalHref(params, SITE_URL);
  return <EmbedScatterClient params={params} canonicalHref={canonicalHref} />;
}
