'use client';

import Link from 'next/link';
import { useLocale } from '@/lib/i18n/use-locale';
import { track } from '@/lib/analytics/analytics';
import { huaweiSkuConfigurations } from './huawei-sku-configurations';

const STRINGS = {
  en: {
    title: 'Huawei 950PR SKU configurations',
    intro:
      '950PR variants differ in enabled core counts, clock rates, memory and cache capacity. These are configuration values from the supplied SKU table, not measured TPC or GPC groupings.',
    columns: [
      'SKU',
      'Cube',
      'Vector',
      'AICPU',
      'Cube / Vector clock (MHz)',
      'Memory (GiB)',
      'L2 (MiB)',
      'DDR Rate*',
      'Virtualisation options',
    ],
    tested: 'Profiled SKU',
    notes:
      'AI Core count equals Cube count in every source row. Cube and Vector clocks are equal; the single DDR Rate value applies to Base, Read and Write. *DDR Rate units are not specified. Do not interpret these values as measured bandwidth. Virtualisation options are reproduced as listed.',
    measured:
      'Our core-profile experiments cover PR_9579: 28 Cube and 56 Vector cores, with 14 Cube and 28 Vector IDs observed in each of two die groups. This grouping must not be extrapolated to other SKUs; the table alone does not identify enabled core IDs or physical placement.',
    profiles: 'View measured PR_9579 core profiles',
    scroll: 'Scroll horizontally to view all configuration columns.',
  },
  zh: {
    title: 'Huawei 950PR SKU 配置',
    intro:
      '950PR 各型号的启用核心数、频率、内存和缓存容量有所不同。以下数值来自所提供的 SKU 配置表，并非实测的 TPC 或 GPC 分组。',
    columns: [
      'SKU',
      'Cube',
      'Vector',
      'AICPU',
      'Cube / Vector 频率（MHz）',
      '内存（GiB）',
      'L2（MiB）',
      'DDR Rate*',
      '虚拟化选项',
    ],
    tested: '已测核心访存特征',
    notes:
      '原表各行的 AI Core 数均与 Cube 数相同，Cube 和 Vector 频率也相同；DDR Rate 的 Base、Read、Write 三项数值一致，此处合并显示。*原表未注明 DDR Rate 的单位，请勿将这些数值视为实测带宽。虚拟化选项按原表保留。',
    measured:
      '我们的核心访存实验覆盖 PR_9579：共 28 个 Cube 核心、56 个 Vector 核心，在两个 die 分组中各观察到 14 个 Cube 和 28 个 Vector 核心 ID。不能将这一分组推广到其他 SKU；仅凭配置表无法确定启用的核心 ID 或物理位置。',
    profiles: '查看 PR_9579 实测核心访存特征',
    scroll: '横向滚动可查看全部配置列。',
  },
} as const;

export function HuaweiSkuConfigurations() {
  const locale = useLocale();
  const t = STRINGS[locale];
  return (
    <section className="space-y-4 border-t pt-8" data-testid="huawei-sku-configurations">
      <h3 className="text-xl font-semibold tracking-tight">{t.title}</h3>
      <p className="text-sm text-muted-foreground max-w-4xl">{t.intro}</p>
      <p className="text-xs text-muted-foreground lg:hidden">{t.scroll}</p>
      <div
        className="overflow-x-auto rounded-lg border"
        tabIndex={0}
        role="region"
        aria-label={t.title}
      >
        <table className="w-full text-sm" data-testid="huawei-sku-table">
          <thead className="bg-muted/50">
            <tr>
              {t.columns.map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="px-4 py-3 text-left font-semibold whitespace-nowrap"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {huaweiSkuConfigurations().map((row) => (
              <tr
                key={row.sku}
                data-sku={row.sku}
                className={
                  row.hasCoreProfileMeasurements
                    ? 'border-t bg-amber-50 dark:bg-amber-950/30'
                    : 'border-t'
                }
              >
                <th scope="row" className="px-4 py-3 text-left whitespace-nowrap font-medium">
                  {row.sku}
                  {row.hasCoreProfileMeasurements && (
                    <span className="block text-xs text-muted-foreground mt-1">{t.tested}</span>
                  )}
                </th>
                {[
                  row.cubeCores,
                  row.vectorCores,
                  row.aiCpuCores,
                  row.cubeClockMHz,
                  row.memoryGiB,
                  row.l2MiB,
                  row.ddrRate.base,
                  row.virtualisationOptions.join(', '),
                ].map((value, index) => (
                  <td key={index} className="px-4 py-3 tabular-nums whitespace-nowrap">
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{t.notes}</p>
      <div className="border-l-2 border-amber-600 dark:border-amber-400 pl-4 space-y-2">
        <p className="text-sm max-w-4xl">{t.measured}</p>
        <Link
          href={`${locale === 'zh' ? '/zh' : ''}/ubenchx/core-memory-profiles`}
          className="text-sm underline underline-offset-4"
          onClick={() => track('ubenchx_sku_profiles_opened', { gpu: 'PR_9579' })}
        >
          {t.profiles}
        </Link>
      </div>
    </section>
  );
}
