import { specDecodePngResponse } from '@/lib/compare/variant-png';

// Matches the page. Its benchmark reads are tagged only through the Blob purge generation.
export const revalidate = 3600;
export const runtime = 'nodejs';

export function generateStaticParams(): { slug: string }[] {
  return [];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  return specDecodePngResponse(slug, 'en');
}
