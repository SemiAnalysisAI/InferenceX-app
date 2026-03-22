/**
 * V22: Gold Title Bar — Thick gold bar at top with brand in dark text,
 * huge white title on charcoal below. Two clear zones, both legible at any size.
 */
import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const GOLD = '#F7B041';
const BLUE = '#0B86D1';
const CHARCOAL = '#454646';

export function renderOgImage(meta: BlogPostMeta) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 34, fontWeight: 800, color: BLUE }}>semi</span>
          <span style={{ fontSize: 34, fontWeight: 800, color: '#444647' }}>analysis</span>
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
