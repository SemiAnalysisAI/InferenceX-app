import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import ThroughputCalculatorDisplay from '@/components/calculator/ThroughputCalculatorDisplay';
import { MODEL_ROUTES, modelRoutePath, resolveModelRouteSlug } from '@/lib/routing/model-routes';
import { MODEL_TAB_META, modelTabMetadata } from '@/lib/routing/tab-meta';
import { TabIntro } from '@/components/dashboard/tab-intro';

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
  return modelTabMetadata('calculator', resolved.route);
}

export default async function CalculatorModelPage({ params }: Props) {
  const { model } = await params;
  const resolved = resolveModelRouteSlug(model);
  if (!resolved) notFound();
  if (resolved.isAlias) {
    permanentRedirect(modelRoutePath('calculator', resolved.route.slug));
  }
  return (
    <>
      <ThroughputCalculatorDisplay routeModel={resolved.route.model} />
      <TabIntro
        tab="calculator"
        title={MODEL_TAB_META.calculator.title(resolved.route.seoName)}
        intro={MODEL_TAB_META.calculator.intro(resolved.route.seoName)}
      />
    </>
  );
}
