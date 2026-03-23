import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

import { getPostBySlug } from '@/lib/blog';

import { renderOgImage as v11 } from '@/app/blog/[slug]/og-variants/v11-brand-corners';
import { renderOgImage as v12 } from '@/app/blog/[slug]/og-variants/v12-brand-grid';
import { renderOgImage as v13 } from '@/app/blog/[slug]/og-variants/v13-brand-left-panel';
import { renderOgImage as v15 } from '@/app/blog/[slug]/og-variants/v15-brand-split';

const variants: Record<string, (meta: any) => Promise<ImageResponse>> = {
  v11,
  v12,
  v13,
  v15,
};

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug') ?? 'hello-world';
  const variant = request.nextUrl.searchParams.get('v') ?? 'v11';

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

  return await render(result.meta);
}
