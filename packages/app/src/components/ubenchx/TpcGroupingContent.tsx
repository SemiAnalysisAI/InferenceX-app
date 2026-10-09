'use client';

import { useLocale } from '@/lib/use-locale';

import { TPC_GROUPING_RUNS } from './tpc-grouping-data';
import { transformTpcGroupingRun } from './tpc-grouping-transform';

const STRINGS = {
  en: {
    pageTitle: 'TPC per GPC Grouping',
    pageSubtitle:
      'Measured number of TPCs in each GPC, found by observing which SMs thread-block clusters are co-scheduled on.',
    product: 'Product',
    grouping: 'Measured TPC Groupings',
    methodology: 'Methodology',
    methodologyText:
      'gpc_query launches thread-block clusters of every size from 2 up to the hardware maximum and records the SM each block runs on. A cluster always runs within one GPC, so SMs that share a cluster are merged into the same GPC. Each list gives TPCs (two SMs each) per GPC, sorted descending; positions are not physical GPC indices.',
    driver: 'Driver',
    container: 'Container',
    source: 'Source',
    aria: 'ubenchX TPC per GPC grouping table',
  },
  zh: {
    pageTitle: 'TPC per GPC 分组',
    pageSubtitle: '通过观察线程块集群被协同调度到哪些 SM 上，实测每个 GPC 中的 TPC 数量。',
    product: '产品',
    grouping: '实测 TPC 分组',
    methodology: '测试方法',
    methodologyText:
      'gpc_query 以 2 到硬件上限的各种规模启动线程块集群，并记录每个线程块所在的 SM。一个集群总是在同一个 GPC 内运行，因此同一集群中的 SM 会被合并到同一个 GPC。每个列表给出各 GPC 的 TPC 数量（每个 TPC 含两个 SM），按降序排列；位置并不对应物理 GPC 编号。',
    driver: '驱动',
    container: '容器',
    source: '数据来源',
    aria: 'ubenchX TPC per GPC 分组表',
  },
} as const;

const RESULTS = Object.entries(TPC_GROUPING_RUNS).map(([key, run]) =>
  transformTpcGroupingRun(key, run),
);

export function TpcGroupingContent() {
  const t = STRINGS[useLocale()];
  const sourceUrls = [...new Set(RESULTS.map((r) => r.metadata.sourceUrl))];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t.pageTitle}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t.pageSubtitle}</p>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm" aria-label={t.aria} data-testid="tpc-grouping-table">
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-left font-semibold">
                {t.product}
              </th>
              <th scope="col" className="px-4 py-2.5 text-left font-semibold">
                {t.grouping}
              </th>
            </tr>
          </thead>
          <tbody>
            {RESULTS.map((r) => (
              <tr key={r.gpu} className="border-t">
                <td className="px-4 py-2.5 whitespace-nowrap">{r.gpu}</td>
                <td className="px-4 py-2.5 font-mono">[{r.tpcsPerGpc.join(', ')}]</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="text-xs text-muted-foreground space-y-1">
        <h3 className="text-sm font-semibold">{t.methodology}</h3>
        <p>{t.methodologyText}</p>
        {RESULTS.map((r) => (
          <p key={r.gpu}>
            <strong>{r.gpu}:</strong> {r.metadata.gpu} | {t.driver}: {r.metadata.driver} | CUDA:{' '}
            {r.metadata.cuda} | {t.container}: {r.metadata.container} | {r.gpcCount} GPCs,{' '}
            {r.tpcCount} TPCs, {r.smCount} SMs
          </p>
        ))}
        {sourceUrls.map((url) => (
          <p key={url}>
            {t.source}:{' '}
            <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
              {url}
            </a>
          </p>
        ))}
      </section>
    </div>
  );
}
