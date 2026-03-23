import fs from 'fs';
import path from 'path';

import matter from 'gray-matter';

export interface BlogFrontmatter {
  title: string;
  date: string;
  subtitle: string;
  modifiedDate?: string;
  tags?: string[];
  coverImage?: string;
}

export interface BlogPostMeta extends BlogFrontmatter {
  slug: string;
  readingTime: number;
}

const CONTENT_DIR = path.join(process.cwd(), 'content', 'blog');
const WORDS_PER_MINUTE = 265;

export function getReadingTime(content: string): number {
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

export function getAllPosts(): BlogPostMeta[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];

  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.mdx'));

  const posts = files.map((filename) => {
    const slug = filename.replace(/\.mdx$/, '');
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

export function getPostBySlug(slug: string): { meta: BlogPostMeta; raw: string } | null {
  const filePath = path.join(CONTENT_DIR, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(fileContent);

  return {
    meta: {
      ...(data as BlogFrontmatter),
      slug,
      readingTime: getReadingTime(content),
    },
    raw: content,
  };
}
