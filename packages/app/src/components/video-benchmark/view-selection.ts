import { allocatedGpus } from './allocation';
import { at, number, ROLES, rows, text, type Json } from './bundle';
import { servingCells } from './serving';
import { storedBundle, storedFidelityBundle, type StoredSource } from './stored';

/** Data behind the public result panels, without browser-only media state. */
export function selectVideoEvidence(
  source: StoredSource,
  selection: {
    cell: string | null;
    slot: string | null;
    phase: 'measurement' | 'startup' | 'warmup';
    gpuBasis: 'participating' | 'allocated';
  },
) {
  if (source.kind === 'fidelity') {
    const bundle = storedFidelityBundle(source);
    const slots = rows(at(bundle.portable, 'slots'));
    const slot = slots.find((item) => at(item, 'slot_id') === selection.slot) ?? slots[0] ?? null;
    return {
      kind: 'fidelity',
      source: source.id,
      slot: text(at(slot, 'slot_id')),
      selectedSlot: slot,
      comparison: bundle.comparison,
      comparisonSha256: bundle.comparisonSha256,
    };
  }
  const bundle = storedBundle(source);
  const cells = servingCells(bundle);
  const current = cells.find((cell) => cell.id === selection.cell) ?? cells[0];
  if (current) {
    const verified = at(current.cell, 'verified') === true;
    const metrics = verified ? at(current.cell, 'metrics') : null;
    const records = rows(at(current.run, 'records'));
    const record =
      records.find((item) => at(item, 'slot_id') === selection.slot) ??
      records.find((item) => at(item, 'phase') === 'measurement') ??
      records[0] ??
      null;
    const uuids = rows(at(current.spec, 'gpu_uuids')).map(text);
    const participating =
      uuids.length > 0 && uuids.every(Boolean) && new Set(uuids).size === uuids.length
        ? uuids.length
        : null;
    const allocated = allocatedGpus(bundle);
    const gpuCount = selection.gpuBasis === 'participating' ? participating : allocated;
    const rate = (value: Json) => {
      const n = number(value);
      return n !== null && gpuCount !== null && gpuCount > 0 ? (n * 3600) / gpuCount : null;
    };
    const phase = at(current.power, 'phases', selection.phase);
    return {
      kind: 'serving',
      source: source.id,
      cell: current.id,
      slot: text(at(record, 'slot_id')),
      selectedCell: current,
      selectedSlot: record,
      verified,
      metrics,
      participating,
      allocated,
      gpuCount,
      clipsPerGpuHour: rate(at(metrics, 'valid_clips_per_second')),
      videoSecondsPerGpuHour: rate(at(metrics, 'serving', 'valid_video_seconds_per_second')),
      power: verified && at(phase, 'valid') === true ? phase : null,
    };
  }
  const observations = (role: string) => [
    ...rows(at(bundle.report, 'roles', role, 'observations')),
    ...rows(at(bundle.report, 'roles', role, 'warmups')),
  ];
  const slots = [
    ...new Map(ROLES.flatMap(observations).map((row) => [text(at(row, 'slot_id')), row])).keys(),
  ];
  const slot =
    selection.slot && slots.includes(selection.slot) ? selection.slot : (slots[0] ?? null);
  return {
    kind: 'paired',
    source: source.id,
    slot,
    roles: Object.fromEntries(
      ROLES.map((role) => {
        const phase = at(bundle.result, 'roles', role, 'power', 'phases', selection.phase);
        return [
          role,
          {
            observation: observations(role).find((row) => at(row, 'slot_id') === slot) ?? null,
            power: at(phase, 'valid') === true ? phase : null,
          },
        ];
      }),
    ),
    comparison: slot ? at(bundle.report, 'slot_comparisons', slot) : null,
  };
}
