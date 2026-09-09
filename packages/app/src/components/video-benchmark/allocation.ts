import { at, rows, text, type Bundle } from './bundle';

export function allocatedGpus(bundle: Partial<Pick<Bundle, 'ci' | 'documents'>>): number | null {
  const job = at(bundle.ci, 'slurm_job');
  const match = /(?:^|,)gres\/gpu=(?<count>\d+)(?:,|$)/u.exec(text(at(job, 'AllocTRES')));
  if (match) {
    const count = Number(match.groups?.count);
    return Number.isSafeInteger(count) && count > 0 ? count : null;
  }
  // AMD's granted full-node job omits GPU AllocTRES. Require the retained step
  // binding and physical UUID inventory; requested GPU counts alone are insufficient.
  if (
    text(at(bundle.ci, 'site', 'cluster')) !== 'mi355x-amds' ||
    text(at(job, 'OverSubscribe')) !== 'NO' ||
    text(at(job, 'NumNodes')) !== '1' ||
    text(at(job, 'TresPerNode')) !== 'gres/gpu:8'
  )
    return null;
  const bound = text(
    at(bundle.documents?.get('binding.json'), 'slurm', 'H3_AMD_ALLOCATION_UUIDS'),
  ).split(',');
  const physical = rows(bundle.documents?.get('amd-allocated-devices.json') ?? null).map((row) =>
    text(at(row, 'uuid')),
  );
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
  return bound.length === 8 &&
    new Set(bound).size === 8 &&
    physical.length === 8 &&
    new Set(physical).size === 8 &&
    bound.every((id) => uuid.test(id) && physical.includes(id))
    ? 8
    : null;
}
