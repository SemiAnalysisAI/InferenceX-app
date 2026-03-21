import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

import { getPostBySlug } from '@/lib/blog';

import { renderOgImage as v1 } from '@/app/blog/[slug]/og-variants/v1-current';
import { renderOgImage as v2 } from '@/app/blog/[slug]/og-variants/v2-circuit-corners';
import { renderOgImage as v3 } from '@/app/blog/[slug]/og-variants/v3-grid-overlay';
import { renderOgImage as v4 } from '@/app/blog/[slug]/og-variants/v4-left-stripe';
import { renderOgImage as v5 } from '@/app/blog/[slug]/og-variants/v5-diagonal-blocks';
import { renderOgImage as v6 } from '@/app/blog/[slug]/og-variants/v6-top-bar';
import { renderOgImage as v7 } from '@/app/blog/[slug]/og-variants/v7-right-panel';
import { renderOgImage as v8 } from '@/app/blog/[slug]/og-variants/v8-bottom-circuit';
import { renderOgImage as v9 } from '@/app/blog/[slug]/og-variants/v9-scattered-nodes';
import { renderOgImage as v10 } from '@/app/blog/[slug]/og-variants/v10-border-frame';
import { renderOgImage as v11 } from '@/app/blog/[slug]/og-variants/v11-brand-corners';
import { renderOgImage as v12 } from '@/app/blog/[slug]/og-variants/v12-brand-grid';
import { renderOgImage as v13 } from '@/app/blog/[slug]/og-variants/v13-brand-left-panel';
import { renderOgImage as v14 } from '@/app/blog/[slug]/og-variants/v14-brand-frame-gold';
import { renderOgImage as v15 } from '@/app/blog/[slug]/og-variants/v15-brand-split';

const variants: Record<string, (meta: any) => ImageResponse> = {
  v1,
  v2,
  v3,
  v4,
  v5,
  v6,
  v7,
  v8,
  v9,
  v10,
  v11,
  v12,
  v13,
  v14,
  v15,
};

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug') ?? 'hello-world';
  const variant = request.nextUrl.searchParams.get('v') ?? 'v1';

  const result = getPostBySlug(slug);
  if (!result) {
    return new Response('Post not found', { status: 404 });
  }

  const render = variants[variant];
  if (!render) {
    return new Response(
      `Unknown variant: ${variant}. Available: ${Object.keys(variants).join(', ')}`,
      { status: 400 },
    );
  }

  return render(result.meta);
}
