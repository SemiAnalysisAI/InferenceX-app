/**
 * V149: Periodic Element — Dark bg with a large centered periodic-table-style
 * element cell. Reading time as atomic number, title initials as symbol.
 * Surrounded by subtle grid lines suggesting the periodic table.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#08080e';
const CELL_BG = '#10121c';
const CELL_BORDER = '#2a3050';
const ACCENT = '#5b8def';
const GRID = '#ffffff06';

// Generate the "element symbol" from the title
function getSymbol(title: string): string {
  const words = title.split(/\s+/).filter((w) => w.length > 0);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return title.slice(0, 2).toUpperCase();
}

// Subtle grid lines around the main cell
const hLines = [0, 70, 140, 210, 280, 350, 420, 490, 560, 630];
const vLines = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200];

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const symbol = getSymbol(meta.title);

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        color: '#e0e4f0',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background grid — horizontal */}
      {hLines.map((y, i) => (
        <div
          key={`h${i}`}
          style={{
            position: 'absolute',
            left: 0,
            top: y,
            width: 1200,
            height: 1,
            backgroundColor: GRID,
            display: 'flex',
          }}
        />
      ))}

      {/* Background grid — vertical */}
      {vLines.map((x, i) => (
        <div
          key={`v${i}`}
          style={{
            position: 'absolute',
            left: x,
            top: 0,
            width: 1,
            height: 630,
            backgroundColor: GRID,
            display: 'flex',
          }}
        />
      ))}

      {/* Small ghost cells in background */}
      {[
        { x: 50, y: 70 },
        { x: 150, y: 70 },
        { x: 1050, y: 70 },
        { x: 50, y: 140 },
        { x: 1050, y: 140 },
        { x: 950, y: 140 },
        { x: 50, y: 490 },
        { x: 150, y: 490 },
        { x: 250, y: 490 },
        { x: 950, y: 490 },
        { x: 1050, y: 490 },
      ].map((c, i) => (
        <div
          key={`gc${i}`}
          style={{
            position: 'absolute',
            left: c.x,
            top: c.y,
            width: 80,
            height: 60,
            border: '1px solid #ffffff06',
            borderRadius: 2,
            display: 'flex',
          }}
        />
      ))}

      {/* Logo — top left */}
      <div style={{ position: 'absolute', top: 30, left: 40, display: 'flex' }}>
        <img src={logoSrc} height={28} />
      </div>

      {/* Main element cell */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: 340,
          height: 380,
          backgroundColor: CELL_BG,
          border: `2px solid ${CELL_BORDER}`,
          borderRadius: 8,
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Atomic number (reading time) */}
        <div
          style={{
            position: 'absolute',
            top: 20,
            left: 24,
            fontSize: 24,
            color: ACCENT,
            fontWeight: 600,
            display: 'flex',
          }}
        >
          {meta.readingTime}
        </div>

        {/* Element symbol */}
        <div
          style={{
            fontSize: 120,
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1,
            marginTop: 10,
            display: 'flex',
          }}
        >
          {symbol}
        </div>

        {/* Element name (title, truncated) */}
        <div
          style={{
            fontSize: 18,
            color: '#8890b0',
            textAlign: 'center',
            marginTop: 8,
            maxWidth: 280,
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          {meta.title.length > 30 ? meta.title.slice(0, 30) + '\u2026' : meta.title}
        </div>

        {/* Discovered by */}
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            fontSize: 14,
            color: '#505878',
            display: 'flex',
          }}
        >
          Discovered by {meta.author}
        </div>
      </div>

      {/* Full title below cell */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: 24,
          zIndex: 1,
          maxWidth: 900,
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1.3,
            textAlign: 'center',
            display: 'flex',
          }}
        >
          {meta.title}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          position: 'absolute',
          bottom: 30,
          display: 'flex',
          gap: 24,
          fontSize: 20,
          color: '#506080',
        }}
      >
        <span style={{ fontWeight: 600, color: ACCENT }}>{meta.author}</span>
        <span>{'\u00b7'}</span>
        <span>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
        <span>{'\u00b7'}</span>
        <span>{meta.readingTime} min read</span>
        {meta.tags &&
          meta.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              style={{
                backgroundColor: '#151828',
                padding: '3px 10px',
                borderRadius: 9999,
                fontSize: 16,
                color: ACCENT,
              }}
            >
              {tag}
            </span>
          ))}
      </div>
    </div>,
    size,
  );
}
