import { ImageResponse } from 'next/og';

import { renderOgImage, size } from '@/app/blog/[slug]/og-image-render';
import { getModelPage, getModelPageSlugs } from '@/lib/model-pages';

export const alt = 'InferenceX Model Architecture Deep-Dive';
export { size };
export const contentType = 'image/png';

export function generateStaticParams() {
  return getModelPageSlugs().map((slug) => ({ slug }));
}

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getModelPage(slug);

  if (!page) {
    return new ImageResponse(
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          backgroundColor: '#18181b',
          color: '#fafafa',
          fontSize: 48,
        }}
      >
        InferenceX
      </div>,
      size,
    );
  }

  return renderOgImage(
    {
      title: `${page.meta.title} — Architecture & Evals`,
      subtitle: page.meta.description,
      date: '',
    },
    // releaseDate is free-form text (may hold multiple versions), so it is
    // passed through verbatim instead of being date-formatted.
    { dateLabel: `${page.meta.developer} · ${page.meta.releaseDate}` },
  );
}
