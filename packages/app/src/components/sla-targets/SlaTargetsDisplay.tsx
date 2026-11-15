'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { minimumSampleSize, type SlaTargets } from '@semianalysisai/inferencex-constants';

import { CHART_COLORS } from '@/components/agentic-workload-explorer/series-colors';
import { Card } from '@/components/ui/card';
import { ChartShareActions } from '@/components/ui/chart-display-helpers';
import { DashboardSectionHeader } from '@/components/ui/dashboard-section-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Heading } from '@/components/ui/heading';
import { RetryableQueryError } from '@/components/ui/retryable-query-error';
import { useSlaEvaluations, useSlaTargetsDataset } from '@/hooks/api/use-sla-targets';
import { useUrlState } from '@/hooks/useUrlState';
import { track, trackOncePerPageview } from '@/lib/analytics/analytics';
import { useLocale } from '@/lib/i18n/use-locale';
import { SLA_AGENTIC_WORKLOAD } from '@/lib/sla-targets/dataset';
import {
  attainmentPercent,
  parseSlaTargetsState,
  serializeSlaTargetsState,
  type SlaCostTier,
  type SlaTargetsState,
} from '@/lib/sla-targets/state';
import {
  evaluateSlaTargetsView,
  slaEvaluationIds,
  slaWorkloads,
  type SlaConfigView,
} from '@/lib/sla-targets/view';

import { SlaControls } from './sla-controls';
import { SlaCostComparison } from './sla-cost-comparison';
import { formatCount, formatPercent, formatRate } from './sla-format';
import { SlaLoadChart, type SlaChartSeries } from './sla-load-chart';
import { SlaResultsTable } from './sla-results-table';
import { SLA_STRINGS, type SlaStrings } from './sla-strings';

/** Typing in a target field re-evaluates on the server after this pause. */
const TARGET_DEBOUNCE_MS = 350;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function chartSeries(
  t: SlaStrings,
  rows: SlaConfigView[],
  colors: Record<string, string>,
  metric: 'attainment' | 'goodput',
): SlaChartSeries[] {
  return rows.map((row) => {
    const label = `${row.hardwareLabel} · ${row.servingLabel}`;
    const color = colors[row.config.key];
    return {
      key: row.config.key,
      label,
      color,
      exploratory: row.points.some((view) => view.result?.qualification.exploratory),
      points: row.points
        .flatMap((view) => {
          const observed = view.result?.observed;
          const qualification = view.result?.qualification;
          if (!observed || !qualification) return [];
          const y = metric === 'attainment' ? observed.attainment : observed.goodputRps;
          if (y === null || observed.attainment === null) return [];
          return [
            {
              x: view.concurrency,
              y: metric === 'attainment' ? y * 100 : y,
              meets: qualification.status === 'meets',
              seriesLabel: label,
              color,
              loadLabel: t.load(row.config.loadKind, view.concurrency),
              statusLabel: [
                t.statusLabel[qualification.status],
                qualification.exploratory ? t.exploratory : null,
                t.reason[qualification.reason] || null,
              ]
                .filter((part) => part !== null)
                .join(' · '),
              metrics: [
                { value: formatPercent(observed.attainment), label: t.tipAttainment },
                {
                  value:
                    observed.goodputRps === null
                      ? '—'
                      : `${formatRate(observed.goodputRps)} ${t.reqPerSecond}`,
                  label: t.tipGoodput,
                },
                { value: formatCount(observed.attempted), label: t.tipAttempts },
              ],
            },
          ];
        })
        .toSorted((a, b) => a.x - b.x),
    };
  });
}

export default function SlaTargetsDisplay() {
  const locale = useLocale();
  const t = SLA_STRINGS[locale];
  const { getUrlParam, setUrlParams } = useUrlState();
  const [state, setState] = useState<SlaTargetsState>(() =>
    parseSlaTargetsState({
      s_model: getUrlParam('s_model'),
      s_seq: getUrlParam('s_seq'),
      s_ttft: getUrlParam('s_ttft'),
      s_tpot: getUrlParam('s_tpot'),
      s_e2e: getUrlParam('s_e2e'),
      s_att: getUrlParam('s_att'),
      s_cost: getUrlParam('s_cost'),
    }),
  );
  const update = useCallback(
    (patch: Partial<SlaTargetsState>) => {
      setState((current) => {
        const next = { ...current, ...patch };
        setUrlParams(serializeSlaTargetsState(next));
        return next;
      });
    },
    [setUrlParams],
  );

  useEffect(() => {
    trackOncePerPageview('sla_targets_page_viewed');
  }, []);

  const dataset = useSlaTargetsDataset(state.model);
  const model = dataset.data?.model ?? null;
  const workloads = useMemo(() => slaWorkloads(dataset.data?.configs ?? []), [dataset.data]);
  const workload =
    state.workload !== null && workloads.includes(state.workload)
      ? state.workload
      : (workloads[0] ?? SLA_AGENTIC_WORKLOAD);
  const configs = useMemo(
    () => (dataset.data?.configs ?? []).filter((config) => config.workload === workload),
    [dataset.data, workload],
  );

  const { maxTtftMs, maxTpotMs, maxE2eS, requiredAttainment } = state.targets;
  const latency = useMemo(
    () => ({ maxTtftMs, maxTpotMs, maxE2eS }),
    [maxTtftMs, maxTpotMs, maxE2eS],
  );
  const evaluatedTargets = useDebounced(latency, TARGET_DEBOUNCE_MS);
  const ids = useMemo(() => slaEvaluationIds(configs), [configs]);
  const evaluations = useSlaEvaluations(ids, evaluatedTargets);
  // While typed targets wait for the server, rows read "Evaluating…" instead of the old verdict.
  const settled = evaluatedTargets === latency;
  const view = useMemo(
    () =>
      evaluateSlaTargetsView(
        configs,
        model ?? '',
        settled ? evaluations.evaluations : {},
        requiredAttainment,
        state.costTier,
        locale,
      ),
    [configs, model, settled, evaluations.evaluations, requiredAttainment, state.costTier, locale],
  );
  const colors = useMemo(
    () =>
      Object.fromEntries(
        configs.map((config, index) => [config.key, CHART_COLORS[index % CHART_COLORS.length]]),
      ),
    [configs],
  );
  const attainmentSeries = useMemo(
    () => chartSeries(t, view.rows, colors, 'attainment'),
    [t, view.rows, colors],
  );
  const goodputSeries = useMemo(
    () => chartSeries(t, view.rows, colors, 'goodput'),
    [t, view.rows, colors],
  );
  const threshold = useMemo(
    () => ({
      value: requiredAttainment * 100,
      label: t.requiredLine(`${attainmentPercent(requiredAttainment)}%`),
    }),
    [requiredAttainment, t],
  );

  const onTargetsChange = useCallback(
    (targets: SlaTargets) => {
      update({ targets });
      track('sla_targets_targets_changed', {
        max_ttft_ms: targets.maxTtftMs,
        max_tpot_ms: targets.maxTpotMs,
        max_e2e_s: targets.maxE2eS,
        required_attainment: targets.requiredAttainment,
      });
    },
    [update],
  );

  const error = dataset.error ?? evaluations.error;
  if (error) {
    return (
      <RetryableQueryError
        message={t.errorText}
        analyticsEvent="sla_targets_retry_clicked"
        onRetry={() => Promise.all([dataset.refetch(), evaluations.refetch()])}
        testId="sla-targets-error"
      />
    );
  }

  const snapshot = dataset.data?.snapshot;
  const loadKind = configs[0]?.loadKind ?? 'agentx_users';
  const costLabel = state.costTier === 'rental' ? t.costRental : t.costHyperscaler;

  return (
    <div data-testid="sla-targets-display" className="flex flex-col gap-4">
      <section>
        <Card>
          <DashboardSectionHeader
            title={t.heading}
            description={t.explanation}
            actions={<ChartShareActions />}
          />
          {snapshot?.kind === 'captured' && (
            <p className="mt-3 text-sm text-muted-foreground" data-testid="sla-snapshot-note">
              {t.capturedSnapshot(snapshot.runs.length, snapshot.capturedAt.slice(0, 10))}
            </p>
          )}
          {dataset.data && model !== null && (
            <div className="mt-4 flex flex-col gap-4">
              <SlaControls
                t={t}
                models={dataset.data.models}
                model={model}
                workloads={workloads}
                workload={workload}
                targets={state.targets}
                costTier={state.costTier}
                onModelChange={(next) => update({ model: next, workload: null })}
                onWorkloadChange={(next) => update({ workload: next })}
                onTargetsChange={onTargetsChange}
                onCostTierChange={(costTier: SlaCostTier) => update({ costTier })}
              />
              <dl
                className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2"
                aria-label={t.definitions}
                data-testid="sla-definitions"
              >
                {(
                  [
                    [t.defAttainmentTerm, t.defAttainment],
                    [t.defGoodputTerm, t.defGoodput],
                    [
                      t.defLoadTerm,
                      loadKind === 'agentx_users' ? t.defLoadAgentic : t.defLoadFixed,
                    ],
                    [t.defVerdictTerm, t.defVerdict(minimumSampleSize(requiredAttainment))],
                  ] as const
                ).map(([term, text]) => (
                  <div key={term}>
                    <dt className="font-medium">{term}</dt>
                    <dd className="text-muted-foreground">{text}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </Card>
      </section>

      {dataset.isLoading || !dataset.data || !snapshot ? (
        <Card>
          <EmptyState bare role="status" className="h-32">
            {t.loading}
          </EmptyState>
        </Card>
      ) : configs.length === 0 ? (
        <Card>
          <EmptyState bare className="h-32">
            {t.noConfigs}
          </EmptyState>
        </Card>
      ) : (
        <>
          <section>
            <Card>
              <div className="mb-4">
                <Heading as="h2" level="card">
                  {t.tableHeading}
                </Heading>
                <p className="mt-1 text-sm text-muted-foreground">{t.tableHint}</p>
              </div>
              <SlaResultsTable t={t} rows={view.rows} colors={colors} snapshot={snapshot} />
            </Card>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SlaLoadChart
              title={t.chartAttainment}
              subtitle={t.chartAttainmentSub}
              series={attainmentSeries}
              xLabel={t.loadAxis[loadKind]}
              yLabel={t.axisAttainment}
              yTick={(value) => `${value}`}
              yDomain={[0, 100]}
              threshold={threshold}
              filename="InferenceX_sla_attainment"
              emptyLabel={t.chartEmpty}
              legendNote={t.chartLegend}
              testId="sla-attainment-chart"
            />
            <SlaLoadChart
              title={t.chartGoodput}
              subtitle={t.chartGoodputSub}
              series={goodputSeries}
              xLabel={t.loadAxis[loadKind]}
              yLabel={t.axisGoodput}
              yTick={formatRate}
              filename="InferenceX_sla_goodput"
              emptyLabel={t.chartEmpty}
              legendNote={t.chartLegend}
              testId="sla-goodput-chart"
            />
          </section>

          <section>
            <Card>
              <div className="mb-4">
                <Heading as="h2" level="card">
                  {t.costHeading}
                </Heading>
                <p className="mt-1 text-sm text-muted-foreground">{t.costSub(costLabel)}</p>
              </div>
              <SlaCostComparison t={t} rows={view.qualifying} colors={colors} />
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
