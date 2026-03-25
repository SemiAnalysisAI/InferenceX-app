'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import type { FavoritePreset } from '@/components/favorites/favorite-presets';
import { Badge } from '@/components/ui/badge';
import { track } from '@/lib/analytics';

export function PresetCard({ preset }: { preset: FavoritePreset }) {
  return (
    <Link
      href={`/inference?g_preset=${preset.id}`}
      data-testid={`landing-preset-${preset.id}`}
      onClick={() =>
        track('landing_preset_clicked', {
          preset_id: preset.id,
          preset_title: preset.title,
        })
      }
      className="group flex flex-col rounded-xl border border-border bg-card/90 p-4 md:p-5 transition-all duration-200 hover:border-brand/50 hover:bg-card"
    >
      <p className="font-semibold text-sm leading-tight mb-1.5">{preset.title}</p>
      <p className="text-xs text-muted-foreground leading-snug mb-3 line-clamp-2">
        {preset.description}
      </p>
      <div className="flex flex-wrap gap-1 mt-auto">
        {preset.tags.map((tag) => (
          <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 leading-tight">
            {tag}
          </Badge>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-3 text-xs text-brand opacity-0 group-hover:opacity-100 transition-opacity">
        View comparison
        <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
  );
}
