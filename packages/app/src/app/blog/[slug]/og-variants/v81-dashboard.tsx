/**
 * V81: Dashboard — Data dashboard panel with a top bar, KPI-style title display,
 * data labels for author/date, and subtle grid lines in the background.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

// Grid lines
const hGridLines = Array.from({ length: 12 }, (_, i) => ({ y: 60 + i * 50 }));
const vGridLines = Array.from({ length: 10 }, (_, i) => ({ x: 100 + i * 120 }));

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
        backgroundColor: '#0f1117',
        color: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Grid lines horizontal */}
      {hGridLines.map((line, i) => (
        <div
          key={`hg${i}`}
          style={{
            position: 'absolute',
            left: 0,
            top: line.y,
            width: 1200,
            height: 1,
            backgroundColor: '#ffffff06',
            display: 'flex',
          }}
        />
      ))}

      {/* Grid lines vertical */}
      {vGridLines.map((line, i) => (
        <div
          key={`vg${i}`}
          style={{
            position: 'absolute',
            left: line.x,
            top: 0,
            width: 1,
            height: 630,
            backgroundColor: '#ffffff06',
            display: 'flex',
          }}
        />
      ))}

      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 52,
          backgroundColor: '#161822',
          borderBottom: '1px solid #2a2d3a',
          padding: '0 30px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 9999,
              backgroundColor: '#22c55e',
              display: 'flex',
            }}
          />
          <span style={{ fontSize: 14, color: '#a1a1b5', letterSpacing: 2 }}>
            INFERENCEX ANALYTICS
          </span>
        </div>
        <div style={{ display: 'flex', gap: 20, fontSize: 13, color: '#5a5a72' }}>
          <span>OVERVIEW</span>
          <span style={{ color: '#7c8aff', borderBottom: '2px solid #7c8aff' }}>BLOG</span>
          <span>METRICS</span>
        </div>
      </div>

      {/* Dashboard body */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '36px 50px 40px',
        }}
      >
        {/* Logo + status indicators */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 2,
          }}
        >
          <img src={logoSrc} height={28} />
          <div style={{ display: 'flex', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: '#5a5a72', letterSpacing: 1 }}>READ TIME</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#7c8aff' }}>
                {meta.readingTime}m
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: '#5a5a72', letterSpacing: 1 }}>TAGS</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>
                {meta.tags ? meta.tags.length : 0}
              </span>
            </div>
          </div>
        </div>

        {/* KPI-style title */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, zIndex: 2 }}>
          <div style={{ fontSize: 12, color: '#5a5a72', letterSpacing: 2 }}>LATEST POST</div>
          <div
            style={{
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.2,
              color: '#ffffff',
              display: 'flex',
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              fontSize: 24,
              color: '#7a7a8e',
              lineHeight: 1.4,
              maxHeight: 70,
              overflow: 'hidden',
              display: 'flex',
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '...' : meta.excerpt}
          </div>
        </div>

        {/* Data labels footer */}
        <div style={{ display: 'flex', gap: 40, fontSize: 14, zIndex: 2 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: '#5a5a72', letterSpacing: 1, fontSize: 11 }}>AUTHOR</span>
            <span style={{ color: '#c4c4d4', fontSize: 20, fontWeight: 600 }}>{meta.author}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: '#5a5a72', letterSpacing: 1, fontSize: 11 }}>PUBLISHED</span>
            <span style={{ color: '#c4c4d4', fontSize: 20 }}>
              {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ color: '#5a5a72', letterSpacing: 1, fontSize: 11 }}>STATUS</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 9999,
                  backgroundColor: '#22c55e',
                  display: 'flex',
                }}
              />
              <span style={{ color: '#22c55e', fontSize: 20 }}>Published</span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
