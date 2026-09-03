import { InfoHelp } from '@/components/ui/option-info';
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

/** Agentic-only info-footer note; point tooltips carry the exact optimization method. */
export function AgenticOptimizationNote() {
  const t = STRINGS[useLocale()];

  return (
    <div
      data-testid="agentic-optimization-note"
      className="flex w-full items-center gap-1 px-1 pr-2 text-xs italic text-blue-600 dark:text-blue-400"
    >
      <span>*{t.label}</span>
      <InfoHelp
        label={t.label}
        value="agentic-optimizations"
        ariaLabel={t.aria}
        triggerClassName="-my-1"
      >
        {t.details}
      </InfoHelp>
    </div>
  );
}
