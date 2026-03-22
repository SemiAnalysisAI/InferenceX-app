/**
 * V159: Typewriter — Off-white paper with monospace typed text, roller guide, and red ribbon accent.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

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
        backgroundColor: '#f5f0e8',
        color: '#2a2a2a',
        fontFamily: 'monospace',
        position: 'relative',
      }}
    >
      {/* Roller guide line at top */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '6px',
          backgroundColor: '#d4cfc4',
        }}
      />
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '2px',
          backgroundColor: '#b5b0a4',
          marginBottom: '8px',
        }}
      />

      {/* Small carriage indicator at top right */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '14px',
          right: '60px',
          width: '40px',
          height: '12px',
          backgroundColor: '#8a8478',
        }}
      />

      {/* Page content area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '50px 100px 40px 120px',
          flex: 1,
        }}
      >
        {/* Left margin line */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            left: '90px',
            top: '30px',
            bottom: '30px',
            width: '1px',
            backgroundColor: '#e0b0b0',
          }}
        />

        {/* Date line */}
        <div style={{ display: 'flex', marginBottom: '24px' }}>
          <span style={{ fontSize: 14, color: '#777777' }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
        </div>

        {/* Title — typed text */}
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '28px' }}>
          <span
            style={{
              fontSize: titleSize - 16,
              fontWeight: 700,
              lineHeight: 1.4,
              color: '#1a1a1a',
              letterSpacing: '0.02em',
            }}
          >
            {meta.title}
          </span>
        </div>

        {/* Horizontal typed line */}
        <div style={{ display: 'flex', marginBottom: '20px' }}>
          <span style={{ fontSize: 12, color: '#cccccc', letterSpacing: '0.05em' }}>
            _______________________________________________
          </span>
        </div>

        {/* Author — red ribbon accent */}
        <div style={{ display: 'flex', marginBottom: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#999999', marginRight: '8px' }}>by</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#cc3333' }}>{meta.author}</span>
        </div>

        {/* Excerpt — lighter typed text */}
        <div style={{ display: 'flex', marginBottom: '16px' }}>
          <span style={{ fontSize: 14, color: '#666666', lineHeight: 1.6, maxWidth: '700px' }}>
            {meta.excerpt.length > 160 ? meta.excerpt.slice(0, 160) + '...' : meta.excerpt}
          </span>
        </div>

        {/* Reading time */}
        <div style={{ display: 'flex', marginBottom: '8px' }}>
          <span style={{ fontSize: 12, color: '#888888' }}>
            Reading time: {meta.readingTime} minutes
          </span>
        </div>

        {/* Tags */}
        {meta.tags && (
          <div style={{ display: 'flex' }}>
            <span style={{ fontSize: 11, color: '#aaaaaa' }}>[{meta.tags.join('] [')}]</span>
          </div>
        )}
      </div>

      {/* Logo bottom-right */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '24px',
          right: '40px',
          alignItems: 'center',
        }}
      >
        <img src={logoSrc} width={20} height={20} />
        <span style={{ fontSize: 10, color: '#aaaaaa', marginLeft: '6px', letterSpacing: '0.1em' }}>
          INFERENCEX
        </span>
      </div>

      {/* Bottom roller line */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '2px',
          backgroundColor: '#d4cfc4',
        }}
      />
    </div>,
    size,
  );
}
