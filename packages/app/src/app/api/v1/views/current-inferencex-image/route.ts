import { GET as releases } from '@/app/api/v1/framework-releases/route';
import { GET as images } from '@/app/api/v1/latest-images/route';
import {
  baseFramework,
  daysSince,
  getActualLatestTag,
  imageRowDisplayModel,
  imageRowSequence,
  isActiveImageRow,
  isOutdated,
  isStaleAgentx,
  resolveSelectedSequence,
  sequenceOptionsForModel,
} from '@/components/latest-image/latest-image-utils';
import type { FrameworkReleases, LatestImageRow } from '@/lib/api';
import { cachedJson } from '@/lib/api-cache';
import { runViewsRoute } from '@/lib/views-api/errors';
import {
  parseDateParam,
  parseEnumParam,
  parseFreeListParam,
  validateParams,
  validateParams as validateViewParams,
} from '@/lib/views-api/params';
import { VIEW_QUERY_PARAMS } from '@/lib/views-api/registry';
import { readResponse } from '@/lib/views-api/source';
import type { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';
const IMAGE_PARAMS = [
  'model',
  'precision',
  'sequence',
  'spec',
  'hardware',
  'nodeType',
  'frameworks',
  'asOf',
] as const;
export function GET(request: NextRequest) {
  return runViewsRoute('current-inferencex-image', async () => {
    validateViewParams(request.nextUrl.searchParams, VIEW_QUERY_PARAMS['current-inferencex-image']);
    const s = request.nextUrl.searchParams;
    validateParams(s, IMAGE_PARAMS);
    const model = s.get('model') ?? 'all';
    const precision = s.get('precision') ?? 'all';
    const spec = s.get('spec') ?? 'all';
    const hardware = s.get('hardware') ?? 'all';
    const nodeType = parseEnumParam(
      s.get('nodeType'),
      'nodeType',
      ['all', 'single', 'disagg'],
      'single',
    );
    const frameworks = parseFreeListParam(s.get('frameworks'));
    const asOf = parseDateParam(s.get('asOf'), 'asOf') ?? new Date().toISOString().slice(0, 10);
    const [raw, releaseData] = await Promise.all([
      readResponse<LatestImageRow[]>(await images()),
      readResponse<FrameworkReleases>(await releases()),
    ]);
    const active = raw.filter(isActiveImageRow);
    const sequences = sequenceOptionsForModel(active, model);
    const sequence = resolveSelectedSequence(sequences, s.get('sequence') ?? '8k/1k');
    const rows = active
      .filter(
        (row) =>
          (model === 'all' || imageRowDisplayModel(row) === model) &&
          (precision === 'all' || row.precision === precision) &&
          imageRowSequence(row) === sequence &&
          (spec === 'all' || row.spec_method === spec) &&
          (hardware === 'all' || row.hardware === hardware) &&
          (nodeType === 'all' || (nodeType === 'disagg' ? row.disagg : !row.disagg)) &&
          (frameworks.length === 0 || frameworks.includes(baseFramework(row.framework))),
      )
      .toSorted((a, b) => a.date.localeCompare(b.date))
      .map((row) => {
        const ageDays = daysSince(row.date, new Date(`${asOf}T00:00:00Z`));
        const actualLatest = getActualLatestTag(row.framework, releaseData);
        return {
          ...row,
          displayModel: imageRowDisplayModel(row),
          sequence: imageRowSequence(row),
          ageDays,
          actualLatest,
          outdated: isOutdated(row.image, actualLatest),
          staleAgentx: isStaleAgentx(row.benchmark_type, ageDays),
        };
      });
    return cachedJson({
      apiVersion: 'v1',
      view: 'current-inferencex-image',
      params: { model, precision, spec, hardware, nodeType, frameworks, sequence, asOf },
      options: { sequences },
      rows,
      releases: releaseData,
    });
  });
}
