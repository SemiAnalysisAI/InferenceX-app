/**
 * V11: Brand Corners — Correct SemiAnalysis palette. Circuit blocks in corners
 * using exact brand gold (#F7B041), blue (#0B86D1), teal traces (#2A6B6B–#3A7A7A),
 * on #131416 background. Gold pill button for tags.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const GOLD = '#F7B041';
const BLUE = '#0B86D1';
const TEAL = '#3A7A7A';
const BG = '#131416';
const TEXT = '#EAEBEC';
const TEXT_DIM = '#B4B9BC';

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/brand/logo-color.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 50 ? 48 : meta.title.length > 35 ? 56 : 64;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        color: TEXT,
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top-right circuit cluster */}
      <div
        style={{
          position: 'absolute',
          left: 880,
          top: 15,
          width: 90,
          height: 70,
          border: `2px solid ${TEAL}40`,
          borderRadius: 4,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 985,
          top: 25,
          width: 70,
          height: 55,
          border: `2px solid ${TEAL}60`,
          borderRadius: 4,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 1070,
          top: 10,
          width: 110,
          height: 90,
          border: `2px solid ${TEAL}35`,
          borderRadius: 4,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 940,
          top: 95,
          width: 55,
          height: 45,
          border: `2px solid ${GOLD}50`,
          borderRadius: 4,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 1010,
          top: 105,
          width: 80,
          height: 50,
          border: `2px solid ${TEAL}45`,
          borderRadius: 4,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 1105,
          top: 115,
          width: 75,
          height: 55,
          border: `2px solid ${BLUE}35`,
          borderRadius: 4,
          display: 'flex',
        }}
      />
      {/* Traces */}
      <div
        style={{
          position: 'absolute',
          left: 920,
          top: 50,
          width: 65,
          height: 2,
          backgroundColor: `${TEAL}40`,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 1055,
          top: 55,
          width: 2,
          height: 60,
          backgroundColor: `${TEAL}35`,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 975,
          top: 118,
          width: 35,
          height: 2,
          backgroundColor: `${GOLD}40`,
          display: 'flex',
        }}
      />

      {/* Bottom-left circuit cluster */}
      <div
        style={{
          position: 'absolute',
          left: 15,
          top: 470,
          width: 95,
          height: 65,
          border: `2px solid ${TEAL}40`,
          borderRadius: 4,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 125,
          top: 490,
          width: 65,
          height: 55,
          border: `2px solid ${TEAL}55`,
          borderRadius: 4,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 40,
          top: 545,
          width: 85,
          height: 60,
          border: `2px solid ${BLUE}30`,
          borderRadius: 4,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 200,
          top: 530,
          width: 55,
          height: 50,
          border: `2px solid ${GOLD}45`,
          borderRadius: 4,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 140,
          top: 560,
          width: 55,
          height: 45,
          border: `2px solid ${TEAL}35`,
          borderRadius: 4,
          display: 'flex',
        }}
      />
      {/* Traces */}
      <div
        style={{
          position: 'absolute',
          left: 110,
          top: 510,
          width: 2,
          height: 50,
          backgroundColor: `${TEAL}35`,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 60,
          top: 540,
          width: 65,
          height: 2,
          backgroundColor: `${TEAL}30`,
          display: 'flex',
        }}
      />

      {/* Gold accent line — left edge */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 180,
          width: 4,
          height: 270,
          backgroundColor: GOLD,
          display: 'flex',
        }}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          zIndex: 1,
        }}
      >
        <img src={logoSrc} height={80} />
      </div>

      {/* Title */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, zIndex: 1 }}>
        <div
          style={{
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.2,
            color: '#FFFFFF',
            maxHeight: 220,
            overflow: 'hidden',
          }}
        >
          {meta.title}
        </div>
      </div>

      {/* Meta row */}
      <div
        style={{
          display: 'flex',
          gap: 20,
          fontSize: 24,
          color: TEXT_DIM,
          alignItems: 'center',
          zIndex: 1,
        }}
      >
        <span>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
        <span style={{ color: `${GOLD}60` }}>·</span>
        <span>{meta.readingTime} min read</span>
      </div>
    </div>,
    size,
  );
}
