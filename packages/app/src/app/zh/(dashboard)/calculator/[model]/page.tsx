import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { LazyThroughputCalculatorDisplay } from '@/components/calculator/lazy-calculator-displays';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { MODEL_ROUTES, modelRoutePath, resolveModelRouteSlug } from '@/lib/routing/model-routes';
import { modelTabCanonicalPath } from '@/lib/routing/tab-meta';
import { MODEL_TAB_META_ZH, modelTabMetadataZh } from '@/lib/routing/tab-meta-zh';

interface Props {
  params: Promise<{ model: string }>;
}

export function generateStaticParams() {
  return MODEL_ROUTES.map((route) => ({ model: route.slug }));
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

export default async function ZhCalculatorModelPage({ params }: Props) {
  const { model } = await params;
  const resolved = resolveModelRouteSlug(model);
  if (!resolved) notFound();
  if (resolved.isAlias) {
    permanentRedirect(`/zh${modelRoutePath('calculator', resolved.route.slug)}`);
  }
  const meta = MODEL_TAB_META_ZH.calculator;
  return (
    <>
      <LazyThroughputCalculatorDisplay routeModel={resolved.route.model} />
      <ZhTabIntro
        tab="calculator"
        title={meta.title(resolved.route.seoName)}
        intro={meta.intro(resolved.route.seoName)}
      />
    </>
  );
}
