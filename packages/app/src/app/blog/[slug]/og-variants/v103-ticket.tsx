/**
 * V103: Ticket — Landscape event ticket with tear-off stub separated by dashed line.
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
        backgroundColor: '#f0ebe3',
        padding: '40px 50px',
        fontFamily: 'sans-serif',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Ticket body */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          backgroundColor: '#ffffff',
          border: '2px solid #333333',
          borderRadius: '12px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Left portion — event details */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '72%',
            height: '100%',
            padding: '35px 40px',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          {/* Event branding */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <img src={logoSrc} width={22} height={22} />
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                marginLeft: '8px',
                letterSpacing: '0.2em',
                color: '#888888',
              }}
            >
              INFERENCEX EVENT
            </span>
          </div>

          {/* Title */}
          <div style={{ display: 'flex', marginBottom: '18px' }}>
            <span
              style={{
                fontSize: titleSize - 8,
                fontWeight: 800,
                lineHeight: 1.1,
                color: '#1a1a1a',
                maxWidth: '95%',
              }}
            >
              {meta.title}
            </span>
          </div>

          {/* Excerpt */}
          <div style={{ display: 'flex', marginBottom: '16px' }}>
            <span style={{ fontSize: 15, color: '#666666', lineHeight: 1.5 }}>
              {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
            </span>
          </div>

          {/* Date and author */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span
              style={{
                fontSize: 14,
                color: '#333333',
                fontWeight: 600,
              }}
            >
              {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </span>
            <span style={{ fontSize: 14, color: '#aaaaaa', margin: '0 12px' }}>|</span>
            <span style={{ fontSize: 14, color: '#555555' }}>{meta.author}</span>
          </div>
        </div>

        {/* Dashed vertical divider — perforated edge */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '2px',
            height: '100%',
            position: 'absolute',
            left: '72%',
            top: '0',
          }}
        >
          {Array.from({ length: 22 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                width: '2px',
                height: '16px',
                backgroundColor: i % 2 === 0 ? '#cccccc' : 'transparent',
              }}
            />
          ))}
        </div>

        {/* Right portion — tear-off stub */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '28%',
            height: '100%',
            padding: '35px 25px',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#fafafa',
          }}
        >
          {/* Reading time */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: '30px',
            }}
          >
            <span
              style={{
                fontSize: 42,
                fontWeight: 900,
                color: '#1a1a1a',
              }}
            >
              {meta.readingTime}
            </span>
            <span
              style={{
                fontSize: 12,
                color: '#888888',
                letterSpacing: '0.15em',
                marginTop: '2px',
              }}
            >
              MIN READ
            </span>
          </div>

          {/* Divider */}
          <div
            style={{
              display: 'flex',
              width: '60%',
              borderTop: '1px solid #dddddd',
              marginBottom: '24px',
            }}
          />

          {/* ADMIT ONE */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: '0.25em',
                color: '#cc4444',
              }}
            >
              ADMIT
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: '0.25em',
                color: '#cc4444',
              }}
            >
              ONE
            </span>
          </div>

          {/* Tags */}
          <div
            style={{
              display: 'flex',
              marginTop: '24px',
            }}
          >
            <span style={{ fontSize: 10, color: '#aaaaaa', textAlign: 'center' }}>
              {meta.tags ? meta.tags.slice(0, 3).join(' \u00b7 ') : ''}
            </span>
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
