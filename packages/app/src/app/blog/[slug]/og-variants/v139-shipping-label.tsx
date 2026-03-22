/**
 * V139: Shipping Label — Kraft brown package bg with white label, FRAGILE stamp, barcode lines, and tape strips.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  /* Barcode lines */
  const barcodeLines = Array.from({ length: 30 }, (_, i) => ({
    width: i % 3 === 0 ? 4 : 2,
    marginRight: i % 4 === 0 ? 3 : 1,
  }));

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: '#3a3020',
        fontFamily: 'sans-serif',
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Kraft paper texture dots */}
      {Array.from({ length: 30 }, (_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            left: ((i * 127 + 19) % 1180) + 10,
            top: ((i * 61 + 37) % 610) + 10,
            width: 3,
            height: 3,
            backgroundColor: `rgba(80,65,40,${0.3 + (i % 3) * 0.15})`,
            borderRadius: '50%',
          }}
        />
      ))}

      {/* Tape strip — top */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '60px',
          left: '350px',
          width: '500px',
          height: '36px',
          backgroundColor: 'rgba(210,195,160,0.35)',
          border: '1px solid rgba(180,160,120,0.2)',
          zIndex: 3,
        }}
      />

      {/* Tape strip — bottom */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '55px',
          left: '380px',
          width: '440px',
          height: '36px',
          backgroundColor: 'rgba(210,195,160,0.35)',
          border: '1px solid rgba(180,160,120,0.2)',
          zIndex: 3,
        }}
      />

      {/* White label */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '900px',
          height: '480px',
          backgroundColor: '#ffffff',
          border: '1px solid #cccccc',
          padding: '30px 40px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* FROM address */}
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '14px' }}>
          <div style={{ display: 'flex', marginBottom: '2px' }}>
            <span style={{ fontSize: 11, color: '#999999', letterSpacing: '0.1em' }}>FROM:</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src={logoSrc} width={16} height={16} />
            <span style={{ fontSize: 14, color: '#333333', marginLeft: '6px', fontWeight: 600 }}>
              InferenceX
            </span>
            <span style={{ fontSize: 12, color: '#888888', marginLeft: '12px' }}>
              &middot; {meta.author}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '1px',
            backgroundColor: '#e0e0e0',
            marginBottom: '14px',
          }}
        />

        {/* TO address */}
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '20px' }}>
          <div style={{ display: 'flex', marginBottom: '2px' }}>
            <span style={{ fontSize: 11, color: '#999999', letterSpacing: '0.1em' }}>TO:</span>
          </div>
          <div style={{ display: 'flex' }}>
            <span style={{ fontSize: 14, color: '#333333', fontWeight: 600 }}>Reader</span>
          </div>
        </div>

        {/* Title — main content of label */}
        <div style={{ display: 'flex', marginBottom: '14px' }}>
          <span
            style={{
              fontSize: titleSize - 8,
              fontWeight: 700,
              color: '#1a1a1a',
              lineHeight: 1.2,
            }}
          >
            {meta.title}
          </span>
        </div>

        {/* Excerpt */}
        <div style={{ display: 'flex', marginBottom: '12px' }}>
          <span style={{ fontSize: 14, color: '#666666', lineHeight: 1.5 }}>
            {meta.excerpt.length > 130 ? meta.excerpt.slice(0, 130) + '\u2026' : meta.excerpt}
          </span>
        </div>

        {/* Date and reading time */}
        <div style={{ display: 'flex', marginBottom: '16px' }}>
          <span style={{ fontSize: 12, color: '#999999' }}>
            Ship Date:{' '}
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ fontSize: 12, color: '#cccccc', marginLeft: '16px', marginRight: '16px' }}>
            |
          </span>
          <span style={{ fontSize: 12, color: '#999999' }}>Weight: {meta.readingTime} min</span>
        </div>

        {/* Tags */}
        {meta.tags && (
          <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: '12px' }}>
            {meta.tags.map((tag, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  border: '1px solid #dddddd',
                  padding: '2px 8px',
                  marginRight: '6px',
                  marginBottom: '4px',
                }}
              >
                <span style={{ fontSize: 10, color: '#888888' }}>{tag}</span>
              </div>
            ))}
          </div>
        )}

        {/* Barcode at bottom of label */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: '25px',
            left: '40px',
            alignItems: 'flex-end',
          }}
        >
          {barcodeLines.map((line, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                width: line.width,
                height: 30 + (i % 5 === 0 ? 8 : 0),
                backgroundColor: '#1a1a1a',
                marginRight: line.marginRight,
              }}
            />
          ))}
        </div>

        {/* FRAGILE stamp — rotated via text positioning */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: '30px',
            right: '40px',
            border: '3px solid #cc3333',
            padding: '6px 16px',
            borderRadius: '3px',
          }}
        >
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: '#cc3333',
              letterSpacing: '0.2em',
            }}
          >
            FRAGILE
          </span>
        </div>

        {/* Handle with care */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: '76px',
            right: '40px',
          }}
        >
          <span style={{ fontSize: 10, color: '#cc3333', letterSpacing: '0.1em' }}>
            HANDLE WITH CARE
          </span>
        </div>
      </div>
    </div>,
    size,
  );
}
