/**
 * V6: Top Bar — Dense circuit pattern as a header bar across the top.
 * Clean separation between decorative and content areas.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 56 : meta.title.length > 40 ? 64 : 72;

  const topBlocks = [];
  for (let col = 0; col < 15; col++) {
    const w = 60 + (col % 3) * 10;
    const h = 40 + (col % 4) * 8;
    const isTeal = col % 5 !== 0;
    topBlocks.push({
      x: col * 80 + 4,
      y: 4 + (col % 2) * 20,
      w,
      h,
      color: isTeal ? `#2dd4bf${20 + (col % 3) * 10}` : `#eab308${20 + (col % 3) * 10}`,
    });
  }

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0c0c0e',
        color: '#fafafa',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 100,
          backgroundColor: '#0f1a19',
          position: 'relative',
          borderBottom: '2px solid #2dd4bf30',
        }}
      >
        {topBlocks.map((b, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: b.x,
              top: b.y,
              width: b.w,
              height: b.h,
              border: `1.5px solid ${b.color}`,
              borderRadius: 3,
              display: 'flex',
            }}
          />
        ))}
        {/* Gold accent dots */}
        <div
          style={{
            position: 'absolute',
            left: 400,
            top: 45,
            width: 8,
            height: 8,
            backgroundColor: '#eab308',
            borderRadius: 4,
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 800,
            top: 30,
            width: 6,
            height: 6,
            backgroundColor: '#eab308',
            borderRadius: 3,
            display: 'flex',
          }}
        />
      </div>

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '40px 60px 50px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <img src={logoSrc} height={96} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2 }}>{meta.title}</div>
          <div
            style={{
              fontSize: 42,
              color: '#d4d4d8',
              lineHeight: 1.4,
              maxHeight: 60,
              overflow: 'hidden',
            }}
          >
            {meta.excerpt.length > 100 ? meta.excerpt.slice(0, 100) + '...' : meta.excerpt}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, fontSize: 36, color: '#d4d4d8' }}>
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
        </div>
      </div>
    </div>,
    size,
  );
}
