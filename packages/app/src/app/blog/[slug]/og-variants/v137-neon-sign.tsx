/**
 * V137: Neon Sign — Pure black bg with glowing neon tube text, double-line offset effect, and OPEN badge.
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
        backgroundColor: '#000000',
        color: '#ffffff',
        fontFamily: 'sans-serif',
        position: 'relative',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Subtle brick wall texture — rows of rectangles */}
      {Array.from({ length: 8 }, (_, row) =>
        Array.from({ length: 12 }, (_, col) => (
          <div
            key={`${row}-${col}`}
            style={{
              display: 'flex',
              position: 'absolute',
              left: col * 100 + (row % 2 === 0 ? 0 : 50),
              top: row * 80,
              width: '96px',
              height: '76px',
              border: '1px solid rgba(40,20,15,0.4)',
              backgroundColor: 'rgba(25,12,8,0.3)',
            }}
          />
        )),
      )}

      {/* Glow backdrop for title — large blurred area */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '160px',
          left: '100px',
          right: '100px',
          height: '180px',
          backgroundColor: 'rgba(255,0,255,0.06)',
          borderRadius: '80px',
        }}
      />

      {/* Secondary glow — cyan */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '180px',
          left: '140px',
          right: '140px',
          height: '140px',
          backgroundColor: 'rgba(0,255,255,0.04)',
          borderRadius: '60px',
        }}
      />

      {/* Neon title — back layer (offset for double-line effect) */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '198px',
          left: '82px',
          right: '82px',
          padding: '16px 24px',
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontSize: titleSize,
            fontWeight: 700,
            color: 'rgba(0,255,255,0.3)',
            lineHeight: 1.2,
            letterSpacing: '0.02em',
          }}
        >
          {meta.title}
        </span>
      </div>

      {/* Neon title — front layer */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '195px',
          left: '80px',
          right: '80px',
          padding: '16px 24px',
          zIndex: 2,
        }}
      >
        <span
          style={{
            fontSize: titleSize,
            fontWeight: 700,
            color: '#ff00ff',
            lineHeight: 1.2,
            letterSpacing: '0.02em',
          }}
        >
          {meta.title}
        </span>
      </div>

      {/* Neon underline bar */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '370px',
          left: '80px',
          width: '300px',
          height: '3px',
          backgroundColor: '#00ffff',
          zIndex: 2,
        }}
      />
      {/* Glow behind underline */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '368px',
          left: '78px',
          width: '304px',
          height: '7px',
          backgroundColor: 'rgba(0,255,255,0.25)',
          borderRadius: '4px',
          zIndex: 1,
        }}
      />

      {/* Author and date — dim neon */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '395px',
          left: '80px',
          zIndex: 2,
        }}
      >
        <span style={{ fontSize: 18, color: 'rgba(255,0,255,0.6)' }}>{meta.author}</span>
        <span
          style={{
            fontSize: 18,
            color: 'rgba(255,255,255,0.2)',
            marginLeft: '16px',
            marginRight: '16px',
          }}
        >
          |
        </span>
        <span style={{ fontSize: 18, color: 'rgba(0,255,255,0.5)' }}>
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
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: '435px',
            left: '80px',
            flexWrap: 'wrap',
            zIndex: 2,
          }}
        >
          {meta.tags.map((tag, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                border: '1px solid rgba(0,255,255,0.3)',
                padding: '3px 10px',
                marginRight: '8px',
                borderRadius: '2px',
              }}
            >
              <span style={{ fontSize: 12, color: 'rgba(0,255,255,0.6)' }}>{tag}</span>
            </div>
          ))}
        </div>
      )}

      {/* "OPEN" neon badge — top right */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '40px',
          right: '60px',
          zIndex: 3,
        }}
      >
        {/* Glow behind badge */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: '-4px',
            left: '-4px',
            right: '-4px',
            bottom: '-4px',
            backgroundColor: 'rgba(255,0,255,0.12)',
            borderRadius: '8px',
          }}
        />
        <div
          style={{
            display: 'flex',
            border: '2px solid #ff00ff',
            borderRadius: '6px',
            padding: '8px 20px',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: '#ff00ff',
              letterSpacing: '0.15em',
            }}
          >
            OPEN
          </span>
        </div>
      </div>

      {/* Reading time — neon clock */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '40px',
          right: '60px',
          alignItems: 'center',
          zIndex: 2,
        }}
      >
        <span style={{ fontSize: 14, color: 'rgba(0,255,255,0.5)', letterSpacing: '0.1em' }}>
          {meta.readingTime} MIN READ
        </span>
      </div>

      {/* Logo — bottom left */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '40px',
          left: '80px',
          alignItems: 'center',
          zIndex: 2,
        }}
      >
        <img src={logoSrc} width={22} height={22} />
        <span
          style={{
            fontSize: 13,
            color: 'rgba(255,0,255,0.5)',
            marginLeft: '8px',
            letterSpacing: '0.12em',
          }}
        >
          INFERENCEX
        </span>
      </div>
    </div>,
    size,
  );
}
