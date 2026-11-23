import { perDollarVersionedPngResponse } from '@/lib/compare/per-dollar-png';

export const revalidate = 86400;
export const runtime = 'nodejs';

export function generateStaticParams(): { slug: string; file: string }[] {
  return [];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; file: string }> },
): Promise<Response> {
  const { slug, file } = await params;
  return perDollarVersionedPngResponse(slug, file, 'en');
}
