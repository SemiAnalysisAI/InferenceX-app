/**
 * V161: Safety Card — Airline safety card with panel layout, numbered steps, and pictogram-style shapes.
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
        backgroundColor: '#e8e8e8',
        padding: '24px 32px',
        fontFamily: 'sans-serif',
        position: 'relative',
      }}
    >
      {/* Top header bar */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          backgroundColor: '#003399',
          padding: '10px 24px',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={22} height={22} />
          <span
            style={{
              fontSize: 14,
              color: '#ffffff',
              fontWeight: 700,
              marginLeft: '10px',
              letterSpacing: '0.15em',
            }}
          >
            INFERENCEX AIRLINES
          </span>
        </div>
        <span style={{ fontSize: 12, color: '#ffffff', letterSpacing: '0.1em' }}>
          SAFETY INFORMATION CARD
        </span>
      </div>

      {/* "IN CASE OF READING" header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
          marginBottom: '14px',
        }}
      >
        <div
          style={{
            display: 'flex',
            backgroundColor: '#cc0000',
            padding: '6px 28px',
          }}
        >
          <span
            style={{ fontSize: 20, fontWeight: 900, color: '#ffffff', letterSpacing: '0.12em' }}
          >
            IN CASE OF READING
          </span>
        </div>
      </div>

      {/* Title panel */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          border: '2px solid #003399',
          padding: '14px 20px',
          marginBottom: '14px',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontSize: titleSize > 56 ? 22 : 26,
            fontWeight: 700,
            color: '#1a1a1a',
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          {meta.title}
        </span>
      </div>

      {/* Three numbered step panels */}
      <div style={{ display: 'flex', width: '100%', flex: 1 }}>
        {/* Step 1 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            border: '1px solid #bbbbbb',
            marginRight: '8px',
            padding: '14px',
            backgroundColor: '#f4f4f4',
          }}
        >
          <div style={{ display: 'flex', marginBottom: '10px', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                width: '28px',
                height: '28px',
                backgroundColor: '#003399',
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: '50%',
                marginRight: '10px',
              }}
            >
              <span style={{ fontSize: 14, color: '#ffffff', fontWeight: 700 }}>1</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>OPEN ARTICLE</span>
          </div>
          {/* Pictogram: person + rectangle (screen) */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginRight: '16px',
              }}
            >
              {/* Head */}
              <div
                style={{
                  display: 'flex',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: '#003399',
                }}
              />
              {/* Body */}
              <div
                style={{
                  display: 'flex',
                  width: '16px',
                  height: '30px',
                  backgroundColor: '#003399',
                  marginTop: '4px',
                }}
              />
            </div>
            {/* Screen */}
            <div
              style={{
                display: 'flex',
                width: '60px',
                height: '45px',
                border: '2px solid #003399',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 8, color: '#003399' }}>BLOG</span>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            border: '1px solid #bbbbbb',
            marginRight: '8px',
            padding: '14px',
            backgroundColor: '#f4f4f4',
          }}
        >
          <div style={{ display: 'flex', marginBottom: '10px', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                width: '28px',
                height: '28px',
                backgroundColor: '#003399',
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: '50%',
                marginRight: '10px',
              }}
            >
              <span style={{ fontSize: 14, color: '#ffffff', fontWeight: 700 }}>2</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>
              READ {meta.readingTime} MIN
            </span>
          </div>
          {/* Pictogram: person reading */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {/* Head */}
              <div
                style={{
                  display: 'flex',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: '#003399',
                }}
              />
              {/* Body */}
              <div
                style={{
                  display: 'flex',
                  width: '16px',
                  height: '30px',
                  backgroundColor: '#003399',
                  marginTop: '4px',
                }}
              />
              {/* Arms holding document */}
              <div style={{ display: 'flex', marginTop: '-20px' }}>
                <div
                  style={{
                    display: 'flex',
                    width: '24px',
                    height: '6px',
                    backgroundColor: '#003399',
                    marginRight: '4px',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    width: '24px',
                    height: '6px',
                    backgroundColor: '#003399',
                  }}
                />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <span style={{ fontSize: 10, color: '#666666' }}>
              approx. {meta.readingTime} minutes
            </span>
          </div>
        </div>

        {/* Step 3 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            border: '1px solid #bbbbbb',
            padding: '14px',
            backgroundColor: '#f4f4f4',
          }}
        >
          <div style={{ display: 'flex', marginBottom: '10px', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                width: '28px',
                height: '28px',
                backgroundColor: '#003399',
                justifyContent: 'center',
                alignItems: 'center',
                borderRadius: '50%',
                marginRight: '10px',
              }}
            >
              <span style={{ fontSize: 14, color: '#ffffff', fontWeight: 700 }}>3</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>SHARE</span>
          </div>
          {/* Pictogram: two people */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginRight: '20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: '#003399',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  width: '16px',
                  height: '30px',
                  backgroundColor: '#003399',
                  marginTop: '4px',
                }}
              />
            </div>
            {/* Arrow */}
            <div
              style={{
                display: 'flex',
                width: '30px',
                height: '4px',
                backgroundColor: '#cc0000',
                marginBottom: '10px',
              }}
            />
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginLeft: '20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: '#003399',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  width: '16px',
                  height: '30px',
                  backgroundColor: '#003399',
                  marginTop: '4px',
                }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <span style={{ fontSize: 10, color: '#666666' }}>with fellow passengers</span>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '10px',
          padding: '6px 0',
        }}
      >
        <span style={{ fontSize: 11, color: '#888888' }}>
          By {meta.author} |{' '}
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
        <div style={{ display: 'flex' }}>
          {meta.tags &&
            meta.tags.slice(0, 3).map((tag, i) => (
              <span
                key={i}
                style={{ fontSize: 10, color: '#888888', marginLeft: i > 0 ? '8px' : '0' }}
              >
                {tag}
              </span>
            ))}
        </div>
      </div>
    </div>,
    size,
  );
}
