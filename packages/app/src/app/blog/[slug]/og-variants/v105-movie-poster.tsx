/**
 * V105: Movie Poster — Cinematic poster with massive title, colored glow, and genre labels.
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
        backgroundColor: '#0a0a12',
        color: '#ffffff',
        fontFamily: 'sans-serif',
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 80px',
      }}
    >
      {/* Subtle colored glow behind title — layered translucent divs */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          width: '600px',
          height: '200px',
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          borderRadius: '50%',
          top: '180px',
          left: '300px',
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          width: '500px',
          height: '160px',
          backgroundColor: 'rgba(99, 102, 241, 0.06)',
          borderRadius: '50%',
          top: '200px',
          left: '350px',
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          width: '400px',
          height: '120px',
          backgroundColor: 'rgba(139, 92, 246, 0.05)',
          borderRadius: '50%',
          top: '220px',
          left: '400px',
        }}
      />

      {/* Date / Coming soon at top */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '40px',
          left: '0',
          right: '0',
          justifyContent: 'center',
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontSize: 14,
            letterSpacing: '0.4em',
            color: '#8888aa',
          }}
        >
          {new Date(meta.date + 'T00:00:00Z')
            .toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })
            .toUpperCase()}
        </span>
      </div>

      {/* Logo */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '38px',
          left: '50px',
          zIndex: 1,
        }}
      >
        <img src={logoSrc} width={24} height={24} />
      </div>

      {/* Title — MASSIVE */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontSize: titleSize + 16,
            fontWeight: 900,
            textAlign: 'center',
            lineHeight: 1.0,
            maxWidth: '95%',
            letterSpacing: '-0.02em',
          }}
        >
          {meta.title}
        </span>
      </div>

      {/* "A film by" author */}
      <div
        style={{
          display: 'flex',
          marginTop: '28px',
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontSize: 18,
            color: '#aaaacc',
            fontStyle: 'italic',
          }}
        >
          A film by {meta.author}
        </span>
      </div>

      {/* Excerpt */}
      <div
        style={{
          display: 'flex',
          marginTop: '16px',
          zIndex: 1,
          maxWidth: '70%',
        }}
      >
        <span
          style={{
            fontSize: 14,
            color: '#666680',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
        </span>
      </div>

      {/* Genre labels (tags) at bottom */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '40px',
          left: '0',
          right: '0',
          justifyContent: 'center',
          zIndex: 1,
        }}
      >
        {meta.tags &&
          meta.tags.map((tag, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                padding: '5px 16px',
                border: '1px solid #444466',
                borderRadius: '2px',
                marginLeft: i > 0 ? '10px' : '0px',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  letterSpacing: '0.15em',
                  color: '#8888aa',
                }}
              >
                {tag.toUpperCase()}
              </span>
            </div>
          ))}
      </div>

      {/* Reading time bottom-right */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '42px',
          right: '50px',
          zIndex: 1,
        }}
      >
        <span style={{ fontSize: 11, color: '#555566' }}>{meta.readingTime} MIN</span>
      </div>
    </div>,
    size,
  );
}
