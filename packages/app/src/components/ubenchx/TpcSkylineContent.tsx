'use client';

import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { TABLE_HEAD_CELL_STYLE, TABLE_HEAD_ROW_STYLE } from '@/components/ui/control-styles';
import { ResultContext, sourceLinkClassName } from '@/components/ui/result-context';
import { useLocale } from '@/lib/i18n/use-locale';

import { HuaweiSkuConfigurations } from './HuaweiSkuConfigurations';
import { UbenchxHub } from './UbenchxHub';
import { TPC_SKYLINE_RUNS } from './tpc-skyline-data';
import { transformTpcSkylineRun } from './tpc-skyline-transform';

const STRINGS = {
  en: {
    nvidia: 'NVIDIA measured TPC groupings',
    product: 'Product',
    gpcs: 'Measured # of GPCs',
    sms: 'Measured # of SMs',
    grouping: 'Measured TPC groupings',
    methodology: 'Methodology',
    methodologyText:
      'gpc_query launches thread-block clusters of every size from 2 up to the hardware maximum and records the SM each block runs on. A cluster always runs within one GPC, so SMs that share a cluster are merged into the same GPC. Each list gives TPCs (two SMs each) per GPC, sorted descending; positions are not physical GPC indices.',
    device: 'Device',
    hardware: 'Hardware',
    driver: 'Driver',
    container: 'Container',
    source: 'Source: ',
    aria: 'uBenchX TPC Skyline table',
  },
  zh: {
    nvidia: 'NVIDIA 实测 TPC 分组',
    product: '产品',
    gpcs: '实测 GPC 数量',
    sms: '实测 SM 数量',
    grouping: '实测 TPC 分组',
    methodology: '测试方法',
    methodologyText:
      'gpc_query 以 2 到硬件上限的各种规模启动线程块集群，并记录每个线程块所在的 SM。一个集群总是在同一个 GPC 内运行，因此同一集群中的 SM 会被合并到同一个 GPC。每个列表给出各 GPC 的 TPC 数量（每个 TPC 含两个 SM），按降序排列；位置并不对应物理 GPC 编号。',
    device: '设备',
    hardware: '硬件',
    driver: '驱动',
    container: '容器',
    source: '数据来源：',
    aria: 'uBenchX TPC Skyline 表',
  },
} as const;

const RESULTS = Object.entries(TPC_SKYLINE_RUNS).map(([key, run]) =>
  transformTpcSkylineRun(key, run),
);

export function TpcSkylineContent() {
  const locale = useLocale();
  const t = STRINGS[locale];
  const sourceUrls = [...new Set(RESULTS.map((r) => r.metadata.sourceUrl))];

  return (
    <div className="flex flex-col gap-4">
      <UbenchxHub current="tpc-skyline" />

      <section className="space-y-4">
        <figure className="relative min-w-0">
          <Card>
            <figcaption>
              <Heading as="h2" level="card">
                {t.nvidia}
              </Heading>
            </figcaption>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm" aria-label={t.aria} data-testid="tpc-skyline-table">
                <thead>
                  <tr className={TABLE_HEAD_ROW_STYLE}>
                    <th scope="col" className={`${TABLE_HEAD_CELL_STYLE} px-4 py-2.5 text-left`}>
                      {t.product}
                    </th>
                    <th scope="col" className={`${TABLE_HEAD_CELL_STYLE} px-4 py-2.5 text-right`}>
                      {t.gpcs}
                    </th>
                    <th scope="col" className={`${TABLE_HEAD_CELL_STYLE} px-4 py-2.5 text-right`}>
                      {t.sms}
                    </th>
                    <th scope="col" className={`${TABLE_HEAD_CELL_STYLE} px-4 py-2.5 text-left`}>
                      {t.grouping}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {RESULTS.map((r) => (
                    <tr key={r.gpu} className="border-t border-border/30">
                      <td className="px-4 py-2.5 whitespace-nowrap">{r.gpu}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.gpcCount}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.smCount}</td>
                      <td className="px-4 py-2.5 font-mono whitespace-nowrap">
                        [{r.tpcsPerGpc.join(', ')}]
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3">
              <ResultContext locale={locale} layout="footer" source="SemiAnalysis InferenceX™" />
              <div className="mt-3 max-w-[80ch] space-y-1.5 text-xs leading-5 text-muted-foreground">
                <h3 className="font-medium text-foreground">{t.methodology}</h3>
                <p>{t.methodologyText}</p>
              </div>
              <div className="mt-3 overflow-x-auto" data-testid="tpc-skyline-device-specs">
                <table className="w-full text-left text-xs text-muted-foreground tabular-nums">
                  <thead>
                    <tr className={TABLE_HEAD_ROW_STYLE}>
                      {[t.device, t.hardware, t.driver, 'CUDA', t.container, 'TPCs'].map(
                        (header, index, headers) => (
                          <th
                            key={header}
                            scope="col"
                            className={`${TABLE_HEAD_CELL_STYLE} py-1.5 ${index === headers.length - 1 ? 'text-right' : 'pr-4'}`}
                          >
                            {header}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {RESULTS.map((r) => (
                      <tr key={r.gpu} className="border-b border-border/30 last:border-b-0">
                        <th
                          scope="row"
                          className="py-1.5 pr-4 font-medium whitespace-nowrap text-foreground"
                        >
                          {r.gpu}
                        </th>
                        <td className="py-1.5 pr-4 whitespace-nowrap">{r.metadata.gpu}</td>
                        <td className="py-1.5 pr-4 whitespace-nowrap">{r.metadata.driver}</td>
                        <td className="py-1.5 pr-4 whitespace-nowrap">{r.metadata.cuda}</td>
                        <td className="min-w-64 py-1.5 pr-4 break-all">{r.metadata.container}</td>
                        <td className="py-1.5 text-right whitespace-nowrap">{r.tpcCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {t.source}
                {sourceUrls.map((url, index) => (
                  <span key={url}>
                    {index > 0 && ' · '}
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={sourceLinkClassName}
                    >
                      {url.includes('/pull/')
                        ? `PR #${url.slice(url.lastIndexOf('/') + 1)}`
                        : url.slice(url.lastIndexOf('/') + 1)}
                    </a>
                  </span>
                ))}
              </p>
            </div>
          </Card>
        </figure>
      </section>
      <HuaweiSkuConfigurations />
    </div>
  );
}
