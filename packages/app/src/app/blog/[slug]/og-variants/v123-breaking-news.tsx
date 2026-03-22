/**
 * V123: Breaking News — TV news chyron/lower third with red "BREAKING" banner, broadcast urgent aesthetic.
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
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#111827',
        color: '#ffffff',
        position: 'relative',
      }}
    >
      {/* Upper area: Logo + Author info */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          padding: '40px 56px',
          justifyContent: 'space-between',
        }}
      >
        {/* Top bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src={logoSrc} width={44} height={44} />
            <div
              style={{
                display: 'flex',
                marginLeft: '12px',
                fontSize: 22,
                fontWeight: 800,
                color: '#ffffff',
              }}
            >
              InferenceX
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                display: 'flex',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#ef4444',
              }}
            />
            <div
              style={{
                display: 'flex',
                fontSize: 14,
                fontWeight: 700,
                color: '#ef4444',
                letterSpacing: '2px',
              }}
            >
              LIVE
            </div>
          </div>
        </div>

        {/* Author + Date + Excerpt above the chyron */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', fontSize: 18, color: '#d1d5db' }}>{meta.author}</div>
            <div style={{ display: 'flex', fontSize: 16, color: '#9ca3af' }}>
              {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 19,
              color: '#9ca3af',
              lineHeight: 1.5,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>
      </div>

      {/* Chyron / Lower Third */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
        }}
      >
        {/* BREAKING label bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <div
            style={{
              display: 'flex',
              backgroundColor: '#dc2626',
              padding: '10px 28px',
              fontSize: 20,
              fontWeight: 900,
              color: '#ffffff',
              letterSpacing: '4px',
            }}
          >
            BREAKING
          </div>
          <div
            style={{
              display: 'flex',
              flex: 1,
              height: '4px',
              backgroundColor: '#dc2626',
            }}
          />
        </div>

        {/* Title banner */}
        <div
          style={{
            display: 'flex',
            backgroundColor: '#1e293b',
            padding: '20px 28px',
            width: '100%',
            borderBottom: '4px solid #dc2626',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              lineHeight: 1.15,
              color: '#ffffff',
            }}
          >
            {meta.title}
          </div>
        </div>

        {/* Ticker bar at very bottom */}
        <div
          style={{
            display: 'flex',
            backgroundColor: '#0f172a',
            padding: '8px 28px',
            width: '100%',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 13,
              color: '#64748b',
              letterSpacing: '2px',
              fontWeight: 600,
            }}
          >
            INFERENCEX NEWS NETWORK
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 13,
              color: '#64748b',
              letterSpacing: '1px',
            }}
          >
            {meta.readingTime} MIN READ
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
