import { SM_L2_RUNS } from '@/components/ubenchx/sm-l2-data';
import { transformSmL2Run } from '@/components/ubenchx/sm-l2-transform';
import { TPC_GROUPING_RUNS } from '@/components/ubenchx/tpc-grouping-data';
import { transformTpcGroupingRun } from '@/components/ubenchx/tpc-grouping-transform';
import { UBENCHX_RUNS } from '@/components/ubenchx/ubenchx-data';
import { transformUbenchxRun } from '@/components/ubenchx/ubenchx-transform';
import { cachedJson } from '@/lib/api-cache';
import { runViewsRoute } from '@/lib/views-api/errors';
import { parseEnumParam, validateParams as validateViewParams } from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const AVAILABLE_TESTS = ['mem-bw', 'sm-l2-distance', 'tpc-grouping'] as const;

/** TPC per GPC groupings for every GPU (`gpu=all`, the default) or one GPU. */
function tpcGroupingResults(gpu: string) {
  return gpu === 'all'
    ? Object.entries(TPC_GROUPING_RUNS).map(([key, run]) => transformTpcGroupingRun(key, run))
    : [transformTpcGroupingRun(gpu, TPC_GROUPING_RUNS[gpu])];
}

export function GET(request: NextRequest) {
  return runViewsRoute('ubenchx', () => {
    validateViewParams(request.nextUrl.searchParams, VIEW_QUERY_PARAMS.ubenchx);
    const s = request.nextUrl.searchParams;
    const test = parseEnumParam(s.get('test'), 'test', ['all', ...AVAILABLE_TESTS], 'all');
    const rawGpu = s.get('gpu');

    if (test === 'tpc-grouping') {
      const gpuKeys = Object.keys(TPC_GROUPING_RUNS);
      const gpu = parseEnumParam(s.get('gpu'), 'gpu', ['all', ...gpuKeys], 'all');
      return Promise.resolve(
        cachedJson({
          apiVersion: 'v1',
          view: 'ubenchx',
          test: 'tpc-grouping',
          params: { test: 'tpc-grouping', gpu },
          gpus: tpcGroupingResults(gpu),
        }),
      );
    }

    if (test === 'mem-bw' || test === 'all') {
      const gpuKeys = Object.keys(UBENCHX_RUNS);
      const gpu = parseEnumParam(s.get('gpu'), 'gpu', ['all', ...gpuKeys], gpuKeys[0]);

      const memBwResults =
        gpu === 'all'
          ? Object.entries(UBENCHX_RUNS).map(([key, run]) => transformUbenchxRun(key, run))
          : [transformUbenchxRun(gpu, UBENCHX_RUNS[gpu])];

      if (test === 'mem-bw') {
        return Promise.resolve(
          cachedJson({
            apiVersion: 'v1',
            view: 'ubenchx',
            test: 'mem-bw',
            params: { test: 'mem-bw', gpu },
            gpus: memBwResults,
          }),
        );
      }

      // test === 'all': return every test
      const smL2GpuKeys = Object.keys(SM_L2_RUNS);
      const smL2Gpu = parseEnumParam(s.get('gpu'), 'gpu', ['all', ...smL2GpuKeys], 'all');
      const smL2Results =
        smL2Gpu === 'all'
          ? Object.entries(SM_L2_RUNS).map(([key, run]) => transformSmL2Run(key, run))
          : SM_L2_RUNS[smL2Gpu]
            ? [transformSmL2Run(smL2Gpu, SM_L2_RUNS[smL2Gpu])]
            : [];

      return Promise.resolve(
        cachedJson({
          apiVersion: 'v1',
          view: 'ubenchx',
          test: 'all',
          params: { test: 'all', gpu },
          tests: AVAILABLE_TESTS,
          memBw: { gpus: memBwResults },
          smL2Distance: { gpus: smL2Results },
          // Like smL2Distance, default to every GPU rather than mem-bw's first one.
          tpcGrouping: {
            gpus: tpcGroupingResults(rawGpu && rawGpu in TPC_GROUPING_RUNS ? rawGpu : 'all'),
          },
        }),
      );
    }

    // test === 'sm-l2-distance'
    const smL2GpuKeys = Object.keys(SM_L2_RUNS);
    const gpu = parseEnumParam(s.get('gpu'), 'gpu', ['all', ...smL2GpuKeys], smL2GpuKeys[0]);
    const smL2Results =
      gpu === 'all'
        ? Object.entries(SM_L2_RUNS).map(([key, run]) => transformSmL2Run(key, run))
        : [transformSmL2Run(gpu, SM_L2_RUNS[gpu])];

    return Promise.resolve(
      cachedJson({
        apiVersion: 'v1',
        view: 'ubenchx',
        test: 'sm-l2-distance',
        params: { test: 'sm-l2-distance', gpu },
        gpus: smL2Results,
      }),
    );
  });
}
