/**
 * V174: Psychedelic 60s — Groovy poster with nested rounded rectangles creating a tunnel/portal, bright saturated colors, peace signs.
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

  // Psychedelic color palette
  const colors = [
    '#ff6600', // orange
    '#ff00ff', // magenta
    '#00ff00', // lime
    '#9900ff', // purple
    '#ffff00', // yellow
    '#ff0066', // hot pink
    '#00ffcc', // cyan-green
    '#ff3300', // red-orange
  ];

  // Nested rounded rectangles creating a tunnel/portal effect
  const tunnelLayers = Array.from({ length: 16 }, (_, i) => {
    const inset = i * 22;
    return {
      top: 10 + inset,
      left: 10 + inset,
      right: 10 + inset,
      bottom: 10 + inset,
      color: colors[i % colors.length],
      borderRadius: 30 + i * 4,
      borderWidth: 6,
    };
  });

  // Flower shapes — circles arranged in a flower pattern
  // Each "flower" is a center circle + 5-6 petal circles
  const flowerCenters = [
    { top: 30, left: 30, size: 18 },
    { top: 560, left: 1130, size: 20 },
    { top: 540, left: 40, size: 16 },
    { top: 20, left: 1120, size: 18 },
  ];

  // Peace sign — circle with lines: center circle + 3 lines (vertical + 2 diagonal approximated)
  const peaceSignX = 60;
  const peaceSignY = 280;
  const peaceSignSize = 50;

  // Small scattered circles for "bubble" / groovy dots
  const bubbles = Array.from({ length: 20 }, (_, i) => ({
    top: (i * 113 + 37) % 600,
    left: (i * 157 + 91) % 1170,
    size: 6 + (i % 4) * 3,
    color: colors[i % colors.length],
    opacity: 0.3 + (i % 4) * 0.1,
  }));

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#1a0030',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Nested tunnel rectangles */}
      {tunnelLayers.map((layer, i) => (
        <div
          key={`t${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: layer.top,
            left: layer.left,
            right: layer.right,
            bottom: layer.bottom,
            border: `${layer.borderWidth}px solid ${layer.color}`,
            borderRadius: layer.borderRadius,
            opacity: 0.7,
          }}
        />
      ))}

      {/* Groovy bubbles */}
      {bubbles.map((bubble, i) => (
        <div
          key={`b${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: bubble.top,
            left: bubble.left,
            width: bubble.size,
            height: bubble.size,
            borderRadius: bubble.size / 2,
            backgroundColor: bubble.color,
            opacity: bubble.opacity,
          }}
        />
      ))}

      {/* Flower shapes — petal circles around a center */}
      {flowerCenters.map((flower, fi) => {
        const petals = Array.from({ length: 6 }, (_, pi) => {
          const angle = (pi / 6) * Math.PI * 2;
          const petalDist = flower.size * 0.9;
          return {
            top: flower.top + Math.sin(angle) * petalDist - flower.size * 0.35,
            left: flower.left + Math.cos(angle) * petalDist - flower.size * 0.35,
            size: flower.size * 0.7,
          };
        });
        return [
          // Petals
          ...petals.map((petal, pi) => (
            <div
              key={`f${fi}p${pi}`}
              style={{
                display: 'flex',
                position: 'absolute',
                top: petal.top,
                left: petal.left,
                width: petal.size,
                height: petal.size,
                borderRadius: petal.size / 2,
                backgroundColor: colors[(fi + pi) % colors.length],
                opacity: 0.5,
              }}
            />
          )),
          // Center
          <div
            key={`f${fi}c`}
            style={{
              display: 'flex',
              position: 'absolute',
              top: flower.top - flower.size * 0.25,
              left: flower.left - flower.size * 0.25,
              width: flower.size * 0.5,
              height: flower.size * 0.5,
              borderRadius: flower.size * 0.25,
              backgroundColor: '#ffff00',
              opacity: 0.7,
            }}
          />,
        ];
      })}

      {/* Peace sign — circle + vertical line + two angled lines (approximated) */}
      {/* Circle */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: peaceSignY,
          left: peaceSignX,
          width: peaceSignSize,
          height: peaceSignSize,
          borderRadius: peaceSignSize / 2,
          border: '3px solid #00ff00',
          opacity: 0.5,
        }}
      />
      {/* Vertical line */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: peaceSignY,
          left: peaceSignX + peaceSignSize / 2 - 1,
          width: 3,
          height: peaceSignSize,
          backgroundColor: '#00ff00',
          opacity: 0.5,
        }}
      />
      {/* Left "leg" — approximated with a rectangle */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: peaceSignY + peaceSignSize / 2 - 1,
          left: peaceSignX + 4,
          width: peaceSignSize / 2 - 3,
          height: 3,
          backgroundColor: '#00ff00',
          opacity: 0.5,
        }}
      />
      {/* Right "leg" */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: peaceSignY + peaceSignSize / 2 - 1,
          left: peaceSignX + peaceSignSize / 2,
          width: peaceSignSize / 2 - 3,
          height: 3,
          backgroundColor: '#00ff00',
          opacity: 0.5,
        }}
      />

      {/* Content zone — dark center */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 180,
          left: 250,
          width: 700,
          height: 280,
          backgroundColor: '#1a0030',
          borderRadius: 20,
          opacity: 0.85,
          zIndex: 5,
        }}
      />

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: 190,
          left: 280,
          width: 640,
          height: 260,
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <img src={logoSrc} width={28} height={28} />
          <span
            style={{
              marginLeft: 8,
              fontSize: 15,
              fontWeight: 800,
              color: '#ff00ff',
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
            fontSize: titleSize * 0.8,
            fontWeight: 900,
            color: '#ffffff',
            lineHeight: 1.2,
            textAlign: 'center',
            justifyContent: 'center',
          }}
        >
          {meta.title}
        </div>

        {/* Excerpt */}
        <div
          style={{
            display: 'flex',
            fontSize: 16,
            color: '#cc99ff',
            lineHeight: 1.4,
            textAlign: 'center',
            marginTop: 12,
            justifyContent: 'center',
            maxWidth: 550,
          }}
        >
          {meta.excerpt.length > 110 ? meta.excerpt.slice(0, 110) + '\u2026' : meta.excerpt}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            fontSize: 13,
            color: '#ff6600',
            marginTop: 14,
            fontWeight: 700,
            letterSpacing: '0.1em',
          }}
        >
          {meta.author} &middot; {formattedDate} &middot; {meta.readingTime} min
        </div>

        {/* Tags */}
        {meta.tags && (
          <div style={{ display: 'flex', marginTop: 8, gap: 12 }}>
            {meta.tags.slice(0, 3).map((tag, i) => (
              <div
                key={tag}
                style={{
                  display: 'flex',
                  fontSize: 11,
                  color: colors[i % colors.length],
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                }}
              >
                {tag.toUpperCase()}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* "GROOVY" watermark */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 8,
          left: 0,
          right: 0,
          justifyContent: 'center',
          fontSize: 11,
          color: '#9900ff',
          opacity: 0.3,
          letterSpacing: '0.5em',
          zIndex: 10,
        }}
      >
        FAR OUT
      </div>
    </div>,
    size,
  );
}
