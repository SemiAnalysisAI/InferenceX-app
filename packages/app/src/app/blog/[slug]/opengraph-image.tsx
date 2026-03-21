import { ImageResponse } from 'next/og';

import { getAllPosts, getPostBySlug } from '@/lib/blog';

export const alt = 'InferenceX Blog';
export const size = { width: 1200, height: 630 };
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
        InferenceX Blog
      </div>,
      size,
    );
  }

  const { meta } = result;
  const titleSize = meta.title.length > 60 ? 40 : meta.title.length > 40 ? 48 : 56;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        backgroundColor: '#18181b',
        color: '#fafafa',
        padding: 60,
      }}
    >
      <div style={{ display: 'flex', fontSize: 20, color: '#a1a1aa' }}>
        InferenceX Blog — SemiAnalysis
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2 }}>{meta.title}</div>
        <div
          style={{
            fontSize: 22,
            color: '#a1a1aa',
            lineHeight: 1.4,
            maxHeight: 62,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '…' : meta.excerpt}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, fontSize: 18, color: '#a1a1aa' }}>
        <span>{meta.author}</span>
        <span>·</span>
        <span>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
        <span>·</span>
        <span>{meta.readingTime} min read</span>
        {meta.tags &&
          meta.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              style={{
                backgroundColor: '#27272a',
                padding: '4px 12px',
                borderRadius: 9999,
                fontSize: 14,
              }}
            >
              {tag}
            </span>
          ))}
      </div>
    </div>,
    size,
  );
}
