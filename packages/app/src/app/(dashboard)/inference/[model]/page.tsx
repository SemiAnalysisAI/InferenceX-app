import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { enAlternates } from '@/lib/i18n';
import { inferenceModelMeta } from '@/lib/inference-model-meta';
import {
  getInferenceModelBySlug,
  INFERENCE_MODEL_SLUGS,
  inferenceModelPath,
} from '@/lib/inference-model-slug';

/**
 * `/inference/<model>` — an indexable path form of `/inference?g_model=<model>`.
 *
 * The query form stays supported for share links, but this page gives every
 * model its own crawlable URL with model-specific metadata, a self-canonical,
 * and a `/zh` hreflang sibling. The chart body is identical to `/inference`;
 * the model is pinned from the pathname by the dashboard shell
 * (`GlobalFilterProvider` seeding via `inferenceModelForPathname`), and an
 * explicit `?g_model=` param still wins over the path pin.
 */

interface Props {
  params: Promise<{ model: string }>;
}

export function generateStaticParams(): { model: string }[] {
  return INFERENCE_MODEL_SLUGS.map((entry) => ({ model: entry.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { model } = await params;
  const entry = getInferenceModelBySlug(model);
  if (!entry) return {};
  const { title, description } = inferenceModelMeta(entry);
  const enPath = inferenceModelPath(entry.slug);
  const url = `${SITE_URL}${enPath}`;
  return {
    title: { absolute: `${title} | ${SITE_NAME} by ${AUTHOR_NAME}` },
    description,
    alternates: enAlternates(enPath),
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${SITE_NAME}`,
      description,
    },
  };
}

export default async function InferenceModelPage({ params }: Props) {
  const { model } = await params;
  const entry = getInferenceModelBySlug(model);
  if (!entry) notFound();
  // Aliases (family names, superseded versions, raw `g_model` display names,
  // uppercase variants) collapse onto the one canonical URL per model.
  if (model !== entry.slug) permanentRedirect(inferenceModelPath(entry.slug));
  return (
    <InferenceProvider activeTab="inference">
      <InferenceChartDisplay />
    </InferenceProvider>
  );
}
