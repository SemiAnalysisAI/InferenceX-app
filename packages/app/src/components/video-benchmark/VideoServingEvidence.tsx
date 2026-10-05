'use client';

import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { useLocale } from '@/lib/use-locale';
import type { VideoServingEvidenceRow } from './serving-evidence';

const STRINGS = {
  en: {
    title: 'Serving evidence',
    scope:
      'Every loaded planned cell, including failed and zero-sample cells. Chart, quality and hardware filters do not remove these outcomes.',
    unknown: (count: number) =>
      `Cells with unknown workload identity: ${count}. They remain visible.`,
    empty: 'No serving sources in the loaded history.',
    source: 'Source / hardware',
    state: 'Execution / load',
    scheduled: 'Scheduled',
    attempted: 'Attempt intent',
    completed: 'Completed',
    failed: 'Failed attempts',
    timedOut: 'Timed out',
    notStarted: 'Not started',
    valid: 'Technical-valid',
    unjudged: 'Quality-unjudged',
    legacyFailedSlots: 'Legacy failed slots',
    unfinished: 'Unfinished',
    deliveryDeadlineSeconds: 'Deadline (s)',
    qualitySloGoodput: 'Quality/SLO goodput (videos/s)',
    meaning:
      'Attempt intent does not prove server receipt. Completed includes local media analysis. Timed out is a subset of failed attempts; legacy failed slots also include invalid and not-started work. Warmups are excluded.',
    missing:
      '— means unavailable. Quality/SLO goodput requires a per-request join of technical validity, calibrated quality and delivery deadlines; cell aggregates cannot supply it.',
    identity: 'Workload identity unknown',
    statuses: {
      complete: 'Complete',
      failed: 'Failed',
      running: 'Running',
      not_started: 'Not started',
      queued: 'Queued',
    },
    modes: { closed_loop: 'Closed loop', serial: 'Serial' },
    provenance: {
      'request-ledger': 'Request ledger',
      'cell-summary': 'Cell summary',
      'legacy-projection': 'Legacy projection',
      unavailable: 'Evidence unavailable',
    },
  },
  zh: {
    title: '服务结果记录',
    scope:
      '列出已加载的全部计划 cell，包括失败和零样本 cell。图表、质量和硬件筛选不会移除这些结果。',
    unknown: (count: number) => `${count} 个 cell 的工作负载标识未知，仍保留在表中。`,
    empty: '已加载的历史中没有服务结果来源。',
    source: '来源 / 硬件',
    state: '执行状态 / 负载',
    scheduled: '计划数',
    attempted: '已开始尝试',
    completed: '已完成',
    failed: '尝试失败',
    timedOut: '超时',
    notStarted: '未启动',
    valid: '技术有效',
    unjudged: '质量未评估',
    legacyFailedSlots: '原始失败槽位',
    unfinished: '尚未结束',
    deliveryDeadlineSeconds: '交付时限（s）',
    qualitySloGoodput: '质量 / SLO 有效吞吐量（视频/s）',
    meaning:
      '开始尝试不代表服务端已收到请求。“已完成”包含本地媒体分析。超时属于尝试失败的子集；原始失败槽位还包括无效媒体和未启动请求。计数不含 warmup。',
    missing:
      '— 表示数据不可用。质量 / SLO 有效吞吐量需要逐请求关联技术有效性、经校准的质量评估和交付时限；cell 汇总值不足以计算该指标。',
    identity: '工作负载标识未知',
    statuses: {
      complete: '已完成',
      failed: '失败',
      running: '运行中',
      not_started: '未启动',
      queued: '排队中',
    },
    modes: { closed_loop: '闭环负载', serial: '串行' },
    provenance: {
      'request-ledger': '请求记录',
      'cell-summary': 'cell 汇总',
      'legacy-projection': '历史投影',
      unavailable: '证据不可用',
    },
  },
};

const COLUMNS = [
  'scheduled',
  'attempted',
  'completed',
  'failed',
  'timedOut',
  'notStarted',
  'valid',
  'unjudged',
  'legacyFailedSlots',
  'unfinished',
  'deliveryDeadlineSeconds',
  'qualitySloGoodput',
] as const;

export default function VideoServingEvidence({ rows }: { rows: VideoServingEvidenceRow[] }) {
  const locale = useLocale();
  const s = STRINGS[locale];
  const unknown = rows.filter((row) => !row.workloadKey).length;
  return (
    <Card className="min-w-0 space-y-3 p-4 md:p-6" data-testid="video-serving-evidence">
      <Heading level="card">{s.title}</Heading>
      <p className="text-sm text-muted-foreground">{s.scope}</p>
      {unknown > 0 && <p className="text-sm text-muted-foreground">{s.unknown(unknown)}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{s.empty}</p>
      ) : (
        <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label={s.title}>
          <table className="w-full min-w-[72rem] text-left text-xs tabular-nums">
            <caption className="sr-only">{s.title}</caption>
            <thead>
              <tr className="border-b">
                <th scope="col" className="px-2 py-2">
                  {s.source}
                </th>
                <th scope="col" className="px-2 py-2">
                  {s.state}
                </th>
                {COLUMNS.map((column) => (
                  <th scope="col" className="px-2 py-2" key={column}>
                    {s[column]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const query = new URLSearchParams({
                  view: 'results',
                  run: row.runId,
                  artifact: String(row.artifactId),
                  source: row.sourceId,
                });
                if (row.cell) query.set('cell', row.cell);
                return (
                  <tr
                    key={row.id}
                    className="border-b last:border-b-0"
                    data-testid="video-serving-row"
                    data-source={row.sourceId}
                    data-cell={row.cell ?? ''}
                  >
                    <th scope="row" className="px-2 py-2 font-normal">
                      <span className="block whitespace-nowrap">{row.hardware || '—'}</span>
                      <a
                        className="underline underline-offset-2"
                        href={`${locale === 'zh' ? '/zh' : ''}/video?${query}`}
                      >
                        {row.sourceId} / {row.cell ?? '—'}
                      </a>
                      {!row.workloadKey && (
                        <span className="block text-muted-foreground">{s.identity}</span>
                      )}
                      {row.error && (
                        <span className="block max-w-64 break-words text-muted-foreground">
                          {row.error}
                        </span>
                      )}
                    </th>
                    <td className="px-2 py-2">
                      <span className="block whitespace-nowrap">
                        {s.statuses[row.status as keyof typeof s.statuses] ?? (row.status || '—')} ·
                        C{row.concurrency ?? '—'}
                      </span>
                      <span className="block whitespace-nowrap">
                        {s.modes[row.mode as keyof typeof s.modes] ?? row.mode ?? '—'}
                      </span>
                      <span className="block text-muted-foreground">
                        {s.provenance[row.provenance]}
                      </span>
                    </td>
                    {COLUMNS.map((column) => (
                      <td
                        key={column}
                        className="px-2 py-2"
                        data-testid={`video-serving-${column}`}
                      >
                        {row[column] ?? '—'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{s.meaning}</p>
      <p className="text-xs text-muted-foreground">{s.missing}</p>
    </Card>
  );
}
