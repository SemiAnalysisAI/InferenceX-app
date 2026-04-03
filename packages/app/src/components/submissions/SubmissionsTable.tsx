'use client';

import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { track } from '@/lib/analytics';
import { MODEL_PREFIX_MAPPING, getModelLabel } from '@/lib/data-mappings';
import type { SubmissionSummaryRow } from '@/lib/submissions-types';
import { getFrameworkLabel } from '@/lib/utils';
import {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';

import { getVendor } from './submissions-utils';

function DetailItem({
  label,
  tip,
  children,
}: {
  label: string;
  tip: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      <TooltipRoot>
        <TooltipTrigger asChild>
          <Info className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top" collisionPadding={10}>
          <span className="text-xs">{tip}</span>
        </TooltipContent>
      </TooltipRoot>
      <span className="font-medium">{children}</span>
    </div>
  );
}

type SortKey =
  | 'hardware'
  | 'model'
  | 'precision'
  | 'framework'
  | 'latest_date'
  | 'total_datapoints';
type SortDir = 'asc' | 'desc';

interface SubmissionsTableProps {
  data: SubmissionSummaryRow[];
}

function getModelDisplayName(dbModel: string): string {
  // MODEL_PREFIX_MAPPING maps prefix → display model name
  const displayModel = MODEL_PREFIX_MAPPING[dbModel];
  if (displayModel) return getModelLabel(displayModel);
  return dbModel;
}

export default function SubmissionsTable({ data }: SubmissionsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('latest_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('desc');
      }
      track('submissions_table_sorted', { column: key });
    },
    [sortKey],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(
      (row) =>
        row.hardware.includes(q) ||
        row.model.includes(q) ||
        row.framework.includes(q) ||
        row.precision.includes(q) ||
        getVendor(row.hardware).toLowerCase().includes(q) ||
        getModelDisplayName(row.model).toLowerCase().includes(q),
    );
  }, [data, search]);

  const sorted = useMemo(() => {
    const mult = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mult;
      return String(av).localeCompare(String(bv)) * mult;
    });
  }, [filtered, sortKey, sortDir]);

  const toggleRow = useCallback((key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        track('submissions_row_collapsed', { config: key });
      } else {
        next.add(key);
        track('submissions_row_expanded', { config: key });
      }
      return next;
    });
  }, []);

  const rowKey = (row: SubmissionSummaryRow) =>
    `${row.model}_${row.hardware}_${row.framework}_${row.precision}_${row.spec_method}_${row.disagg}_${row.is_multinode}_${row.num_prefill_gpu}_${row.num_decode_gpu}_${row.prefill_tp}_${row.prefill_ep}_${row.decode_tp}_${row.decode_ep}`;

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="px-3 py-2 text-left text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey === field && (
          <span className="text-foreground">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </th>
  );

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onBlur={() => {
          if (search.trim()) track('submissions_table_searched', { query: search.trim() });
        }}
        placeholder="Search configs..."
        className="w-full max-w-sm px-3 py-1.5 rounded-md border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-8 px-2" />
              <SortHeader label="GPU" field="hardware" />
              <SortHeader label="Model" field="model" />
              <SortHeader label="Precision" field="precision" />
              <SortHeader label="Framework" field="framework" />
              <SortHeader label="Latest Run" field="latest_date" />
              <SortHeader label="Datapoints" field="total_datapoints" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((row) => {
              const key = rowKey(row);
              const isExpanded = expandedRows.has(key);
              return (
                <SubmissionRow
                  key={key}
                  row={row}
                  isExpanded={isExpanded}
                  onToggle={() => toggleRow(key)}
                />
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  {search ? 'No matching submissions found.' : 'No submission data available.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {filtered.length} config{filtered.length !== 1 ? 's' : ''} ·{' '}
        {filtered.reduce((sum, r) => sum + r.total_datapoints, 0).toLocaleString()} total datapoints
      </p>
    </div>
  );
}

function SubmissionRow({
  row,
  isExpanded,
  onToggle,
}: {
  row: SubmissionSummaryRow;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const vendor = getVendor(row.hardware);

  return (
    <>
      <tr className="hover:bg-muted/30 cursor-pointer transition-colors" onClick={onToggle}>
        <td className="px-2 py-2 text-muted-foreground">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </td>
        <td className="px-3 py-2 font-medium">
          <span className="flex items-center gap-1.5">
            <span
              className={`inline-block w-2 h-2 rounded-full ${vendor === 'NVIDIA' ? 'bg-green-500' : vendor === 'AMD' ? 'bg-red-500' : 'bg-gray-400'}`}
            />
            {row.hardware.toUpperCase()}
          </span>
        </td>
        <td className="px-3 py-2">{getModelDisplayName(row.model)}</td>
        <td className="px-3 py-2 uppercase">{row.precision}</td>
        <td className="px-3 py-2">{getFrameworkLabel(row.framework)}</td>
        <td className="px-3 py-2 tabular-nums">{row.latest_date}</td>
        <td className="px-3 py-2 tabular-nums">{row.total_datapoints.toLocaleString()}</td>
      </tr>
      {isExpanded && (
        <tr className="bg-muted/20">
          <td />
          <td colSpan={6} className="px-3 py-3">
            <TooltipProvider>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-2 text-sm">
                <DetailItem label="Vendor:" tip="GPU manufacturer">
                  {vendor}
                </DetailItem>
                <DetailItem label="First Run:" tip="Date of the earliest benchmark for this config">
                  <span className="tabular-nums">{row.first_date}</span>
                </DetailItem>
                <DetailItem
                  label="Run Days:"
                  tip="Number of distinct days this config was benchmarked"
                >
                  <span className="tabular-nums">{row.run_days}</span>
                </DetailItem>
                <DetailItem
                  label="Spec Method:"
                  tip="Speculative decoding method (e.g. MTP, Eagle)"
                >
                  {row.spec_method || 'none'}
                </DetailItem>
                <DetailItem
                  label="Disaggregated:"
                  tip="Prefill and decode run on separate GPU pools"
                >
                  {row.disagg ? 'Yes' : 'No'}
                </DetailItem>
                <DetailItem label="Multinode:" tip="Config spans multiple physical nodes">
                  {row.is_multinode ? 'Yes' : 'No'}
                </DetailItem>
                <DetailItem
                  label="Total GPUs:"
                  tip="Total physical GPUs. When disaggregated, prefill + decode are separate pools"
                >
                  <span className="tabular-nums">
                    {row.disagg ? row.num_prefill_gpu + row.num_decode_gpu : row.num_prefill_gpu}
                  </span>
                </DetailItem>
                <DetailItem
                  label="Prefill GPUs:"
                  tip="GPUs for the prefill (prompt processing) phase"
                >
                  <span className="tabular-nums">{row.num_prefill_gpu}</span>
                </DetailItem>
                <DetailItem label="Decode GPUs:" tip="GPUs for the decode (token generation) phase">
                  <span className="tabular-nums">{row.num_decode_gpu}</span>
                </DetailItem>
                <DetailItem
                  label="Prefill TP/EP:"
                  tip="Tensor parallelism / Expert parallelism for prefill"
                >
                  <span className="tabular-nums">
                    {row.prefill_tp ?? '—'}/{row.prefill_ep ?? '—'}
                  </span>
                </DetailItem>
                <DetailItem
                  label="Decode TP/EP:"
                  tip="Tensor parallelism / Expert parallelism for decode"
                >
                  <span className="tabular-nums">
                    {row.decode_tp ?? '—'}/{row.decode_ep ?? '—'}
                  </span>
                </DetailItem>
                <DetailItem
                  label="Sequences:"
                  tip="Distinct ISL/OSL sequence length combinations tested"
                >
                  <span className="tabular-nums">{row.distinct_sequences ?? '—'}</span>
                </DetailItem>
                <DetailItem label="Concurrencies:" tip="Distinct concurrency levels tested">
                  <span className="tabular-nums">
                    {row.distinct_concurrencies ?? '—'}
                    {row.max_concurrency ? ` (max ${row.max_concurrency})` : ''}
                  </span>
                </DetailItem>
                <div className="col-span-2 md:col-span-4">
                  <DetailItem
                    label="Image:"
                    tip="Container image used for this benchmark configuration"
                  >
                    <span className="font-mono text-xs break-all">{row.image ?? '—'}</span>
                  </DetailItem>
                </div>
              </div>
            </TooltipProvider>
          </td>
        </tr>
      )}
    </>
  );
}
