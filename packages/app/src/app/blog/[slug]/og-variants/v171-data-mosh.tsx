/**
 * V171: Glitch/Data Mosh — Digital corruption aesthetic with RGB channel offset title, horizontal tear lines, and displaced blocks.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;
  const formattedDate = new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  // Horizontal tear lines — rectangles that cut across the image
  const tears = [
    { top: 95, left: 0, width: 1200, height: 3, color: '#ff0040', opacity: 0.6 },
    { top: 98, left: 200, width: 800, height: 1, color: '#00ff40', opacity: 0.4 },
    { top: 230, left: 0, width: 600, height: 2, color: '#0080ff', opacity: 0.5 },
    { top: 232, left: 400, width: 800, height: 1, color: '#ff0040', opacity: 0.3 },
    { top: 370, left: 100, width: 1100, height: 3, color: '#00ff40', opacity: 0.4 },
    { top: 374, left: 0, width: 500, height: 1, color: '#0080ff', opacity: 0.5 },
    { top: 490, left: 0, width: 1200, height: 2, color: '#ff0040', opacity: 0.5 },
    { top: 493, left: 300, width: 900, height: 1, color: '#00ff40', opacity: 0.3 },
    { top: 155, left: 0, width: 1200, height: 1, color: '#ffffff', opacity: 0.1 },
    { top: 310, left: 0, width: 1200, height: 1, color: '#ffffff', opacity: 0.08 },
    { top: 550, left: 0, width: 1200, height: 1, color: '#ffffff', opacity: 0.1 },
  ];

  // Displaced blocks — chunks of the image that appear shifted
  const displacedBlocks = [
    { top: 90, left: 50, width: 180, height: 12, color: '#0a0a12', shift: 15 },
    { top: 225, left: 600, width: 250, height: 10, color: '#0a0a12', shift: -20 },
    { top: 365, left: 100, width: 300, height: 14, color: '#0a0a12', shift: 25 },
    { top: 485, left: 400, width: 200, height: 11, color: '#0a0a12', shift: -10 },
  ];

  // Static noise dots scattered across
  const noiseDots = Array.from({ length: 50 }, (_, i) => ({
    top: (i * 97 + 31) % 610,
    left: (i * 143 + 67) % 1180,
    size: (i % 3) + 1,
    color: i % 3 === 0 ? '#ff0040' : i % 3 === 1 ? '#00ff40' : '#0080ff',
    opacity: 0.2 + (i % 5) * 0.05,
  }));

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0a12',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Noise dots */}
      {noiseDots.map((dot, i) => (
        <div
          key={`n${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: dot.top,
            left: dot.left,
            width: dot.size,
            height: dot.size,
            backgroundColor: dot.color,
            opacity: dot.opacity,
          }}
        />
      ))}

      {/* RED channel title — offset left and up */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 198,
          left: 58,
          right: 60,
          fontSize: titleSize,
          fontWeight: 800,
          lineHeight: 1.15,
          color: '#ff0000',
          opacity: 0.5,
          zIndex: 2,
        }}
      >
        {meta.title}
      </div>

      {/* GREEN channel title — offset right */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 202,
          left: 64,
          right: 56,
          fontSize: titleSize,
          fontWeight: 800,
          lineHeight: 1.15,
          color: '#00ff00',
          opacity: 0.35,
          zIndex: 2,
        }}
      >
        {meta.title}
      </div>

      {/* BLUE channel title — offset down */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 205,
          left: 60,
          right: 58,
          fontSize: titleSize,
          fontWeight: 800,
          lineHeight: 1.15,
          color: '#0060ff',
          opacity: 0.45,
          zIndex: 2,
        }}
      >
        {meta.title}
      </div>

      {/* Tear lines */}
      {tears.map((tear, i) => (
        <div
          key={`t${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: tear.top,
            left: tear.left,
            width: tear.width,
            height: tear.height,
            backgroundColor: tear.color,
            opacity: tear.opacity,
            zIndex: 8,
          }}
        />
      ))}

      {/* Displaced blocks */}
      {displacedBlocks.map((block, i) => (
        <div
          key={`d${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: block.top,
            left: block.left + block.shift,
            width: block.width,
            height: block.height,
            backgroundColor: block.color,
            border: '1px solid rgba(255,255,255,0.05)',
            zIndex: 7,
          }}
        />
      ))}

      {/* Main content layer */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '40px 60px',
          position: 'relative',
          zIndex: 5,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src={logoSrc} width={34} height={34} />
            <span
              style={{
                marginLeft: 10,
                fontSize: 18,
                fontWeight: 700,
                color: '#ffffff',
              }}
            >
              InferenceX
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 12,
              color: '#ff0040',
              letterSpacing: '0.3em',
              fontWeight: 700,
            }}
          >
            DATA_CORRUPT
          </div>
        </div>

        {/* Title — primary white layer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
          <div
            style={{
              display: 'flex',
              fontSize: 18,
              color: '#888899',
              lineHeight: 1.5,
            }}
          >
            {meta.excerpt.length > 130 ? meta.excerpt.slice(0, 130) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', fontSize: 15, color: '#00ff40', opacity: 0.7 }}>
              {meta.author}
            </div>
            <div style={{ display: 'flex', fontSize: 14, color: '#666680' }}>{formattedDate}</div>
            <div style={{ display: 'flex', fontSize: 13, color: '#555566' }}>
              {meta.readingTime} min
            </div>
          </div>
          {meta.tags && (
            <div style={{ display: 'flex', gap: 10 }}>
              {meta.tags.slice(0, 3).map((tag) => (
                <div
                  key={tag}
                  style={{
                    display: 'flex',
                    fontSize: 11,
                    color: '#0080ff',
                    letterSpacing: '0.1em',
                    opacity: 0.6,
                  }}
                >
                  {tag.toUpperCase()}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    size,
  );
}
