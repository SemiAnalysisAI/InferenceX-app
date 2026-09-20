import { buildCacheReuse, defaultCacheReuseGroup } from '@/components/calculator/cache-reuse';
import {
  DEFAULT_FIRST_TOKEN_CAPS,
  parseFirstTokenCaps,
  selectFirstTokenWinners,
} from '@/components/calculator/first-token-limits';
import { interpolateForGPU } from '@/components/calculator/interpolation';
import {
  DEFAULT_UTILIZATION_PCT,
  listPricingToTokenRevenuePricing,
  profitModelDefaults,
} from '@/components/calculator/profit-estimator';
import { estimateProfitByPower } from '@/components/calculator/profit-power';
import type { TokenRevenuePricing } from '@/components/inference/types';
import { fetchOpenRouterPricing } from '@/hooks/api/use-openrouter-pricing';
import { cachedJson } from '@/lib/api-cache';
import { getGpuSpecs } from '@/lib/constants';
import { getOpenRouterModelId, Sequence, type Model } from '@/lib/data-mappings';
import type { NextRequest } from 'next/server';
import { runViewsRoute, ViewsApiParamError } from './errors';
import { parseEnumParam, parseNumberMap, parseNumberParam, validateParams } from './params';
import { VIEW_QUERY_PARAMS } from './registry';
import { calculatorGroups, comparisonSelections, selection } from './source';

export const CALCULATOR_SELECTION_PARAMS = [
  'model',
  'sequence',
  'date',
  'runId',
  'percentile',
  'tcoBasis',
  'precisions',
  'gpus',
  'unofficialrun',
] as const;
export const EXTENSION_PARAMS = {
  'first-token': [
    ...CALCULATOR_SELECTION_PARAMS,
    'caps',
    'minInteractivity',
    'costProvider',
    'costType',
  ],
  'cache-reuse': [...CALCULATOR_SELECTION_PARAMS, 'config'],
  'profit-estimator': [
    ...CALCULATOR_SELECTION_PARAMS,
    'target',
    'costProvider',
    'customCosts',
    'priceSource',
    'inputPrice',
    'cachedInputPrice',
    'outputPrice',
    'utilization',
    'labCut',
    'powerBasis',
    'dates',
    'start',
    'end',
  ],
  'profit-estimator-per-gigawatt': [
    ...CALCULATOR_SELECTION_PARAMS,
    'target',
    'costProvider',
    'customCosts',
    'priceSource',
    'inputPrice',
    'cachedInputPrice',
    'outputPrice',
    'utilization',
    'labCut',
    'powerBasis',
    'dates',
    'start',
    'end',
  ],
} as const;
export type CalculatorExtension = keyof typeof EXTENSION_PARAMS;

export function calculatorExtension(view: CalculatorExtension, request: NextRequest) {
  return runViewsRoute(view, async () => {
    const search = request.nextUrl.searchParams;
    validateParams(search, VIEW_QUERY_PARAMS[view]);
    const params = selection(search);
    if (view !== 'first-token' && params.sequence !== Sequence.AgenticTraces)
      throw new ViewsApiParamError('sequence', 'This view requires agentic-traces', [
        'agentic-traces',
      ]);
    const groups = await calculatorGroups(request, params);
    const envelope = { apiVersion: 'v1', view, params: groups.params };
    const options = {
      official: groups.official.grouped,
      officialMeta: groups.official.groupMeta,
      overlay: groups.overlay.grouped,
      overlayMeta: groups.overlay.groupMeta,
    };
    if (view === 'first-token') {
      const caps = search.has('caps')
        ? parseFirstTokenCaps(search.get('caps'))
        : [...DEFAULT_FIRST_TOKEN_CAPS];
      if (!caps || (search.get('caps')?.split(',').length ?? 0) > 8)
        throw new ViewsApiParamError(
          'caps',
          'Expected one to eight distinct positive first-token caps in seconds',
        );
      const minInteractivity = parseNumberParam(
        search.get('minInteractivity'),
        'minInteractivity',
        params.sequence === Sequence.AgenticTraces ? 150 : 35,
        { min: 0 },
      );
      const costProvider = parseEnumParam(
        search.get('costProvider'),
        'costProvider',
        ['costh', 'costr'],
        'costh',
      );
      const costType = parseEnumParam(
        search.get('costType'),
        'costType',
        ['total', 'input', 'output'],
        'total',
      );
      return cachedJson({
        ...envelope,
        params: { ...envelope.params, caps, minInteractivity, costProvider, costType },
        data: selectFirstTokenWinners({
          ...options,
          caps,
          minInteractivity,
          costProvider,
          costType,
        }),
      });
    }
    if (view === 'cache-reuse') {
      const configurations = { ...groups.official.groupMeta, ...groups.overlay.groupMeta };
      const config =
        search.get('config') ??
        defaultCacheReuseGroup(groups.official.grouped, groups.official.groupMeta) ??
        defaultCacheReuseGroup(groups.overlay.grouped, groups.overlay.groupMeta);
      if (config && !configurations[config])
        throw new ViewsApiParamError(
          'config',
          'Unknown configuration',
          Object.keys(configurations),
        );
      return cachedJson({
        ...envelope,
        params: { ...envelope.params, config },
        configurations,
        data: config
          ? buildCacheReuse({
              ...options,
              official: groups.official.grouped[config] ?? [],
              config: configurations[config],
            })
          : null,
      });
    }
    const defaults = profitModelDefaults(params.model as Model);
    const basis = view === 'profit-estimator' ? 'chip-hour' : 'gw-year';
    const target = parseNumberParam(search.get('target'), 'target', defaults.interactivity, {
      min: 0.001,
    });
    const utilization = parseNumberParam(
      search.get('utilization'),
      'utilization',
      DEFAULT_UTILIZATION_PCT,
      { min: 0, max: 100 },
    );
    const labCut = parseNumberParam(search.get('labCut'), 'labCut', defaults.labCutPct, {
      min: 0,
      max: 100,
    });
    const costProvider = parseEnumParam(
      search.get('costProvider'),
      'costProvider',
      ['costh', 'costr', 'custom'],
      basis === 'chip-hour' ? 'costr' : 'costh',
    );
    const customCosts = parseNumberMap(search.get('customCosts'), 'customCosts');
    const powerBasis = parseEnumParam(
      search.get('powerBasis'),
      'powerBasis',
      ['provisioned', 'modeled', 'compare'],
      'provisioned',
    );
    const priceSource = parseEnumParam(
      search.get('priceSource'),
      'priceSource',
      ['list', 'openrouter', 'custom'],
      defaults.listPricing ? 'list' : 'openrouter',
    );
    let pricing: TokenRevenuePricing;
    if (priceSource === 'list') {
      if (!defaults.listPricing)
        throw new ViewsApiParamError('priceSource', 'This model has no configured list price', [
          'openrouter',
          'custom',
        ]);
      pricing = listPricingToTokenRevenuePricing(defaults.listPricing);
    } else if (priceSource === 'openrouter') {
      const id = getOpenRouterModelId(params.model as Model);
      if (!id)
        throw new ViewsApiParamError(
          'priceSource',
          'This model has no OpenRouter price; supply custom prices',
          ['custom'],
        );
      pricing = await fetchOpenRouterPricing(id, AbortSignal.timeout(15_000));
    } else {
      pricing = {
        source: 'normalized',
        inputPerMillion: parseNumberParam(search.get('inputPrice'), 'inputPrice', 1, { min: 0 }),
        cachedInputPerMillion: parseNumberParam(
          search.get('cachedInputPrice'),
          'cachedInputPrice',
          0.1,
          { min: 0 },
        ),
        outputPerMillion: parseNumberParam(search.get('outputPrice'), 'outputPrice', 1, { min: 0 }),
      };
    }
    const assumptions = {
      utilizationPct: utilization,
      labCutPct: labCut,
      basis,
      powerBasis,
    } as const;
    function estimate(group: typeof groups.official) {
      const results = Object.entries(group.grouped).flatMap(([key, points]) => {
        const result = interpolateForGPU(
          points,
          target,
          'interactivity_to_throughput',
          costProvider === 'custom' ? 'costh' : costProvider,
        );
        return result && result.value > 0
          ? [{ ...result, ...group.groupMeta[key], resultKey: key }]
          : [];
      });
      return estimateProfitByPower(
        results,
        (hwKey) => ({
          powerKwPerGpu: getGpuSpecs(hwKey, params.tcoBasis).power,
          costPerGpuHour:
            costProvider === 'custom'
              ? (customCosts[hwKey.split('_')[0]] ?? 0)
              : getGpuSpecs(hwKey, params.tcoBasis)[costProvider],
        }),
        pricing,
        assumptions,
        powerBasis,
        target,
        { provisioned: 'Provisioned', modeled: 'Modeled' },
      );
    }
    const selections = comparisonSelections(search);
    const comparisons = await Promise.all(
      selections.map(async ({ entry, date, runId }) => {
        const group = await calculatorGroups(request, { ...groups.params, date, runId });
        return { entry, data: estimate(group.official) };
      }),
    );
    return cachedJson({
      ...envelope,
      params: {
        ...envelope.params,
        target,
        costProvider,
        customCosts,
        priceSource,
        utilization,
        labCut,
        powerBasis,
        basis,
        dates: selections.map((s) => s.entry),
      },
      pricing,
      data: estimate(groups.official),
      overlays: estimate(groups.overlay),
      comparisons,
    });
  });
}
