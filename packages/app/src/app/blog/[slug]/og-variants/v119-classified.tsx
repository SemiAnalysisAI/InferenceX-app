/**
 * V119: Classified — styled like a declassified dossier with stamp-style "CLASSIFIED" text and structured metadata fields.
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
        backgroundColor: '#f5f0e8',
        color: '#1a1a1a',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* "CLASSIFIED" stamp in background */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '180px',
          left: '300px',
          fontSize: 120,
          fontWeight: 900,
          color: '#cc0000',
          opacity: 0.08,
          letterSpacing: '12px',
        }}
      >
        CLASSIFIED
      </div>

      {/* "DECLASSIFIED" diagonal stamp */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '40px',
          right: '60px',
          fontSize: 24,
          fontWeight: 800,
          color: '#cc0000',
          opacity: 0.35,
          letterSpacing: '4px',
          border: '3px solid #cc0000',
          borderRadius: '4px',
          padding: '6px 18px',
        }}
      >
        DECLASSIFIED
      </div>

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '44px 56px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={40} height={40} />
          <div
            style={{
              display: 'flex',
              marginLeft: '12px',
              fontSize: 18,
              fontWeight: 700,
              color: '#333333',
              letterSpacing: '2px',
            }}
          >
            INFERENCEX
          </div>
        </div>

        {/* Document body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Title as subject */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div
              style={{
                display: 'flex',
                fontSize: 14,
                fontWeight: 700,
                color: '#666666',
                letterSpacing: '3px',
              }}
            >
              SUBJECT:
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: titleSize,
                fontWeight: 800,
                lineHeight: 1.15,
                color: '#1a1a1a',
              }}
            >
              {meta.title}
            </div>
          </div>

          {/* Excerpt as brief */}
          <div
            style={{
              display: 'flex',
              fontSize: 18,
              color: '#555555',
              lineHeight: 1.5,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Dossier footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-start',
            alignItems: 'center',
            gap: '40px',
            borderTop: '2px solid #cccccc',
            paddingTop: '16px',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                fontSize: 13,
                fontWeight: 700,
                color: '#888888',
                letterSpacing: '2px',
              }}
            >
              AUTHOR:
            </div>
            <div style={{ display: 'flex', fontSize: 16, color: '#333333' }}>{meta.author}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                fontSize: 13,
                fontWeight: 700,
                color: '#888888',
                letterSpacing: '2px',
              }}
            >
              DATE:
            </div>
            <div style={{ display: 'flex', fontSize: 16, color: '#333333' }}>
              {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                fontSize: 13,
                fontWeight: 700,
                color: '#888888',
                letterSpacing: '2px',
              }}
            >
              CLEARANCE:
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 16,
                color: '#cc0000',
                fontWeight: 700,
              }}
            >
              TOP SECRET
            </div>
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
