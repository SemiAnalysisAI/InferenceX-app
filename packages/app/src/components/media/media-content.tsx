'use client';

import { track } from '@/lib/analytics';

import { Card } from '@/components/ui/card';
import { ExternalLinkIcon } from '@/components/ui/external-link-icon';

import { MEDIA_ITEMS, type MediaItem } from './media-data';

function MediaCard({ title, organization, url, type, date }: MediaItem) {
  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <article>
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <time dateTime={date}>{formattedDate}</time>
        <span>&middot;</span>
        <span className="font-semibold text-foreground">{organization}</span>
        <span>&middot;</span>
        <span className="inline-flex items-center rounded-full bg-muted px-3 py-0.5 text-xs text-muted-foreground">
          {type.charAt(0).toUpperCase() + type.slice(1)}
        </span>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block"
        onClick={() =>
          track('media_link_clicked', {
            organization,
            type,
          })
        }
      >
        <h3 className="text-base lg:text-lg font-medium leading-snug text-foreground group-hover:text-brand group-hover:underline transition-colors">
          &ldquo;{title}&rdquo;
          <ExternalLinkIcon />
        </h3>
      </a>
    </article>
  );
}

export function MediaContent() {
  return (
    <main className="relative">
      <div className="container mx-auto px-4 lg:px-8 flex flex-col gap-4">
        <section className="flex flex-col gap-4">
          <Card>
            <h2 className="text-2xl lg:text-4xl font-bold tracking-tight">
              InferenceX&trade; In the Media
            </h2>
            <p className="mt-3 text-base lg:text-lg text-muted-foreground">
              Coverage and mentions of InferenceX&trade; across industry publications, blogs, and
              media outlets.
            </p>
            <div className="mt-6 pt-6 border-t border-border/40">
              <div className="flex flex-col gap-8">
                {[...MEDIA_ITEMS]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((item) => (
                    <MediaCard key={item.url} {...item} />
                  ))}
              </div>
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
