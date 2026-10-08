import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbClient } from '../connection';
import { getAgenticMemory, MEMORY_LOG_CHARS } from './agentic-memory';
import { getServerLogChunk, getServerLogFileNames } from './server-logs';

vi.mock('./server-logs', () => ({ getServerLogChunk: vi.fn(), getServerLogFileNames: vi.fn() }));
const row = {
  id: 1,
  model: 'any-model',
  framework: 'vllm',
  hardware: 'b300',
  date: '2026-08-21',
  image: 'image:tag',
  conc: 8,
  disagg: false,
  metrics: { gpu_kv_cache_usage_pct: 0.9, kv_cache_pool_tokens: 1000 },
};
const db = (rows = [row]) => vi.fn().mockResolvedValue(rows) as unknown as DbClient;
beforeEach(() => vi.clearAllMocks());
describe('memory query', () => {
  it('returns missing rather than fake zeros and keeps tokens separate', async () => {
    vi.mocked(getServerLogFileNames).mockResolvedValue([]);
    const result = await getAgenticMemory(db(), 1);
    expect(result).toMatchObject({
      status: 'missing',
      ranks: [],
      kvPoolTokens: 1000,
      kvUsageMaxFraction: 0.9,
    });
  });
  it('bounds file count and size; reports truncation', async () => {
    vi.mocked(getServerLogFileNames).mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => `worker${i}.log`),
    );
    vi.mocked(getServerLogChunk).mockResolvedValue({
      fileName: 'worker.log',
      serverLog: '',
      offset: 0,
      nextOffset: 10,
    });
    const result = await getAgenticMemory(db(), 1);
    expect(getServerLogChunk).toHaveBeenCalledTimes(16);
    expect(getServerLogChunk).toHaveBeenCalledWith(
      expect.anything(),
      1,
      0,
      MEMORY_LOG_CHARS,
      expect.any(String),
    );
    expect(result!.filesOmitted).toBe(4);
    expect(result!.files.every((f) => f.truncated)).toBe(true);
  });
  it('does not access logs for unsupported frameworks or missing rows', async () => {
    expect(await getAgenticMemory(db([]), 1)).toBeNull();
    const result = await getAgenticMemory(db([{ ...row, framework: 'trtllm' }]), 1);
    expect(result!.status).toBe('unsupported');
    expect(getServerLogFileNames).not.toHaveBeenCalled();
  });
});
