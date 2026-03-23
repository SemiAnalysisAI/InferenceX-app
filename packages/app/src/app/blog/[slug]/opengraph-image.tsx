import { ImageResponse } from 'next/og';

import { getAllPosts, getPostBySlug } from '@/lib/blog';

import { renderOgImage, size } from './og-image-render';

export const alt = 'InferenceX Articles';
export { size };
export const contentType = 'image/png';

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = getPostBySlug(slug);

  if (!result) {
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
        InferenceX Articles
      </div>,
      size,
    );
  }

  return await renderOgImage(result.meta);
}
