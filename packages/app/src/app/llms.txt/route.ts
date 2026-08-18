import { getAllPosts } from '@/lib/blog';
import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

// oxlint-disable-next-line require-await
export async function GET() {
  const posts = getAllPosts();

  const lines = [
    `# ${SITE_NAME} by ${AUTHOR_NAME}`,
    '',
    `> ${SITE_NAME} is an open-source agentic inference benchmark dashboard. It compares the AgentX long-context, multi-turn coding scenario with fixed-sequence serving across NVIDIA, AMD, and other accelerators using public runs.`,
    '',
    `## Links`,
    '',
    `- [Dashboard](${SITE_URL})`,
    `- [AgentX](${SITE_URL}/agentx)`,
    `- [AgentX Methodology](${SITE_URL}/agentx/methodology)`,
    `- [Articles](${SITE_URL}/blog)`,
    `- [API Reference](${SITE_URL}/api)`,
    `- [OpenAPI 3.1 Specification](${SITE_URL}/api/openapi.json)`,
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
