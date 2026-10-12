'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocale } from '@/lib/i18n/use-locale';

export interface ToolOsProviderBreakdown {
  client: string;
  totalCalls: number;
  matchedResults: number;
  supportsExplicitErrors: boolean;
}

export interface ToolOsErrorRate {
  os: string;
  allCalls: number;
  allMatchedResults: number;
  comparableCalls: number;
  matchedResults: number;
  successes: number;
  errors: number;
  unknown: number;
  errorRate: number | null;
  providers: ToolOsProviderBreakdown[];
}

const OS_ORDER = ['MacOS', 'Windows', 'Linux', 'Unknown'];
const CLIENT_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  codex: 'Codex',
  openai: 'OpenAI',
};

const STRINGS = {
  en: {
    title: 'Explicit Tool-Result Error Rate by OS',
    comparableResults: (n: string) => `(${n} comparable results)`,
    description:
      'Error rate uses matched Anthropic results because that protocol carries an explicit error signal. OpenAI and Codex remain in all-call volume and traffic mix, but are not silently counted as successes. OS describes the request sender, not necessarily the tool execution host. Coverage is matched/comparable calls; Signal Share is comparable/all matched results.',
    caption:
      'Explicit Anthropic tool-result error counts and percentages grouped by request sender operating system, with all-provider traffic composition.',
    emptyState: 'No OS result data',
    colOs: 'OS',
    colAllCalls: 'All Calls',
    colComparable: 'Comparable',
    colMatched: 'Matched',
    colCoverage: 'Coverage',
    colSignalShare: 'Signal Share',
    colErrors: 'Errors',
    colErrorRate: 'Error Rate',
    colTrafficMix: 'Traffic Mix',
    signalShareTitle: 'Share of all matched provider results included in the explicit error rate',
  },
  zh: {
    title: '按操作系统分组的工具结果错误率',
    comparableResults: (n: string) => `(${n} 个可比较结果)`,
    description:
      '错误率使用 Anthropic 匹配结果计算，因为该协议携带显式错误信号。OpenAI 和 Codex 仅参与总调用量和流量占比统计，不被默认计为成功。OS 指请求发送端，不一定是工具执行主机。Coverage 为 matched/comparable 调用比；Signal Share 为 comparable/全部 matched 结果比。',
    caption:
      '按请求发送端操作系统分组的 Anthropic 工具结果错误数及百分比，附全 provider 流量构成。',
    emptyState: '暂无按操作系统分组的结果数据',
    colOs: 'OS',
    colAllCalls: '总调用',
    colComparable: '可比较',
    colMatched: '已匹配',
    colCoverage: '覆盖率',
    colSignalShare: '信号占比',
    colErrors: '错误数',
    colErrorRate: '错误率',
    colTrafficMix: '流量构成',
    signalShareTitle: '纳入显式错误率计算的匹配 provider 结果占比',
  },
};

function compareOs(left: ToolOsErrorRate, right: ToolOsErrorRate): number {
  const leftIndex = OS_ORDER.indexOf(left.os);
  const rightIndex = OS_ORDER.indexOf(right.os);
  const leftRank = leftIndex === -1 ? OS_ORDER.length : leftIndex;
  const rightRank = rightIndex === -1 ? OS_ORDER.length : rightIndex;
  return leftRank - rightRank || left.os.localeCompare(right.os);
}

function formatPct(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function ProviderMix({ row }: { row: ToolOsErrorRate }) {
  return (
    <div className="flex flex-wrap justify-end gap-x-2 gap-y-0.5 text-3xs">
      {row.providers.map((provider) => (
        <span
          key={provider.client}
          className={provider.supportsExplicitErrors ? 'text-foreground' : 'text-subtle'}
          title={`${provider.totalCalls.toLocaleString()} calls · ${provider.matchedResults.toLocaleString()} matched${provider.supportsExplicitErrors ? ' · explicit errors supported' : ' · no explicit error signal'}`}
        >
          {CLIENT_LABELS[provider.client] ?? provider.client}{' '}
          {formatPct(ratio(provider.totalCalls, row.allCalls))}
        </span>
      ))}
    </div>
  );
}

export function ToolOsErrorRates({ rows }: { rows: ToolOsErrorRate[] }) {
  const t = STRINGS[useLocale()];
  const sortedRows = rows.toSorted(compareOs);
  const matchedResults = rows.reduce((total, row) => total + Number(row.matchedResults), 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>
          {t.title}{' '}
          <span className="font-normal text-muted-foreground">
            {t.comparableResults(matchedResults.toLocaleString())}
          </span>
        </CardTitle>
        <p className="mt-0.5 text-3xs font-mono text-subtle">{t.description}</p>
      </CardHeader>
      <CardContent>
        {sortedRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t.emptyState}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-2xs font-mono">
              <caption className="sr-only">{t.caption}</caption>
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th scope="col" className="py-1.5 text-left font-medium">
                    {t.colOs}
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    {t.colAllCalls}
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    {t.colComparable}
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    {t.colMatched}
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    {t.colCoverage}
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    {t.colSignalShare}
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    {t.colErrors}
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    {t.colErrorRate}
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    {t.colTrafficMix}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedRows.map((row) => (
                  <tr key={row.os} className="transition-colors hover:bg-surface-hover/70">
                    <th scope="row" className="py-1.5 text-left font-medium">
                      {row.os}
                    </th>
                    <td className="py-1.5 text-right tabular-nums">
                      {Number(row.allCalls).toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {Number(row.comparableCalls).toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {Number(row.matchedResults).toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                      {formatPct(ratio(row.matchedResults, row.comparableCalls))}
                    </td>
                    <td
                      className="py-1.5 text-right tabular-nums text-muted-foreground"
                      title={t.signalShareTitle}
                    >
                      {formatPct(ratio(row.matchedResults, row.allMatchedResults))}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-rose-500">
                      {Number(row.errors).toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right font-medium tabular-nums">
                      {formatPct(row.errorRate)}
                    </td>
                    <td className="py-1.5 text-right">
                      <ProviderMix row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
