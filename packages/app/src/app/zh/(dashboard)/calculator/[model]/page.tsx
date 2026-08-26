import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import ThroughputCalculatorDisplay from '@/components/calculator/ThroughputCalculatorDisplay';
import { resolveCalculatorUrlSeed } from '@/components/calculator/url-seed';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { modelRoutePath, pathWithSearchParams, resolveModelRouteSlug } from '@/lib/model-routes';
import { modelTabCanonicalPath } from '@/lib/tab-meta';
import { MODEL_TAB_META_ZH, modelTabMetadataZh } from '@/lib/tab-meta-zh';

/** Chinese sibling of `/calculator/<model>` (see that page for the routing
 *  and client-side model-switch behavior). */

interface Props {
  params: Promise<{ model: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { model } = await params;
  const resolved = resolveModelRouteSlug(model);
  if (!resolved) return {};
  return modelTabMetadataZh(
    'calculator',
    resolved.route,
    modelTabCanonicalPath('calculator', resolved.route),
  );
}

export default async function ZhCalculatorModelPage({ params, searchParams }: Props) {
  const [{ model }, sp] = await Promise.all([params, searchParams]);
  const resolved = resolveModelRouteSlug(model);
  if (!resolved) notFound();
  // Keep share-link params through the 308.
  if (resolved.isAlias) {
    permanentRedirect(
      pathWithSearchParams(`/zh${modelRoutePath('calculator', resolved.route.slug)}`, sp),
    );
  }
  const seed = resolveCalculatorUrlSeed(sp);
  const meta = MODEL_TAB_META_ZH.calculator;
  return (
    <>
      <ZhTabIntro
        tab="calculator"
        title={meta.title(resolved.route.seoName)}
        intro={meta.intro(resolved.route.seoName)}
      />
      <ThroughputCalculatorDisplay
        urlSeed={{ ...seed, model: seed.model ?? resolved.route.model }}
      />
    </>
  );
}
