import { Model, Precision, Sequence } from '@/lib/data-mappings';

export function toModel(value: string): Model | undefined {
  return Object.values(Model).includes(value as Model) ? (value as Model) : undefined;
}

export function toSequence(value: string | null): Sequence | undefined {
  if (!value) return undefined;
  return Object.values(Sequence).includes(value as Sequence) ? (value as Sequence) : undefined;
}

export function toPrecisions(value: string | null): string[] | undefined {
  if (!value) return undefined;
  return Object.values(Precision).includes(value as Precision) ? [value] : undefined;
}
