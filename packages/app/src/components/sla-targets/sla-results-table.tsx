'use client';

import { Fragment, useState, type ReactNode } from 'react';

import {
  SLA_ACCOUNTING_POLICY_VERSION,
  SLA_EVALUATOR_VERSION,
  type SlaLoadKind,
} from '@semianalysisai/inferencex-constants';

import { TABLE_HEAD_CELL_STYLE, TABLE_HEAD_ROW_STYLE } from '@/components/ui/control-styles';
import { DisclosureToggle } from '@/components/ui/disclosure-toggle';
import { track } from '@/lib/analytics/analytics';
import { cn } from '@/lib/shared/utils';
import type { SlaTargetsSnapshot } from '@/lib/sla-targets/dataset';
import type { SlaConfigView, SlaPointView, SlaRowStatus } from '@/lib/sla-targets/view';

import { formatCount, formatPercent, formatRate, formatSeconds, formatUsd } from './sla-format';
import type { SlaStrings } from './sla-strings';

const STATUS_TONE: Record<SlaRowStatus, string> = {
  meets: 'text-success',
  misses: 'text-destructive',
  insufficient_data: 'text-muted-foreground',
  loading: 'text-muted-foreground',
};

const DASH = '—';

function loadOf(t: SlaStrings, kind: SlaLoadKind, view: SlaPointView): string {
  return t.load(kind, view.concurrency);
}

/** A value with the load point that supports it underneath. */
function Supported({ value, note }: { value: string; note?: string | null }) {
  return (
    <span className="flex flex-col">
      <span className="tabular-nums">{value}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </span>
  );
}

interface RowCells {
  status: ReactNode;
  load: ReactNode;
  attainment: ReactNode;
  goodput: ReactNode;
  cost: ReactNode;
  attempts: ReactNode;
}

function rowCells(t: SlaStrings, row: SlaConfigView): RowCells {
  const kind = row.config.loadKind;
  const { highestPassingLoad, highestGoodput, lowestCost } = row.selections;
  // Without a qualifying point the row shows its best observed attainment, labelled as such.
  const shown = highestPassingLoad ?? row.bestObserved;
  const observed = shown?.result?.observed ?? null;
  const goodput = highestGoodput?.result?.observed?.goodputRps ?? null;
  const cost = lowestCost?.result?.costPer1kCompliantUsd ?? null;
  const reason =
    row.status === 'insufficient_data'
      ? (row.points
          .map((point) => point.result?.qualification)
          .find((qualification) => qualification?.exploratory)?.reason ??
        shown?.result?.qualification.reason ??
        row.points[0]?.result?.qualification.reason)
      : undefined;
  return {
    status: (
      <span className="flex flex-col">
        <span
          className={cn('font-medium whitespace-nowrap', STATUS_TONE[row.status])}
          data-testid="sla-row-status"
        >
          {t.statusLabel[row.status]}
        </span>
        {row.exploratory && (
          <span className="text-xs text-muted-foreground" data-testid="sla-row-exploratory">
            {t.exploratory}
          </span>
        )}
        {reason && <span className="text-xs text-muted-foreground">{t.reason[reason]}</span>}
      </span>
    ),
    load: highestPassingLoad ? (
      <Supported
        value={loadOf(t, kind, highestPassingLoad)}
        note={row.lowerLoadMissed ? t.lowerLoadMissed : null}
      />
    ) : (
      DASH
    ),
    attainment:
      observed?.attainment === null || observed === null ? (
        DASH
      ) : (
        <Supported
          value={formatPercent(observed.attainment)}
          note={highestPassingLoad ? null : t.bestObservedAt(loadOf(t, kind, shown!))}
        />
      ),
    goodput:
      highestGoodput === null || goodput === null ? (
        DASH
      ) : (
        <Supported
          value={`${formatRate(goodput)} ${t.reqPerSecond}`}
          note={t.at(loadOf(t, kind, highestGoodput))}
        />
      ),
    cost:
      lowestCost === null || cost === null ? (
        DASH
      ) : (
        <Supported value={formatUsd(cost)} note={t.at(loadOf(t, kind, lowestCost))} />
      ),
    attempts: observed ? (
      <span className="tabular-nums">{formatCount(observed.attempted)}</span>
    ) : (
      DASH
    ),
  };
}

function pointKey(view: SlaPointView): string {
  return `${view.point?.id ?? 'excluded'}-${view.concurrency}-${view.excluded?.runAttempt ?? ''}`;
}

function part(count: number | null, label: string): string | null {
  return count !== null && count > 0 ? `${formatCount(count)} ${label}` : null;
}

function accountingLines(t: SlaStrings, view: SlaPointView): string[] {
  const evaluation = view.evaluation;
  if (!evaluation) return [];
  const { accounting, counts } = evaluation;
  const failed = Object.entries(accounting.failureClasses)
    .map(([failureClass, count]) => `${formatCount(count)} ${failureClass}`)
    .join(', ');
  const overflow = part(accounting.contextOverflowRejected, t.breakdown.overflow);
  return [
    accounting.reason === 'dispatch_count_unavailable' && accounting.issuedLowerBound !== null
      ? `${t.accounting[accounting.reason]} (≥ ${formatCount(accounting.issuedLowerBound)})`
      : t.accounting[accounting.reason],
    // What the client or its log said about a measurement that did not complete.
    accounting.reason === 'measurement_incomplete' ? (evaluation.source.abortReason ?? '') : '',
    [
      part(accounting.completed, t.breakdown.completed),
      accounting.failed > 0
        ? `${formatCount(accounting.failed)} ${t.breakdown.failed} (${failed})`
        : null,
      part(accounting.cancelled, t.breakdown.cancelled),
      part(accounting.incomplete, t.breakdown.incomplete),
      // Counted apart only when the policy does not take them as completed.
      accounting.policy.completionEvidence === 'required'
        ? part(accounting.unconfirmedCompletions, t.breakdown.unconfirmed)
        : null,
      part(accounting.unknown, t.breakdown.unknown),
      part(counts.missingTelemetry, t.breakdown.missingTelemetry),
    ]
      .filter((entry) => entry !== null)
      .join(' · '),
    [
      part(accounting.skippedBeforeDispatch, t.breakdown.skipped),
      overflow && accounting.contextOverflowOverLimit
        ? `${overflow} (${t.breakdown.overflowOverLimit})`
        : overflow,
      part(accounting.warmupExcluded, t.breakdown.warmup),
    ]
      .filter((entry) => entry !== null)
      .join(' · '),
  ].filter((line) => line.length > 0);
}

/** The headline values of the configuration that this load point supports. */
function supportedValues(t: SlaStrings, row: SlaConfigView, view: SlaPointView): string[] {
  return (Object.keys(row.selections) as (keyof typeof row.selections)[])
    .filter((key) => row.selections[key] === view)
    .map((key) => t.supports[key]);
}

function PointRow({ t, row, view }: { t: SlaStrings; row: SlaConfigView; view: SlaPointView }) {
  const kind = row.config.loadKind;
  const cell = 'px-3 py-2 align-top';
  if (view.excluded) {
    const { excluded } = view;
    const failures = excluded.observedFailures
      ? Object.entries(excluded.observedFailures)
          .map(([failureClass, count]) => `${formatCount(count)} ${failureClass}`)
          .join(', ')
      : null;
    return (
      <tr className="border-b border-border/40 last:border-0" data-testid="sla-excluded-point">
        <td className={cn(cell, 'whitespace-nowrap tabular-nums')}>{loadOf(t, kind, view)}</td>
        <td className={cell} colSpan={7}>
          <span className="font-medium">{t.exclusion[excluded.category]}</span>
          {excluded.runAttempt !== null && (
            <span className="text-muted-foreground"> · {t.attempt(excluded.runAttempt)}</span>
          )}
          <span className="block text-xs text-muted-foreground">{excluded.reason}</span>
          {failures && (
            <span className="block text-xs text-muted-foreground">
              {t.labelled(t.observedFailures, failures)}
            </span>
          )}
          {excluded.jobUrl && (
            <a
              href={excluded.jobUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-brand-fill hover:underline"
            >
              {t.jobLink}
            </a>
          )}
        </td>
      </tr>
    );
  }

  const result = view.result;
  const observed = result?.observed ?? null;
  const attainment = observed?.attainment ?? null;
  const goodput = observed?.goodputRps ?? null;
  const achieved = observed?.completedRps ?? null;
  const cost = result?.costPer1kCompliantUsd ?? null;
  const qualification = result?.qualification;
  const status: SlaRowStatus = qualification?.status ?? 'loading';
  const supports = supportedValues(t, row, view);
  const bounds = observed
    ? [
        observed.attainmentExcludingIncomplete !== null &&
        observed.attainmentExcludingIncomplete !== observed.attainment
          ? t.excludingCutoff(formatPercent(observed.attainmentExcludingIncomplete))
          : null,
        observed.attainmentUpper !== null && observed.indeterminate > 0
          ? t.upperBound(formatPercent(observed.attainmentUpper))
          : null,
      ].filter((entry) => entry !== null)
    : [];
  return (
    <tr className="border-b border-border/40 last:border-0" data-testid="sla-point-row">
      <td className={cn(cell, 'whitespace-nowrap')}>
        <span className="tabular-nums">{loadOf(t, kind, view)}</span>
        {supports.length > 0 && (
          <span className="block text-xs text-muted-foreground">
            {supports.join(t.listSeparator)}
          </span>
        )}
      </td>
      <td className={cell}>
        <span className={cn('font-medium whitespace-nowrap', STATUS_TONE[status])}>
          {t.statusLabel[status]}
        </span>
        {qualification && qualification.reason in t.reason && t.reason[qualification.reason] && (
          <span className="block text-xs text-muted-foreground">
            {qualification.exploratory
              ? t.exploratoryReason(t.reason[qualification.reason])
              : t.reason[qualification.reason]}
            {qualification.reason === 'below_minimum_sample'
              ? ` (< ${formatCount(qualification.minimumSample)})`
              : ''}
          </span>
        )}
        {qualification?.smallSample && (
          <span className="block text-xs text-muted-foreground">{t.smallSample}</span>
        )}
      </td>
      <td className={cn(cell, 'text-right tabular-nums')}>
        {observed ? formatCount(observed.attempted) : DASH}
      </td>
      <td className={cn(cell, 'text-right tabular-nums')}>
        {observed ? formatCount(observed.passing) : DASH}
      </td>
      <td className={cn(cell, 'text-right')}>
        {attainment === null ? (
          DASH
        ) : (
          <>
            <span className="tabular-nums">{formatPercent(attainment)}</span>
            {bounds.map((bound) => (
              <span key={bound} className="block text-xs text-muted-foreground">
                {bound}
              </span>
            ))}
          </>
        )}
      </td>
      <td className={cn(cell, 'text-right tabular-nums')}>
        {goodput === null ? DASH : formatRate(goodput)}
        {achieved !== null && (
          <span className="block text-xs text-muted-foreground">
            {t.labelled(t.colPointAchieved, formatRate(achieved))}
          </span>
        )}
      </td>
      <td className={cn(cell, 'text-right tabular-nums')}>
        {cost === null ? DASH : formatUsd(cost)}
      </td>
      <td className={cn(cell, 'min-w-80 text-xs text-muted-foreground')}>
        {accountingLines(t, view).map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
        {!view.evaluation && qualification && t.reason[qualification.reason]}
        {view.result?.unavailable?.detail && (
          <span className="block break-words" data-testid="sla-unavailable-detail">
            {view.result.unavailable.detail}
          </span>
        )}
      </td>
    </tr>
  );
}

/** One tested load as a stacked block, for phone widths where the table does not fit. */
function PointBlock({ t, row, view }: { t: SlaStrings; row: SlaConfigView; view: SlaPointView }) {
  const kind = row.config.loadKind;
  if (view.excluded) {
    const { excluded } = view;
    return (
      <li className="py-2" data-testid="sla-excluded-point">
        <div className="flex items-baseline justify-between gap-3">
          <span className="tabular-nums">{loadOf(t, kind, view)}</span>
          <span className="text-right font-medium">{t.exclusion[excluded.category]}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {excluded.runAttempt === null ? '' : `${t.attempt(excluded.runAttempt)} · `}
          {excluded.reason}
        </p>
      </li>
    );
  }
  const observed = view.result?.observed ?? null;
  const qualification = view.result?.qualification;
  const status: SlaRowStatus = qualification?.status ?? 'loading';
  const attainment = observed?.attainment ?? null;
  const goodput = observed?.goodputRps ?? null;
  const cost = view.result?.costPer1kCompliantUsd ?? null;
  const reason = qualification ? t.reason[qualification.reason] : '';
  const supports = supportedValues(t, row, view);
  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="tabular-nums">{loadOf(t, kind, view)}</span>
        <span className={cn('font-medium', STATUS_TONE[status])}>{t.statusLabel[status]}</span>
      </div>
      {supports.length > 0 && (
        <p className="text-xs text-muted-foreground">{supports.join(t.listSeparator)}</p>
      )}
      {observed && attainment !== null && (
        <p className="mt-1 text-sm tabular-nums">
          {formatPercent(attainment)}
          <span className="text-muted-foreground">
            {' · '}
            {formatCount(observed.passing)} / {formatCount(observed.attempted)}
            {goodput === null ? '' : ` · ${formatRate(goodput)} ${t.reqPerSecond}`}
            {cost === null ? '' : ` · ${formatUsd(cost)}`}
          </span>
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        {[
          reason ? (qualification?.exploratory ? t.exploratoryReason(reason) : reason) : null,
          view.result?.unavailable?.detail ?? null,
          ...accountingLines(t, view),
        ]
          .filter((line) => line !== null)
          .map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
      </p>
    </li>
  );
}

function Provenance({
  t,
  row,
  snapshot,
}: {
  t: SlaStrings;
  row: SlaConfigView;
  snapshot: SlaTargetsSnapshot;
}) {
  const { config } = row;
  const window = row.points.find((view) => view.evaluation)?.evaluation?.accounting.window;
  const attempts = [...new Set(row.points.flatMap((view) => view.point?.runAttempt ?? []))];
  const artifacts = row.points.flatMap((view) => view.point?.artifact ?? []);
  const entries: [string, ReactNode][] = [
    [
      t.provRun,
      config.runUrl ? (
        <a
          href={config.runUrl}
          target="_blank"
          rel="noreferrer"
          className="text-brand-fill hover:underline"
        >
          {config.runId}
          {attempts.length > 0
            ? ` (${attempts.map((attempt) => t.attempt(attempt)).join(', ')})`
            : ''}
        </a>
      ) : (
        DASH
      ),
    ],
    [t.provDate, config.date],
    [t.provCommit, config.benchmarkCommit ? config.benchmarkCommit.slice(0, 12) : DASH],
    [t.provDataset, config.datasetSlug ?? DASH],
    [t.provHarness, config.harnessVersion ? `agentx-harness ${config.harnessVersion}` : DASH],
    [t.provImage, config.image ?? DASH],
    [
      t.provWindow,
      window ? (
        <>
          {t.window(formatSeconds(window.durationS), t.durationSource[window.durationSource])}
          <span className="block text-xs text-muted-foreground">
            {t.windowOthers(
              window.phaseElapsedS === null ? null : formatSeconds(window.phaseElapsedS),
              window.clientDurationS === null ? null : formatSeconds(window.clientDurationS),
            )}
          </span>
        </>
      ) : (
        DASH
      ),
    ],
    [t.provPolicy, t.policy(SLA_EVALUATOR_VERSION, SLA_ACCOUNTING_POLICY_VERSION)],
  ];
  return (
    <div data-testid="sla-provenance">
      <h4 className="text-xs font-medium text-muted-foreground">{t.provenanceHeading}</h4>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {entries.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
        {artifacts.length > 0 && (
          <div className="col-span-full min-w-0">
            <dt className="text-xs text-muted-foreground">{t.provArtifacts}</dt>
            <dd className="font-mono text-xs break-all text-muted-foreground">
              {artifacts.map((artifact) => (
                <span key={artifact} className="block">
                  {artifact}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>
      {snapshot.kind === 'live' && (
        <p className="mt-2 text-xs text-muted-foreground">{t.noFailedPointsLive}</p>
      )}
    </div>
  );
}

function Details({
  t,
  row,
  snapshot,
}: {
  t: SlaStrings;
  row: SlaConfigView;
  snapshot: SlaTargetsSnapshot;
}) {
  const head = `${TABLE_HEAD_CELL_STYLE} px-3 py-2`;
  return (
    <div className="flex flex-col gap-4 py-3" data-testid="sla-row-details">
      <div>
        <h4 className="text-xs font-medium text-muted-foreground">{t.pointsHeading}</h4>
        <ul className="mt-1 divide-y divide-border/40 text-sm md:hidden">
          {row.points.map((view) => (
            <PointBlock key={pointKey(view)} t={t} row={row} view={view} />
          ))}
        </ul>
        <div className="mt-2 hidden overflow-x-auto md:block">
          <table className="w-full min-w-240 text-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW_STYLE}>
                <th className={cn(head, 'text-left')}>{t.colPointLoad}</th>
                <th className={cn(head, 'text-left')}>{t.colStatus}</th>
                <th className={cn(head, 'text-right')}>{t.colPointAttempts}</th>
                <th className={cn(head, 'text-right')}>{t.colPointPassing}</th>
                <th className={cn(head, 'text-right')}>{t.colAttainment}</th>
                <th className={cn(head, 'text-right')}>
                  {t.colGoodput} ({t.reqPerSecond})
                </th>
                <th className={cn(head, 'text-right')}>{t.colPointCost}</th>
                <th className={cn(head, 'text-left')}>{t.colPointAccounting}</th>
              </tr>
            </thead>
            <tbody>
              {row.points.map((view) => (
                <PointRow key={pointKey(view)} t={t} row={row} view={view} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Provenance t={t} row={row} snapshot={snapshot} />
    </div>
  );
}

export function SlaResultsTable({
  t,
  rows,
  colors,
  snapshot,
}: {
  t: SlaStrings;
  rows: SlaConfigView[];
  colors: Record<string, string>;
  snapshot: SlaTargetsSnapshot;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) => {
    const next = new Set(open);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpen(next);
    track('sla_targets_row_toggled', { enabled: next.has(key) });
  };
  const head = `${TABLE_HEAD_CELL_STYLE} px-3 py-2`;
  const config = (row: SlaConfigView) => (
    <span className="flex min-w-0 items-start gap-2" data-testid="sla-config-name">
      <span
        aria-hidden="true"
        className="mt-1.5 size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: colors[row.config.key] }}
      />
      <span className="flex min-w-0 flex-col">
        <span className="font-medium">{row.hardwareLabel}</span>
        <span className="text-xs text-muted-foreground">{row.servingLabel}</span>
      </span>
    </span>
  );

  return (
    <>
      {/* Desktop: one table. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm" data-testid="sla-results-table">
          <thead>
            <tr className={TABLE_HEAD_ROW_STYLE}>
              <th className={cn(head, 'text-left')}>{t.colConfig}</th>
              <th className={cn(head, 'text-left')}>{t.colStatus}</th>
              <th className={cn(head, 'text-left')}>{t.colLoad}</th>
              <th className={cn(head, 'text-left')}>{t.colAttainment}</th>
              <th className={cn(head, 'text-left')}>{t.colGoodput}</th>
              <th className={cn(head, 'text-left whitespace-normal')}>{t.colCost}</th>
              <th className={cn(head, 'text-left')}>{t.colAttempts}</th>
              <th className={cn(head, 'text-right')}>
                <span className="sr-only">{t.details}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const cells = rowCells(t, row);
              const expanded = open.has(row.config.key);
              return (
                <Fragment key={row.config.key}>
                  <tr
                    className={cn('align-top', !expanded && 'border-b border-border/40')}
                    data-testid="sla-config-row"
                    data-status={row.status}
                  >
                    <td className="px-3 py-3">{config(row)}</td>
                    <td className="px-3 py-3">{cells.status}</td>
                    <td className="px-3 py-3">{cells.load}</td>
                    <td className="px-3 py-3">{cells.attainment}</td>
                    <td className="px-3 py-3">{cells.goodput}</td>
                    <td className="px-3 py-3">{cells.cost}</td>
                    <td className="px-3 py-3">{cells.attempts}</td>
                    <td className="px-3 py-3 text-right">
                      <DisclosureToggle
                        open={expanded}
                        onClick={() => toggle(row.config.key)}
                        data-testid="sla-row-toggle"
                        className="text-xs"
                      >
                        {t.details}
                      </DisclosureToggle>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="border-b border-border/40">
                      <td colSpan={8} className="px-3">
                        <Details t={t} row={row} snapshot={snapshot} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phone: one block per configuration with the same values. */}
      <ul
        className="flex flex-col divide-y divide-border/40 md:hidden"
        data-testid="sla-results-list"
      >
        {rows.map((row) => {
          const cells = rowCells(t, row);
          const expanded = open.has(row.config.key);
          return (
            <li key={row.config.key} className="py-3" data-status={row.status}>
              {/* Stacked, not side by side: the status carries a reason sentence on rows
                  without a verdict, and beside the name it squeezes both into slivers. */}
              {config(row)}
              <div className="mt-1.5 pl-4.5 text-sm">{cells.status}</div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {(
                  [
                    [t.colLoad, cells.load],
                    [t.colAttainment, cells.attainment],
                    [t.colGoodput, cells.goodput],
                    [t.colCost, cells.cost],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <DisclosureToggle
                open={expanded}
                onClick={() => toggle(row.config.key)}
                className="mt-3 text-xs"
              >
                {t.details}
              </DisclosureToggle>
              {expanded && <Details t={t} row={row} snapshot={snapshot} />}
            </li>
          );
        })}
      </ul>
    </>
  );
}
