/**
 * V140: Polaroid — Medium grey bg with a centered polaroid frame, thick white border, title as photo, handwritten author.
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
        width: '100%',
        height: '100%',
        backgroundColor: '#2a2a2a',
        fontFamily: 'serif',
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Subtle surface texture */}
      {Array.from({ length: 20 }, (_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            left: ((i * 113 + 7) % 1180) + 10,
            top: ((i * 71 + 23) % 610) + 10,
            width: 2,
            height: 2,
            backgroundColor: `rgba(255,255,255,${0.02 + (i % 3) * 0.01})`,
            borderRadius: '50%',
          }}
        />
      ))}

      {/* Shadow behind polaroid — offset darker div */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '58px',
          left: '258px',
          width: '700px',
          height: '530px',
          backgroundColor: 'rgba(0,0,0,0.35)',
        }}
      />

      {/* Polaroid frame — white border */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '700px',
          height: '530px',
          backgroundColor: '#f5f3ef',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* Top border */}
        <div style={{ display: 'flex', height: '24px', width: '100%' }} />

        {/* Left/Right borders wrap the photo area */}
        <div style={{ display: 'flex', flex: 1, padding: '0 24px' }}>
          {/* Photo area — dark with title */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              height: '100%',
              backgroundColor: '#1a1a2e',
              padding: '30px 35px',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            {/* Date — top left of photo */}
            <div style={{ display: 'flex', position: 'absolute', top: '14px', left: '20px' }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  timeZone: 'UTC',
                })}
              </span>
            </div>

            {/* Logo — top right of photo */}
            <div
              style={{
                display: 'flex',
                position: 'absolute',
                top: '12px',
                right: '20px',
                alignItems: 'center',
              }}
            >
              <img src={logoSrc} width={16} height={16} />
              <span
                style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.3)',
                  marginLeft: '5px',
                  letterSpacing: '0.1em',
                }}
              >
                INFERENCEX
              </span>
            </div>

            {/* Title as the "photo" content */}
            <div style={{ display: 'flex', marginBottom: '14px' }}>
              <span
                style={{
                  fontSize: titleSize - 6,
                  fontWeight: 700,
                  color: '#ffffff',
                  lineHeight: 1.2,
                }}
              >
                {meta.title}
              </span>
            </div>

            {/* Excerpt */}
            <div style={{ display: 'flex' }}>
              <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                {meta.excerpt.length > 100 ? meta.excerpt.slice(0, 100) + '\u2026' : meta.excerpt}
              </span>
            </div>

            {/* Tags — bottom of photo */}
            {meta.tags && (
              <div
                style={{
                  display: 'flex',
                  position: 'absolute',
                  bottom: '14px',
                  left: '20px',
                  flexWrap: 'wrap',
                }}
              >
                {meta.tags.map((tag, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      padding: '2px 8px',
                      marginRight: '6px',
                      backgroundColor: 'rgba(255,255,255,0.08)',
                      borderRadius: '2px',
                    }}
                  >
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{tag}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Reading time — bottom right of photo */}
            <div
              style={{
                display: 'flex',
                position: 'absolute',
                bottom: '14px',
                right: '20px',
              }}
            >
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                {meta.readingTime} min
              </span>
            </div>
          </div>
        </div>

        {/* Wide bottom margin — author "handwritten" */}
        <div
          style={{
            display: 'flex',
            height: '90px',
            width: '100%',
            padding: '16px 40px',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontSize: 22,
              color: '#444444',
              fontStyle: 'italic',
            }}
          >
            {meta.author}
          </span>
        </div>
      </div>
    </div>,
    size,
  );
}
