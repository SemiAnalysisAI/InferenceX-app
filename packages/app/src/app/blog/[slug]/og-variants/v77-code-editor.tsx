/**
 * V77: Code Editor — Dark editor background with line numbers, syntax-highlighted title,
 * and a file tab element at the top.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const lineNumbers = Array.from({ length: 22 }, (_, i) => i + 1);

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
        backgroundColor: '#1e1e1e',
        color: '#d4d4d4',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 40,
          backgroundColor: '#252526',
          borderBottom: '1px solid #3c3c3c',
        }}
      >
        {/* Active tab */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 40,
            padding: '0 20px',
            backgroundColor: '#1e1e1e',
            borderTop: '2px solid #007acc',
            fontSize: 14,
            color: '#ffffff',
            gap: 8,
          }}
        >
          <span style={{ color: '#519aba' }}>TS</span>
          <span>blog-post.tsx</span>
        </div>
        {/* Inactive tab */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 40,
            padding: '0 20px',
            backgroundColor: '#2d2d2d',
            fontSize: 14,
            color: '#969696',
            gap: 8,
          }}
        >
          <span style={{ color: '#6a9955' }}>MD</span>
          <span>README.md</span>
        </div>
      </div>

      {/* Editor body */}
      <div style={{ display: 'flex', flex: 1 }}>
        {/* Line numbers gutter */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: 60,
            backgroundColor: '#1e1e1e',
            borderRight: '1px solid #3c3c3c',
            padding: '16px 0',
            alignItems: 'flex-end',
            paddingRight: 12,
          }}
        >
          {lineNumbers.map((n) => (
            <div
              key={n}
              style={{
                display: 'flex',
                fontSize: 14,
                color: n <= 5 ? '#858585' : '#4a4a4a',
                lineHeight: 1.8,
              }}
            >
              {n}
            </div>
          ))}
        </div>

        {/* Code content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '40px 50px',
            justifyContent: 'space-between',
          }}
        >
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', zIndex: 1 }}>
            <img src={logoSrc} height={28} />
          </div>

          {/* Code-style title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, zIndex: 1 }}>
            <div style={{ display: 'flex', fontSize: 18, color: '#608b4e' }}>{'// Blog post'}</div>
            <div style={{ display: 'flex', fontSize: 18, gap: 8 }}>
              <span style={{ color: '#569cd6' }}>export const</span>
              <span style={{ color: '#4ec9b0' }}>title</span>
              <span style={{ color: '#d4d4d4' }}>=</span>
            </div>
            <div
              style={{
                fontSize: titleSize,
                fontWeight: 700,
                lineHeight: 1.2,
                color: '#ce9178',
                display: 'flex',
              }}
            >
              &quot;{meta.title}&quot;
            </div>
            <div
              style={{
                fontSize: 22,
                color: '#6a9955',
                lineHeight: 1.4,
                maxHeight: 65,
                overflow: 'hidden',
                display: 'flex',
              }}
            >
              /* {meta.excerpt.length > 120 ? meta.excerpt.slice(0, 120) + '...' : meta.excerpt} */
            </div>
          </div>

          {/* Footer as code */}
          <div style={{ display: 'flex', gap: 8, fontSize: 20, zIndex: 1 }}>
            <span style={{ color: '#569cd6' }}>const</span>
            <span style={{ color: '#9cdcfe' }}>author</span>
            <span style={{ color: '#d4d4d4' }}>=</span>
            <span style={{ color: '#ce9178' }}>&quot;{meta.author}&quot;</span>
            <span style={{ color: '#d4d4d4' }}>,</span>
            <span style={{ color: '#9cdcfe' }}>date</span>
            <span style={{ color: '#d4d4d4' }}>=</span>
            <span style={{ color: '#ce9178' }}>
              &quot;
              {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}
              &quot;
            </span>
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
