export interface BlogPost {
  slug: string;
  title: string;
  author: string;
  date: string; // ISO format: 'YYYY-MM-DD'
  excerpt: string;
  content: string; // Markdown
  tags?: string[];
}

export const BLOG_POSTS: BlogPost[] = [];
