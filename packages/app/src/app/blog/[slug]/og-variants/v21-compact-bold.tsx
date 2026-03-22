/**
 * V21: Compact Bold — Huge title, brand top-left, date bottom-right.
 * Nothing else. Maximum readability at small render sizes.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const GOLD = '#F7B041';
const BG = '#131416';

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
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
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <img src={logoSrc} height={108} />
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
