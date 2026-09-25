import type { OperatorXStatus } from '@semianalysisai/inferencex-db/operatorx/normalize';

export function formatUs(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(2)} ms`;
  return `${value < 10 ? value.toFixed(2) : value.toFixed(1)} µs`;
}

export function formatTflops(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value < 1 ? value.toFixed(3) : value < 100 ? value.toFixed(1) : value.toFixed(0);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 16).replace('T', ' ');
}

/** Short kernel/class name: drop templates, argument lists and namespaces beyond two. */
export function shortKernel(name: string): string {
  const base = name
    .replace(/^void /u, '')
    .replace(/<.*$/u, '')
    .replace(/\(.*$/u, '');
  return base.split('::').slice(-2).join('::');
}

export const STATUS_ORDER: OperatorXStatus[] = ['ok', 'unsupported', 'error', 'missing'];

export const STATUS_CLASS: Record<OperatorXStatus, string> = {
  ok: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  unsupported: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
  error: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  missing: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
};

export const GITHUB_REPO_URL = 'https://github.com/SemiAnalysisAI/InferenceX';
