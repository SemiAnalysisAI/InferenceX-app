/**
 * V157: Passport — Dark navy cover with inner off-white page, MRZ zone, and official document styling.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  const surname = meta.author.split(' ').slice(-1)[0].toUpperCase();
  const givenNames = meta.author.split(' ').slice(0, -1).join(' ').toUpperCase() || 'AUTHOR';
  const mrzName = `${surname}<<${givenNames.replace(/ /g, '<')}`;
  const mrzLine1 = `P<BLG${mrzName}${'<'.repeat(Math.max(0, 44 - 5 - mrzName.length))}`.slice(
    0,
    44,
  );
  const mrzLine2 =
    `INF${meta.date.replace(/-/g, '').slice(2)}<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<`.slice(0, 44);

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: '#1a2744',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: 'monospace',
        position: 'relative',
      }}
    >
      {/* Passport cover emblem text */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '20px',
          left: '0',
          width: '100%',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 11, color: '#4a5a7a', letterSpacing: '0.3em', fontWeight: 700 }}>
          BLOG PASSPORT
        </span>
      </div>

      {/* Inner page */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '1060px',
          height: '510px',
          backgroundColor: '#f5f0e5',
          color: '#1a1a1a',
          padding: '30px 40px',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, color: '#888888', letterSpacing: '0.2em' }}>
              INFERENCEX
            </span>
            <span
              style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.1em', color: '#1a2744' }}
            >
              BLOG PASSPORT
            </span>
          </div>
          <div style={{ display: 'flex' }}>
            <img src={logoSrc} width={36} height={36} />
          </div>
        </div>

        {/* Thin rule */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            borderTop: '1px solid #c4b8a4',
            marginBottom: '16px',
          }}
        />

        {/* Body: photo placeholder + fields */}
        <div style={{ display: 'flex', flex: 1, width: '100%' }}>
          {/* Photo placeholder */}
          <div
            style={{
              display: 'flex',
              width: '140px',
              height: '175px',
              border: '2px solid #b5a88a',
              backgroundColor: '#e8e2d6',
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: '30px',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 11, color: '#999999', letterSpacing: '0.1em' }}>PHOTO</span>
          </div>

          {/* Fields */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {/* Type / Country */}
            <div style={{ display: 'flex', marginBottom: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', marginRight: '40px' }}>
                <span style={{ fontSize: 9, color: '#999999', letterSpacing: '0.15em' }}>TYPE</span>
                <span style={{ fontSize: 16, fontWeight: 700 }}>P</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', marginRight: '40px' }}>
                <span style={{ fontSize: 9, color: '#999999', letterSpacing: '0.15em' }}>
                  COUNTRY CODE
                </span>
                <span style={{ fontSize: 16, fontWeight: 700 }}>BLG</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 9, color: '#999999', letterSpacing: '0.15em' }}>
                  NATIONALITY
                </span>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{meta.author.toUpperCase()}</span>
              </div>
            </div>

            {/* Surname / Given Name = Title */}
            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '10px' }}>
              <span style={{ fontSize: 9, color: '#999999', letterSpacing: '0.15em' }}>
                TITLE / NAME
              </span>
              <span
                style={{
                  fontSize: titleSize > 56 ? 17 : 20,
                  fontWeight: 700,
                  lineHeight: 1.25,
                  color: '#1a2744',
                }}
              >
                {meta.title}
              </span>
            </div>

            {/* Date of issue / Expiry */}
            <div style={{ display: 'flex', marginBottom: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', marginRight: '40px' }}>
                <span style={{ fontSize: 9, color: '#999999', letterSpacing: '0.15em' }}>
                  DATE OF ISSUE
                </span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 9, color: '#999999', letterSpacing: '0.15em' }}>
                  READING TIME
                </span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{meta.readingTime} MIN</span>
              </div>
            </div>

            {/* Tags */}
            {meta.tags && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 9, color: '#999999', letterSpacing: '0.15em' }}>
                  ENDORSEMENTS
                </span>
                <span style={{ fontSize: 12, color: '#555555' }}>{meta.tags.join(' / ')}</span>
              </div>
            )}
          </div>
        </div>

        {/* MRZ zone */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            backgroundColor: '#ece6d8',
            padding: '8px 12px',
            marginTop: '12px',
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontFamily: 'monospace',
              letterSpacing: '0.12em',
              color: '#444444',
            }}
          >
            {mrzLine1}
          </span>
          <span
            style={{
              fontSize: 13,
              fontFamily: 'monospace',
              letterSpacing: '0.12em',
              color: '#444444',
              marginTop: '2px',
            }}
          >
            {mrzLine2}
          </span>
        </div>
      </div>
    </div>,
    size,
  );
}
