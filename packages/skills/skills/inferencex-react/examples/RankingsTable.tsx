/**
 * RankingsTable — sortable cheapest-GPU / fastest-GPU rankings table.
 *
 * Complete single-file example. Dependencies: react, swr (via ./hooks). No chart library.
 * Data: GET /api/v1/views/rankings
 *       -> { kind, entries: [{ model, scenario, rows: [{rank, hardware, chip, value, unit,
 *            framework, precision}] }] }
 *
 * Usage: <RankingsTable kind="cheapest-gpu" model="DeepSeek-V4-Pro" />
 */

import React, { useMemo, useState } from 'react';
import { useRankingsView } from './hooks';
import type { RankingRow } from './types';

type SortKey = keyof Pick<
  RankingRow,
  'rank' | 'hardware' | 'chip' | 'value' | 'framework' | 'precision'
>;

export interface RankingsTableProps {
  /** 'cheapest-gpu' (API default) or 'fastest-gpu'. */
  kind?: 'cheapest-gpu' | 'fastest-gpu';
  /** Display model name or compare slug; omit for all models. */
  model?: string;
  /** 'single_turn_8k1k' | 'agentx' (aliases '8k-1k' | 'agentic'); omit for both. */
  scenario?: string;
}

export function RankingsTable({ kind = 'cheapest-gpu', model, scenario }: RankingsTableProps) {
  const { data, error, isLoading } = useRankingsView({ kind, model, scenario });
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [asc, setAsc] = useState(true);

  const entries = data?.entries ?? [];

  const sortedEntries = useMemo(
    () =>
      entries.map((e) => ({
        ...e,
        rows: [...e.rows].sort((a, b) => {
          const av = a[sortKey];
          const bv = b[sortKey];
          const cmp =
            typeof av === 'number' && typeof bv === 'number'
              ? av - bv
              : String(av).localeCompare(String(bv));
          return asc ? cmp : -cmp;
        }),
      })),
    [entries, sortKey, asc],
  );

  if (isLoading) return <p>Loading InferenceX rankings…</p>;
  if (error) return <p role="alert">Failed to load: {String(error.message ?? error)}</p>;
  if (!data) return null;

  const onSort = (key: SortKey) => {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(true);
    }
  };

  const header = (key: SortKey, title: string) => (
    <th
      onClick={() => onSort(key)}
      style={{ cursor: 'pointer', textAlign: 'left', padding: '4px 10px', whiteSpace: 'nowrap' }}
      aria-sort={sortKey === key ? (asc ? 'ascending' : 'descending') : 'none'}
    >
      {title} {sortKey === key ? (asc ? '▲' : '▼') : ''}
    </th>
  );

  return (
    <div>
      <h3 style={{ margin: '0 0 4px' }}>
        {data.kind === 'cheapest-gpu' ? 'Cheapest GPU' : 'Fastest GPU'} rankings
      </h3>
      <p style={{ fontSize: 12, color: '#757575', margin: '0 0 12px' }}>
        InferenceX views API · generated {data.generatedAt}
      </p>
      {sortedEntries.map((entry) => (
        <section key={`${entry.model}-${entry.scenario}`} style={{ marginBottom: 24 }}>
          <h4 style={{ margin: '0 0 6px' }}>
            {entry.model} · {entry.scenario}
          </h4>
          <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                {header('rank', '#')}
                {header('hardware', 'Hardware')}
                {header('chip', 'Chip')}
                {header('value', 'Value')}
                {header('framework', 'Framework')}
                {header('precision', 'Precision')}
              </tr>
            </thead>
            <tbody>
              {entry.rows.map((r) => (
                <tr key={`${r.rank}-${r.hardware}`} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '4px 10px' }}>{r.rank}</td>
                  <td style={{ padding: '4px 10px' }}>{r.hardware}</td>
                  <td style={{ padding: '4px 10px' }}>{r.chip}</td>
                  <td style={{ padding: '4px 10px', fontVariantNumeric: 'tabular-nums' }}>
                    {r.value.toLocaleString(undefined, { maximumSignificantDigits: 4 })} {r.unit}
                  </td>
                  <td style={{ padding: '4px 10px' }}>{r.framework}</td>
                  <td style={{ padding: '4px 10px' }}>{r.precision}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

export default RankingsTable;
