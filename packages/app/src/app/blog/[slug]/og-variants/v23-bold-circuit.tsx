/**
 * V23: Bold Circuit — Thick, chunky circuit blocks (visible at 400px wide).
 * Only 6-8 large blocks, not dozens of tiny ones. Gold accent blocks stand out.
 * Huge centered title.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const GOLD = '#F7B041';
const BG = '#131416';
const TEAL = '#3A7A7A';

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 50 ? 54 : meta.title.length > 30 ? 66 : 78;

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
        padding: '50px 60px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Bold circuit blocks — few, large, thick borders */}
      <div
        style={{
          position: 'absolute',
          right: -30,
          top: -30,
          width: 200,
          height: 180,
          border: `4px solid ${TEAL}35`,
          borderRadius: 8,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 140,
          top: 20,
          width: 140,
          height: 120,
          border: `4px solid ${GOLD}40`,
          borderRadius: 8,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -40,
          bottom: -40,
          width: 220,
          height: 200,
          border: `4px solid ${TEAL}30`,
          borderRadius: 8,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 150,
          bottom: 10,
          width: 160,
          height: 130,
          border: `4px solid ${GOLD}35`,
          borderRadius: 8,
          display: 'flex',
        }}
      />
      {/* Thick trace lines */}
      <div
        style={{
          position: 'absolute',
          right: 100,
          top: 150,
          width: 4,
          height: 120,
          backgroundColor: `${TEAL}25`,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 130,
          bottom: 180,
          width: 120,
          height: 4,
          backgroundColor: `${TEAL}20`,
          display: 'flex',
        }}
      />

      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', zIndex: 1 }}>
        <img src={logoSrc} height={100} />
      </div>

      {/* Title */}
      <div style={{ fontSize: titleSize, fontWeight: 800, lineHeight: 1.1, zIndex: 1 }}>
        {meta.title}
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 1,
        }}
      >
        <span style={{ fontSize: 26, color: GOLD, fontWeight: 600 }}>InferenceX Blog</span>
        <span style={{ fontSize: 24, color: '#656B72' }}>{meta.author}</span>
      </div>
    </div>,
    size,
  );
}
