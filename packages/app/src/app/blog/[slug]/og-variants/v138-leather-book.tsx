/**
 * V138: Leather Book — Rich dark brown embossed cover with gold double-line frame, diamond corners, and spine title.
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
        backgroundColor: '#2a1810',
        color: '#c8a84e',
        fontFamily: 'serif',
        position: 'relative',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Leather texture — subtle grain dots */}
      {Array.from({ length: 60 }, (_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            left: ((i * 83 + 11) % 1180) + 10,
            top: ((i * 47 + 29) % 610) + 10,
            width: 2,
            height: 2,
            backgroundColor: `rgba(42,24,16,${0.3 + (i % 4) * 0.1})`,
            borderRadius: '50%',
          }}
        />
      ))}

      {/* Outer frame — gold */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '24px',
          left: '24px',
          right: '24px',
          bottom: '24px',
          border: '2px solid #c8a84e',
        }}
      />

      {/* Inner frame — gold with gap */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '36px',
          left: '36px',
          right: '36px',
          bottom: '36px',
          border: '1px solid #c8a84e',
        }}
      />

      {/* Corner diamonds — top-left */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '26px',
          left: '26px',
          width: '16px',
          height: '16px',
          backgroundColor: '#c8a84e',
          borderRadius: '1px',
        }}
      />
      {/* Corner diamond — top-right */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '26px',
          right: '26px',
          width: '16px',
          height: '16px',
          backgroundColor: '#c8a84e',
          borderRadius: '1px',
        }}
      />
      {/* Corner diamond — bottom-left */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '26px',
          left: '26px',
          width: '16px',
          height: '16px',
          backgroundColor: '#c8a84e',
          borderRadius: '1px',
        }}
      />
      {/* Corner diamond — bottom-right */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '26px',
          right: '26px',
          width: '16px',
          height: '16px',
          backgroundColor: '#c8a84e',
          borderRadius: '1px',
        }}
      />

      {/* Spine line — left side */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '36px',
          left: '80px',
          width: '1px',
          height: 'calc(100% - 72px)',
          backgroundColor: 'rgba(200,168,78,0.25)',
        }}
      />

      {/* Content area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 100px',
          zIndex: 1,
        }}
      >
        {/* Decorative top rule */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <div
            style={{ display: 'flex', width: '60px', height: '1px', backgroundColor: '#c8a84e' }}
          />
          <div
            style={{
              display: 'flex',
              width: '8px',
              height: '8px',
              backgroundColor: '#c8a84e',
              marginLeft: '12px',
              marginRight: '12px',
              borderRadius: '1px',
            }}
          />
          <div
            style={{ display: 'flex', width: '60px', height: '1px', backgroundColor: '#c8a84e' }}
          />
        </div>

        {/* Publisher */}
        <div style={{ display: 'flex', marginBottom: '24px' }}>
          <span style={{ fontSize: 13, color: 'rgba(200,168,78,0.6)', letterSpacing: '0.25em' }}>
            INFERENCEX PUBLISHING
          </span>
        </div>

        {/* Title — centered like book cover */}
        <div style={{ display: 'flex', marginBottom: '20px', textAlign: 'center' }}>
          <span
            style={{
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.2,
              color: '#c8a84e',
              letterSpacing: '0.03em',
            }}
          >
            {meta.title}
          </span>
        </div>

        {/* Decorative middle rule */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
          <div
            style={{
              display: 'flex',
              width: '100px',
              height: '1px',
              backgroundColor: 'rgba(200,168,78,0.5)',
            }}
          />
        </div>

        {/* Author */}
        <div style={{ display: 'flex', marginBottom: '12px' }}>
          <span style={{ fontSize: 20, color: 'rgba(200,168,78,0.75)', letterSpacing: '0.1em' }}>
            By {meta.author}
          </span>
        </div>

        {/* Date */}
        <div style={{ display: 'flex', marginBottom: '16px' }}>
          <span style={{ fontSize: 14, color: 'rgba(200,168,78,0.45)' }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
        </div>

        {/* Tags */}
        {meta.tags && (
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>
            {meta.tags.map((tag, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  padding: '2px 10px',
                  marginRight: '6px',
                  marginBottom: '4px',
                }}
              >
                <span
                  style={{ fontSize: 11, color: 'rgba(200,168,78,0.4)', letterSpacing: '0.08em' }}
                >
                  {tag}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Decorative bottom rule */}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: '16px' }}>
          <div
            style={{ display: 'flex', width: '60px', height: '1px', backgroundColor: '#c8a84e' }}
          />
          <div
            style={{
              display: 'flex',
              width: '8px',
              height: '8px',
              backgroundColor: '#c8a84e',
              marginLeft: '12px',
              marginRight: '12px',
              borderRadius: '1px',
            }}
          />
          <div
            style={{ display: 'flex', width: '60px', height: '1px', backgroundColor: '#c8a84e' }}
          />
        </div>
      </div>

      {/* Logo — bottom center */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '50px',
          alignItems: 'center',
        }}
      >
        <img src={logoSrc} width={18} height={18} />
        <span
          style={{
            fontSize: 10,
            color: 'rgba(200,168,78,0.4)',
            marginLeft: '6px',
            letterSpacing: '0.15em',
          }}
        >
          {meta.readingTime} MIN
        </span>
      </div>
    </div>,
    size,
  );
}
