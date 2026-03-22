/**
 * V150: Microscope — Dark bg with a centered microscope slide and circular
 * lens/petri dish view. Scale bar, magnification text, and lab labels.
 * Scientific/clinical feel.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#0c0c12';
const SLIDE_BG = '#12141e';
const LENS_BORDER = '#3a4060';
const LABEL_COLOR = '#505878';
const ACCENT = '#40c8a0';

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 36 : meta.title.length > 40 ? 42 : 48;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        color: '#e0e4f0',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Logo — top left */}
      <div style={{ position: 'absolute', top: 30, left: 40, display: 'flex', zIndex: 2 }}>
        <img src={logoSrc} height={28} />
      </div>

      {/* Lab label — top right */}
      <div
        style={{
          position: 'absolute',
          top: 30,
          right: 40,
          fontSize: 13,
          color: LABEL_COLOR,
          display: 'flex',
          gap: 16,
        }}
      >
        <span style={{ display: 'flex' }}>
          SPECIMEN #{meta.readingTime.toString().padStart(4, '0')}
        </span>
        <span style={{ display: 'flex' }}>|</span>
        <span style={{ display: 'flex' }}>PREPARED BY: {meta.author.toUpperCase()}</span>
      </div>

      {/* Microscope slide — large rounded rectangle */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: 900,
          height: 440,
          backgroundColor: SLIDE_BG,
          borderRadius: 20,
          border: '1px solid #1e2038',
          position: 'relative',
        }}
      >
        {/* Slide label — top left corner of slide */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 20,
            fontSize: 11,
            color: '#404060',
            display: 'flex',
          }}
        >
          SLIDE A-{meta.readingTime}
        </div>

        {/* Circular lens view */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: 320,
            height: 320,
            borderRadius: 160,
            border: `2px solid ${LENS_BORDER}`,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Inner subtle ring */}
          <div
            style={{
              position: 'absolute',
              left: 10,
              top: 10,
              width: 296,
              height: 296,
              borderRadius: 148,
              border: '1px solid #2a2e48',
              display: 'flex',
            }}
          />

          {/* Specimen dots inside the lens (simulated microorganisms) */}
          {[
            { x: 80, y: 90, s: 8 },
            { x: 180, y: 70, s: 5 },
            { x: 240, y: 140, s: 7 },
            { x: 100, y: 200, s: 6 },
            { x: 200, y: 230, s: 4 },
            { x: 140, y: 150, s: 9 },
            { x: 220, y: 190, s: 5 },
          ].map((dot, i) => (
            <div
              key={`dot${i}`}
              style={{
                position: 'absolute',
                left: dot.x - dot.s / 2,
                top: dot.y - dot.s / 2,
                width: dot.s,
                height: dot.s,
                borderRadius: dot.s / 2,
                backgroundColor: `${ACCENT}30`,
                border: `1px solid ${ACCENT}50`,
                display: 'flex',
              }}
            />
          ))}

          {/* Content inside the lens */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 30,
              zIndex: 1,
            }}
          >
            <div
              style={{
                fontSize: titleSize,
                fontWeight: 700,
                color: '#ffffff',
                lineHeight: 1.2,
                textAlign: 'center',
                display: 'flex',
                maxWidth: 260,
              }}
            >
              {meta.title.length > 50 ? meta.title.slice(0, 50) + '\u2026' : meta.title}
            </div>
          </div>
        </div>

        {/* Scale bar — bottom of slide */}
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            right: 30,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              width: 60,
              height: 2,
              backgroundColor: '#ffffff40',
              display: 'flex',
            }}
          />
          <span style={{ fontSize: 11, color: '#606888', display: 'flex' }}>50 \u00b5m</span>
        </div>

        {/* Magnification */}
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: 30,
            fontSize: 14,
            color: ACCENT,
            fontWeight: 600,
            display: 'flex',
          }}
        >
          100x
        </div>
      </div>

      {/* Excerpt below slide */}
      <div
        style={{
          display: 'flex',
          maxWidth: 800,
          marginTop: 20,
          fontSize: 22,
          color: '#606888',
          lineHeight: 1.4,
          textAlign: 'center',
          justifyContent: 'center',
        }}
      >
        {meta.excerpt.length > 120 ? meta.excerpt.slice(0, 120) + '\u2026' : meta.excerpt}
      </div>

      {/* Footer */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          display: 'flex',
          gap: 24,
          fontSize: 20,
          color: '#506068',
        }}
      >
        <span style={{ fontWeight: 600, color: ACCENT }}>{meta.author}</span>
        <span>{'\u00b7'}</span>
        <span>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
        <span>{'\u00b7'}</span>
        <span>{meta.readingTime} min read</span>
        {meta.tags &&
          meta.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              style={{
                backgroundColor: '#141828',
                padding: '3px 10px',
                borderRadius: 9999,
                fontSize: 16,
                color: ACCENT,
              }}
            >
              {tag}
            </span>
          ))}
      </div>
    </div>,
    size,
  );
}
