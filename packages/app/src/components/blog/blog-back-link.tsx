'use client';

import Link from 'next/link';
import { track } from '@/lib/analytics';

export function BlogBackLink() {
  return (
    <nav>
      <Link
        href="/blog"
        className="text-sm text-muted-foreground hover:underline mb-4 inline-block"
        onClick={() => track('blog_back_clicked')}
      >
        &larr;&nbsp;&nbsp;Back to articles
      </Link>
    </nav>
  );
}
