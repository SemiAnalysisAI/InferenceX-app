'use client';

import { ArrowRight, Activity } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/eyebrow';
import { headingVariants } from '@/components/ui/heading';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';

interface BlogSidebarCtaProps {
  href: string;
  slug: string;
  labels: { eyebrow: string; title: string; body: string; button: string };
}

/** Sticky-sidebar card pointing readers at the live AgentX dashboard. */
export function BlogSidebarCta({ href, slug, labels }: BlogSidebarCtaProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-5"
      data-testid="blog-sidebar-cta"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary">
          <Activity aria-hidden="true" className="size-3.5" />
        </span>
        <Eyebrow as="p">{labels.eyebrow}</Eyebrow>
      </div>
      <p className={cn(headingVariants({ level: 'card' }), 'text-balance')}>{labels.title}</p>
      <p className="text-sm leading-6 text-muted-foreground">{labels.body}</p>
      <Button asChild size="sm" className="w-fit">
        <Link href={href} onClick={() => track('blog_sidebar_cta_clicked', { slug, href })}>
          {labels.button}
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
