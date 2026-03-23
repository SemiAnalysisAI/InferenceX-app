/**
 * V15: Brand Split — Horizontal split: top 60% is content on dark, bottom 40% is
 * a teal-tinted circuit field with the brand mark. Gold divider line between.
 * Most "presentation slide" feel.
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

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/brand/logo-color.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        color: '#EAEBEC',
        overflow: 'hidden',
      }}
    >
      {/* Top section — content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '48px 60px 24px',
        }}
      >
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

        <div
          style={{ display: 'flex', gap: 20, fontSize: 28, color: '#d4d4d8', alignItems: 'center' }}
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
      </div>

      {/* Gold divider */}
      <div style={{ display: 'flex', width: '100%', height: 3, backgroundColor: GOLD }} />

      {/* Bottom section — circuit field with brand */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 200,
          backgroundColor: '#0F1214',
          position: 'relative',
        }}
      >
        {/* Circuit blocks */}
        {Array.from({ length: 24 }).map((_, i) => {
          const col = i % 12;
          const row = Math.floor(i / 12);
          const isGold = i === 3 || i === 9 || i === 18;
          const isBlue = i === 6 || i === 15 || i === 21;
          const color = isGold ? `${GOLD}30` : isBlue ? `${BLUE}22` : `${TEAL}18`;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 8 + col * 100,
                top: 10 + row * 100,
                width: 88,
                height: 82,
                border: `1.5px solid ${color}`,
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {i % 4 === 0 && (
                <div
                  style={{
                    width: 35,
                    height: 30,
                    border: `1px solid ${isGold ? `${GOLD}20` : `${TEAL}12`}`,
                    borderRadius: 2,
                    display: 'flex',
                  }}
                />
              )}
            </div>
          );
        })}

        {/* Horizontal trace */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 50,
            width: '100%',
            height: 1,
            backgroundColor: `${TEAL}10`,
            display: 'flex',
          }}
        />

        {/* Brand logo positioned right */}
        <div
          style={{
            position: 'absolute',
            right: 50,
            top: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            zIndex: 1,
          }}
        >
          <img src={logoSrc} height={80} />
        </div>
      </div>
    </div>,
    size,
  );
}
