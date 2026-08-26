import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

import { InferenceProvider } from '@/components/inference/InferenceContext';
import InferenceChartDisplay from '@/components/inference/ui/ChartDisplay';
import { ZhTabIntro } from '@/components/zh/zh-tab-intro';
import { ZH_OG_LOCALE, zhAlternates, zhPath } from '@/lib/i18n';
import { inferenceModelMetaZh } from '@/lib/inference-model-meta';
import {
  getInferenceModelBySlug,
  INFERENCE_MODEL_SLUGS,
  inferenceModelPath,
} from '@/lib/inference-model-slug';

/**
 * `/zh/inference/<model>` — Chinese sibling of `/inference/<model>`. Same
 * pinned-model chart body; metadata and intro copy are Simplified Chinese.
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
  const { title, description } = inferenceModelMetaZh(entry);
  const enPath = inferenceModelPath(entry.slug);
  const url = `${SITE_URL}${zhPath(enPath)}`;
  return {
    title: { absolute: `${title} | ${SITE_NAME} by ${AUTHOR_NAME}` },
    description,
    alternates: zhAlternates(enPath),
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      type: 'website',
      locale: ZH_OG_LOCALE,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${SITE_NAME}`,
      description,
    },
  };
}

export default async function ZhInferenceModelPage({ params }: Props) {
  const { model } = await params;
  const entry = getInferenceModelBySlug(model);
  if (!entry) notFound();
  if (model !== entry.slug) permanentRedirect(zhPath(inferenceModelPath(entry.slug)));
  return (
    <>
      <ZhTabIntro tab="inference" />
      <InferenceProvider activeTab="inference">
        <InferenceChartDisplay />
      </InferenceProvider>
    </>
  );
}
