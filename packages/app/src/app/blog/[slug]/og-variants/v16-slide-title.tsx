/**
 * V16: Slide Title — Gold (#F7B041) background, dark text, circuit pattern on the right side,
 * logo bottom-left. This is the "opening slide" look.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const GOLD = '#F7B041';
const DARK = '#444647';
const DARK_DEEP = '#2A2B2C';

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 66;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: GOLD,
        color: DARK,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Right-side circuit pattern area */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: 420,
          height: '100%',
          backgroundColor: DARK_DEEP,
          display: 'flex',
        }}
      >
        {/* Circuit traces — vertical */}
        {[60, 140, 220, 300, 380].map((x) => (
          <div
            key={`v${x}`}
            style={{
              position: 'absolute',
              left: x,
              top: 0,
              width: 1,
              height: '100%',
              backgroundColor: '#55565740',
              display: 'flex',
            }}
          />
        ))}
        {/* Circuit traces — horizontal */}
        {[70, 160, 250, 340, 430, 520].map((y) => (
          <div
            key={`h${y}`}
            style={{
              position: 'absolute',
              left: 0,
              top: y,
              width: '100%',
              height: 1,
              backgroundColor: '#55565730',
              display: 'flex',
            }}
          />
        ))}
        {/* Circuit blocks at intersections */}
        {[
          { x: 54, y: 64, s: 14 },
          { x: 134, y: 154, s: 12 },
          { x: 214, y: 244, s: 16 },
          { x: 294, y: 334, s: 12 },
          { x: 374, y: 424, s: 14 },
          { x: 134, y: 64, s: 10 },
          { x: 294, y: 154, s: 14 },
          { x: 54, y: 334, s: 12 },
          { x: 214, y: 514, s: 10 },
          { x: 374, y: 244, s: 16 },
          { x: 54, y: 424, s: 12 },
          { x: 294, y: 514, s: 14 },
        ].map((n, i) => (
          <div
            key={`n${i}`}
            style={{
              position: 'absolute',
              left: n.x,
              top: n.y,
              width: n.s,
              height: n.s,
              border: `1.5px solid #55565750`,
              borderRadius: 2,
              display: 'flex',
            }}
          />
        ))}
        {/* Gold accent nodes */}
        {[
          { x: 137, y: 67, s: 6 },
          { x: 217, y: 247, s: 8 },
          { x: 377, y: 427, s: 6 },
        ].map((n, i) => (
          <div
            key={`g${i}`}
            style={{
              position: 'absolute',
              left: n.x,
              top: n.y,
              width: n.s,
              height: n.s,
              backgroundColor: `${GOLD}90`,
              borderRadius: n.s,
              display: 'flex',
            }}
          />
        ))}
        {/* Right-angle trace bends */}
        <div
          style={{
            position: 'absolute',
            left: 60,
            top: 70,
            width: 80,
            height: 2,
            backgroundColor: '#55565740',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 140,
            top: 70,
            width: 2,
            height: 90,
            backgroundColor: '#55565740',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 220,
            top: 250,
            width: 80,
            height: 2,
            backgroundColor: '#55565740',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 300,
            top: 160,
            width: 2,
            height: 92,
            backgroundColor: '#55565740',
            display: 'flex',
          }}
        />
      </div>

      {/* Content — left side */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 780,
          padding: '55px 60px',
          zIndex: 1,
        }}
      >
        {/* Date */}
        <div style={{ display: 'flex', fontSize: 36, color: '#9ca3af' }}>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </div>

        {/* Title + excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: titleSize, fontWeight: 800, lineHeight: 1.15, color: DARK }}>
            {meta.title}
          </div>
          <div
            style={{
              fontSize: 42,
              color: '#9ca3af',
              lineHeight: 1.4,
              maxHeight: 70,
              overflow: 'hidden',
            }}
          >
            {meta.excerpt.length > 100 ? meta.excerpt.slice(0, 100) + '…' : meta.excerpt}
          </div>
        </div>

        {/* Bottom: author + logo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 36, color: '#9ca3af' }}>{meta.author}</span>
            <span style={{ fontSize: 36, color: '#9ca3af' }}>{meta.readingTime} min read</span>
          </div>
          <img src={logoSrc} height={84} />
        </div>
      </div>
    </div>,
    size,
  );
}
