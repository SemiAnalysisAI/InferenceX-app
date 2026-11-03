'use client';

import { ArrowRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { NewBadge } from '@/components/ui/new-badge';
import { track } from '@/lib/analytics/analytics';
import { placementFor } from '@/lib/analytics/placement';
import { useLocale } from '@/lib/i18n/use-locale';
import type { FavoritePreset } from '@/components/favorites/favorite-presets';

export function CuratedViewCard({ preset }: { preset: FavoritePreset }) {
  const locale = useLocale();
  const isZh = locale === 'zh';
  const isNew = preset.tags.some((t) => t.toLowerCase() === 'new');
  const visibleTags = preset.tags.filter((t) => t.toLowerCase() !== 'new');
  const title = (isZh && preset.titleZh) || preset.title;
  const description = (isZh && preset.descriptionZh) || preset.description;
  const href = `${isZh ? '/zh' : ''}/inference?preset=${preset.id}`;
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    track('landing_curated_view_clicked', {
      preset_id: preset.id,
      preset_title: preset.title,
      placement: placementFor(e.currentTarget),
    });
    window.location.href = href;
  };
  return (
    <a
      href={href}
      onClick={onClick}
      className={`group flex min-w-0 flex-col rounded-lg border border-border/30 p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none${preset.wide ? ' sm:col-span-2' : ''}`}
      data-testid={`curated-view-${preset.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base leading-snug font-medium">
          <span className="align-middle">{title}</span>
          {isNew && <NewBadge className="ml-2 align-middle">{isZh ? '新' : 'New'}</NewBadge>}
        </h3>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      {visibleTags.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
          {visibleTags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </a>
  );
}
