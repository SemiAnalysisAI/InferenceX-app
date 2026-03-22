/**
 * V164: Test Pattern — Classic TV color bars with broadcast header, title, and "PLEASE STAND BY" footer.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  const barColors = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff'];

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0a0a',
        fontFamily: 'monospace',
        position: 'relative',
      }}
    >
      {/* Top broadcast header */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px 40px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={24} height={24} />
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: '#ffffff',
              marginLeft: '12px',
              letterSpacing: '0.2em',
            }}
          >
            INFERENCEX BROADCAST
          </span>
        </div>
      </div>

      {/* Channel / date info */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          justifyContent: 'space-between',
          padding: '0 60px 10px',
        }}
      >
        <span style={{ fontSize: 12, color: '#666666' }}>
          CH.{meta.readingTime} |{' '}
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
        <span style={{ fontSize: 12, color: '#666666' }}>{meta.author.toUpperCase()}</span>
      </div>

      {/* Color bars */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '200px',
        }}
      >
        {barColors.map((color, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flex: 1,
              height: '100%',
              backgroundColor: color,
            }}
          />
        ))}
      </div>

      {/* Thin black separator */}
      <div style={{ display: 'flex', width: '100%', height: '4px', backgroundColor: '#000000' }} />

      {/* Lower complement bars (darker versions) */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '30px',
        }}
      >
        {barColors.map((_, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flex: 1,
              height: '100%',
              backgroundColor: [
                '#0000ff',
                '#000000',
                '#ff00ff',
                '#000000',
                '#00ffff',
                '#000000',
                '#ffffff',
              ][i],
            }}
          />
        ))}
      </div>

      {/* Title area */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          width: '100%',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '10px 60px',
        }}
      >
        <span
          style={{
            fontSize: titleSize > 56 ? 26 : 32,
            fontWeight: 700,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.3,
            maxWidth: '900px',
          }}
        >
          {meta.title}
        </span>
      </div>

      {/* Tags */}
      {meta.tags && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '6px' }}>
          {meta.tags.slice(0, 4).map((tag, i) => (
            <span
              key={i}
              style={{
                fontSize: 11,
                color: barColors[i % barColors.length],
                marginLeft: i > 0 ? '12px' : '0',
                letterSpacing: '0.05em',
              }}
            >
              {tag.toUpperCase()}
            </span>
          ))}
        </div>
      )}

      {/* PLEASE STAND BY footer */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '14px 0',
          backgroundColor: '#111111',
        }}
      >
        <span style={{ fontSize: 20, fontWeight: 700, color: '#ffffff', letterSpacing: '0.3em' }}>
          PLEASE STAND BY
        </span>
      </div>

      {/* Time code */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          justifyContent: 'center',
          padding: '6px 0 10px',
        }}
      >
        <span style={{ fontSize: 14, color: '#555555', letterSpacing: '0.15em' }}>
          TC 00:{String(meta.readingTime).padStart(2, '0')}:00:00
        </span>
      </div>
    </div>,
    size,
  );
}
