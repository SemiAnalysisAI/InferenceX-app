import { getAllPosts } from '@/lib/blog';
import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const posts = getAllPosts();
  const now = new Date().toUTCString();

  const items = posts
    .map(
      (post) => `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${SITE_URL}/blog/${post.slug}</link>
      <guid isPermaLink="false">${SITE_URL}/blog/${post.slug}</guid>
      <description>${escapeXml(post.subtitle)}</description>
      <dc:creator>${escapeXml('SemiAnalysis')}</dc:creator>
      <pubDate>${new Date(post.date + 'T00:00:00Z').toUTCString()}</pubDate>${
        post.tags
          ? post.tags.map((tag) => `\n      <category>${escapeXml(tag)}</category>`).join('')
          : ''
      }
    </item>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:atom="http://www.w3.org/2005/Atom"
     version="2.0">
  <channel>
    <title>${escapeXml(SITE_NAME)} Blog</title>
    <description>Technical blog from ${escapeXml(SITE_NAME)} by ${escapeXml(AUTHOR_NAME)}</description>
    <link>${SITE_URL}/blog</link>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
