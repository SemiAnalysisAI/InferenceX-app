/**
 * V145: Billboard — Dark sky bg with green highway sign, white border, exit number, arrow, reflective dot pattern.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  /* Reflective dots on the sign surface */
  const reflectiveDots = Array.from({ length: 50 }, (_, i) => ({
    left: ((i * 79 + 13) % 900) + 40,
    top: ((i * 43 + 29) % 350) + 40,
    opacity: 0.04 + (i % 4) * 0.02,
  }));

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a1628',
        fontFamily: 'sans-serif',
        position: 'relative',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Stars in the night sky */}
      {Array.from({ length: 15 }, (_, i) => (
        <div
          key={`star-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: ((i * 137 + 41) % 1180) + 10,
            top: ((i * 29 + 7) % 100) + 10,
            width: 2,
            height: 2,
            backgroundColor: `rgba(255,255,255,${0.15 + (i % 4) * 0.1})`,
            borderRadius: '50%',
          }}
        />
      ))}

      {/* Sign support posts — left */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '0px',
          left: '200px',
          width: '8px',
          height: '120px',
          backgroundColor: '#3a3a3a',
        }}
      />
      {/* Sign support posts — right */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '0px',
          right: '200px',
          width: '8px',
          height: '120px',
          backgroundColor: '#3a3a3a',
        }}
      />

      {/* Highway sign */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '1020px',
          height: '440px',
          backgroundColor: '#006400',
          borderRadius: '8px',
          border: '6px solid #ffffff',
          position: 'relative',
          padding: '30px 50px',
        }}
      >
        {/* Reflective dot pattern on sign surface */}
        {reflectiveDots.map((dot, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              position: 'absolute',
              left: dot.left,
              top: dot.top,
              width: 3,
              height: 3,
              backgroundColor: `rgba(255,255,255,${dot.opacity})`,
              borderRadius: '50%',
            }}
          />
        ))}

        {/* Top row — Interstate shield and route info */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', zIndex: 1 }}>
          {/* Interstate shield shape approximation */}
          <div
            style={{
              display: 'flex',
              width: '56px',
              height: '48px',
              backgroundColor: '#1a3a8a',
              border: '3px solid #ffffff',
              borderRadius: '4px',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>IX</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: '16px' }}>
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.1em' }}>
              INFERENCEX HIGHWAY
            </span>
          </div>

          {/* Logo — top right */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: '30px',
              right: '50px',
              alignItems: 'center',
            }}
          >
            <img src={logoSrc} width={20} height={20} />
          </div>
        </div>

        {/* Divider line */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '2px',
            backgroundColor: 'rgba(255,255,255,0.3)',
            marginBottom: '24px',
            zIndex: 1,
          }}
        />

        {/* Main destination — title */}
        <div style={{ display: 'flex', marginBottom: '14px', zIndex: 1 }}>
          <span
            style={{
              fontSize: titleSize,
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.2,
              letterSpacing: '0.02em',
            }}
          >
            {meta.title}
          </span>
        </div>

        {/* Excerpt as secondary destination */}
        <div style={{ display: 'flex', marginBottom: '16px', zIndex: 1 }}>
          <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>
            {meta.excerpt.length > 110 ? meta.excerpt.slice(0, 110) + '\u2026' : meta.excerpt}
          </span>
        </div>

        {/* Bottom row — EXIT info and arrow */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: '30px',
            left: '50px',
            right: '50px',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 1,
          }}
        >
          {/* Exit badge */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                backgroundColor: '#ffffff',
                padding: '4px 14px',
                borderRadius: '3px',
                marginRight: '12px',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: '#006400' }}>
                EXIT {meta.readingTime}
              </span>
            </div>
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>{meta.author}</span>
            <span
              style={{
                fontSize: 14,
                color: 'rgba(255,255,255,0.25)',
                marginLeft: '12px',
                marginRight: '12px',
              }}
            >
              |
            </span>
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
              {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </span>
          </div>

          {/* Arrow pointing right — constructed from rectangles */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* Arrow shaft */}
            <div
              style={{
                display: 'flex',
                width: '60px',
                height: '6px',
                backgroundColor: '#ffffff',
              }}
            />
            {/* Arrow head — stacked bars narrowing */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <div
                style={{
                  display: 'flex',
                  width: '18px',
                  height: '3px',
                  backgroundColor: '#ffffff',
                  marginBottom: '0px',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  width: '12px',
                  height: '3px',
                  backgroundColor: '#ffffff',
                  marginBottom: '0px',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  width: '6px',
                  height: '3px',
                  backgroundColor: '#ffffff',
                  marginBottom: '0px',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  width: '12px',
                  height: '3px',
                  backgroundColor: '#ffffff',
                  marginBottom: '0px',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  width: '18px',
                  height: '3px',
                  backgroundColor: '#ffffff',
                }}
              />
            </div>
          </div>
        </div>

        {/* Tags */}
        {meta.tags && (
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              bottom: '70px',
              left: '50px',
              flexWrap: 'wrap',
              zIndex: 1,
            }}
          >
            {meta.tags.map((tag, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  padding: '2px 10px',
                  marginRight: '8px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '2px',
                }}
              >
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{tag}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    size,
  );
}
