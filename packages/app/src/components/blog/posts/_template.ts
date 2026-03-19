import type { BlogPost } from '../blog-data';

export const post: BlogPost = {
  slug: 'your-post-slug',
  title: 'Your Post Title',
  author: 'SemiAnalysis',
  date: '2026-03-19',
  excerpt: 'A short summary for the listing page and SEO description.',
  tags: ['inference', 'benchmarks'],
  content: `
Your markdown content goes here.

## Subheading

Paragraphs, **bold**, *italic*, [links](https://example.com), images, tables — all standard markdown.

\`\`\`python
# Code blocks work too
print("hello world")
\`\`\`
`,
};
