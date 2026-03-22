/**
 * V142: License Plate — Dark bg with centered embossed-style plate, state label, registration stickers, reflective dot border.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  /* Truncate title for plate — plates have limited space */
  const plateText = meta.title.length > 35 ? meta.title.slice(0, 35) + '\u2026' : meta.title;

  /* Reflective border dots */
  const topDots = Array.from({ length: 44 }, (_, i) => i);
  const sideDots = Array.from({ length: 20 }, (_, i) => i);

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: '#141820',
        fontFamily: 'sans-serif',
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* License plate */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '980px',
          height: '460px',
          backgroundColor: '#e8e4d8',
          borderRadius: '16px',
          border: '4px solid #b0a890',
          position: 'relative',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px 40px',
        }}
      >
        {/* Reflective dot border — top row */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: '8px',
            left: '20px',
            right: '20px',
          }}
        >
          {topDots.map((_, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                backgroundColor: 'rgba(160,150,130,0.4)',
                marginRight: i < topDots.length - 1 ? '16px' : '0',
              }}
            />
          ))}
        </div>

        {/* Reflective dot border — bottom row */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: '8px',
            left: '20px',
            right: '20px',
          }}
        >
          {topDots.map((_, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                backgroundColor: 'rgba(160,150,130,0.4)',
                marginRight: i < topDots.length - 1 ? '16px' : '0',
              }}
            />
          ))}
        </div>

        {/* Reflective dot border — left column */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            position: 'absolute',
            top: '20px',
            left: '8px',
            bottom: '20px',
          }}
        >
          {sideDots.map((_, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                backgroundColor: 'rgba(160,150,130,0.4)',
                marginBottom: i < sideDots.length - 1 ? '16px' : '0',
              }}
            />
          ))}
        </div>

        {/* Reflective dot border — right column */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            position: 'absolute',
            top: '20px',
            right: '8px',
            bottom: '20px',
          }}
        >
          {sideDots.map((_, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                width: '5px',
                height: '5px',
                borderRadius: '50%',
                backgroundColor: 'rgba(160,150,130,0.4)',
                marginBottom: i < sideDots.length - 1 ? '16px' : '0',
              }}
            />
          ))}
        </div>

        {/* Bolt holes */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: '50%',
            left: '30px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            border: '2px solid #b0a890',
            backgroundColor: '#d4d0c4',
          }}
        />
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: '50%',
            right: '30px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            border: '2px solid #b0a890',
            backgroundColor: '#d4d0c4',
          }}
        />

        {/* State label — top */}
        <div style={{ display: 'flex', marginBottom: '8px' }}>
          <span
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: '#1a4a8a',
              letterSpacing: '0.3em',
            }}
          >
            INFERENCEX
          </span>
        </div>

        {/* Subtitle — state motto style */}
        <div style={{ display: 'flex', marginBottom: '20px' }}>
          <span style={{ fontSize: 12, color: '#6a7a9a', letterSpacing: '0.15em' }}>
            THE BENCHMARK STATE
          </span>
        </div>

        {/* Main plate text — embossed title */}
        <div style={{ display: 'flex', marginBottom: '16px' }}>
          <span
            style={{
              fontSize: titleSize - 10,
              fontWeight: 800,
              color: '#1a2a3a',
              letterSpacing: '0.05em',
              lineHeight: 1.2,
              textAlign: 'center',
            }}
          >
            {plateText}
          </span>
        </div>

        {/* Excerpt — smaller text below */}
        <div style={{ display: 'flex', marginBottom: '16px' }}>
          <span style={{ fontSize: 14, color: '#6a6a6a', lineHeight: 1.4, textAlign: 'center' }}>
            {meta.excerpt.length > 100 ? meta.excerpt.slice(0, 100) + '\u2026' : meta.excerpt}
          </span>
        </div>

        {/* Bottom row — author, date */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#8a8a8a' }}>{meta.author}</span>
          <span style={{ fontSize: 13, color: '#cccccc', marginLeft: '12px', marginRight: '12px' }}>
            &middot;
          </span>
          <span style={{ fontSize: 13, color: '#8a8a8a' }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
        </div>

        {/* Registration sticker — top left corner */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: '24px',
            left: '28px',
            width: '40px',
            height: '40px',
            backgroundColor: '#2e7d32',
            borderRadius: '4px',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: '#ffffff' }}>
            {meta.readingTime}
          </span>
        </div>

        {/* Registration sticker — top right corner */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: '24px',
            right: '28px',
            width: '40px',
            height: '40px',
            backgroundColor: '#c62828',
            borderRadius: '4px',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 700, color: '#ffffff' }}>
            {meta.date.slice(0, 4)}
          </span>
        </div>

        {/* Tags */}
        {meta.tags && (
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              bottom: '24px',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            {meta.tags.map((tag, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  padding: '2px 8px',
                  marginRight: '6px',
                }}
              >
                <span style={{ fontSize: 10, color: '#8a8a8a' }}>{tag}</span>
              </div>
            ))}
          </div>
        )}

        {/* Logo — bottom center above tags */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: '48px',
            alignItems: 'center',
          }}
        >
          <img src={logoSrc} width={14} height={14} />
        </div>
      </div>
    </div>,
    size,
  );
}
