/**
 * V163: Warning Sign — Industrial caution sign with yellow triangle, hazard stripes, and bold warnings.
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
        backgroundColor: '#1a1a1a',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: 'sans-serif',
        position: 'relative',
      }}
    >
      {/* Warning triangle area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        {/* Triangle built from stacked rectangles (widening) */}
        <div
          style={{
            display: 'flex',
            width: '8px',
            height: '8px',
            backgroundColor: '#ffd700',
            marginBottom: '0px',
          }}
        />
        <div
          style={{ display: 'flex', width: '24px', height: '8px', backgroundColor: '#ffd700' }}
        />
        <div
          style={{ display: 'flex', width: '40px', height: '8px', backgroundColor: '#ffd700' }}
        />
        <div
          style={{ display: 'flex', width: '56px', height: '8px', backgroundColor: '#ffd700' }}
        />
        <div
          style={{ display: 'flex', width: '72px', height: '8px', backgroundColor: '#ffd700' }}
        />
        <div
          style={{ display: 'flex', width: '88px', height: '8px', backgroundColor: '#ffd700' }}
        />
        <div
          style={{ display: 'flex', width: '104px', height: '8px', backgroundColor: '#ffd700' }}
        />
        <div
          style={{ display: 'flex', width: '120px', height: '8px', backgroundColor: '#ffd700' }}
        />
        <div
          style={{ display: 'flex', width: '136px', height: '8px', backgroundColor: '#ffd700' }}
        />
        <div
          style={{ display: 'flex', width: '152px', height: '8px', backgroundColor: '#ffd700' }}
        />
        <div
          style={{ display: 'flex', width: '168px', height: '8px', backgroundColor: '#ffd700' }}
        />

        {/* Exclamation mark overlaid */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            position: 'absolute',
            top: '85px',
            alignItems: 'center',
          }}
        >
          <div
            style={{ display: 'flex', width: '10px', height: '44px', backgroundColor: '#1a1a1a' }}
          />
          <div
            style={{
              display: 'flex',
              width: '10px',
              height: '10px',
              backgroundColor: '#1a1a1a',
              marginTop: '6px',
            }}
          />
        </div>
      </div>

      {/* WARNING text */}
      <div style={{ display: 'flex', marginBottom: '10px' }}>
        <span style={{ fontSize: 36, fontWeight: 900, color: '#ffd700', letterSpacing: '0.15em' }}>
          WARNING
        </span>
      </div>

      {/* Title */}
      <div
        style={{
          display: 'flex',
          maxWidth: '900px',
          justifyContent: 'center',
          marginBottom: '14px',
        }}
      >
        <span
          style={{
            fontSize: titleSize > 56 ? 24 : 28,
            fontWeight: 700,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.3,
          }}
        >
          {meta.title.toUpperCase()}
        </span>
      </div>

      {/* Caution subtitle */}
      <div style={{ display: 'flex', marginBottom: '8px' }}>
        <span style={{ fontSize: 16, color: '#cccccc' }}>
          CAUTION: May contain {meta.readingTime} minutes of reading
        </span>
      </div>

      {/* Author and date */}
      <div style={{ display: 'flex', marginBottom: '14px' }}>
        <span style={{ fontSize: 13, color: '#888888' }}>
          Issued by {meta.author} |{' '}
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
      </div>

      {/* Tags */}
      {meta.tags && (
        <div style={{ display: 'flex' }}>
          {meta.tags.slice(0, 4).map((tag, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                border: '1px solid #ffd700',
                padding: '2px 10px',
                marginLeft: i > 0 ? '6px' : '0',
              }}
            >
              <span style={{ fontSize: 10, color: '#ffd700', letterSpacing: '0.08em' }}>
                {tag.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Hazard stripes at bottom */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '0',
          left: '0',
          width: '100%',
          height: '28px',
        }}
      >
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              width: '50px',
              height: '28px',
              backgroundColor: i % 2 === 0 ? '#ffd700' : '#cc0000',
            }}
          />
        ))}
      </div>

      {/* Logo top-left */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '18px',
          left: '24px',
          alignItems: 'center',
        }}
      >
        <img src={logoSrc} width={22} height={22} />
        <span style={{ fontSize: 10, color: '#555555', marginLeft: '8px', letterSpacing: '0.1em' }}>
          INFERENCEX
        </span>
      </div>
    </div>,
    size,
  );
}
