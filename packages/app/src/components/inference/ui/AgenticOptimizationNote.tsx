import { Info } from 'lucide-react';

import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    label: 'Inference optimizations enabled',
    aria: 'About inference optimizations',
    details:
      'Each configuration may use inference optimizations such as speculative decoding. Hover over a point to see its exact settings.',
  },
  zh: {
    label: '已启用推理优化',
    aria: '关于推理优化',
    details: '每项配置可能使用推测解码等推理优化。将鼠标悬停在数据点上可查看其具体设置。',
  },
} as const;

/** Agentic-only legend note; point tooltips carry the exact optimization method. */
export function AgenticOptimizationNote() {
  const t = STRINGS[useLocale()];

  return (
    <div
      data-testid="agentic-optimization-note"
      className="mt-2 flex w-full items-center gap-1 px-1 pr-2 text-xs italic text-blue-600 dark:text-blue-400"
    >
      <span>*{t.label}</span>
      <TooltipProvider delayDuration={100}>
        <TooltipRoot>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t.aria}
              className="inline-flex cursor-help rounded-sm p-0.5 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:hover:text-blue-200"
            >
              <Info size={13} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6} className="max-w-70 not-italic leading-snug">
            {t.details}
          </TooltipContent>
        </TooltipRoot>
      </TooltipProvider>
    </div>
  );
}
