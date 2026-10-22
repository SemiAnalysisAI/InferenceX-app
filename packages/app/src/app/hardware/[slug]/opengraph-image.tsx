import { ImageResponse } from 'next/og';

import { renderOgImage, size } from '@/app/blog/[slug]/og-image-render';
import { formatBlogDate } from '@/lib/blog/blog';
import { getAllHardwarePages, getHardwarePageBySlug } from '@/lib/hardware/hardware';
import { HARDWARE_COPY } from '@/lib/hardware/hardware-copy';

export const alt = 'InferenceX Hardware Results';
export { size };
export const contentType = 'image/png';

export function generateStaticParams() {
  return getAllHardwarePages().map((page) => ({ slug: page.slug }));
}

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getHardwarePageBySlug(slug);

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
          fontWeight: 700,
        }}
      >
        InferenceX Hardware Results
      </div>,
      size,
    );
  }

  const { title, seoDescription, date } = page.meta;
  return renderOgImage(
    { title, subtitle: seoDescription, date },
    { dateLabel: `${HARDWARE_COPY.en.indexTitle} · ${formatBlogDate(date)}` },
  );
}
