import { sequenceToIslOsl } from '@semianalysisai/inferencex-constants';
import type { QueryClient } from '@tanstack/react-query';

import { fleetMegawatts } from '@/components/calculator/lifecycle';
import { profitAgenticModels } from '@/components/calculator/profit-estimator';
import { calculatorUrlSeed } from '@/components/calculator/url-seed';
import { throughputQueryOptions } from '@/components/calculator/useThroughputData';
import { chartBenchmarkQueryDate } from '@/components/inference/hooks/chart-data-core';
import { availabilityQueryOptions } from '@/hooks/api/use-availability';
import { benchmarkHistoryQueryOptions } from '@/hooks/api/use-benchmark-history';
import { benchmarkQueryOptions } from '@/hooks/api/use-benchmarks';
import { evaluationsQueryOptions } from '@/hooks/api/use-evaluations';
import { trendHistoryQueryOptions } from '@/hooks/api/use-trend-history';
import { workflowInfoQueryOptions } from '@/hooks/api/use-workflow-info';
import type { AvailabilityIndex } from '@/lib/benchmarks/availability-index';
import { Model, Sequence } from '@/lib/catalog/data-mappings';
import {
  dashboardRouteForPathname,
  dashboardShellCapabilitiesForPathname,
} from '@/lib/routing/dashboard-routes';
import { inferenceModelForPathname } from '@/lib/routing/inference-model-slug';
import { getInferenceNavigationModel } from '@/lib/routing/inference-navigation-state';
import { profitRouteSearch } from '@/lib/routing/profit-estimator-routes';
import {
  DEFAULT_FLEET_MW,
  peekNavigationUrlParams,
  type UrlStateKey,
} from '@/lib/routing/url-state';
import { readFeatureGateUnlocked } from '@/lib/runtime/use-feature-gate';
import {
  type FilterRequest,
  type FilterSelection,
  resolveAvailableModels,
  resolveFilterNavigationOverrides,
  resolveFilterSelection,
  resolveMountedFilterRequest,
  visibleSelectedModel,
} from '@/providers/GlobalFilterContext';
import { parseUnofficialRunIds } from '@/providers/unofficial-run-provider';

import type { InferenceRoute, InferenceRoutePage } from './inference-route-data';

type PrefetchOptions = Parameters<QueryClient['prefetchQuery']>[0] & { enabled?: boolean };

/** Starts a query the page would run, skipping one its options leave disabled. */
function prefetchEnabled(queryClient: QueryClient, options: PrefetchOptions): void {
  if (options.enabled !== false) void queryClient.prefetchQuery(options);
}

interface RouteUrlState {
  getUrlParam: (key: UrlStateKey) => string | undefined;
  hasExplicitUrlParam: (key: UrlStateKey) => boolean;
  featureGateUnlocked: boolean;
}

/** The main benchmarks query of `InferenceProvider` pages, which pass no seed rows or scope. */
function inferenceChartQueryOptions(model: Model, queryDate: string) {
  return benchmarkQueryOptions(
    model,
    queryDate,
    true,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    true,
  );
}

/**
 * Whether the dashboard shell's filter provider stays mounted into the target page. Then the page
 * inherits the live selection instead of mounting a fresh one.
 */
function shellFilterProviderPersists(): boolean {
  const current = window.location.pathname;
  return (
    dashboardRouteForPathname(current) !== undefined &&
    dashboardShellCapabilitiesForPathname(current).providers.globalFilters
  );
}

function isModel(value: string | undefined): value is Model {
  return value !== undefined && (Object.values(Model) as string[]).includes(value);
}

/**
 * Warms the queries `route`'s page runs on a client navigation. Keys come from the option
 * builders and selection helpers the page itself uses. Selections only the live page knows are
 * skipped rather than guessed. Rejects only when availability fails to load.
 */
export async function warmInferenceRoute(
  queryClient: QueryClient,
  route: InferenceRoute,
): Promise<void> {
  if (route.page === 'evaluation') void queryClient.prefetchQuery(evaluationsQueryOptions());
  const { pathname, search } = route;
  // Overlay runs add models and sequences the selection can switch to once they load. A favorite
  // preset link switches the Inference chart's model, sequence and precisions after mount.
  const routeSearch = pathname === null ? null : profitRouteSearch(pathname, search);
  if (
    pathname === null ||
    routeSearch === null ||
    parseUnofficialRunIds(routeSearch.toString()).length > 0 ||
    ((route.page === 'inference' || route.page === 'historical') && routeSearch.has('preset'))
  ) {
    void queryClient.prefetchQuery(availabilityQueryOptions());
    return;
  }

  const { params, explicit } = peekNavigationUrlParams(pathname, search);
  const state: RouteUrlState = {
    getUrlParam: (key) => params[key],
    hasExplicitUrlParam: (key) => explicit[key] !== undefined,
    featureGateUnlocked: readFeatureGateUnlocked(),
  };

  if (route.page === 'inference' || route.page === 'historical' || route.page === 'evaluation') {
    if (shellFilterProviderPersists()) {
      warmPersistentShellPage(queryClient, route.page, pathname, state);
      return;
    }
    await warmShellPage(queryClient, route.page, pathname, state);
    return;
  }
  await warmCalculatorPage(queryClient, route, pathname, search, state);
}

/**
 * The shell provider keeps its sequence, precisions and run picks across the navigation. Only the
 * model is readable from outside, so only the latest benchmarks key is warmed.
 */
function warmPersistentShellPage(
  queryClient: QueryClient,
  page: InferenceRoutePage,
  pathname: string,
  { getUrlParam, hasExplicitUrlParam, featureGateUnlocked }: RouteUrlState,
): void {
  void queryClient.prefetchQuery(availabilityQueryOptions());
  if (page === 'evaluation') return;
  // The provider mirrors its run picks into the remembered URL state.
  if (getUrlParam('g_rundate') || getUrlParam('g_runid')) return;
  const liveModel = getInferenceNavigationModel();
  const requested =
    resolveFilterNavigationOverrides({
      pathname,
      getUrlParam,
      hasExplicitUrlParam,
      initialPrecisions: [],
      initialChipBasis: undefined,
    }).model ?? (isModel(liveModel) ? liveModel : undefined);
  if (!requested) return;
  void queryClient.prefetchQuery(
    inferenceChartQueryOptions(visibleSelectedModel(requested, featureGateUnlocked), ''),
  );
}

/** A shell page whose filter provider mounts fresh, as the dashboard shell mounts it. */
async function warmShellPage(
  queryClient: QueryClient,
  page: InferenceRoutePage,
  pathname: string,
  state: RouteUrlState,
): Promise<void> {
  const request = resolveMountedFilterRequest({
    pathname,
    initialModel: inferenceModelForPathname(pathname) ?? undefined,
    ...state,
  });
  const charted = page !== 'evaluation';
  // Before availability resolves the chart reads the latest rows, unless a run date is pinned.
  if (charted && !resolveFilterSelection(undefined, request).effectiveRunDate) {
    void queryClient.prefetchQuery(inferenceChartQueryOptions(request.model, ''));
  }

  const availability = await queryClient.ensureQueryData(availabilityQueryOptions());
  const selection = selectAndWarmWorkflow(queryClient, availability, request);
  if (!charted) return;
  // A pinned run resolves against workflow info, which is a step further out.
  if (!request.requestedRunId) {
    const queryDate = chartBenchmarkQueryDate(
      selection.effectiveRunDate,
      selection.availableDates.at(-1),
      undefined,
    );
    void queryClient.prefetchQuery(inferenceChartQueryOptions(request.model, queryDate ?? ''));
  }
  if (page === 'historical') {
    const islOsl = sequenceToIslOsl(selection.effectiveSequence);
    prefetchEnabled(
      queryClient,
      trendHistoryQueryOptions(
        request.model,
        islOsl?.isl ?? 0,
        islOsl?.osl ?? 0,
        selection.effectiveSequence === Sequence.AgenticTraces ? 'agentic_traces' : undefined,
      ),
    );
  }
}

/** Calculator displays mount their own filter provider, seeded from the URL. */
async function warmCalculatorPage(
  queryClient: QueryClient,
  route: InferenceRoute,
  pathname: string,
  search: string,
  state: RouteUrlState,
): Promise<void> {
  const profit = route.page === 'profit-estimator';
  const seed = calculatorUrlSeed(pathname, search, route.routeModel);
  const request = resolveMountedFilterRequest({
    pathname,
    initialModel: seed.model,
    initialSequence: profit ? Sequence.AgenticTraces : seed.sequence,
    initialPrecisions: profit ? undefined : seed.precisions,
    initialRunDate: seed.runDate,
    initialRunId: seed.runId,
    ...state,
  });
  const prefetchThroughput = (selection: FilterSelection) =>
    prefetchEnabled(
      queryClient,
      throughputQueryOptions(
        request.model,
        // The profit estimator always charts agentic traces.
        profit ? Sequence.AgenticTraces : selection.effectiveSequence,
        selection.effectiveRunDate,
      ),
    );

  prefetchThroughput(resolveFilterSelection(undefined, request));
  const availability = await queryClient.ensureQueryData(availabilityQueryOptions());
  if (profit) {
    const offered = profitAgenticModels(
      'profit-estimator',
      resolveAvailableModels(availability, [], state.featureGateUnlocked),
      availability.lines,
    );
    // The page switches to an offered model, so this model's dated keys go unused.
    if (!offered.includes(request.model)) return;
  }
  const selection = selectAndWarmWorkflow(queryClient, availability, request);
  prefetchThroughput(selection);

  if (
    route.page === 'fleet' &&
    fleetMegawatts(state.getUrlParam('c_mw') ?? DEFAULT_FLEET_MW) !== null
  ) {
    const islOsl = sequenceToIslOsl(selection.effectiveSequence);
    prefetchEnabled(
      queryClient,
      benchmarkHistoryQueryOptions(request.model, islOsl?.isl ?? 0, islOsl?.osl ?? 0, {
        ...(islOsl === null ? { benchmarkType: 'agentic_traces' as const } : {}),
        view: 'calculator',
        enabled: true,
      }),
    );
  }
}

/** The provider's selection once availability loads. Also warms its run's workflow info. */
function selectAndWarmWorkflow(
  queryClient: QueryClient,
  availability: AvailabilityIndex,
  request: FilterRequest,
): FilterSelection {
  const selection = resolveFilterSelection(availability, request);
  prefetchEnabled(queryClient, workflowInfoQueryOptions(selection.effectiveRunDate));
  return selection;
}
