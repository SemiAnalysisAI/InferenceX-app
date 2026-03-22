/**
 * V85: API Docs — Styled like REST API documentation with endpoint path,
 * description, and response headers. Clean documentation-style layout.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 44 : meta.title.length > 40 ? 52 : 58;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0f1117',
        color: '#e4e4e7',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 50,
          backgroundColor: '#161822',
          borderBottom: '1px solid #27272a',
          padding: '0 40px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={logoSrc} height={22} />
          <span style={{ fontSize: 14, color: '#71717a', letterSpacing: 1 }}>API REFERENCE</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#22c55e' }}>v1.0</span>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: 9999,
              backgroundColor: '#22c55e',
              display: 'flex',
            }}
          />
        </div>
      </div>

      {/* Main content area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          padding: '36px 60px',
          gap: 28,
        }}
      >
        {/* Endpoint */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 14px',
              backgroundColor: '#22c55e20',
              border: '1px solid #22c55e40',
              borderRadius: 4,
              fontSize: 16,
              fontWeight: 700,
              color: '#22c55e',
            }}
          >
            GET
          </div>
          <span style={{ fontSize: 22, color: '#a1a1aa' }}>/api/v1/blog/</span>
          <span style={{ fontSize: 22, color: '#7c8aff' }}>{'{'}</span>
          <span style={{ fontSize: 22, color: '#eab308' }}>slug</span>
          <span style={{ fontSize: 22, color: '#7c8aff' }}>{'}'}</span>
        </div>

        {/* Separator */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: 1,
            backgroundColor: '#27272a',
          }}
        />

        {/* Description (title) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#71717a', letterSpacing: 1 }}>DESCRIPTION</span>
          <div
            style={{
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.2,
              color: '#fafafa',
              display: 'flex',
            }}
          >
            {meta.title}
          </div>
        </div>

        {/* Excerpt as summary */}
        <div
          style={{
            fontSize: 22,
            color: '#71717a',
            lineHeight: 1.5,
            maxHeight: 70,
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '...' : meta.excerpt}
        </div>

        {/* Separator */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: 1,
            backgroundColor: '#27272a',
          }}
        />

        {/* Response headers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#71717a', letterSpacing: 1 }}>RESPONSE HEADERS</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 16 }}>
            <div style={{ display: 'flex', fontSize: 18, gap: 12 }}>
              <span style={{ color: '#7c8aff' }}>X-Author:</span>
              <span style={{ color: '#e4e4e7' }}>{meta.author}</span>
            </div>
            <div style={{ display: 'flex', fontSize: 18, gap: 12 }}>
              <span style={{ color: '#7c8aff' }}>X-Published:</span>
              <span style={{ color: '#e4e4e7' }}>
                {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  timeZone: 'UTC',
                })}
              </span>
            </div>
            <div style={{ display: 'flex', fontSize: 18, gap: 12 }}>
              <span style={{ color: '#7c8aff' }}>X-Read-Time:</span>
              <span style={{ color: '#e4e4e7' }}>{meta.readingTime} min</span>
            </div>
            <div style={{ display: 'flex', fontSize: 18, gap: 12 }}>
              <span style={{ color: '#7c8aff' }}>Content-Type:</span>
              <span style={{ color: '#e4e4e7' }}>application/blog+markdown</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom status bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 36,
          backgroundColor: '#161822',
          borderTop: '1px solid #27272a',
          padding: '0 40px',
          fontSize: 12,
          color: '#52525b',
        }}
      >
        <span>Status: 200 OK</span>
        <div style={{ display: 'flex', gap: 16 }}>
          {meta.tags &&
            meta.tags.slice(0, 3).map((tag, i) => (
              <span key={`tag${i}`} style={{ color: '#eab30880' }}>
                #{tag}
              </span>
            ))}
        </div>
      </div>
    </div>,
    size,
  );
}
