import { ImageResponse } from 'next/og';

import { getAllPosts, getPostBySlug } from '@/lib/blog/blog';

import { renderOgImage, size } from '../../../blog/[slug]/og-image-render';

export const alt = 'InferenceX 文章';
export { size };
export const contentType = 'image/png';

export function generateStaticParams() {
  return getAllPosts('zh').map((post) => ({ slug: post.slug }));
}

export default async function ZhOgImage({ params }: { params: Promise<{ slug: string }> }) {
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
        }}
      >
        InferenceX Articles
      </div>,
      size,
    );
  }

  return renderOgImage(result.meta);
}
