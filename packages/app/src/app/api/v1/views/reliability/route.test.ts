import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetReliabilityStats, mockGetDb } = vi.hoisted(() => ({
  mockGetReliabilityStats: vi.fn(),
  mockGetDb: vi.fn(() => 'mock-sql'),
}));

vi.mock('@semianalysisai/inferencex-db/connection', () => ({
  getDb: mockGetDb,
  FIXTURES_MODE: false,
}));

vi.mock('@semianalysisai/inferencex-db/queries/reliability', () => ({
  getReliabilityStats: mockGetReliabilityStats,
}));

vi.mock('@/lib/api-cache', () => ({
  cachedQuery: (fn: (...args: unknown[]) => unknown) => fn,
  cachedJson: (data: unknown) => Response.json(data),
  cachedText: (data: string, contentType: string) =>
    new Response(data, { headers: { 'Content-Type': contentType } }),
}));

import { aggregateByDateRange } from '@/components/reliability/aggregate';

import { GET } from './route';

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost'));
}

const DAY_MS = 86_400_000;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
}

const ROWS = [
  { hardware: 'h200', date: daysAgo(1), n_success: 9, total: 10 },
  { hardware: 'h200', date: daysAgo(40), n_success: 1, total: 10 },
  { hardware: 'b200', date: daysAgo(1), n_success: 5, total: 5 },
  { hardware: 'h200', date: daysAgo(400), n_success: 10, total: 10 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetReliabilityStats.mockResolvedValue(ROWS);
});

describe('GET /api/v1/views/reliability', () => {
  it('defaults to last-3-months and echoes resolved params', async () => {
    const res = await GET(request('/api/v1/views/reliability'));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.view).toBe('reliability');
    expect(body.apiVersion).toBe('v1');
    expect(body.params).toEqual({ range: 'last-3-months', format: 'json' });
    expect(body.range).toBe('last-3-months');
    // The 400-day-old row is outside last-3-months.
    const h200 = body.hardware.find((h: { key: string }) => h.key === 'h200');
    expect(h200).toMatchObject({ successRate: 50, successes: 10, total: 20 });
    expect(h200.label).toBeTruthy();
    expect(body.generatedFrom).toEqual({ firstDate: daysAgo(400), lastDate: daysAgo(1) });
    expect(mockGetReliabilityStats).toHaveBeenCalledWith('mock-sql');
  });

  it('honors an explicit range preset', async () => {
    const res = await GET(request('/api/v1/views/reliability?range=all-time'));
    const body = await res.json();
    const h200 = body.hardware.find((h: { key: string }) => h.key === 'h200');
    expect(h200).toMatchObject({ successRate: 66.67, successes: 20, total: 30 });
  });

  it('matches the shared aggregateByDateRange output (parity)', async () => {
    const res = await GET(request('/api/v1/views/reliability?range=last-7-days'));
    const body = await res.json();
    const expected = aggregateByDateRange(ROWS)['last-7-days'];
    for (const entry of body.hardware) {
      expect(entry.successRate).toBe(expected[entry.key].rate);
      expect(entry.successes).toBe(expected[entry.key].n_success);
      expect(entry.total).toBe(expected[entry.key].total);
    }
    expect(body.hardware).toHaveLength(Object.keys(expected).length);
  });

  it('rejects an unknown range with the allowed list', async () => {
    const res = await GET(request('/api/v1/views/reliability?range=last-year'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.param).toBe('range');
    expect(body.allowed).toEqual([
      'last-3-days',
      'last-7-days',
      'last-month',
      'last-3-months',
      'all-time',
    ]);
    expect(mockGetReliabilityStats).not.toHaveBeenCalled();
  });

  it('returns a CSV representation with format=csv', async () => {
    const res = await GET(request('/api/v1/views/reliability?range=all-time&format=csv'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    const text = await res.text();
    const lines = text.trim().split('\r\n');
    expect(lines[0]).toBe('range,key,label,successRate,successes,total');
    expect(lines.length).toBe(3); // header + h200 + b200
    expect(lines.some((line) => line.startsWith('all-time,h200,'))).toBe(true);
  });

  it('rejects an unknown format', async () => {
    const res = await GET(request('/api/v1/views/reliability?format=xml'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.param).toBe('format');
    expect(body.allowed).toEqual(['json', 'csv']);
  });

  it('returns 500 when the query throws', async () => {
    mockGetReliabilityStats.mockRejectedValueOnce(new Error('DB unreachable'));
    const res = await GET(request('/api/v1/views/reliability'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal server error');
  });
});
