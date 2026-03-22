/**
 * V131: Stained Glass — Cathedral stained glass window with jewel-toned panes separated by thick dark lead borders, sacred geometry feel.
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

  // Jewel tone colors
  const ruby = '#9b1b30';
  const sapphire = '#1a3a7a';
  const emerald = '#1a6b3a';
  const amber = '#c4881a';
  const amethyst = '#5a1a6b';
  const topaz = '#b8860b';

  // Stained glass pane grid — arranged as irregular mosaic
  const panes = [
    // Top row
    { top: 0, left: 0, w: 150, h: 120, color: sapphire, opacity: 0.7 },
    { top: 0, left: 155, w: 120, h: 80, color: ruby, opacity: 0.65 },
    { top: 0, left: 280, w: 180, h: 120, color: emerald, opacity: 0.6 },
    { top: 0, left: 465, w: 100, h: 80, color: amber, opacity: 0.7 },
    { top: 0, left: 570, w: 160, h: 120, color: amethyst, opacity: 0.55 },
    { top: 0, left: 735, w: 130, h: 80, color: ruby, opacity: 0.6 },
    { top: 0, left: 870, w: 170, h: 120, color: sapphire, opacity: 0.65 },
    { top: 0, left: 1045, w: 155, h: 80, color: emerald, opacity: 0.7 },

    // Second row fragments
    { top: 85, left: 155, w: 120, h: 40, color: topaz, opacity: 0.5 },
    { top: 85, left: 465, w: 100, h: 40, color: sapphire, opacity: 0.5 },
    { top: 85, left: 735, w: 130, h: 40, color: amber, opacity: 0.55 },
    { top: 85, left: 1045, w: 155, h: 40, color: ruby, opacity: 0.5 },

    // Middle rows — around the content area, creating a frame
    { top: 125, left: 0, w: 80, h: 100, color: amber, opacity: 0.6 },
    { top: 125, left: 1120, w: 80, h: 100, color: emerald, opacity: 0.6 },
    { top: 230, left: 0, w: 80, h: 110, color: ruby, opacity: 0.55 },
    { top: 230, left: 1120, w: 80, h: 110, color: amethyst, opacity: 0.55 },
    { top: 345, left: 0, w: 80, h: 100, color: emerald, opacity: 0.6 },
    { top: 345, left: 1120, w: 80, h: 100, color: amber, opacity: 0.6 },

    // Bottom rows
    { top: 450, left: 0, w: 80, h: 180, color: sapphire, opacity: 0.65 },
    { top: 450, left: 1120, w: 80, h: 180, color: ruby, opacity: 0.65 },

    { top: 530, left: 85, w: 130, h: 100, color: amethyst, opacity: 0.5 },
    { top: 530, left: 220, w: 160, h: 100, color: amber, opacity: 0.55 },
    { top: 530, left: 385, w: 120, h: 100, color: sapphire, opacity: 0.6 },
    { top: 530, left: 510, w: 180, h: 100, color: ruby, opacity: 0.5 },
    { top: 530, left: 695, w: 140, h: 100, color: emerald, opacity: 0.6 },
    { top: 530, left: 840, w: 130, h: 100, color: topaz, opacity: 0.55 },
    { top: 530, left: 975, w: 140, h: 100, color: amethyst, opacity: 0.5 },
  ];

  // Rose window circle elements (sacred geometry at center-top)
  const roseCircles = [
    { top: 125, left: 520, size: 160, border: 4, color: amber, opacity: 0.25 },
    { top: 155, left: 550, size: 100, border: 3, color: ruby, opacity: 0.2 },
    { top: 180, left: 575, size: 50, border: 2, color: sapphire, opacity: 0.3 },
    { top: 195, left: 590, size: 20, border: 0, color: amber, opacity: 0.4 },
  ];

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0c0c10',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Lead frame background */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#1a1a1e',
        }}
      />

      {/* Stained glass panes */}
      {panes.map((pane, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            top: pane.top,
            left: pane.left,
            width: pane.w,
            height: pane.h,
            backgroundColor: pane.color,
            opacity: pane.opacity,
            border: '4px solid #0c0c10',
          }}
        />
      ))}

      {/* Inner glow on select panes */}
      {panes.slice(0, 8).map((pane, i) => (
        <div
          key={`glow-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: pane.top + 8,
            left: pane.left + 8,
            width: pane.w - 16,
            height: pane.h - 16,
            backgroundColor: '#ffffff',
            opacity: 0.04,
            borderRadius: 2,
          }}
        />
      ))}

      {/* Rose window / sacred geometry circles */}
      {roseCircles.map((circle, i) => (
        <div
          key={`rose-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: circle.top,
            left: circle.left,
            width: circle.size,
            height: circle.size,
            borderRadius: circle.size / 2,
            backgroundColor: circle.border === 0 ? circle.color : 'transparent',
            border: circle.border > 0 ? `${circle.border}px solid ${circle.color}` : 'none',
            opacity: circle.opacity,
          }}
        />
      ))}

      {/* Content overlay panel */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: 130,
          left: 100,
          right: 100,
          bottom: 120,
          backgroundColor: '#0c0c10',
          opacity: 0.85,
          borderRadius: 4,
        }}
      />

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: 145,
          left: 130,
          right: 130,
          bottom: 135,
          zIndex: 4,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <img src={logoSrc} width={28} height={28} />
          <span
            style={{
              marginLeft: 10,
              fontSize: 16,
              color: '#d4af37',
              fontWeight: 600,
              letterSpacing: '0.15em',
            }}
          >
            INFERENCEX
          </span>
        </div>

        {/* Title */}
        <div
          style={{
            display: 'flex',
            fontSize: titleSize - 4,
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1.2,
            marginBottom: 16,
            maxWidth: 800,
          }}
        >
          {meta.title}
        </div>

        {/* Excerpt */}
        <div
          style={{
            display: 'flex',
            fontSize: 18,
            color: '#c0c0c8',
            lineHeight: 1.5,
            maxWidth: 700,
          }}
        >
          {excerpt}
        </div>

        {/* Spacer */}
        <div style={{ display: 'flex', flex: 1 }} />

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 14, color: '#888890' }}>
            {meta.author} &middot; {formattedDate}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', fontSize: 13, color: '#888890' }}>
              {meta.readingTime} min read
            </div>
            {meta.tags &&
              meta.tags.slice(0, 2).map((tag) => (
                <div
                  key={tag}
                  style={{
                    display: 'flex',
                    fontSize: 11,
                    color: '#d4af37',
                    opacity: 0.7,
                    border: '1px solid #d4af3744',
                    borderRadius: 3,
                    padding: '2px 6px',
                  }}
                >
                  {tag}
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Gothic arch suggestion at the very top — curved border */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: -300,
          left: 350,
          width: 500,
          height: 400,
          borderRadius: '0 0 250px 250px',
          border: '3px solid #d4af37',
          opacity: 0.08,
        }}
      />
    </div>,
    size,
  );
}
