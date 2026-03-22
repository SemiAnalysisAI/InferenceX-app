/**
 * V172: Risograph — Two-color overprint effect with pink/red and blue shapes, misregistered overlap creating purple zones, scattered grain dots.
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

  // Grain dots — scattered small circles for risograph texture
  const grainDots = Array.from({ length: 80 }, (_, i) => ({
    top: (i * 73 + 19) % 615,
    left: (i * 127 + 43) % 1185,
    size: (i % 4) + 1,
    color: i % 2 === 0 ? '#ff4466' : '#2244cc',
    opacity: 0.08 + (i % 6) * 0.02,
  }));

  // Pink/red layer shapes
  const pinkShapes = [
    { top: 40, left: 60, width: 280, height: 200, radius: 140 },
    { top: 350, left: 800, width: 320, height: 220, radius: 20 },
    { top: 100, left: 900, width: 180, height: 180, radius: 90 },
    { top: 420, left: 150, width: 160, height: 160, radius: 80 },
  ];

  // Blue layer shapes — slightly offset from pink for misregistration
  const blueShapes = [
    { top: 45, left: 68, width: 280, height: 200, radius: 140 },
    { top: 356, left: 808, width: 320, height: 220, radius: 20 },
    { top: 106, left: 906, width: 180, height: 180, radius: 90 },
    { top: 426, left: 156, width: 160, height: 160, radius: 80 },
  ];

  // Purple overlap zones (where pink and blue intersect)
  const purpleZones = [
    { top: 45, left: 68, width: 272, height: 195, radius: 130 },
    { top: 356, left: 808, width: 312, height: 214, radius: 18 },
    { top: 106, left: 906, width: 174, height: 174, radius: 87 },
    { top: 426, left: 156, width: 154, height: 154, radius: 77 },
  ];

  // Decorative lines — riso-style ruled marks
  const ruledLines = [
    { top: 265, left: 100, width: 400, height: 2 },
    { top: 270, left: 100, width: 400, height: 1 },
    { top: 395, left: 100, width: 400, height: 2 },
    { top: 400, left: 100, width: 400, height: 1 },
  ];

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#f5f0e8',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Grain texture dots */}
      {grainDots.map((dot, i) => (
        <div
          key={`g${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: dot.top,
            left: dot.left,
            width: dot.size,
            height: dot.size,
            borderRadius: dot.size / 2,
            backgroundColor: dot.color,
            opacity: dot.opacity,
          }}
        />
      ))}

      {/* Pink/red layer */}
      {pinkShapes.map((shape, i) => (
        <div
          key={`p${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: shape.top,
            left: shape.left,
            width: shape.width,
            height: shape.height,
            borderRadius: shape.radius,
            backgroundColor: '#ff4466',
            opacity: 0.3,
          }}
        />
      ))}

      {/* Blue layer — offset for misregistration */}
      {blueShapes.map((shape, i) => (
        <div
          key={`b${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: shape.top,
            left: shape.left,
            width: shape.width,
            height: shape.height,
            borderRadius: shape.radius,
            backgroundColor: '#2244cc',
            opacity: 0.25,
          }}
        />
      ))}

      {/* Purple overlap zones */}
      {purpleZones.map((zone, i) => (
        <div
          key={`pu${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: zone.top,
            left: zone.left,
            width: zone.width,
            height: zone.height,
            borderRadius: zone.radius,
            backgroundColor: '#663388',
            opacity: 0.15,
          }}
        />
      ))}

      {/* Ruled lines */}
      {ruledLines.map((line, i) => (
        <div
          key={`l${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: line.top,
            left: line.left,
            width: line.width,
            height: line.height,
            backgroundColor: '#2244cc',
            opacity: 0.2,
          }}
        />
      ))}

      {/* Content area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: 50,
          left: 100,
          right: 500,
          bottom: 80,
          justifyContent: 'space-between',
          zIndex: 5,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={32} height={32} />
          <span
            style={{
              marginLeft: 10,
              fontSize: 16,
              fontWeight: 800,
              color: '#ff4466',
              letterSpacing: '0.1em',
            }}
          >
            InferenceX
          </span>
        </div>

        {/* Title — rendered twice for riso overprint effect */}
        <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {/* Blue layer of title — offset */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: 3,
              left: 2,
              fontSize: titleSize,
              fontWeight: 900,
              color: '#2244cc',
              lineHeight: 1.15,
              opacity: 0.5,
            }}
          >
            {meta.title}
          </div>
          {/* Pink layer of title */}
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 900,
              color: '#ff4466',
              lineHeight: 1.15,
              opacity: 0.7,
            }}
          >
            {meta.title}
          </div>

          {/* Excerpt */}
          <div
            style={{
              display: 'flex',
              fontSize: 17,
              color: '#444444',
              lineHeight: 1.5,
              marginTop: 16,
            }}
          >
            {meta.excerpt.length > 120 ? meta.excerpt.slice(0, 120) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 14,
              color: '#663388',
              fontWeight: 700,
            }}
          >
            {meta.author} &middot; {formattedDate} &middot; {meta.readingTime} min read
          </div>
          {meta.tags && (
            <div style={{ display: 'flex', gap: 12 }}>
              {meta.tags.slice(0, 3).map((tag) => (
                <div
                  key={tag}
                  style={{
                    display: 'flex',
                    fontSize: 11,
                    color: '#2244cc',
                    letterSpacing: '0.12em',
                    fontWeight: 700,
                    opacity: 0.7,
                  }}
                >
                  {tag.toUpperCase()}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* "RISO" watermark */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 20,
          right: 30,
          fontSize: 12,
          color: '#ff4466',
          opacity: 0.25,
          letterSpacing: '0.3em',
          fontWeight: 800,
          zIndex: 5,
        }}
      >
        RISOGRAPH PRINT
      </div>
    </div>,
    size,
  );
}
