'use client';

import Link from 'next/link';

import { track } from '@/lib/analytics';
import { Badge } from '@/components/ui/badge';
import { TooltipContent, TooltipRoot, TooltipTrigger } from '@/components/ui/tooltip';
import { getModelSlugEntryForDisplayName } from '@/lib/compare-slug';
import { formatParamCount, getModelArchitecture } from '@/lib/model-architectures';
import { type Model, getModelLabel } from '@/lib/data-mappings';

/**
 * Compact replacement for the old full-width "Learn more about the … architecture"
 * banner row: an icon link that sits beside the closed model-selector trigger and
 * deep-links to the model's `/model/[slug]` page. The former banner copy and the
 * architecture badges (MoE/Dense, attention type, param count) move into the
 * tooltip so the dashboard no longer spends a whole row of vertical space on them.
 * Renders nothing for models without a public slug (hidden models).
 */
export function ModelArchitectureInfoLink({
  model,
  locale,
}: {
  model: Model;
  locale: 'en' | 'zh';
}) {
  const entry = getModelSlugEntryForDisplayName(model);
  if (!entry) return null;
  const arch = getModelArchitecture(model);
  const label = getModelLabel(model);
  const text =
    locale === 'zh' ? `了解 ${label} 模型架构` : `Learn more about the ${label} architecture`;
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>
        <Link
          href={`/model/${entry.slug}`}
          aria-label={text}
          data-testid="model-architecture-link"
          className="border-input flex size-9 shrink-0 items-center justify-center rounded-md border bg-transparent text-muted-foreground shadow-xs transition-colors hover:bg-muted/50 hover:text-foreground"
          onClick={() => track('model_architecture_link_clicked', { model, slug: entry.slug })}
        >
          <svg
            className="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="9" x2="9" y2="21" />
          </svg>
        </Link>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        collisionPadding={10}
        className="z-[130]"
        data-testid="model-architecture-tooltip"
      >
        <span className="flex flex-wrap items-center gap-1.5">
          {text}
          {arch && (
            <span className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-xs py-0">
                {arch.architectureType === 'moe' ? 'MoE' : 'Dense'}
              </Badge>
              <Badge variant="outline" className="text-xs py-0">
                {arch.attentionType === 'AlternatingSinkGQA' ? 'Sink/Full GQA' : arch.attentionType}
              </Badge>
              <Badge variant="outline" className="text-xs py-0">
                {formatParamCount(arch.totalParams)}
              </Badge>
            </span>
          )}
        </span>
      </TooltipContent>
    </TooltipRoot>
  );
}
