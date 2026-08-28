'use client';

import { Check, X } from 'lucide-react';
import { useMemo } from 'react';

import { Card } from '@/components/ui/card';
import { useLocale } from '@/lib/use-locale';

import {
  buildCollectiveXSupportMatrix,
  collectiveXKernelIsSupported,
  collectiveXSkuLabel,
} from './data';
import type { CollectiveXDataset, CollectiveXMode } from './types';

const MODES: CollectiveXMode[] = ['normal', 'low-latency'];

const STRINGS = {
  en: {
    title: 'Kernel support matrices',
    description:
      'SKU × library support across checked runs. Green means at least one measured case; red means absent.',
    modes: {
      normal: 'Throughput kernels',
      'low-latency': 'Low-latency kernels',
    },
    axes: 'SKU / Library',
    supported: 'Supported',
    absent: 'Absent',
  },
  zh: {
    title: 'Kernel 支持矩阵',
    description:
      '汇总已勾选运行中各 SKU 与集合通信库的支持情况。绿色表示至少有一个已测用例，红色表示未发现支持。',
    modes: {
      normal: '吞吐量 Kernel',
      'low-latency': '低延迟 Kernel',
    },
    axes: 'SKU / 集合通信库',
    supported: '支持',
    absent: '未发现',
  },
} as const;

export function CollectiveXSupportMatrices({ datasets }: { datasets: CollectiveXDataset[] }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const matrix = useMemo(() => buildCollectiveXSupportMatrix(datasets), [datasets]);

  if (matrix.skus.length === 0 || matrix.libraries.length === 0) return null;

  return (
    <Card data-testid="collectivex-support-matrices" className="min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t.title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t.description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <StatusKey supported label={t.supported} />
          <StatusKey supported={false} label={t.absent} />
        </div>
      </div>

      <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-2">
        {MODES.map((mode) => (
          <section
            key={mode}
            data-testid={`collectivex-support-matrix-${mode}`}
            className="min-w-0 overflow-hidden rounded-lg border border-border/60"
          >
            <h3 className="border-b border-border/60 bg-muted/20 px-4 py-3 text-sm font-semibold">
              {t.modes[mode]}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-sm">
                <caption className="sr-only">
                  {t.modes[mode]} · {t.axes}
                </caption>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="bg-muted/30 px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground"
                    >
                      {t.axes}
                    </th>
                    {matrix.libraries.map((library) => (
                      <th
                        key={library}
                        scope="col"
                        className="border-l border-border/60 bg-muted/30 px-3 py-2 text-center text-xs font-medium whitespace-nowrap"
                      >
                        {library}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.skus.map((sku) => (
                    <tr key={sku} className="border-t border-border/60">
                      <th
                        scope="row"
                        className="bg-muted/10 px-3 py-2 text-left font-mono text-xs font-semibold whitespace-nowrap"
                      >
                        {collectiveXSkuLabel(sku)}
                      </th>
                      {matrix.libraries.map((library) => {
                        const supported = collectiveXKernelIsSupported(matrix, mode, sku, library);
                        const status = supported ? t.supported : t.absent;
                        return (
                          <td
                            key={library}
                            data-testid="collectivex-support-cell"
                            data-mode={mode}
                            data-sku={sku}
                            data-library={library}
                            data-supported={String(supported)}
                            className={`border-l border-border/60 px-3 py-2 text-center ${
                              supported
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'bg-red-500/10 text-red-700 dark:text-red-300'
                            }`}
                          >
                            <span
                              role="img"
                              aria-label={`${collectiveXSkuLabel(sku)} × ${library}: ${status}`}
                              title={status}
                              className="inline-flex items-center justify-center"
                            >
                              {supported ? (
                                <Check aria-hidden="true" className="size-4 stroke-[2.5]" />
                              ) : (
                                <X aria-hidden="true" className="size-4 stroke-[2.5]" />
                              )}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </Card>
  );
}

function StatusKey({ supported, label }: { supported: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex size-5 items-center justify-center rounded border ${
          supported
            ? 'border-emerald-600/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
            : 'border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-300'
        }`}
      >
        {supported ? (
          <Check aria-hidden="true" className="size-3.5 stroke-[2.5]" />
        ) : (
          <X aria-hidden="true" className="size-3.5 stroke-[2.5]" />
        )}
      </span>
      {label}
    </span>
  );
}
