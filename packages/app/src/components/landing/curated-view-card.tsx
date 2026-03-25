'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { track } from '@/lib/analytics';
import type { FavoritePreset } from '@/components/favorites/favorite-presets';

export function CuratedViewCard({ preset }: { preset: FavoritePreset }) {
  return (
    <Link
      href={`/inference?preset=${preset.id}`}
      onClick={() =>
        track('landing_curated_view_clicked', {
          preset_id: preset.id,
          preset_title: preset.title,
        })
      }
      className="group block rounded-xl border border-border bg-card/90 p-5 transition-all duration-200 hover:border-primary/40 hover:bg-accent/50 hover:shadow-md"
      data-testid={`curated-view-${preset.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm leading-tight">{preset.title}</h3>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0.5" />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed mt-1.5 line-clamp-2">
        {preset.description}
      </p>
      <div className="flex flex-wrap gap-1 mt-3">
        {preset.tags.map((tag) => (
          <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 leading-tight">
            {tag}
          </Badge>
        ))}
      </div>
    </Link>
  );
}
