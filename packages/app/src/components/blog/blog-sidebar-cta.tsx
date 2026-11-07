'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/eyebrow';
import { headingVariants } from '@/components/ui/heading';
import { track } from '@/lib/analytics/analytics';
import { cn } from '@/lib/shared/utils';

interface BlogSidebarCtaProps {
  href: string;
  slug: string;
  labels: { eyebrow: string; title: string; body: string; button: string };
}

export function BlogSidebarCta({ href, slug, labels }: BlogSidebarCtaProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-border/30 bg-card p-5"
      data-testid="blog-sidebar-cta"
    >
      <Eyebrow as="p">{labels.eyebrow}</Eyebrow>
      <p className={cn(headingVariants({ level: 'card' }), 'text-balance')}>{labels.title}</p>
      <p className="text-sm leading-6 text-muted-foreground">{labels.body}</p>
      <Button asChild variant="brand" size="sm" className="w-fit">
        <Link href={href} onClick={() => track('blog_sidebar_cta_clicked', { slug, href })}>
          {labels.button}
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
