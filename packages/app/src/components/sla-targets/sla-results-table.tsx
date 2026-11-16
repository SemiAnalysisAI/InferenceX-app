'use client';

import { Fragment, useId, useState, type ReactNode } from 'react';

import {
  SLA_ACCOUNTING_POLICY_VERSION,
  SLA_EVALUATOR_VERSION,
  minimumSampleSize,
  type SlaLoadKind,
} from '@semianalysisai/inferencex-constants';

import { TABLE_HEAD_CELL_STYLE, TABLE_HEAD_ROW_STYLE } from '@/components/ui/control-styles';
import { DisclosureToggle } from '@/components/ui/disclosure-toggle';
import { track } from '@/lib/analytics/analytics';
import { cn } from '@/lib/shared/utils';
import type { SlaTargetsSnapshot } from '@/lib/sla-targets/dataset';
import { attainmentPercent } from '@/lib/sla-targets/state';
import { slaRowAnswer, slaRowReason, type SlaRowAnswer } from '@/lib/sla-targets/summary';
import type { SlaConfigView, SlaPointView, SlaRowStatus } from '@/lib/sla-targets/view';

import { formatCount, formatPercent, formatRate, formatSeconds, formatUsd } from './sla-format';
import type { SlaStrings } from './sla-strings';

const STATUS_TONE: Record<SlaRowStatus, string> = {
  meets: 'text-success',
  misses: 'text-destructive',
  insufficient_data: 'text-foreground',
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
        <td className={cn(cell, 'pl-0 whitespace-nowrap tabular-nums')}>{loadOf(t, kind, view)}</td>
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
      <td className={cn(cell, 'pl-0 whitespace-nowrap')}>
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
          <span className="block text-xs whitespace-nowrap text-muted-foreground">
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
  costLabel,
}: {
  t: SlaStrings;
  row: SlaConfigView;
  snapshot: SlaTargetsSnapshot;
  costLabel: string;
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
    [
      t.costBasis,
      row.gpuHourUsd > 0 ? (
        <>
          {t.gpuPrice(formatUsd(row.gpuHourUsd), config.gpuCount)}
          <span className="block text-xs text-muted-foreground">{costLabel}</span>
        </>
      ) : (
        t.costNoPrice
      ),
    ],
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

/** The three headline values of a setup, each with the load point behind it. */
function Selections({ t, row }: { t: SlaStrings; row: SlaConfigView }) {
  const kind = row.config.loadKind;
  const { highestPassingLoad, highestGoodput, lowestCost } = row.selections;
  const goodput = highestGoodput?.result?.observed?.goodputRps ?? null;
  const cost = lowestCost?.result?.costPer1kCompliantUsd ?? null;
  const best = row.bestObserved;
  const bestAttainment = best?.result?.observed?.attainment ?? null;
  const reason = slaRowReason(row);
  return (
    <div data-testid="sla-selections">
      <h4 className="text-xs font-medium text-muted-foreground">{t.selectionsHeading}</h4>
      {highestPassingLoad ? (
        <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div data-testid="sla-selection-load">
            <dt className="text-xs text-muted-foreground">{t.selHighestLoad}</dt>
            <dd>
              <Supported
                value={loadOf(t, kind, highestPassingLoad)}
                note={row.lowerLoadMissed ? t.lowerLoadMissed : null}
              />
            </dd>
          </div>
          <div data-testid="sla-selection-goodput">
            <dt className="text-xs text-muted-foreground">{t.selHighestGoodput}</dt>
            <dd>
              {highestGoodput === null || goodput === null ? (
                DASH
              ) : (
                <Supported
                  value={`${formatRate(goodput)} ${t.reqPerSecond}`}
                  note={t.at(loadOf(t, kind, highestGoodput))}
                />
              )}
            </dd>
          </div>
          <div data-testid="sla-selection-cost">
            <dt className="text-xs text-muted-foreground">{t.selLowestCost}</dt>
            <dd>
              {lowestCost === null || cost === null ? (
                <span className="text-muted-foreground">{t.costNoPrice}</span>
              ) : (
                <Supported value={formatUsd(cost)} note={t.at(loadOf(t, kind, lowestCost))} />
              )}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-sm">
          {t.selNone}
          {row.status === 'insufficient_data' && reason && t.reason[reason] && (
            <span className="block text-muted-foreground" data-testid="sla-row-exploratory">
              {row.exploratory ? t.exploratoryReason(t.reason[reason]) : t.reason[reason]}
            </span>
          )}
          {best && bestAttainment !== null && (
            <span className="block text-muted-foreground">
              {t.bestObserved(formatPercent(bestAttainment), loadOf(t, kind, best))}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/** The measurement rules, in the precise terms the per-load table uses. */
function Definitions({
  t,
  kind,
  requiredAttainment,
  costLabel,
}: {
  t: SlaStrings;
  kind: SlaLoadKind;
  requiredAttainment: number;
  costLabel: string;
}) {
  const entries: [string, string][] = [
    [t.defAttainmentTerm, t.defAttainment],
    [t.defGoodputTerm, t.defGoodput],
    [t.defLoadTerm, kind === 'agentx_users' ? t.defLoadAgentic : t.defLoadFixed],
    [t.defVerdictTerm, t.defVerdict(minimumSampleSize(requiredAttainment))],
    [t.defTtftTerm, t.defTtft],
    [t.defTpotTerm, t.defTpot],
    [t.defE2eTerm, t.defE2e],
    [t.defCostTerm, t.defCost(costLabel)],
  ];
  return (
    <div data-testid="sla-definitions">
      <h4 className="text-xs font-medium text-muted-foreground">{t.definitions}</h4>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
        {entries.map(([term, text]) => (
          <div key={term}>
            <dt className="font-medium">{term}</dt>
            <dd className="text-muted-foreground">{text}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Details({
  id,
  t,
  row,
  snapshot,
  requiredAttainment,
  costLabel,
}: {
  id: string;
  t: SlaStrings;
  row: SlaConfigView;
  snapshot: SlaTargetsSnapshot;
  requiredAttainment: number;
  costLabel: string;
}) {
  const head = `${TABLE_HEAD_CELL_STYLE} px-3 py-2`;
  return (
    <div
      id={id}
      className="mt-1 mb-5 flex flex-col gap-6 border-l border-border pl-4 md:pl-5"
      data-testid="sla-row-details"
    >
      <Selections t={t} row={row} />
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
                <th className={cn(head, 'pl-0 text-left')}>{t.colPointLoad}</th>
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
      <Provenance t={t} row={row} snapshot={snapshot} costLabel={costLabel} />
      <Definitions
        t={t}
        kind={row.config.loadKind}
        requiredAttainment={requiredAttainment}
        costLabel={costLabel}
      />
    </div>
  );
}

/** The line under a status that makes it self-explanatory, in plain words. */
function statusLine(
  t: SlaStrings,
  row: SlaConfigView,
  answer: SlaRowAnswer,
  required: string,
): string | null {
  const kind = row.config.loadKind;
  if (answer.share) {
    const percent = formatPercent(answer.share.fraction);
    const load = loadOf(t, kind, answer.share.point);
    return answer.status === 'meets'
      ? t.shareMeets(percent, load, required)
      : t.shareBest(percent, load, required);
  }
  return answer.reason ? t.plainReason[answer.reason] || null : null;
}

function Figure({ value, unit }: { value: string; unit?: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-base font-semibold tabular-nums">{value}</span>
      {unit && <span className="text-muted-foreground"> {unit}</span>}
    </span>
  );
}

const NONE = <span className="text-muted-foreground">{DASH}</span>;

/** The cost of a setup that meets the target, with its load when that is not the highest one. */
function CostFigure({
  t,
  row,
  answer,
}: {
  t: SlaStrings;
  row: SlaConfigView;
  answer: SlaRowAnswer;
}) {
  if (answer.status !== 'meets') return NONE;
  if (answer.costUsd === null) {
    return <span className="text-muted-foreground">{t.costNoPrice}</span>;
  }
  return (
    <>
      <Figure value={formatUsd(answer.costUsd)} />
      {answer.costAt && (
        <span className="block text-xs text-muted-foreground">
          {t.at(loadOf(t, row.config.loadKind, answer.costAt))}
        </span>
      )}
    </>
  );
}

/**
 * One row per setup with three answers: status, the highest load that meets
 * the target, and the cost. Everything else about a setup is under its
 * "How this was measured" disclosure.
 */
export function SlaResultsTable({
  t,
  rows,
  snapshot,
  requiredAttainment,
  costLabel,
}: {
  t: SlaStrings;
  rows: SlaConfigView[];
  snapshot: SlaTargetsSnapshot;
  requiredAttainment: number;
  costLabel: string;
}) {
  const baseId = useId();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) => {
    const next = new Set(open);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpen(next);
    track('sla_targets_row_toggled', { enabled: next.has(key) });
  };
  const head = `${TABLE_HEAD_CELL_STYLE} px-3 py-2`;
  const required = `${attainmentPercent(requiredAttainment)}%`;
  const kind = rows[0]?.config.loadKind ?? 'agentx_users';
  const entries = rows.map((row, index) => {
    const answer = slaRowAnswer(row);
    const expanded = open.has(row.config.key);
    const detailsId = `${baseId}-details-${index}`;
    return {
      row,
      answer,
      expanded,
      line: statusLine(t, row, answer, required),
      load: answer.maxLoad ? (
        <Figure
          value={formatCount(answer.maxLoad.concurrency)}
          unit={t.loadUnit(row.config.loadKind, answer.maxLoad.concurrency)}
        />
      ) : (
        NONE
      ),
      cost: <CostFigure t={t} row={row} answer={answer} />,
      status: (
        <span
          className={cn('font-semibold whitespace-nowrap', STATUS_TONE[row.status])}
          data-testid="sla-row-status"
        >
          {t.statusLabel[row.status]}
        </span>
      ),
      // The table and the cards are both in the document, so each gets its own panel id.
      disclosure: (layout: 'table' | 'cards', className: string, testId?: string) => (
        <DisclosureToggle
          open={expanded}
          aria-controls={`${detailsId}-${layout}`}
          onClick={() => toggle(row.config.key)}
          data-testid={testId}
          className={className}
        >
          {t.howMeasured}
          <span className="sr-only">
            {t.listSeparator}
            {row.hardwareLabel} {row.servingLabel}
          </span>
        </DisclosureToggle>
      ),
      details: (layout: 'table' | 'cards') =>
        expanded && (
          <Details
            id={`${detailsId}-${layout}`}
            t={t}
            row={row}
            snapshot={snapshot}
            requiredAttainment={requiredAttainment}
            costLabel={costLabel}
          />
        ),
    };
  });

  return (
    <>
      {/* Desktop: one table. */}
      <div className="hidden md:block">
        <table className="w-full text-sm" data-testid="sla-results-table">
          <thead>
            <tr className={TABLE_HEAD_ROW_STYLE}>
              <th className={cn(head, 'pl-0 text-left')}>{t.colSetup}</th>
              <th className={cn(head, 'text-left')}>{t.colStatus}</th>
              <th className={cn(head, 'text-right')}>{t.colMaxLoad[kind]}</th>
              <th className={cn(head, 'text-right')}>{t.colGoodCost}</th>
              <th className={cn(head, 'pr-0')}>
                <span className="sr-only">{t.howMeasured}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ row, expanded, line, load, cost, status, disclosure, details }) => (
              <Fragment key={row.config.key}>
                <tr
                  className={cn('align-top', !expanded && 'border-b border-border/40')}
                  data-testid="sla-config-row"
                  data-status={row.status}
                >
                  <td className="py-4 pr-3" data-testid="sla-config-name">
                    <span className="block font-medium">{row.hardwareLabel}</span>
                    <span className="block text-xs text-muted-foreground">{row.servingLabel}</span>
                  </td>
                  <td className="px-3 py-4">
                    {status}
                    {line && (
                      <span
                        className="block text-xs text-muted-foreground"
                        data-testid="sla-row-line"
                      >
                        {line}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-4 text-right" data-testid="sla-row-load">
                    {load}
                  </td>
                  <td className="px-3 py-4 text-right" data-testid="sla-row-cost">
                    {cost}
                  </td>
                  <td className="py-4 pl-3 text-right whitespace-nowrap">
                    {disclosure('table', 'text-xs', 'sla-row-toggle')}
                  </td>
                </tr>
                {expanded && (
                  <tr className="border-b border-border/40">
                    <td colSpan={5}>{details('table')}</td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone: one card per setup with the same three answers. */}
      <ul
        className="flex flex-col divide-y divide-border/40 md:hidden"
        data-testid="sla-results-list"
      >
        {entries.map(({ row, expanded, line, load, cost, status, disclosure, details }) => (
          <li key={row.config.key} className="py-4 first:pt-0" data-status={row.status}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 font-medium" data-testid="sla-config-name">
                {row.hardwareLabel}
              </span>
              <span className="text-sm">{status}</span>
            </div>
            <p className="text-xs text-muted-foreground">{row.servingLabel}</p>
            {line && (
              <p
                className="mt-2 text-sm text-pretty text-muted-foreground"
                data-testid="sla-row-line"
              >
                {line}
              </p>
            )}
            <dl className="mt-3 flex flex-col gap-1.5 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t.colMaxLoad[row.config.loadKind]}</dt>
                <dd className="shrink-0 text-right" data-testid="sla-row-load">
                  {load}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t.colGoodCost}</dt>
                <dd className="shrink-0 text-right" data-testid="sla-row-cost">
                  {cost}
                </dd>
              </div>
            </dl>
            {disclosure('cards', 'mt-3 text-xs')}
            {expanded && <div className="mt-3">{details('cards')}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}
