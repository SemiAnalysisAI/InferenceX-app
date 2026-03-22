/**
 * V141: Cassette Tape — Dark bg with cassette label design, tape reels, SIDE A, retro 80s/90s orange-brown aesthetic.
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
        backgroundColor: '#1a1410',
        fontFamily: 'sans-serif',
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Cassette shell body */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '1050px',
          height: '540px',
          backgroundColor: '#2a2218',
          border: '3px solid #3d3225',
          borderRadius: '12px',
          position: 'relative',
          padding: '20px',
        }}
      >
        {/* Screw holes — four corners */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: '14px',
            left: '14px',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            border: '1px solid #4a3d2e',
            backgroundColor: '#1a1410',
          }}
        />
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: '14px',
            right: '14px',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            border: '1px solid #4a3d2e',
            backgroundColor: '#1a1410',
          }}
        />
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: '14px',
            left: '14px',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            border: '1px solid #4a3d2e',
            backgroundColor: '#1a1410',
          }}
        />
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: '14px',
            right: '14px',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            border: '1px solid #4a3d2e',
            backgroundColor: '#1a1410',
          }}
        />

        {/* Main label area — center sticker */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            backgroundColor: '#d4a84e',
            borderRadius: '4px',
            padding: '18px 28px',
            position: 'relative',
          }}
        >
          {/* Label top row — SIDE A and record label */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span
                style={{ fontSize: 13, fontWeight: 700, color: '#3d2b1a', letterSpacing: '0.2em' }}
              >
                SIDE A
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <img src={logoSrc} width={14} height={14} />
              <span
                style={{
                  fontSize: 11,
                  color: '#5a4020',
                  marginLeft: '5px',
                  letterSpacing: '0.12em',
                  fontWeight: 600,
                }}
              >
                INFERENCEX RECORDS
              </span>
            </div>
          </div>

          {/* Horizontal line */}
          <div
            style={{
              display: 'flex',
              width: '100%',
              height: '1px',
              backgroundColor: 'rgba(61,43,26,0.3)',
              marginBottom: '10px',
            }}
          />

          {/* Title — album/mix name */}
          <div style={{ display: 'flex', marginBottom: '8px' }}>
            <span
              style={{
                fontSize: Math.min(titleSize - 16, 42),
                fontWeight: 700,
                color: '#2a1a0a',
                lineHeight: 1.2,
              }}
            >
              {meta.title}
            </span>
          </div>

          {/* Artist line */}
          <div style={{ display: 'flex', marginBottom: '6px' }}>
            <span style={{ fontSize: 15, color: '#5a4020' }}>Performed by {meta.author}</span>
          </div>

          {/* Horizontal line */}
          <div
            style={{
              display: 'flex',
              width: '100%',
              height: '1px',
              backgroundColor: 'rgba(61,43,26,0.3)',
              marginBottom: '8px',
            }}
          />

          {/* Bottom row — date and duration */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: '#6b5030' }}>
              Recorded:{' '}
              {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </span>
            <span style={{ fontSize: 11, color: '#6b5030' }}>Duration: {meta.readingTime} min</span>
          </div>

          {/* Tags row */}
          {meta.tags && (
            <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '8px' }}>
              {meta.tags.map((tag, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    padding: '1px 8px',
                    marginRight: '6px',
                    border: '1px solid rgba(61,43,26,0.3)',
                    borderRadius: '2px',
                  }}
                >
                  <span style={{ fontSize: 10, color: '#5a4020' }}>{tag}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tape window area */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            marginTop: '16px',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative',
          }}
        >
          {/* Left reel */}
          <div
            style={{
              display: 'flex',
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              border: '3px solid #4a3d2e',
              backgroundColor: '#1a1410',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Inner hub */}
            <div
              style={{
                display: 'flex',
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                border: '2px solid #5a4d3e',
                backgroundColor: '#2a2218',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: '#4a3d2e',
                }}
              />
            </div>
          </div>

          {/* Tape window — between reels */}
          <div
            style={{
              display: 'flex',
              width: '300px',
              height: '50px',
              backgroundColor: 'rgba(60,45,30,0.4)',
              border: '1px solid #4a3d2e',
              borderRadius: '4px',
              marginLeft: '30px',
              marginRight: '30px',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Tape lines visible through window */}
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  width: '100%',
                  height: '1px',
                  backgroundColor: 'rgba(100,80,50,0.3)',
                  position: 'absolute',
                  top: `${10 + i * 8}px`,
                }}
              />
            ))}
            <span style={{ fontSize: 9, color: 'rgba(200,168,78,0.4)', letterSpacing: '0.15em' }}>
              NORMAL POSITION
            </span>
          </div>

          {/* Right reel */}
          <div
            style={{
              display: 'flex',
              width: '100px',
              height: '100px',
              borderRadius: '50%',
              border: '3px solid #4a3d2e',
              backgroundColor: '#1a1410',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Inner hub */}
            <div
              style={{
                display: 'flex',
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                border: '2px solid #5a4d3e',
                backgroundColor: '#2a2218',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: '#4a3d2e',
                }}
              />
            </div>
          </div>
        </div>

        {/* Bottom edge detail */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            justifyContent: 'center',
            marginTop: '14px',
          }}
        >
          <span style={{ fontSize: 9, color: 'rgba(200,168,78,0.25)', letterSpacing: '0.2em' }}>
            TYPE I &middot; 60 MIN &middot; HIGH OUTPUT
          </span>
        </div>
      </div>
    </div>,
    size,
  );
}
