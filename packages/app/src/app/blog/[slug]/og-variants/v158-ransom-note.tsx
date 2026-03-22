/**
 * V158: Ransom Note — Chaotic cut-out collage with alternating sizes, colors, and offset word blocks.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const words = meta.title.split(/\s+/);
  const colors = [
    '#ff3333',
    '#ffffff',
    '#ffdd00',
    '#33ff66',
    '#ff6633',
    '#66ccff',
    '#ff66cc',
    '#ffffff',
  ];
  const bgColors = [
    '#333333',
    '#1a1a1a',
    '#2a1a1a',
    '#1a2a1a',
    '#2a2a1a',
    '#1a1a2a',
    '#2a1a2a',
    '#222222',
  ];
  const sizes = [28, 36, 24, 40, 30, 34, 26, 38, 32, 22, 44, 20];
  const paddings = ['6px 10px', '8px 14px', '4px 8px', '10px 16px', '5px 12px', '7px 11px'];
  const marginTops = [0, -4, 6, -2, 8, -6, 4, -3, 5, -5, 2, 7];
  const marginLefts = [0, 4, -2, 6, -4, 2, -6, 8, -3, 5, -1, 3];

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0a0a',
        padding: '40px 60px',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
      }}
    >
      {/* Scattered cut-out header */}
      <div
        style={{
          display: 'flex',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            backgroundColor: '#cc0000',
            padding: '4px 16px',
          }}
        >
          <span style={{ fontSize: 14, color: '#ffffff', fontWeight: 700, letterSpacing: '0.2em' }}>
            INFERENCEX BLOG
          </span>
        </div>
      </div>

      {/* Title words as cut-outs */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          maxWidth: '1000px',
          padding: '10px',
        }}
      >
        {words.map((word, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              backgroundColor: bgColors[i % bgColors.length],
              padding: paddings[i % paddings.length],
              marginTop: `${marginTops[i % marginTops.length]}px`,
              marginLeft: `${marginLefts[i % marginLefts.length]}px`,
              marginRight: '4px',
              marginBottom: '6px',
              border: `1px solid ${colors[i % colors.length]}33`,
            }}
          >
            <span
              style={{
                fontSize: sizes[i % sizes.length],
                fontWeight: i % 3 === 0 ? 900 : i % 3 === 1 ? 400 : 700,
                color: colors[i % colors.length],
                fontFamily: i % 2 === 0 ? 'serif' : 'monospace',
                letterSpacing: i % 4 === 0 ? '0.08em' : '0',
              }}
            >
              {i % 2 === 0 ? word.toUpperCase() : word.toLowerCase()}
            </span>
          </div>
        ))}
      </div>

      {/* Author and date cutouts */}
      <div style={{ display: 'flex', marginTop: '20px', alignItems: 'center' }}>
        <div
          style={{
            display: 'flex',
            backgroundColor: '#1a2a1a',
            padding: '4px 12px',
            marginRight: '8px',
          }}
        >
          <span style={{ fontSize: 16, color: '#33ff66', fontFamily: 'serif' }}>{meta.author}</span>
        </div>
        <div
          style={{
            display: 'flex',
            backgroundColor: '#2a1a1a',
            padding: '4px 12px',
            marginRight: '8px',
          }}
        >
          <span style={{ fontSize: 14, color: '#ff6633', fontFamily: 'monospace' }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            backgroundColor: '#1a1a2a',
            padding: '4px 12px',
          }}
        >
          <span style={{ fontSize: 14, color: '#66ccff', fontFamily: 'monospace' }}>
            {meta.readingTime} min
          </span>
        </div>
      </div>

      {/* Tags scattered */}
      {meta.tags && (
        <div
          style={{ display: 'flex', marginTop: '12px', flexWrap: 'wrap', justifyContent: 'center' }}
        >
          {meta.tags.map((tag, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                backgroundColor: bgColors[(i + 3) % bgColors.length],
                padding: '2px 8px',
                marginRight: '6px',
                marginTop: `${marginTops[(i + 5) % marginTops.length]}px`,
              }}
            >
              <span style={{ fontSize: 11, color: colors[(i + 2) % colors.length] }}>
                {tag.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Logo */}
      <div style={{ display: 'flex', position: 'absolute', bottom: '20px', right: '30px' }}>
        <img src={logoSrc} width={22} height={22} />
      </div>
    </div>,
    size,
  );
}
