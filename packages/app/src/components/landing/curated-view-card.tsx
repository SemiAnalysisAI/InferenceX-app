'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { track } from '@/lib/analytics';
import type { FavoritePreset } from '@/components/favorites/favorite-presets';

export function CuratedViewCard({ preset }: { preset: FavoritePreset }) {
  const isNew = preset.tags.some((t) => t.toLowerCase() === 'new');
  const visibleTags = preset.tags.filter((t) => t.toLowerCase() !== 'new');
  return (
    <Link
      href={`/inference?preset=${preset.id}`}
      onClick={() =>
        track('landing_curated_view_clicked', {
          preset_id: preset.id,
          preset_title: preset.title,
        })
      }
      className={`group relative flex flex-col rounded-xl border border-border bg-background/20 backdrop-blur-[2px] p-5 transition-all duration-200 hover:border-brand/50 hover:shadow-lg hover:shadow-brand/5 hover:scale-[1.01]${preset.wide ? ' sm:col-span-2' : ''}`}
      data-testid={`curated-view-${preset.id}`}
    >
      <div className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-brand/60 transition-all duration-200 group-hover:bg-brand group-hover:inset-y-2" />
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm leading-tight group-hover:text-brand transition-colors duration-200">
          <span className="align-middle">{preset.title}</span>
          {isNew && (
            <span className="ml-2 inline-flex items-center gap-1.5 align-middle rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm">
              New
            </span>
          )}
        </h3>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-brand" />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed mt-1.5 line-clamp-2">
        {preset.description}
      </p>
      <div className="flex flex-wrap gap-1.5 mt-auto pt-3">
        {visibleTags.map((tag) => (
          <Badge
            key={tag}
            variant="outline"
            className="text-[10px] px-2 py-0.5 leading-tight border-border/60 text-muted-foreground group-hover:border-brand/30 group-hover:text-foreground/80 transition-colors duration-200"
          >
            {tag}
          </Badge>
        ))}
      </div>
    </Link>
  );
}
