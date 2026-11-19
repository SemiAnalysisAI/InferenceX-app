import {
  HUAWEI_SKU_GPU_KEYS,
  huaweiSkuConfigurations,
} from '@/components/ubenchx/huawei-sku-configurations';
import {
  CORE_PROFILE_GPU_KEYS,
  coreMemoryProfileResults,
} from '@/components/ubenchx/core-memory-profiles';
import { SM_L2_RUNS } from '@/components/ubenchx/sm-l2-data';
import { transformSmL2Run } from '@/components/ubenchx/sm-l2-transform';
import { TPC_SKYLINE_RUNS } from '@/components/ubenchx/tpc-skyline-data';
import { transformTpcSkylineRun } from '@/components/ubenchx/tpc-skyline-transform';
import { UBENCHX_RUNS } from '@/components/ubenchx/ubenchx-data';
import { transformUbenchxRun } from '@/components/ubenchx/ubenchx-transform';
import { cachedJson } from '@/lib/cache/api-cache';
import { runViewsRoute } from '@/lib/views-api/errors';
import { parseEnumParam, validateParams as validateViewParams } from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const AVAILABLE_TESTS = [
  'mem-bw',
  'sm-l2-distance',
  'tpc-skyline',
  'core-memory-profiles',
] as const;

/** TPC per GPC groupings for every GPU (`gpu=all`, the default) or one GPU. */
function tpcSkylineResults(gpu: string) {
  return gpu === 'all'
    ? Object.entries(TPC_SKYLINE_RUNS).map(([key, run]) => transformTpcSkylineRun(key, run))
    : TPC_SKYLINE_RUNS[gpu]
      ? [transformTpcSkylineRun(gpu, TPC_SKYLINE_RUNS[gpu])]
      : [];
}

export function GET(request: NextRequest) {
  return runViewsRoute('ubenchx', () => {
    validateViewParams(request.nextUrl.searchParams, VIEW_QUERY_PARAMS.ubenchx);
    const s = request.nextUrl.searchParams;
    const test = parseEnumParam(s.get('test'), 'test', ['all', ...AVAILABLE_TESTS], 'all');
    const rawGpu = s.get('gpu');

    if (test === 'core-memory-profiles') {
      const gpu = parseEnumParam(rawGpu, 'gpu', ['all', ...CORE_PROFILE_GPU_KEYS], 'all');
      return Promise.resolve(
        cachedJson(request, {
          apiVersion: 'v1',
          view: 'ubenchx',
          test,
          params: { test, gpu },
          gpus: coreMemoryProfileResults(gpu),
        }),
      );
    }

    if (test === 'tpc-skyline') {
      const gpuKeys = [...Object.keys(TPC_SKYLINE_RUNS), 'Huawei 950PR', ...HUAWEI_SKU_GPU_KEYS];
      const gpu = parseEnumParam(s.get('gpu'), 'gpu', ['all', ...gpuKeys], 'all');
      return Promise.resolve(
        cachedJson(request, {
          apiVersion: 'v1',
          view: 'ubenchx',
          test: 'tpc-skyline',
          params: { test: 'tpc-skyline', gpu },
          gpus: tpcSkylineResults(gpu),
          skuConfigurations: huaweiSkuConfigurations(gpu),
        }),
      );
    }

    if (test === 'mem-bw' || test === 'all') {
      const gpuKeys =
        test === 'all'
          ? [...Object.keys(UBENCHX_RUNS), ...HUAWEI_SKU_GPU_KEYS]
          : Object.keys(UBENCHX_RUNS);
      const gpu = parseEnumParam(s.get('gpu'), 'gpu', ['all', ...gpuKeys], gpuKeys[0]);

      const memBwResults =
        gpu === 'all'
          ? Object.entries(UBENCHX_RUNS).map(([key, run]) => transformUbenchxRun(key, run))
          : UBENCHX_RUNS[gpu]
            ? [transformUbenchxRun(gpu, UBENCHX_RUNS[gpu])]
            : [];

      if (test === 'mem-bw') {
        return Promise.resolve(
          cachedJson(request, {
            apiVersion: 'v1',
            view: 'ubenchx',
            test: 'mem-bw',
            params: { test: 'mem-bw', gpu },
            gpus: memBwResults,
          }),
        );
      }

      // test === 'all': return every test
      const smL2Results =
        rawGpu === null || gpu === 'all'
          ? Object.entries(SM_L2_RUNS).map(([key, run]) => transformSmL2Run(key, run))
          : SM_L2_RUNS[gpu]
            ? [transformSmL2Run(gpu, SM_L2_RUNS[gpu])]
            : [];

      return Promise.resolve(
        cachedJson(request, {
          apiVersion: 'v1',
          view: 'ubenchx',
          test: 'all',
          params: { test: 'all', gpu },
          tests: AVAILABLE_TESTS,
          memBw: { gpus: memBwResults },
          smL2Distance: { gpus: smL2Results },
          coreMemoryProfiles: {
            gpus: coreMemoryProfileResults(rawGpu === null ? 'all' : gpu),
          },
          // Like smL2Distance, default to every GPU rather than mem-bw's first one, and
          // match the GPU key case-insensitively as parseEnumParam does for the others.
          tpcSkyline: {
            skuConfigurations: huaweiSkuConfigurations(rawGpu === null ? 'all' : gpu),
            gpus:
              rawGpu === null || gpu === 'all'
                ? tpcSkylineResults('all')
                : TPC_SKYLINE_RUNS[gpu]
                  ? tpcSkylineResults(gpu)
                  : [],
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
      cachedJson(request, {
        apiVersion: 'v1',
        view: 'ubenchx',
        test: 'sm-l2-distance',
        params: { test: 'sm-l2-distance', gpu },
        gpus: smL2Results,
      }),
    );
  });
}
