/**
 * V25: Gold Accent Stripe — Dark bg, thick gold left stripe (20px),
 * massive title, brand bottom-left in gold. The most minimal version
 * that still reads as "SemiAnalysis" at thumbnail size.
 */
import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const GOLD = '#F7B041';
const BLUE = '#0B86D1';
const CHARCOAL = '#454646';

export function renderOgImage(meta: BlogPostMeta) {
  const titleSize = meta.title.length > 50 ? 56 : meta.title.length > 30 ? 68 : 80;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: CHARCOAL,
        overflow: 'hidden',
      }}
    >
      {/* Thick gold left stripe */}
      <div style={{ display: 'flex', width: 20, height: '100%', backgroundColor: GOLD }} />

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '50px 60px',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 30, fontWeight: 800, color: BLUE }}>semi</span>
          <span style={{ fontSize: 30, fontWeight: 800, color: GOLD }}>analysis</span>
        </div>

        {/* Title */}
        <div style={{ fontSize: titleSize, fontWeight: 800, lineHeight: 1.1, color: '#FFFFFF' }}>
          {meta.title}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 28, color: GOLD, fontWeight: 700 }}>InferenceX Blog</span>
          <span style={{ fontSize: 22, color: '#999EA4' }}>
            {meta.author} ·{' '}
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              month: 'short',
              year: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
        </div>
      </div>
    </div>,
    size,
  );
}
