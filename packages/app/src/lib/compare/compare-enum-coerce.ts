import { Model, Precision, Scenario } from '@/lib/catalog/data-mappings';

export function toModel(value: string): Model | undefined {
  return Object.values(Model).includes(value as Model) ? (value as Model) : undefined;
}

export function toScenario(value: string | null): Scenario | undefined {
  if (!value) return undefined;
  return Object.values(Scenario).includes(value as Scenario) ? (value as Scenario) : undefined;
}

export function toPrecisions(value: string | null): string[] | undefined {
  if (!value) return undefined;
  return Object.values(Precision).includes(value as Precision) ? [value] : undefined;
}
