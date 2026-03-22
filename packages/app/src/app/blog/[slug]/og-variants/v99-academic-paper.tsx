/**
 * V99: Academic Paper — Formal journal article layout with proceedings header and abstract.
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
        backgroundColor: '#ffffff',
        color: '#111111',
        padding: '40px 80px',
        fontFamily: 'serif',
        position: 'relative',
      }}
    >
      {/* Proceedings header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          borderBottom: '2px solid #111111',
          paddingBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={20} height={20} />
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              marginLeft: '8px',
              letterSpacing: '0.15em',
            }}
          >
            INFERENCEX PROCEEDINGS
          </span>
        </div>
        <span style={{ fontSize: 12, color: '#555555' }}>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
      </div>

      {/* Paper title */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
          marginTop: '40px',
        }}
      >
        <span
          style={{
            fontSize: titleSize - 8,
            fontWeight: 700,
            textAlign: 'center',
            lineHeight: 1.2,
            maxWidth: '90%',
          }}
        >
          {meta.title}
        </span>
      </div>

      {/* Authors */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
          marginTop: '18px',
        }}
      >
        <span style={{ fontSize: 18, color: '#333333' }}>{meta.author}</span>
      </div>

      {/* Affiliation / tags */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
          marginTop: '6px',
        }}
      >
        <span style={{ fontSize: 13, color: '#777777', fontStyle: 'italic' }}>
          {meta.tags ? meta.tags.join(', ') : ''}
        </span>
      </div>

      {/* Abstract */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          marginTop: '30px',
          paddingTop: '16px',
          borderTop: '1px solid #cccccc',
        }}
      >
        <div style={{ display: 'flex', width: '100%' }}>
          <span style={{ fontSize: 14 }}>
            <span style={{ fontWeight: 700 }}>Abstract&mdash;</span>{' '}
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </span>
        </div>
      </div>

      {/* Footer line */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '30px',
          left: '80px',
          right: '80px',
          borderTop: '1px solid #cccccc',
          paddingTop: '8px',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 11, color: '#999999' }}>InferenceX Proceedings</span>
        <span style={{ fontSize: 11, color: '#999999' }}>{meta.readingTime} min read</span>
      </div>
    </div>,
    size,
  );
}
