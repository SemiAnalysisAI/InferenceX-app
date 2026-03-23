import type { NextRequest } from 'next/server';

import { getPostBySlug } from '@/lib/blog';

import { renderOgImage } from '@/app/blog/[slug]/og-image-render';

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug') ?? 'hello-world';

  const result = getPostBySlug(slug);
  if (!result) {
    return new Response('Post not found', { status: 404 });
  }

  const meta = { ...result.meta };
  const titleOverride = request.nextUrl.searchParams.get('title');
  const subtitleOverride = request.nextUrl.searchParams.get('subtitle');
  if (titleOverride) meta.title = titleOverride;
  if (subtitleOverride) meta.subtitle = subtitleOverride;

  return await renderOgImage(meta);
}
