import { GET as submissions } from '@/app/api/v1/submissions/route';
import {
  computeCumulative,
  computePreviousImages,
  computePreviousRuns,
  computeTotalStats,
  getVendor,
  groupVolumeByWeek,
  selectVolumeRows,
  submissionRowKey,
} from '@/components/submissions/submissions-utils';
import { cachedJson } from '@/lib/api-cache';
import type { SubmissionsResponse } from '@/lib/submissions-types';
import { runViewsRoute } from '@/lib/views-api/errors';
import {
  parseBoolParam,
  parseEnumParam,
  parseListParam,
  parseNumberParam,
  validateParams as validateViewParams,
} from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import { readResponse } from '@/lib/views-api/source';
import { DB_MODEL_TO_DISPLAY } from '@semianalysisai/inferencex-constants';
import type { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';
export function GET(request: NextRequest) {
  return runViewsRoute('submissions', async () => {
    validateViewParams(request.nextUrl.searchParams, VIEW_QUERY_PARAMS['submissions']);
    const s = request.nextUrl.searchParams;
    const search = (s.get('search') ?? '').toLowerCase();
    const sort = parseEnumParam(
      s.get('sort'),
      'sort',
      ['hardware', 'model', 'precision', 'spec_method', 'framework', 'date', 'total_datapoints'],
      'date',
    );
    const direction = parseEnumParam(s.get('direction'), 'direction', ['asc', 'desc'], 'desc');
    const limit = parseNumberParam(s.get('limit'), 'limit', 100, {
      min: 1,
      max: 10000,
      integer: true,
    });
    const offset = parseNumberParam(s.get('offset'), 'offset', 0, { min: 0, integer: true });
    const mode = parseEnumParam(s.get('mode'), 'mode', ['weekly', 'cumulative'], 'weekly');
    const onChangeOnly = parseBoolParam(s.get('onChangeOnly'), 'onChangeOnly', true);
    const lines = s.has('lines')
      ? parseListParam(s.get('lines'), 'lines', ['nvidia', 'amd', 'total'])
      : ['nvidia', 'amd', 'total'];
    const { summary, volume } = await readResponse<SubmissionsResponse>(await submissions());
    const previousRuns = computePreviousRuns(summary);
    const previousImages = computePreviousImages(summary);
    const rows = summary
      .filter(
        (row) =>
          !search.trim() ||
          [
            row.hardware,
            row.model,
            row.framework,
            row.precision,
            row.spec_method,
            getVendor(row.hardware),
            DB_MODEL_TO_DISPLAY[row.model] ?? row.model,
          ].some((value) => value.toLowerCase().includes(search)),
      )
      .toSorted(
        (a, b) =>
          (typeof a[sort] === 'number' && typeof b[sort] === 'number'
            ? Number(a[sort]) - Number(b[sort])
            : String(a[sort]).localeCompare(String(b[sort]))) * (direction === 'asc' ? 1 : -1),
      );
    const selectedVolume = selectVolumeRows(volume, mode, onChangeOnly);
    const chart =
      mode === 'weekly'
        ? groupVolumeByWeek(selectedVolume).map((row) => ({ date: row.week, ...row }))
        : computeCumulative(selectedVolume);
    return cachedJson({
      apiVersion: 'v1',
      view: 'submissions',
      params: { search, sort, direction, offset, limit, mode, onChangeOnly, lines },
      total: rows.length,
      stats: computeTotalStats(summary),
      rows: rows.slice(offset, offset + limit).map((row) => ({
        ...row,
        previousRun: previousRuns.get(submissionRowKey(row)) ?? null,
        previousImage: previousImages.get(submissionRowKey(row)) ?? null,
      })),
      series: lines.map((key) => ({
        key,
        points: chart.map((row) => ({
          date: row.date,
          value: key === 'amd' ? row.nonNvidia : row[key as 'nvidia' | 'total'],
        })),
      })),
    });
  });
}
