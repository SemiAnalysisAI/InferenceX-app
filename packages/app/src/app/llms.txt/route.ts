import { getAllPosts } from '@/lib/blog';
import { getAllChipPages, getAllChipVsPages } from '@/lib/chip-pages';
import { getAllRankingPageEntries, rankingPageHeading } from '@/lib/rankings';
import { inferenceModelMeta } from '@/lib/inference-model-meta';
import { INFERENCE_MODEL_SLUGS } from '@/lib/inference-model-slug';
import { getAllWhitepapers } from '@/lib/whitepapers';
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
    `- [Whitepapers](${SITE_URL}/whitepaper)`,
    `- [API Reference](${SITE_URL}/api)`,
    `- [OpenAPI 3.1 Specification](${SITE_URL}/api/openapi.json)`,
    `- [RSS Feed](${SITE_URL}/feed.xml)`,
    `- [Full content for LLMs](${SITE_URL}/llms-full.txt)`,
    `- [GitHub](https://github.com/SemiAnalysisAI/InferenceX)`,
    '',
    `## Model Benchmark Pages`,
    '',
    ...INFERENCE_MODEL_SLUGS.map(
      (entry) =>
        `- [${inferenceModelMeta(entry).title}](${SITE_URL}/inference/${entry.slug}): ${entry.label}`,
    ),
    '',
    `## Chip Pages`,
    '',
    ...getAllChipPages().map(
      (chip) => `- [${chip.title}](${SITE_URL}/chips/${chip.slug}): specs, pricing and benchmarks`,
    ),
    ...getAllChipVsPages().map(
      (page) =>
        `- [${page.a.label} vs ${page.b.label}](${SITE_URL}/chips/${page.slug}): head-to-head comparison`,
    ),
    '',
    `## GPU Rankings`,
    '',
    `- [GPU Rankings for LLM Inference](${SITE_URL}/rankings): live fastest and cheapest GPU leaderboards per model`,
    ...getAllRankingPageEntries().map(
      (entry) =>
        `- [${rankingPageHeading(entry)}](${SITE_URL}/rankings/${entry.slug}): live benchmark ranking`,
    ),
    '',
    `## Model on GPU Results`,
    '',
    `- [Run Any Model on Any GPU](${SITE_URL}/run): measured throughput and cost for every benchmarked model and GPU pairing`,
    '',
    `## Articles`,
    '',
    ...posts.map((post) => `- [${post.title}](${SITE_URL}/blog/${post.slug}): ${post.subtitle}`),
    '',
    `## Whitepapers`,
    '',
    ...getAllWhitepapers().map(
      (paper) =>
        `- [${paper.en.title}](${SITE_URL}/whitepaper/${paper.slug}): ${paper.en.subtitle} (PDF: ${SITE_URL}${paper.pdfPath})`,
    ),
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
