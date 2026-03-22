/**
 * V22: Gold Title Bar — Thick gold bar at top with brand in dark text,
 * huge white title on charcoal below. Two clear zones, both legible at any size.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const GOLD = '#F7B041';
const CHARCOAL = '#454646';

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 50 ? 54 : meta.title.length > 30 ? 66 : 78;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: CHARCOAL,
        overflow: 'hidden',
      }}
    >
      {/* Gold top bar */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 100,
          backgroundColor: GOLD,
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 55px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} height={112} />
        </div>
        <span style={{ fontSize: 26, fontWeight: 600, color: '#444647' }}>InferenceX Blog</span>
      </div>

      {/* Title area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flex: 1,
          padding: '0 55px',
          gap: 20,
        }}
      >
        <div style={{ fontSize: titleSize, fontWeight: 800, lineHeight: 1.1, color: '#FFFFFF' }}>
          {meta.title}
        </div>
        <div style={{ fontSize: 28, color: '#999EA4' }}>{meta.author}</div>
      </div>

      {/* Thin gold bottom line */}
      <div style={{ display: 'flex', width: '100%', height: 8, backgroundColor: GOLD }} />
    </div>,
    size,
  );
}
