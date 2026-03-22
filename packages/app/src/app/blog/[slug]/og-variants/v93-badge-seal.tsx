/**
 * V93: Badge/Seal — circular badge element in the bottom-right corner with reading time, like a wax seal. Decorative concentric rings. Gold on dark background.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  const sealX = 1040;
  const sealY = 460;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0f172a',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Seal — outermost ring */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: sealX - 75,
          top: sealY - 75,
          width: 150,
          height: 150,
          borderRadius: 9999,
          border: '2px solid #b45309',
          opacity: 0.3,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />

      {/* Seal — second ring */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: sealX - 64,
          top: sealY - 64,
          width: 128,
          height: 128,
          borderRadius: 9999,
          border: '1.5px solid #d97706',
          opacity: 0.4,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />

      {/* Seal — third ring (dotted effect via dashed) */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: sealX - 55,
          top: sealY - 55,
          width: 110,
          height: 110,
          borderRadius: 9999,
          border: '1px dashed #fbbf24',
          opacity: 0.3,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />

      {/* Seal — filled center */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: sealX - 44,
          top: sealY - 44,
          width: 88,
          height: 88,
          borderRadius: 9999,
          backgroundColor: '#92400e',
          opacity: 0.35,
        }}
      />

      {/* Seal — inner bright circle */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: sealX - 38,
          top: sealY - 38,
          width: 76,
          height: 76,
          borderRadius: 9999,
          backgroundColor: '#b45309',
          opacity: 0.5,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />

      {/* Seal text container */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          left: sealX - 38,
          top: sealY - 38,
          width: 76,
          height: 76,
          borderRadius: 9999,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 15,
        }}
      >
        <span style={{ color: '#fef3c7', fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
          {meta.readingTime}
        </span>
        <span
          style={{
            color: '#fde68a',
            fontSize: 10,
            fontWeight: 600,
            marginTop: 2,
            letterSpacing: 1,
          }}
        >
          MIN READ
        </span>
      </div>

      {/* Decorative dots around the seal */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const r = 82;
        const dx = Math.cos(rad) * r;
        const dy = Math.sin(rad) * r;
        return (
          <div
            key={`sd-${i}`}
            style={{
              display: 'flex',
              position: 'absolute',
              left: sealX + dx - 3,
              top: sealY + dy - 3,
              width: 6,
              height: 6,
              borderRadius: 9999,
              backgroundColor: '#fbbf24',
              opacity: 0.25,
            }}
          />
        );
      })}

      {/* Subtle warm ambience */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: -40,
          bottom: -40,
          width: 300,
          height: 300,
          borderRadius: 9999,
          backgroundColor: '#78350f',
          opacity: 0.06,
        }}
      />

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '48px 56px',
          width: '100%',
          height: '100%',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={44} height={44} />
          <span style={{ color: '#fbbf24', fontSize: 22, marginLeft: 12, fontWeight: 600 }}>
            InferenceX
          </span>
        </div>

        {/* Title & excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 820 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              color: '#f8fafc',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#fbbf24',
              lineHeight: 1.5,
              opacity: 0.7,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ color: '#fbbf24', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#78350f', fontSize: 22 }}>{'\u00b7'}</span>
          <span style={{ color: '#92400e', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#78350f', fontSize: 22 }}>{'\u00b7'}</span>
          <span style={{ color: '#92400e', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
