/**
 * V143: Credit Card — Dark bg with centered credit card, chip, holographic stripe, card number-style reading time.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  /* Card number formatting from reading time */
  const cardNumber = `${String(meta.readingTime).padStart(4, '0')}  XXXX  XXXX  ${meta.date.replace(/-/g, '').slice(4)}`;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0a14',
        fontFamily: 'sans-serif',
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Ambient glow behind card */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '120px',
          left: '200px',
          width: '800px',
          height: '400px',
          backgroundColor: 'rgba(60,60,120,0.08)',
          borderRadius: '100px',
        }}
      />

      {/* Credit card body */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '960px',
          height: '520px',
          backgroundColor: '#1a1a2e',
          borderRadius: '20px',
          border: '1px solid rgba(200,168,78,0.2)',
          position: 'relative',
          padding: '40px 50px',
        }}
      >
        {/* Top row — bank logo and card network */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '30px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src={logoSrc} width={28} height={28} />
            <span
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: '#c8a84e',
                marginLeft: '10px',
                letterSpacing: '0.12em',
              }}
            >
              INFERENCEX
            </span>
          </div>
          <div style={{ display: 'flex' }}>
            <span
              style={{
                fontSize: 14,
                color: 'rgba(200,168,78,0.5)',
                letterSpacing: '0.1em',
              }}
            >
              PLATINUM
            </span>
          </div>
        </div>

        {/* Chip */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '60px',
            height: '44px',
            borderRadius: '6px',
            border: '2px solid #c8a84e',
            backgroundColor: 'rgba(200,168,78,0.1)',
            marginBottom: '24px',
            position: 'relative',
          }}
        >
          {/* Chip internal lines */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: '14px',
              left: '8px',
              right: '8px',
              height: '1px',
              backgroundColor: 'rgba(200,168,78,0.4)',
            }}
          />
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: '26px',
              left: '8px',
              right: '8px',
              height: '1px',
              backgroundColor: 'rgba(200,168,78,0.4)',
            }}
          />
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: '8px',
              left: '28px',
              width: '1px',
              height: '28px',
              backgroundColor: 'rgba(200,168,78,0.4)',
            }}
          />
        </div>

        {/* Card number */}
        <div style={{ display: 'flex', marginBottom: '20px' }}>
          <span
            style={{
              fontSize: 22,
              color: 'rgba(255,255,255,0.6)',
              letterSpacing: '0.15em',
              fontFamily: 'monospace',
            }}
          >
            {cardNumber}
          </span>
        </div>

        {/* Title as cardholder name */}
        <div style={{ display: 'flex', marginBottom: '12px' }}>
          <span
            style={{
              fontSize: titleSize - 20,
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.2,
            }}
          >
            {meta.title}
          </span>
        </div>

        {/* Cardholder and expiry row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontSize: 9,
                color: 'rgba(255,255,255,0.3)',
                letterSpacing: '0.1em',
                marginBottom: '2px',
              }}
            >
              CARDHOLDER NAME
            </span>
            <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)' }}>
              {meta.author.toUpperCase()}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span
              style={{
                fontSize: 9,
                color: 'rgba(255,255,255,0.3)',
                letterSpacing: '0.1em',
                marginBottom: '2px',
              }}
            >
              VALID THRU
            </span>
            <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)' }}>
              {meta.date.slice(5, 7)}/{meta.date.slice(2, 4)}
            </span>
          </div>
        </div>

        {/* Tags */}
        {meta.tags && (
          <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: '12px' }}>
            {meta.tags.map((tag, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  padding: '2px 10px',
                  marginRight: '6px',
                  border: '1px solid rgba(200,168,78,0.2)',
                  borderRadius: '2px',
                }}
              >
                <span style={{ fontSize: 10, color: 'rgba(200,168,78,0.5)' }}>{tag}</span>
              </div>
            ))}
          </div>
        )}

        {/* Holographic stripe — colored bar at bottom */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: '40px',
            left: '50px',
            right: '50px',
            height: '6px',
            borderRadius: '3px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flex: 1,
              backgroundColor: 'rgba(255,100,100,0.3)',
              borderRadius: '3px 0 0 3px',
            }}
          />
          <div style={{ display: 'flex', flex: 1, backgroundColor: 'rgba(255,200,50,0.3)' }} />
          <div style={{ display: 'flex', flex: 1, backgroundColor: 'rgba(100,255,100,0.3)' }} />
          <div style={{ display: 'flex', flex: 1, backgroundColor: 'rgba(100,100,255,0.3)' }} />
          <div
            style={{
              display: 'flex',
              flex: 1,
              backgroundColor: 'rgba(200,100,255,0.3)',
              borderRadius: '0 3px 3px 0',
            }}
          />
        </div>

        {/* Date formatted */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: '55px',
            right: '50px',
          }}
        >
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
        </div>

        {/* Contactless symbol — three arcs approximated */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: '40px',
            right: '50px',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.15)',
            }}
          />
          <div
            style={{
              display: 'flex',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.1)',
              position: 'absolute',
              top: '-4px',
            }}
          />
          <div
            style={{
              display: 'flex',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.05)',
              position: 'absolute',
              top: '-8px',
            }}
          />
        </div>
      </div>
    </div>,
    size,
  );
}
