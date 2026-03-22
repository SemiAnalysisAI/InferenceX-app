/**
 * V7: Right Panel — Content on left 2/3, circuit pattern panel on right 1/3.
 * Mirror of the left-stripe concept. The panel is the decorative element.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 52 : 60;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: '#0c0c0e',
        color: '#fafafa',
        overflow: 'hidden',
      }}
    >
      {/* Content area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 800,
          padding: '50px 50px 50px 60px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} height={32} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2 }}>{meta.title}</div>
          <div
            style={{
              fontSize: 28,
              color: '#a1a1aa',
              lineHeight: 1.4,
              maxHeight: 80,
              overflow: 'hidden',
            }}
          >
            {meta.excerpt.length > 120 ? meta.excerpt.slice(0, 120) + '...' : meta.excerpt}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20, fontSize: 24, color: '#a1a1aa' }}>
          <span>{meta.author}</span>
          <span>·</span>
          <span>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span>·</span>
          <span>{meta.readingTime} min read</span>
        </div>
      </div>

      {/* Right panel — circuit pattern */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 400,
          height: '100%',
          backgroundColor: '#0a1a18',
          borderLeft: '3px solid #2dd4bf40',
          position: 'relative',
        }}
      >
        {/* Grid of circuit blocks */}
        {Array.from({ length: 24 }).map((_, i) => {
          const row = Math.floor(i / 4);
          const col = i % 4;
          const isGold = i === 5 || i === 14 || i === 19;
          const color = isGold ? '#eab30840' : '#2dd4bf25';
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 20 + col * 95,
                top: 15 + row * 105,
                width: 80,
                height: 90,
                border: `1.5px solid ${color}`,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {i % 3 === 0 && (
                <div
                  style={{
                    width: 40,
                    height: 40,
                    border: `1px solid ${isGold ? '#eab30830' : '#2dd4bf18'}`,
                    borderRadius: 2,
                    display: 'flex',
                  }}
                />
              )}
            </div>
          );
        })}

        {/* Vertical trace lines */}
        <div
          style={{
            position: 'absolute',
            left: 60,
            top: 0,
            width: 1,
            height: '100%',
            backgroundColor: '#2dd4bf12',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 155,
            top: 0,
            width: 1,
            height: '100%',
            backgroundColor: '#2dd4bf12',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 250,
            top: 0,
            width: 1,
            height: '100%',
            backgroundColor: '#2dd4bf12',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 345,
            top: 0,
            width: 1,
            height: '100%',
            backgroundColor: '#2dd4bf12',
            display: 'flex',
          }}
        />

        {/* Gold accent */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 200,
            width: 3,
            height: 230,
            backgroundColor: '#eab308',
            display: 'flex',
          }}
        />
      </div>
    </div>,
    size,
  );
}
