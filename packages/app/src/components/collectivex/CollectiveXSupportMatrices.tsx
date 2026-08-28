'use client';

import { Check, CircleDashed, Clock, TriangleAlert, X } from 'lucide-react';
import { useMemo } from 'react';

import { Card } from '@/components/ui/card';
import { useLocale } from '@/lib/use-locale';

import {
  buildCollectiveXSupportMatrix,
  collectiveXKernelSupportCell,
  collectiveXSkuLabel,
  type CollectiveXSupportStatus,
} from './data';
import type { CollectiveXDataset, CollectiveXMode } from './types';

const MODES: CollectiveXMode[] = ['normal', 'low-latency'];

const STATUSES: CollectiveXSupportStatus[] = [
  'measured',
  'unsupported',
  'failed',
  'pending',
  'unrequested',
];

const STRINGS = {
  en: {
    title: 'Kernel support matrices',
    description:
      'SKU × library support across checked runs. Green means at least one measured case; every other cell says why it is not measured — hover for the coverage reasons.',
    modes: {
      normal: 'Throughput kernels',
      'low-latency': 'Low-latency kernels',
    },
    axes: 'SKU / Library',
    statuses: {
      measured: 'Measured',
      unsupported: 'Unsupported on this platform',
      failed: 'Requested, all attempts failed',
      pending: 'Requested, not measured',
      unrequested: 'Not requested',
    },
  },
  zh: {
    title: 'Kernel 支持矩阵',
    description:
      '汇总已勾选运行中各 SKU 与集合通信库的支持情况。绿色表示至少有一个已测用例；其余单元格标注未测原因——悬停查看覆盖率原因。',
    modes: {
      normal: '吞吐量 Kernel',
      'low-latency': '低延迟 Kernel',
    },
    axes: 'SKU / 集合通信库',
    statuses: {
      measured: '已测',
      unsupported: '平台不支持',
      failed: '已请求，全部失败',
      pending: '已请求，未完成测量',
      unrequested: '未请求',
    },
  },
} as const;

const STATUS_CELL_CLASS: Record<CollectiveXSupportStatus, string> = {
  measured: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  unsupported: 'bg-red-500/10 text-red-700 dark:text-red-300',
  failed: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  unrequested: 'bg-muted/20 text-muted-foreground/70',
};

const STATUS_KEY_CLASS: Record<CollectiveXSupportStatus, string> = {
  measured: 'border-emerald-600/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  unsupported: 'border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-300',
  failed: 'border-orange-600/40 bg-orange-500/15 text-orange-700 dark:text-orange-300',
  pending: 'border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  unrequested: 'border-border bg-muted/20 text-muted-foreground/70',
};

function StatusIcon({
  status,
  className,
}: {
  status: CollectiveXSupportStatus;
  className: string;
}) {
  const shared = { 'aria-hidden': true as const, className };
  switch (status) {
    case 'measured': {
      return <Check {...shared} />;
    }
    case 'unsupported': {
      return <X {...shared} />;
    }
    case 'failed': {
      return <TriangleAlert {...shared} />;
    }
    case 'pending': {
      return <Clock {...shared} />;
    }
    case 'unrequested': {
      return <CircleDashed {...shared} />;
    }
  }
}

export function CollectiveXSupportMatrices({ datasets }: { datasets: CollectiveXDataset[] }) {
  const locale = useLocale();
  const t = STRINGS[locale];
  const matrix = useMemo(() => buildCollectiveXSupportMatrix(datasets), [datasets]);

  if (matrix.skus.length === 0 || matrix.libraries.length === 0) return null;

  return (
    <Card data-testid="collectivex-support-matrices" className="min-w-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t.title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t.description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground lg:max-w-xs lg:justify-end">
          {STATUSES.map((status) => (
            <StatusKey key={status} status={status} label={t.statuses[status]} />
          ))}
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
                        const cell = collectiveXKernelSupportCell(matrix, mode, sku, library);
                        // The status label answers "why is this not green?";
                        // the machine reasons from the coverage rows follow it
                        // verbatim (e.g. backend-platform-unsupported).
                        const why =
                          cell.reasons.length > 0
                            ? `${t.statuses[cell.status]} — ${cell.reasons.join('; ')}`
                            : t.statuses[cell.status];
                        return (
                          <td
                            key={library}
                            data-testid="collectivex-support-cell"
                            data-mode={mode}
                            data-sku={sku}
                            data-library={library}
                            data-status={cell.status}
                            data-supported={String(cell.status === 'measured')}
                            className={`border-l border-border/60 px-3 py-2 text-center ${STATUS_CELL_CLASS[cell.status]}`}
                          >
                            <span
                              role="img"
                              aria-label={`${collectiveXSkuLabel(sku)} × ${library}: ${why}`}
                              title={why}
                              className="inline-flex items-center justify-center"
                            >
                              <StatusIcon status={cell.status} className="size-4 stroke-[2.5]" />
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

function StatusKey({ status, label }: { status: CollectiveXSupportStatus; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex size-5 items-center justify-center rounded border ${STATUS_KEY_CLASS[status]}`}
      >
        <StatusIcon status={status} className="size-3.5 stroke-[2.5]" />
      </span>
      {label}
    </span>
  );
}
