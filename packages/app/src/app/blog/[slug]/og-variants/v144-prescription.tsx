/**
 * V144: Prescription — White bg with pharmaceutical Rx label layout, large Rx symbol, warning stripes, dosage instructions.
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
        backgroundColor: '#f0f0f0',
        fontFamily: 'sans-serif',
        position: 'relative',
        flexDirection: 'column',
      }}
    >
      {/* Prescription label container */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          padding: '24px 36px',
          position: 'relative',
        }}
      >
        {/* Pharmacy header bar */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            backgroundColor: '#1a4a8a',
            padding: '14px 24px',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderRadius: '4px 4px 0 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src={logoSrc} width={22} height={22} />
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: '#ffffff',
                marginLeft: '10px',
                letterSpacing: '0.1em',
              }}
            >
              INFERENCEX PHARMACY
            </span>
          </div>
          <div style={{ display: 'flex' }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
              RX# {meta.date.replace(/-/g, '')}
            </span>
          </div>
        </div>

        {/* Main label body */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            flex: 1,
            backgroundColor: '#ffffff',
            border: '1px solid #cccccc',
            borderTop: 'none',
            padding: '24px 30px',
            position: 'relative',
          }}
        >
          {/* Rx symbol — large, top left */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              top: '16px',
              left: '24px',
            }}
          >
            <span
              style={{
                fontSize: 52,
                fontWeight: 700,
                color: '#1a4a8a',
                fontStyle: 'italic',
                fontFamily: 'serif',
              }}
            >
              Rx
            </span>
          </div>

          {/* Patient and doctor info row */}
          <div
            style={{
              display: 'flex',
              marginLeft: '100px',
              marginBottom: '12px',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontSize: 10,
                  color: '#999999',
                  letterSpacing: '0.08em',
                  marginBottom: '2px',
                }}
              >
                PRESCRIBED BY
              </span>
              <span style={{ fontSize: 15, color: '#333333', fontWeight: 600 }}>
                Dr. {meta.author}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span
                style={{
                  fontSize: 10,
                  color: '#999999',
                  letterSpacing: '0.08em',
                  marginBottom: '2px',
                }}
              >
                FILL DATE
              </span>
              <span style={{ fontSize: 15, color: '#333333' }}>
                {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  timeZone: 'UTC',
                })}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              display: 'flex',
              width: '100%',
              height: '1px',
              backgroundColor: '#e0e0e0',
              marginBottom: '16px',
            }}
          />

          {/* Medication name — title */}
          <div style={{ display: 'flex', marginBottom: '10px' }}>
            <span
              style={{
                fontSize: titleSize - 12,
                fontWeight: 700,
                color: '#1a1a1a',
                lineHeight: 1.2,
              }}
            >
              {meta.title}
            </span>
          </div>

          {/* Dosage instructions */}
          <div
            style={{
              display: 'flex',
              backgroundColor: '#f8f8f8',
              border: '1px solid #e8e8e8',
              padding: '12px 16px',
              marginBottom: '12px',
              borderRadius: '4px',
            }}
          >
            <span style={{ fontSize: 16, color: '#333333', fontWeight: 600 }}>
              TAKE {meta.readingTime} MIN DAILY
            </span>
            <span style={{ fontSize: 14, color: '#888888', marginLeft: '16px' }}>
              &mdash; Read with focus, no distractions
            </span>
          </div>

          {/* Description / excerpt */}
          <div style={{ display: 'flex', marginBottom: '12px' }}>
            <span style={{ fontSize: 14, color: '#666666', lineHeight: 1.5 }}>
              {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
            </span>
          </div>

          {/* Tags */}
          {meta.tags && (
            <div style={{ display: 'flex', flexWrap: 'wrap', marginBottom: '10px' }}>
              {meta.tags.map((tag, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    border: '1px solid #dddddd',
                    padding: '2px 10px',
                    marginRight: '6px',
                    marginBottom: '4px',
                    borderRadius: '2px',
                  }}
                >
                  <span style={{ fontSize: 10, color: '#888888' }}>{tag}</span>
                </div>
              ))}
            </div>
          )}

          {/* Refills remaining */}
          <div style={{ display: 'flex', position: 'absolute', bottom: '16px', right: '30px' }}>
            <span style={{ fontSize: 11, color: '#999999' }}>REFILLS: UNLIMITED</span>
          </div>
        </div>

        {/* Warning stripes at bottom */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '40px',
          }}
        >
          {Array.from({ length: 20 }, (_, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flex: 1,
                backgroundColor: i % 2 === 0 ? '#ff6600' : '#ffffff',
              }}
            />
          ))}
        </div>

        {/* Auxiliary warning label overlay */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: '54px',
            left: '36px',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            padding: '6px 14px',
            borderRadius: '3px',
          }}
        >
          <span style={{ fontSize: 11, color: '#856404', fontWeight: 600 }}>
            CAUTION: May cause deep thinking
          </span>
        </div>
      </div>
    </div>,
    size,
  );
}
