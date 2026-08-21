'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { ServerLogViewer } from '@/components/inference/agentic-point/server-log-viewer';
import { track } from '@/lib/analytics';
import { isZhPathname, ZH_PREFIX } from '@/lib/i18n';
import { useLocale } from '@/lib/use-locale';

const STRINGS = {
  en: {
    back: 'Back',
    inferenceChart: 'Inference chart',
    eyebrow: 'Fixed-sequence benchmark',
    title: 'Benchmark logs',
  },
  zh: {
    back: '返回',
    inferenceChart: '推理图表',
    eyebrow: '固定序列长度基准测试',
    title: '基准测试日志',
  },
} as const;

export function BenchmarkLogDetail({ id }: { id: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = STRINGS[useLocale()];
  const inferenceHref = isZhPathname(pathname) ? `${ZH_PREFIX}/inference` : '/inference';

  return (
    <main className="container mx-auto flex flex-col gap-4 px-4 py-6 lg:px-8">
      <nav className="flex items-center gap-2" aria-label={t.title}>
        <button
          type="button"
          onClick={() => {
            track('inference_fixed_seq_logs_back_clicked', { id });
            router.back();
          }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> {t.back}
        </button>
        <span className="text-sm text-muted-foreground" aria-hidden="true">
          ·
        </span>
        <Link
          href={inferenceHref}
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={() => track('inference_fixed_seq_logs_chart_clicked', { id })}
        >
          {t.inferenceChart}
        </Link>
      </nav>

      <header>
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          {t.eyebrow} · #{id}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-foreground">{t.title}</h1>
      </header>

      <ServerLogViewer id={id} enabled analyticsContext="fixed-sequence" />
    </main>
  );
}
