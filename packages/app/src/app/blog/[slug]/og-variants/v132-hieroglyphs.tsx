/**
 * V132: Hieroglyphs — Egyptian hieroglyphic design with dark sand background, geometric glyph bands, cartouche oval, and Eye of Horus motif.
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

  const gold = '#c8a84e';
  const lapis = '#1e3a5f';
  const darkSand = '#1c1a14';

  // Top hieroglyphic band — repeating geometric glyphs
  const topGlyphs = Array.from({ length: 20 }, (_, i) => {
    const shapes = ['circle', 'triangle', 'rect', 'diamond', 'circle', 'rect'];
    return { left: i * 60, shape: shapes[i % shapes.length] };
  });

  // Bottom hieroglyphic band
  const bottomGlyphs = Array.from({ length: 20 }, (_, i) => {
    const shapes = ['rect', 'circle', 'diamond', 'triangle', 'rect', 'circle'];
    return { left: i * 60, shape: shapes[i % shapes.length] };
  });

  // Eye of Horus components (geometric approximation in top-right)
  const eyeComponents = [
    // Eye outline — oval
    {
      top: 120,
      left: 1010,
      w: 100,
      h: 50,
      borderRadius: '50%',
      bg: 'transparent',
      border: `2px solid ${gold}`,
      opacity: 0.5,
    },
    // Pupil
    {
      top: 133,
      left: 1042,
      w: 36,
      h: 36,
      borderRadius: '50%',
      bg: lapis,
      border: `2px solid ${gold}`,
      opacity: 0.6,
    },
    // Inner pupil
    {
      top: 141,
      left: 1050,
      w: 20,
      h: 20,
      borderRadius: '50%',
      bg: gold,
      border: 'none',
      opacity: 0.4,
    },
    // Teardrop line below eye
    {
      top: 168,
      left: 1055,
      w: 3,
      h: 30,
      borderRadius: '2px',
      bg: gold,
      border: 'none',
      opacity: 0.35,
    },
    // Eyebrow line
    {
      top: 112,
      left: 1000,
      w: 120,
      h: 3,
      borderRadius: '2px',
      bg: gold,
      border: 'none',
      opacity: 0.3,
    },
    // Tail swirl (horizontal line going right from eye)
    {
      top: 145,
      left: 1110,
      w: 40,
      h: 2,
      borderRadius: '1px',
      bg: gold,
      border: 'none',
      opacity: 0.3,
    },
    // Spiral end
    {
      top: 145,
      left: 1148,
      w: 10,
      h: 10,
      borderRadius: '50%',
      bg: 'transparent',
      border: `1px solid ${gold}`,
      opacity: 0.25,
    },
  ];

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: darkSand,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle papyrus texture layer */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#201e16',
          opacity: 0.3,
        }}
      />

      {/* Top border line */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 35,
          left: 30,
          right: 30,
          height: 2,
          backgroundColor: gold,
          opacity: 0.4,
        }}
      />

      {/* Top hieroglyphic band background */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 40,
          left: 30,
          right: 30,
          height: 50,
          backgroundColor: lapis,
          opacity: 0.15,
        }}
      />

      {/* Top glyph shapes */}
      {topGlyphs.map((g, i) => (
        <div
          key={`top-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: g.shape === 'triangle' ? 48 : 50,
            left: 45 + g.left,
            width: g.shape === 'rect' ? 20 : g.shape === 'diamond' ? 14 : 16,
            height: g.shape === 'rect' ? 30 : g.shape === 'triangle' ? 0 : 16,
            borderRadius: g.shape === 'circle' ? 8 : g.shape === 'diamond' ? 2 : 1,
            backgroundColor: g.shape === 'triangle' ? 'transparent' : gold,
            borderLeft: g.shape === 'triangle' ? '8px solid transparent' : 'none',
            borderRight: g.shape === 'triangle' ? '8px solid transparent' : 'none',
            borderBottom: g.shape === 'triangle' ? `16px solid ${gold}` : 'none',
            opacity: 0.3 + (i % 3) * 0.05,
          }}
        />
      ))}

      {/* Top border line bottom */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 92,
          left: 30,
          right: 30,
          height: 2,
          backgroundColor: gold,
          opacity: 0.4,
        }}
      />

      {/* Bottom border line top */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 92,
          left: 30,
          right: 30,
          height: 2,
          backgroundColor: gold,
          opacity: 0.4,
        }}
      />

      {/* Bottom hieroglyphic band background */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 40,
          left: 30,
          right: 30,
          height: 50,
          backgroundColor: lapis,
          opacity: 0.15,
        }}
      />

      {/* Bottom glyph shapes */}
      {bottomGlyphs.map((g, i) => (
        <div
          key={`bot-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: g.shape === 'triangle' ? 48 : 50,
            left: 45 + g.left,
            width: g.shape === 'rect' ? 20 : g.shape === 'diamond' ? 14 : 16,
            height: g.shape === 'rect' ? 30 : g.shape === 'triangle' ? 0 : 16,
            borderRadius: g.shape === 'circle' ? 8 : g.shape === 'diamond' ? 2 : 1,
            backgroundColor: g.shape === 'triangle' ? 'transparent' : gold,
            borderLeft: g.shape === 'triangle' ? '8px solid transparent' : 'none',
            borderRight: g.shape === 'triangle' ? '8px solid transparent' : 'none',
            borderTop: g.shape === 'triangle' ? `16px solid ${gold}` : 'none',
            opacity: 0.3 + (i % 3) * 0.05,
          }}
        />
      ))}

      {/* Bottom border line */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 35,
          left: 30,
          right: 30,
          height: 2,
          backgroundColor: gold,
          opacity: 0.4,
        }}
      />

      {/* Eye of Horus */}
      {eyeComponents.map((ec, i) => (
        <div
          key={`eye-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: ec.top,
            left: ec.left,
            width: ec.w,
            height: ec.h,
            borderRadius: ec.borderRadius,
            backgroundColor: ec.bg,
            border: ec.border,
            opacity: ec.opacity,
          }}
        />
      ))}

      {/* Cartouche oval around title area */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 160,
          left: 80,
          width: 860,
          height: 140,
          borderRadius: 70,
          border: `3px solid ${gold}`,
          opacity: 0.35,
        }}
      />

      {/* Cartouche inner line */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 166,
          left: 86,
          width: 848,
          height: 128,
          borderRadius: 64,
          border: `1px solid ${gold}`,
          opacity: 0.2,
        }}
      />

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          padding: '110px 100px',
          height: '100%',
          zIndex: 3,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
          <img src={logoSrc} width={30} height={30} />
          <span
            style={{
              marginLeft: 10,
              fontSize: 16,
              color: gold,
              fontWeight: 600,
              letterSpacing: '0.2em',
            }}
          >
            INFERENCEX
          </span>
        </div>

        {/* Title inside cartouche */}
        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 700,
            color: '#e8d5a0',
            lineHeight: 1.2,
            marginBottom: 20,
            maxWidth: 800,
            paddingLeft: 20,
          }}
        >
          {meta.title}
        </div>

        {/* Excerpt */}
        <div
          style={{
            display: 'flex',
            fontSize: 19,
            color: '#9a8a60',
            lineHeight: 1.5,
            marginBottom: 20,
            maxWidth: 750,
            paddingLeft: 20,
          }}
        >
          {excerpt}
        </div>

        {/* Spacer */}
        <div style={{ display: 'flex', flex: 1 }} />

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 15, color: '#7a6a40' }}>
            {meta.author} &middot; {formattedDate}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', fontSize: 14, color: '#7a6a40' }}>
              {meta.readingTime} min read
            </div>
          </div>
        </div>

        {/* Tags */}
        {meta.tags && (
          <div style={{ display: 'flex', marginTop: 8, gap: 10 }}>
            {meta.tags.slice(0, 3).map((tag) => (
              <div
                key={tag}
                style={{
                  display: 'flex',
                  fontSize: 11,
                  color: gold,
                  opacity: 0.6,
                  border: `1px solid ${gold}44`,
                  borderRadius: 3,
                  padding: '2px 8px',
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
