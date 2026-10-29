import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { InferencePageIntro } from '@/components/inference/inference-page-intro';
import { zhAlternates, zhPath } from '@/lib/i18n/i18n';
import { inferenceModelMetaZh } from '@/lib/routing/inference-model-meta';
import {
  getInferenceModelBySlug,
  INFERENCE_MODEL_SLUGS,
  inferenceModelPath,
} from '@/lib/routing/inference-model-slug';
import { socialMetadata } from '@/lib/seo/social-metadata';

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
  const { title, description } = inferenceModelMetaZh(entry);
  const enPath = inferenceModelPath(entry.slug);
  const url = `${SITE_URL}${zhPath(enPath)}`;
  return {
    title: { absolute: `${title} | ${SITE_NAME}` },
    description,
    alternates: zhAlternates(enPath),
    ...socialMetadata({ title: `${title} | ${SITE_NAME}`, description, url, locale: 'zh' }),
  };
}

export default async function ZhInferenceModelPage({ params }: Props) {
  const { model } = await params;
  const entry = getInferenceModelBySlug(model);
  if (!entry) notFound();
  return (
    <>
      <InferencePageIntro locale="zh" />
      <InferenceProvider activeTab="inference">
        <InferenceChartDisplay />
      </InferenceProvider>
    </>
  );
}
