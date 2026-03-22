/**
 * V127: Cave Painting — Rough stone-brown background with ochre and red oxide hand-prints, stick figures, and primal energy.
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
  const excerpt = meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt;

  // Hand-print-like circles (ochre and red oxide)
  const handPrints = [
    { top: 50, left: 80, size: 45, color: '#c4883a', opacity: 0.35 },
    { top: 120, left: 1050, size: 55, color: '#8b3a2a', opacity: 0.3 },
    { top: 400, left: 60, size: 50, color: '#c4883a', opacity: 0.25 },
    { top: 500, left: 1000, size: 40, color: '#8b3a2a', opacity: 0.35 },
    { top: 280, left: 1100, size: 35, color: '#c4883a', opacity: 0.2 },
    { top: 550, left: 500, size: 30, color: '#8b3a2a', opacity: 0.15 },
    { top: 100, left: 700, size: 25, color: '#c4883a', opacity: 0.12 },
  ];

  // Finger marks radiating from hand prints
  const fingerMarks = [
    { top: 25, left: 70, w: 8, h: 22, color: '#c4883a', opacity: 0.25 },
    { top: 30, left: 90, w: 7, h: 20, color: '#c4883a', opacity: 0.22 },
    { top: 28, left: 108, w: 8, h: 18, color: '#c4883a', opacity: 0.2 },
    { top: 32, left: 60, w: 7, h: 19, color: '#c4883a', opacity: 0.18 },
    { top: 95, left: 1040, w: 9, h: 24, color: '#8b3a2a', opacity: 0.25 },
    { top: 93, left: 1060, w: 8, h: 22, color: '#8b3a2a', opacity: 0.22 },
    { top: 98, left: 1080, w: 7, h: 20, color: '#8b3a2a', opacity: 0.2 },
    { top: 96, left: 1100, w: 8, h: 23, color: '#8b3a2a', opacity: 0.18 },
  ];

  // Stick figure elements (simple lines using thin tall/wide divs)
  const stickFigures = [
    // Figure 1 - body
    { top: 150, left: 1020, w: 4, h: 50, color: '#c4883a', opacity: 0.3 },
    // Figure 1 - head
    { top: 135, left: 1013, w: 18, h: 18, color: '#c4883a', opacity: 0.3, round: true },
    // Figure 1 - left arm
    { top: 165, left: 1000, w: 22, h: 4, color: '#c4883a', opacity: 0.25 },
    // Figure 1 - right arm
    { top: 165, left: 1022, w: 22, h: 4, color: '#c4883a', opacity: 0.25 },
    // Figure 1 - left leg
    { top: 198, left: 1005, w: 4, h: 30, color: '#c4883a', opacity: 0.25 },
    // Figure 1 - right leg
    { top: 198, left: 1030, w: 4, h: 30, color: '#c4883a', opacity: 0.25 },

    // Figure 2 - body
    { top: 420, left: 1080, w: 4, h: 45, color: '#8b3a2a', opacity: 0.3 },
    // Figure 2 - head
    { top: 407, left: 1074, w: 16, h: 16, color: '#8b3a2a', opacity: 0.3, round: true },
    // Figure 2 - arms (raised)
    { top: 425, left: 1060, w: 20, h: 4, color: '#8b3a2a', opacity: 0.25 },
    { top: 425, left: 1082, w: 20, h: 4, color: '#8b3a2a', opacity: 0.25 },
  ];

  // Scattered dots mimicking stone texture
  const stoneDots = Array.from({ length: 25 }, (_, i) => ({
    top: (i * 137 + 50) % 600,
    left: (i * 211 + 30) % 1170,
    size: 3 + (i % 4),
    opacity: 0.06 + (i % 5) * 0.02,
  }));

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#1a1510',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Stone texture base layer */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#1e1812',
          opacity: 0.5,
        }}
      />

      {/* Stone texture dots */}
      {stoneDots.map((dot, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            top: dot.top,
            left: dot.left,
            width: dot.size,
            height: dot.size,
            borderRadius: dot.size,
            backgroundColor: '#a08060',
            opacity: dot.opacity,
          }}
        />
      ))}

      {/* Hand-print circles */}
      {handPrints.map((hp, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            top: hp.top,
            left: hp.left,
            width: hp.size,
            height: hp.size,
            borderRadius: hp.size,
            backgroundColor: hp.color,
            opacity: hp.opacity,
          }}
        />
      ))}

      {/* Finger marks */}
      {fingerMarks.map((fm, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            top: fm.top,
            left: fm.left,
            width: fm.w,
            height: fm.h,
            borderRadius: 4,
            backgroundColor: fm.color,
            opacity: fm.opacity,
          }}
        />
      ))}

      {/* Stick figures and lines */}
      {stickFigures.map((sf, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            top: sf.top,
            left: sf.left,
            width: sf.w,
            height: sf.h,
            borderRadius: 'round' in sf && sf.round ? sf.w : 2,
            backgroundColor: sf.color,
            opacity: sf.opacity,
          }}
        />
      ))}

      {/* Horizontal primitive line across middle area */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 340,
          left: 80,
          width: 200,
          height: 3,
          backgroundColor: '#c4883a',
          opacity: 0.15,
        }}
      />

      {/* Another primitive line */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 480,
          left: 900,
          width: 150,
          height: 3,
          backgroundColor: '#8b3a2a',
          opacity: 0.15,
        }}
      />

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          padding: '60px 100px',
          height: '100%',
          zIndex: 2,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 30 }}>
          <img src={logoSrc} width={32} height={32} />
          <span
            style={{
              marginLeft: 10,
              fontSize: 16,
              color: '#c4883a',
              fontWeight: 700,
              letterSpacing: '0.15em',
            }}
          >
            INFERENCEX
          </span>
        </div>

        {/* Title — large and primitive */}
        <div
          style={{
            display: 'flex',
            fontSize: titleSize + 4,
            fontWeight: 900,
            color: '#d4a055',
            lineHeight: 1.15,
            marginBottom: 20,
            maxWidth: 850,
          }}
        >
          {meta.title}
        </div>

        {/* Excerpt */}
        <div
          style={{
            display: 'flex',
            fontSize: 20,
            color: '#a08060',
            lineHeight: 1.5,
            marginBottom: 20,
            maxWidth: 750,
          }}
        >
          {excerpt}
        </div>

        {/* Spacer */}
        <div style={{ display: 'flex', flex: 1 }} />

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 16, color: '#8b6530' }}>
            {meta.author} &middot; {formattedDate}
          </div>
          <div style={{ display: 'flex', fontSize: 14, color: '#6b4c2a' }}>
            {meta.readingTime} min read
          </div>
        </div>

        {/* Tags */}
        {meta.tags && (
          <div style={{ display: 'flex', marginTop: 10, gap: 10 }}>
            {meta.tags.slice(0, 3).map((tag) => (
              <div
                key={tag}
                style={{
                  display: 'flex',
                  fontSize: 12,
                  color: '#c4883a',
                  opacity: 0.7,
                }}
              >
                {tag}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    size,
  );
}
