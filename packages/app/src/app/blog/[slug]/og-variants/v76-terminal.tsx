/**
 * V76: Terminal — Console/terminal window with green monospace text on black.
 * Fake title bar with traffic-light dots, prompt prefix, command-style output.
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
        backgroundColor: '#000000',
        color: '#00ff41',
        padding: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Terminal border */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1200,
          height: 630,
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: '#00ff41',
          display: 'flex',
        }}
      />

      {/* Title bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 44,
          backgroundColor: '#111111',
          borderBottom: '1px solid #00ff4140',
          padding: '0 20px',
          gap: 8,
        }}
      >
        {/* Traffic light dots */}
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: 9999,
            backgroundColor: '#ff5f57',
            display: 'flex',
          }}
        />
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: 9999,
            backgroundColor: '#febc2e',
            display: 'flex',
          }}
        />
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: 9999,
            backgroundColor: '#28c840',
            display: 'flex',
          }}
        />
        <div
          style={{
            display: 'flex',
            flex: 1,
            justifyContent: 'center',
            fontSize: 14,
            color: '#00ff4180',
          }}
        >
          inferencex@blog ~ terminal
        </div>
      </div>

      {/* Terminal body */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '40px 50px',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', zIndex: 1 }}>
          <img src={logoSrc} height={28} />
        </div>

        {/* Title with prompt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, zIndex: 1 }}>
          <div style={{ display: 'flex', fontSize: 20, color: '#00ff4180' }}>
            $ cat blog/post.md
          </div>
          <div
            style={{
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.2,
              color: '#00ff41',
              display: 'flex',
            }}
          >
            &gt; {meta.title}
          </div>
          <div
            style={{
              fontSize: 24,
              color: '#00ff4190',
              lineHeight: 1.4,
              maxHeight: 70,
              overflow: 'hidden',
              display: 'flex',
            }}
          >
            {meta.excerpt.length > 130 ? meta.excerpt.slice(0, 130) + '...' : meta.excerpt}
          </div>
        </div>

        {/* Footer as command output */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, zIndex: 1, fontSize: 20 }}>
          <div style={{ display: 'flex', gap: 12, color: '#00ff4170' }}>
            <span>author:</span>
            <span style={{ color: '#00ff41' }}>{meta.author}</span>
            <span style={{ color: '#00ff4140' }}>|</span>
            <span>date:</span>
            <span style={{ color: '#00ff41' }}>
              {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </span>
            <span style={{ color: '#00ff4140' }}>|</span>
            <span>eta:</span>
            <span style={{ color: '#00ff41' }}>{meta.readingTime} min</span>
          </div>
          <div style={{ display: 'flex', color: '#00ff4150', fontSize: 16 }}>$ _</div>
        </div>
      </div>
    </div>,
    size,
  );
}
