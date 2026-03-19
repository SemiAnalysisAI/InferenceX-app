export interface BlogPost {
  slug: string;
  title: string;
  author: string;
  date: string; // ISO format: 'YYYY-MM-DD'
  modifiedDate?: string; // ISO format: 'YYYY-MM-DD'
  excerpt: string;
  content: string; // Markdown
  tags?: string[];
  coverImage?: string; // absolute URL for OG/structured data
}

/** Estimated reading time in minutes (assumes 238 wpm average). */
export function getReadingTime(content: string): number {
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 238));
}

export const BLOG_POSTS: BlogPost[] = [];
