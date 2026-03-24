import fs from 'node:fs';
import path from 'node:path';

import matter from 'gray-matter';

export interface BlogFrontmatter {
  title: string;
  date: string;
  subtitle: string;
  modifiedDate?: string;
  tags?: string[];
}

export interface BlogPostMeta extends BlogFrontmatter {
  slug: string;
  readingTime: number;
}

const CONTENT_DIR = path.join(process.cwd(), 'content', 'blog');
const WORDS_PER_MINUTE = 265;

export function slugify(raw: string): string {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'post'
  );
}

export function getReadingTime(content: string): number {
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

export function getAllPosts(): BlogPostMeta[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.mdx'));

  const posts = files.map((filename) => {
    const slug = slugify(filename.replace(/\.mdx$/, ''));
    const raw = fs.readFileSync(path.join(CONTENT_DIR, filename), 'utf-8');
    const { data, content } = matter(raw);

    return {
      ...(data as BlogFrontmatter),
      slug,
      readingTime: getReadingTime(content),
    };
  });

  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export interface AdjacentPosts {
  prev: BlogPostMeta | null;
  next: BlogPostMeta | null;
}

export function getAdjacentPosts(slug: string): AdjacentPosts {
  const posts = getAllPosts();
  const index = posts.findIndex((p) => p.slug === slug);
  if (index === -1) return { prev: null, next: null };
  return {
    next: index > 0 ? posts[index - 1] : null,
    prev: index < posts.length - 1 ? posts[index + 1] : null,
  };
}

export interface TocHeading {
  level: 1 | 2 | 3;
  text: string;
  id: string;
}

export function extractHeadings(rawMdx: string): TocHeading[] {
  const stripped = rawMdx.replaceAll(/```[\s\S]*?```/g, '');
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  const headings: TocHeading[] = [];
  const seen = new Set<string>();
  const parents: string[] = []; // parents[level] = slug of most recent heading at that level
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(stripped)) !== null) {
    const level = match[1].length as 1 | 2 | 3;
    const text = match[2].trim();
    const base = slugify(text);
    parents[level] = base;
    let id = base;
    if (seen.has(id)) {
      // prefix with nearest parent heading
      const parent = parents.slice(1, level).findLast((p) => p);
      id = parent ? `${parent}-${base}` : `${base}-${level}`;
    }
    seen.add(id);
    headings.push({ level, text, id });
  }
  return headings;
}

export function getPostBySlug(slug: string): { meta: BlogPostMeta; raw: string } | null {
  const safe = slugify(slug);
  const filePath = path.join(CONTENT_DIR, `${safe}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(fileContent);

  return {
    meta: {
      ...(data as BlogFrontmatter),
      slug: safe,
      readingTime: getReadingTime(content),
    },
    raw: content,
  };
}
