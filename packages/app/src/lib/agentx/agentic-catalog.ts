import { FIXTURES_MODE, getDb } from '@semianalysisai/inferencex-db/connection';

import {
  type AgenticCatalogEntry,
  getAgenticCatalog,
} from '@semianalysisai/inferencex-db/queries/agentic-catalog';

import { FRAMEWORK_LABELS, HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { cachedQuery } from '@/lib/cache/api-cache';
import { COMPARE_MODEL_SLUGS } from '@/lib/compare/compare-slug';
import { loadFixture } from '@/lib/testing/test-fixtures';

export const getCachedAgenticCatalog = cachedQuery(() => {
  if (FIXTURES_MODE) return Promise.resolve(loadFixture<AgenticCatalogEntry[]>('agentic-catalog'));

  return getAgenticCatalog(getDb());
}, 'agentic-catalog');

export interface AgenticCatalogCard {
  id: number;
  label: string;
  hardwareKey: string;
  hardwareLabel: string;
  frameworkLabel: string;
  precisionLabel: string;
  vendor: string;
  arch: string;
  points: number;
  minConc: number;
  maxConc: number;
  latestDate: string;
}

export interface AgenticCatalogModelGroup {
  key: string;
  label: string;
  cards: AgenticCatalogCard[];
  totalPoints: number;
}

function buildModelLabels(): Map<string, string> {
  const labels = new Map<string, string>();
  for (const model of COMPARE_MODEL_SLUGS) {
    for (const dbKey of model.dbKeys) labels.set(dbKey, model.label);
  }
  return labels;
}

function precisionLabel(precision: string): string {
  return precision.toUpperCase();
}

export function groupAgenticCatalog(rows: AgenticCatalogEntry[]): AgenticCatalogModelGroup[] {
  const modelLabels = buildModelLabels();
  const groups = new Map<string, AgenticCatalogModelGroup>();

  for (const row of rows) {
    const modelLabel = modelLabels.get(row.model);
    const hw = HW_REGISTRY[row.hardware];
    if (!modelLabel || !hw) continue;

    const frameworkLabel = FRAMEWORK_LABELS[row.framework] ?? row.framework;
    const group = groups.get(row.model) ?? {
      key: row.model,
      label: modelLabel,
      cards: [],
      totalPoints: 0,
    };
    group.cards.push({
      id: row.id,
      label: `${hw.label} · ${frameworkLabel}`,
      hardwareKey: row.hardware,
      hardwareLabel: hw.label,
      frameworkLabel,
      precisionLabel: precisionLabel(row.precision),
      vendor: hw.vendor,
      arch: hw.arch,
      points: row.points,
      minConc: row.minConc,
      maxConc: row.maxConc,
      latestDate: row.latestDate,
    });
    group.totalPoints += row.points;
    groups.set(row.model, group);
  }

  const ordered = [...groups.values()];
  for (const group of ordered) {
    group.cards.sort(
      (a, b) =>
        (HW_REGISTRY[a.hardwareKey]?.sort ?? 0) - (HW_REGISTRY[b.hardwareKey]?.sort ?? 0) ||
        a.label.localeCompare(b.label),
    );
  }
  ordered.sort((a, b) => b.totalPoints - a.totalPoints || a.label.localeCompare(b.label));
  return ordered;
}

export async function getAgenticCatalogGroups(): Promise<AgenticCatalogModelGroup[]> {
  return groupAgenticCatalog(await getCachedAgenticCatalog());
}
