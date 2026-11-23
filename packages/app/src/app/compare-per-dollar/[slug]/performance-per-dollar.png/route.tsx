import { perDollarPngResponse } from '@/lib/compare/per-dollar-png';

export const revalidate = 86400;
export const runtime = 'nodejs';

export function generateStaticParams(): { slug: string }[] {
  return [];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  return perDollarPngResponse(slug, 'en');
}
