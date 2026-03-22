/**
 * V24: Gold Split Bold — Left 30% gold with brand stacked vertically,
 * right 70% dark with massive title. Both zones survive at 360px render.
 * No fine details, just color blocks and big text.
 */
import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const GOLD = '#F7B041';
const BLUE = '#0B86D1';
const BG = '#131416';

export function renderOgImage(meta: BlogPostMeta) {
  const titleSize = meta.title.length > 50 ? 52 : meta.title.length > 30 ? 64 : 76;

  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Left gold panel */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 340,
          height: '100%',
          backgroundColor: GOLD,
          padding: '50px 40px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: BLUE }}>semi</span>
            <span style={{ fontSize: 36, fontWeight: 800, color: '#444647' }}>analysis</span>
          </div>
          <span style={{ fontSize: 24, color: '#5D5E5F', fontWeight: 600 }}>InferenceX Blog</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 22, color: '#5D5E5F' }}>{meta.author}</span>
          <span style={{ fontSize: 20, color: '#6D6E6F' }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              month: 'short',
              year: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
        </div>
      </div>

      {/* Right dark panel */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flex: 1,
          backgroundColor: BG,
          padding: '50px 55px',
        }}
      >
        <div style={{ fontSize: titleSize, fontWeight: 800, lineHeight: 1.1, color: '#FFFFFF' }}>
          {meta.title}
        </div>
      </div>
    </div>,
    size,
  );
}
