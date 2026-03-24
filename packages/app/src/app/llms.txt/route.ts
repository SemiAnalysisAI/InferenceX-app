import { getAllPosts } from '@/lib/blog';
import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

export async function GET() {
  const posts = getAllPosts();

  const lines = [
    `# ${SITE_NAME} by ${AUTHOR_NAME}`,
    '',
    `> ${SITE_NAME} is the open-source AI inference benchmark dashboard. We compare GPU performance for LLM inference across NVIDIA GB200, H100, AMD MI355X, and more.`,
    '',
    `## Links`,
    '',
    `- [Dashboard](${SITE_URL})`,
    `- [Articles](${SITE_URL}/blog)`,
    `- [RSS Feed](${SITE_URL}/feed.xml)`,
    `- [Full content for LLMs](${SITE_URL}/llms-full.txt)`,
    `- [GitHub](https://github.com/SemiAnalysisAI/InferenceX)`,
    '',
    `## Articles`,
    '',
    ...posts.map((post) => `- [${post.title}](${SITE_URL}/blog/${post.slug}): ${post.subtitle}`),
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
