import { ImageResponse } from 'next/og';

import { BLOG_POSTS, getReadingTime } from '@/components/blog/blog-data';

export const alt = 'InferenceX Blog';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = BLOG_POSTS.find((p) => p.slug === slug);

  if (!post) {
    return new ImageResponse(
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#09090b',
          color: '#fafafa',
          fontSize: 48,
          fontWeight: 700,
        }}
      >
        InferenceX Blog
      </div>,
      size,
    );
  }

  const readingTime = getReadingTime(post.content);
  const tags = post.tags?.slice(0, 3) ?? [];
  const truncatedExcerpt =
    post.excerpt.length > 160 ? post.excerpt.slice(0, 157) + '...' : post.excerpt;
  const formattedDate = new Date(post.date + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#09090b',
        padding: '60px 72px',
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: 22,
          fontWeight: 700,
          color: '#a1a1aa',
          letterSpacing: '-0.02em',
        }}
      >
        InferenceX Blog — SemiAnalysis
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div
          style={{
            display: 'flex',
            fontSize: post.title.length > 60 ? 44 : 52,
            fontWeight: 700,
            color: '#fafafa',
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            maxWidth: '1050px',
          }}
        >
          {post.title}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            color: '#a1a1aa',
            lineHeight: 1.4,
            maxWidth: '900px',
          }}
        >
          {truncatedExcerpt}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ display: 'flex', fontSize: 20, color: '#fafafa', fontWeight: 600 }}>
            {post.author}
          </div>
          <div style={{ display: 'flex', fontSize: 18, color: '#71717a' }}>{formattedDate}</div>
          <div style={{ display: 'flex', fontSize: 18, color: '#71717a' }}>
            {`${readingTime} min read`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {tags.map((tag) => (
            <div
              key={tag}
              style={{
                display: 'flex',
                fontSize: 16,
                color: '#3b82f6',
                backgroundColor: 'rgba(59,130,246,0.15)',
                padding: '4px 14px',
                borderRadius: '6px',
                fontWeight: 500,
              }}
            >
              {tag}
            </div>
          ))}
        </div>
      </div>
    </div>,
    size,
  );
}
