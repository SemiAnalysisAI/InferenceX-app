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
    <Card className="p-3 sm:p-5 lg:p-6 transition-colors hover:bg-card">
      <div className="space-y-1.5 sm:space-y-2">
        {/* Desktop */}
        <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
          <span>{formattedDate}</span>
          <span>&middot;</span>
          <span className="font-semibold text-foreground">{organization}</span>
          <span>&middot;</span>
          <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </span>
        </div>
        {/* Mobile */}
        <div className="sm:hidden text-sm text-muted-foreground">
          <span>{formattedDate}</span>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{organization}</span>
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </span>
          </div>
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
          <h3 className="text-sm sm:text-base lg:text-lg font-medium leading-snug text-foreground group-hover:text-primary transition-colors italic group-hover:underline">
            &ldquo;{title}&rdquo;
            <ExternalLinkIcon />
          </h3>
        </a>
      </div>
    </Card>
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
              Coverage and mentions of InferenceX&trade; (formerly InferenceMAX) across industry
              publications, blogs, and media outlets.
            </p>
          </Card>
          <Card>
            <div className="flex flex-col gap-3 md:pl-6">
              {[...MEDIA_ITEMS]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((item) => (
                  <MediaCard key={item.url} {...item} />
                ))}
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
