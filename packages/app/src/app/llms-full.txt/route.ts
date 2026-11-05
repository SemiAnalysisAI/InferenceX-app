import { getAllPosts, getPostBySlug } from '@/lib/blog/blog';
import {
  getAllHardwarePages,
  getHardwarePageBySlug,
  hardwarePagePath,
} from '@/lib/hardware/hardware';
import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

// oxlint-disable-next-line require-await
export async function GET() {
  const posts = getAllPosts();

  const sections = posts.map((post) => {
    const result = getPostBySlug(post.slug);
    if (!result) return '';

    return [
      `# ${post.title}`,
      '',
      `> ${post.subtitle}`,
      '',
      `- **Author**: ${AUTHOR_NAME}`,
      `- **Date**: ${post.date}`,
      `- **URL**: ${SITE_URL}/blog/${post.slug}`,
      ...(post.tags ? [`- **Tags**: ${post.tags.join(', ')}`] : []),
      `- **Reading time**: ${post.readingTime} min`,
      '',
      result.raw,
    ].join('\n');
  });

  const hardwareSections = getAllHardwarePages().flatMap((meta) => {
    const page = getHardwarePageBySlug(meta.slug);
    if (!page) return [];

    return [
      [
        `# ${meta.title}`,
        '',
        `> ${meta.seoDescription}`,
        '',
        `- **Author**: ${AUTHOR_NAME}`,
        `- **Date**: ${meta.date}`,
        `- **URL**: ${SITE_URL}${hardwarePagePath(meta.slug)}`,
        `- **Tags**: ${meta.tags.join(', ')}`,
        `- **Reading time**: ${meta.readingTime} min`,
        '',
        meta.lede,
        '',
        page.raw,
      ].join('\n'),
    ];
  });

  const body = [
    `# ${SITE_NAME} Articles — Full Content`,
    `> By ${AUTHOR_NAME}`,
    '',
    `This file contains the full text of all articles (${SITE_URL}/blog) and hardware results pages (${SITE_URL}/hardware) from ${SITE_NAME}, covering agentic inference benchmarks including AgentX results, fixed-sequence AI inference, chip performance, and ML infrastructure.`,
    `It is intended for consumption by large language models and AI assistants.`,
    '',
    '---',
    '',
    ...[...sections, ...hardwareSections].flatMap((s) => [s, '', '---', '']),
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
