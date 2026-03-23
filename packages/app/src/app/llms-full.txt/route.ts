import { getAllPosts, getPostBySlug } from '@/lib/blog';
import { AUTHOR_NAME, SITE_NAME, SITE_URL } from '@semianalysisai/inferencex-constants';

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
      `- **Author**: ${'SemiAnalysis'}`,
      `- **Date**: ${post.date}`,
      `- **URL**: ${SITE_URL}/blog/${post.slug}`,
      ...(post.tags ? [`- **Tags**: ${post.tags.join(', ')}`] : []),
      `- **Reading time**: ${post.readingTime} min`,
      '',
      result.raw,
    ].join('\n');
  });

  const body = [
    `# ${SITE_NAME} Articles — Full Content`,
    `> By ${AUTHOR_NAME}`,
    '',
    `This file contains the full text of all articles from ${SITE_NAME} (${SITE_URL}/blog).`,
    `It is intended for consumption by large language models and AI assistants.`,
    '',
    '---',
    '',
    ...sections.flatMap((s) => [s, '', '---', '']),
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
