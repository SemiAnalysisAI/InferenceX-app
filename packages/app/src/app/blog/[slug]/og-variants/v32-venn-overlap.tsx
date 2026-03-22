/**
 * V32: Venn Overlap — 3 large translucent circles overlapping Venn-diagram style.
 * Each circle uses a different color (teal, gold, blue) with content over the intersection.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const CIRCLES = [
  { cx: 480, cy: 240, r: 220, color: '#0d9488', opacity: 0.2 },
  { cx: 720, cy: 240, r: 220, color: '#2563eb', opacity: 0.2 },
  { cx: 600, cy: 440, r: 220, color: '#d97706', opacity: 0.2 },
];

const CIRCLE_BORDERS = [
  { cx: 480, cy: 240, r: 220, color: '#14b8a6', opacity: 0.4 },
  { cx: 720, cy: 240, r: 220, color: '#3b82f6', opacity: 0.4 },
  { cx: 600, cy: 440, r: 220, color: '#f59e0b', opacity: 0.4 },
];

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
        backgroundColor: '#0f172a',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Venn circles — fills */}
      {CIRCLES.map((c, i) => (
        <div
          key={`f-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: c.cx - c.r,
            top: c.cy - c.r,
            width: c.r * 2,
            height: c.r * 2,
            borderRadius: 9999,
            backgroundColor: c.color,
            opacity: c.opacity,
          }}
        />
      ))}

      {/* Venn circles — borders */}
      {CIRCLE_BORDERS.map((c, i) => (
        <div
          key={`b-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: c.cx - c.r,
            top: c.cy - c.r,
            width: c.r * 2,
            height: c.r * 2,
            borderRadius: 9999,
            border: `1.5px solid ${c.color}`,
            opacity: c.opacity,
          }}
        />
      ))}

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '40px 56px',
          width: '100%',
          height: '100%',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Top row: logo + tags */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src={logoSrc} width={44} height={44} />
            <span style={{ color: '#e2e8f0', fontSize: 22, marginLeft: 12, fontWeight: 600 }}>
              InferenceX
            </span>
          </div>
          {meta.tags && meta.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              {meta.tags.slice(0, 3).map((tag) => (
                <div
                  key={tag}
                  style={{
                    display: 'flex',
                    padding: '4px 14px',
                    borderRadius: 9999,
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    color: '#94a3b8',
                    fontSize: 14,
                  }}
                >
                  {tag}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Title & excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 860 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              color: '#f1f5f9',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#cbd5e1',
              lineHeight: 1.5,
              opacity: 0.8,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ color: '#14b8a6', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#334155', fontSize: 22 }}>\u00b7</span>
          <span style={{ color: '#64748b', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#334155', fontSize: 22 }}>\u00b7</span>
          <span style={{ color: '#64748b', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
