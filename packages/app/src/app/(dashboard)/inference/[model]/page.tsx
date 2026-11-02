import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { InferencePageIntro } from '@/components/inference/inference-page-intro';
import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { enAlternates } from '@/lib/i18n/i18n';
import { inferenceModelMeta } from '@/lib/routing/inference-model-meta';
import {
  getInferenceModelBySlug,
  PUBLIC_INFERENCE_MODEL_SLUGS,
  inferenceModelPath,
} from '@/lib/routing/inference-model-slug';
import { socialMetadata } from '@/lib/seo/social-metadata';

interface Props {
  params: Promise<{ model: string }>;
}

export function generateStaticParams(): { model: string }[] {
  return PUBLIC_INFERENCE_MODEL_SLUGS.map((entry) => ({ model: entry.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { model } = await params;
  const entry = getInferenceModelBySlug(model);
  if (!entry) return {};
  const { title, description } = inferenceModelMeta(entry);
  const enPath = inferenceModelPath(entry.slug);
  const url = `${SITE_URL}${enPath}`;
  return {
    title: { absolute: `${title} | ${SITE_NAME}` },
    description,
    alternates: enAlternates(enPath),
    ...socialMetadata({ title: `${title} | ${SITE_NAME}`, description, url, locale: 'en' }),
  };
}

export default async function InferenceModelPage({ params }: Props) {
  const { model } = await params;
  const entry = getInferenceModelBySlug(model);
  if (!entry) notFound();
  return (
    <>
      <InferencePageIntro locale="en" />
      <InferenceProvider activeTab="inference">
        <InferenceChartDisplay centerOnEnter />
      </InferenceProvider>
    </>
  );
}
