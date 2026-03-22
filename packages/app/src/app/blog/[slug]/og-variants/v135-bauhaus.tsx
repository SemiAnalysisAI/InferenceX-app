/**
 * V135: Bauhaus — Stark white background with primary color geometric shapes (circle, square, triangle), heavy black typography, Dessau school aesthetic.
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

  const red = '#e63946';
  const blue = '#1d3557';
  const yellow = '#f1c40f';
  const black = '#000000';
  const bg = '#f5f5f5';

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: bg,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Large red circle — behind and to the right */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 60,
          right: 80,
          width: 280,
          height: 280,
          borderRadius: 140,
          backgroundColor: red,
          opacity: 0.25,
        }}
      />

      {/* Medium blue square — center-left area */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 300,
          left: 80,
          width: 200,
          height: 200,
          backgroundColor: blue,
          opacity: 0.2,
        }}
      />

      {/* Yellow triangle — using CSS border trick */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 100,
          right: 200,
          width: 0,
          height: 0,
          borderLeft: '100px solid transparent',
          borderRight: '100px solid transparent',
          borderBottom: `175px solid ${yellow}`,
          opacity: 0.3,
        }}
      />

      {/* Secondary smaller circle — accent */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 30,
          left: 900,
          width: 50,
          height: 50,
          borderRadius: 25,
          backgroundColor: yellow,
          opacity: 0.5,
        }}
      />

      {/* Small black circle — accent */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 180,
          left: 150,
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: black,
          opacity: 0.15,
        }}
      />

      {/* Thin black horizontal line — Bauhaus compositional line */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 100,
          left: 60,
          width: 500,
          height: 2,
          backgroundColor: black,
          opacity: 0.15,
        }}
      />

      {/* Thin black vertical line */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 60,
          left: 60,
          width: 2,
          height: 510,
          backgroundColor: black,
          opacity: 0.1,
        }}
      />

      {/* Another compositional line — horizontal */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 110,
          left: 300,
          width: 840,
          height: 2,
          backgroundColor: black,
          opacity: 0.1,
        }}
      />

      {/* Small red square accent */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 92,
          left: 52,
          width: 18,
          height: 18,
          backgroundColor: red,
          opacity: 0.6,
        }}
      />

      {/* Small blue circle accent on bottom line */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 104,
          left: 296,
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: blue,
          opacity: 0.5,
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
          zIndex: 3,
        }}
      >
        {/* Logo row */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <img src={logoSrc} width={32} height={32} />
          <span
            style={{
              marginLeft: 12,
              fontSize: 18,
              color: black,
              fontWeight: 800,
              letterSpacing: '0.2em',
            }}
          >
            INFERENCEX
          </span>

          {/* Colored dots after name */}
          <div style={{ display: 'flex', marginLeft: 16, gap: 6, alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: red,
              }}
            />
            <div style={{ display: 'flex', width: 8, height: 8, backgroundColor: blue }} />
            <div
              style={{
                display: 'flex',
                width: 0,
                height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderBottom: `9px solid ${yellow}`,
              }}
            />
          </div>
        </div>

        {/* Spacing */}
        <div style={{ display: 'flex', height: 30 }} />

        {/* Title — heavy black typography */}
        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 900,
            color: black,
            lineHeight: 1.15,
            marginBottom: 24,
            maxWidth: 800,
          }}
        >
          {meta.title}
        </div>

        {/* Excerpt */}
        <div
          style={{
            display: 'flex',
            fontSize: 20,
            color: '#333333',
            lineHeight: 1.5,
            marginBottom: 20,
            maxWidth: 700,
          }}
        >
          {excerpt}
        </div>

        {/* Spacer */}
        <div style={{ display: 'flex', flex: 1 }} />

        {/* Footer row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Red vertical bar accent */}
            <div style={{ display: 'flex', width: 4, height: 24, backgroundColor: red }} />
            <div style={{ display: 'flex', fontSize: 16, color: black, fontWeight: 700 }}>
              {meta.author}
            </div>
            {/* Blue dot separator */}
            <div
              style={{
                display: 'flex',
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: blue,
              }}
            />
            <div style={{ display: 'flex', fontSize: 16, color: '#444444' }}>{formattedDate}</div>
            {/* Yellow dot separator */}
            <div
              style={{
                display: 'flex',
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: yellow,
              }}
            />
            <div style={{ display: 'flex', fontSize: 16, color: '#444444' }}>
              {meta.readingTime} min
            </div>
          </div>
        </div>

        {/* Tags */}
        {meta.tags && (
          <div style={{ display: 'flex', marginTop: 12, gap: 10 }}>
            {meta.tags.slice(0, 3).map((tag, i) => {
              const tagColors = [red, blue, yellow];
              return (
                <div
                  key={tag}
                  style={{
                    display: 'flex',
                    fontSize: 12,
                    fontWeight: 700,
                    color: tagColors[i % 3] === yellow ? black : tagColors[i % 3],
                    border: `2px solid ${tagColors[i % 3]}`,
                    borderRadius: 0,
                    padding: '3px 10px',
                    letterSpacing: '0.05em',
                  }}
                >
                  {tag.toUpperCase()}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    size,
  );
}
