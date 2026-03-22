/**
 * V21: Compact Bold — Huge title, brand top-left, date bottom-right.
 * Nothing else. Maximum readability at small render sizes.
 */
import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const GOLD = '#F7B041';
const BLUE = '#0B86D1';
const BG = '#131416';

export function renderOgImage(meta: BlogPostMeta) {
  const titleSize = meta.title.length > 50 ? 56 : meta.title.length > 30 ? 68 : 80;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        color: '#FFFFFF',
        padding: '50px 65px',
      }}
    >
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 32, fontWeight: 800, color: BLUE }}>semi</span>
        <span style={{ fontSize: 32, fontWeight: 800, color: GOLD }}>analysis</span>
      </div>

      {/* Title — the hero */}
      <div style={{ fontSize: titleSize, fontWeight: 800, lineHeight: 1.1, color: '#FFFFFF' }}>
        {meta.title}
      </div>

      {/* Minimal footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 28, color: GOLD, fontWeight: 600 }}>InferenceX Blog</span>
        <span style={{ fontSize: 24, color: '#656B72' }}>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
      </div>
    </div>,
    size,
  );
}
