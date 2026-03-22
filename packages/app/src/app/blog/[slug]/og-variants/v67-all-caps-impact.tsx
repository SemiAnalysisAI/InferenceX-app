/**
 * V67: All Caps Impact — Title rendered in ALL CAPS with generous letterSpacing (6-8px).
 * Heavy weight (900). No excerpt shown. Maximum readability. Title is THE design.
 * Minimal footer.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0a0a',
        padding: '60px 70px',
        justifyContent: 'space-between',
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex' }}>
        <img src={logoSrc} width={130} height={34} />
      </div>

      {/* Title — ALL CAPS, heavy weight, wide letter spacing */}
      <div
        style={{
          display: 'flex',
          fontSize: titleSize,
          fontWeight: 900,
          color: '#ffffff',
          textTransform: 'uppercase' as const,
          letterSpacing: '7px',
          lineHeight: 1.3,
        }}
      >
        {meta.title.toUpperCase()}
      </div>

      {/* Minimal footer */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          fontSize: 20,
          color: '#666',
          letterSpacing: '2px',
        }}
      >
        <div style={{ display: 'flex' }}>{meta.author.toUpperCase()}</div>
        <div
          style={{
            display: 'flex',
            width: '4px',
            height: '4px',
            borderRadius: '2px',
            backgroundColor: '#666',
            marginLeft: '16px',
            marginRight: '16px',
          }}
        />
        <div style={{ display: 'flex' }}>
          {new Date(meta.date + 'T00:00:00Z')
            .toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })
            .toUpperCase()}
        </div>
      </div>
    </div>,
    size,
  );
}
