/**
 * V160: Sticky Note — Yellow Post-it on dark background with pin indicator and informal handwritten feel.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: '#1a1a1a',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
      }}
    >
      {/* Shadow behind sticky note (offset darker div) */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          width: '520px',
          height: '420px',
          backgroundColor: '#0a0a0a',
          top: '118px',
          left: '348px',
        }}
      />

      {/* Sticky note */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '520px',
          height: '420px',
          backgroundColor: '#fff740',
          padding: '40px 36px 30px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Pin circle at top center */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: '-12px',
            left: '248px',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            backgroundColor: '#cc3333',
            border: '2px solid #aa2222',
            zIndex: 2,
          }}
        />

        {/* Small fold line top-left */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: '0',
            left: '0',
            width: '30px',
            height: '30px',
            backgroundColor: '#ede83a',
            borderRight: '1px solid #ddd530',
            borderBottom: '1px solid #ddd530',
          }}
        />

        {/* Title — main scrawl */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: '12px',
            marginBottom: '16px',
            flex: 1,
          }}
        >
          <span
            style={{
              fontSize: titleSize > 56 ? 26 : titleSize > 48 ? 30 : 34,
              fontWeight: 700,
              color: '#1a1a1a',
              lineHeight: 1.3,
              fontFamily: 'serif',
            }}
          >
            {meta.title}
          </span>
        </div>

        {/* Underline scribble */}
        <div
          style={{
            display: 'flex',
            width: '200px',
            borderTop: '2px solid #1a1a1a',
            marginBottom: '12px',
          }}
        />

        {/* Excerpt */}
        <div style={{ display: 'flex', marginBottom: '14px' }}>
          <span style={{ fontSize: 13, color: '#444444', lineHeight: 1.4, fontFamily: 'serif' }}>
            {meta.excerpt.length > 100 ? meta.excerpt.slice(0, 100) + '...' : meta.excerpt}
          </span>
        </div>

        {/* Author and date */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#333333', fontFamily: 'serif' }}>
              - {meta.author}
            </span>
            <span style={{ fontSize: 11, color: '#666666', marginTop: '2px' }}>
              {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#666666' }}>~{meta.readingTime} min</span>
          </div>
        </div>
      </div>

      {/* Logo bottom-left on dark bg */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '20px',
          left: '30px',
          alignItems: 'center',
        }}
      >
        <img src={logoSrc} width={22} height={22} />
        <span style={{ fontSize: 11, color: '#555555', marginLeft: '8px', letterSpacing: '0.1em' }}>
          INFERENCEX
        </span>
      </div>

      {/* Tags as small notes at bottom-right */}
      {meta.tags && (
        <div style={{ display: 'flex', position: 'absolute', bottom: '20px', right: '30px' }}>
          {meta.tags.slice(0, 3).map((tag, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                backgroundColor: '#ffe066',
                padding: '2px 8px',
                marginLeft: '6px',
              }}
            >
              <span style={{ fontSize: 10, color: '#555555' }}>{tag}</span>
            </div>
          ))}
        </div>
      )}
    </div>,
    size,
  );
}
