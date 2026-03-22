/**
 * V122: Stamp/Postmark — large circular postmark element with date inside, vintage red/brown ink color, mailed letter aesthetic.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  const formattedDate = new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#f2ece0',
        color: '#2c1810',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Postmark circle — top right */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '40px',
          right: '50px',
          width: '200px',
          height: '200px',
          borderRadius: '50%',
          border: '4px solid #8b3a2a',
          opacity: 0.5,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
      >
        {/* Inner circle */}
        <div
          style={{
            display: 'flex',
            width: '160px',
            height: '160px',
            borderRadius: '50%',
            border: '2px solid #8b3a2a',
            opacity: 0.7,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 11,
              fontWeight: 800,
              color: '#8b3a2a',
              letterSpacing: '3px',
            }}
          >
            INFERENCEX
          </div>
          {/* Horizontal line */}
          <div
            style={{
              display: 'flex',
              width: '100px',
              height: '1px',
              backgroundColor: '#8b3a2a',
              opacity: 0.6,
            }}
          />
          <div
            style={{
              display: 'flex',
              fontSize: 13,
              fontWeight: 700,
              color: '#8b3a2a',
              textAlign: 'center',
            }}
          >
            {formattedDate}
          </div>
          {/* Horizontal line */}
          <div
            style={{
              display: 'flex',
              width: '100px',
              height: '1px',
              backgroundColor: '#8b3a2a',
              opacity: 0.6,
            }}
          />
          <div
            style={{
              display: 'flex',
              fontSize: 10,
              fontWeight: 700,
              color: '#8b3a2a',
              letterSpacing: '2px',
            }}
          >
            BLOG POST
          </div>
        </div>
      </div>

      {/* Horizontal postmark lines through the circle */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: '100px',
          right: '0px',
          gap: '8px',
          opacity: 0.25,
        }}
      >
        <div
          style={{
            display: 'flex',
            width: '320px',
            height: '2px',
            backgroundColor: '#8b3a2a',
          }}
        />
        <div
          style={{
            display: 'flex',
            width: '320px',
            height: '2px',
            backgroundColor: '#8b3a2a',
          }}
        />
        <div
          style={{
            display: 'flex',
            width: '320px',
            height: '2px',
            backgroundColor: '#8b3a2a',
          }}
        />
        <div
          style={{
            display: 'flex',
            width: '320px',
            height: '2px',
            backgroundColor: '#8b3a2a',
          }}
        />
        <div
          style={{
            display: 'flex',
            width: '320px',
            height: '2px',
            backgroundColor: '#8b3a2a',
          }}
        />
        <div
          style={{
            display: 'flex',
            width: '320px',
            height: '2px',
            backgroundColor: '#8b3a2a',
          }}
        />
      </div>

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '44px 56px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={40} height={40} />
          <div
            style={{
              display: 'flex',
              marginLeft: '12px',
              fontSize: 20,
              fontWeight: 700,
              color: '#5c2418',
            }}
          >
            InferenceX
          </div>
        </div>

        {/* Title + Excerpt */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            maxWidth: '800px',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              lineHeight: 1.15,
              color: '#2c1810',
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 19,
              color: '#6b4c3b',
              lineHeight: 1.5,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid #c8b89a',
            paddingTop: '16px',
          }}
        >
          <div style={{ display: 'flex', fontSize: 18, color: '#5c2418' }}>{meta.author}</div>
          <div style={{ display: 'flex', fontSize: 16, color: '#8b6f5e' }}>{formattedDate}</div>
        </div>
      </div>
    </div>,
    size,
  );
}
