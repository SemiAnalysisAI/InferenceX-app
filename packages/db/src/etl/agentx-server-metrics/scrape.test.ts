import { describe, expect, it } from 'vitest';

import { fraction, gaugeStat, parseScrapeCsv, sumByLabel, sumStat } from './scrape';

const CSV = `# AIPerf Server Metrics Export (CSV)
#
Endpoint,Type,Metric,Unit,avg,min,max,std,p50,engine,model_name,Description
localhost:8000,gauge,vllm:kv_cache_usage_perc,ratio,0.0559,0.0000,0.1697,0.04,0.05,0,Kimi,"KV-cache usage, 1 means 100 percent"

Endpoint,Type,Metric,Unit,total,rate,rate_avg,engine,model_name,source,Description
localhost:8000,counter,vllm:prompt_tokens,tokens,1000.0000,1.0,1.0,0,Kimi,,Prefill tokens.
localhost:8001,counter,vllm:prompt_tokens,tokens,500.0000,1.0,1.0,1,Kimi,,Prefill tokens.
localhost:8000,counter,vllm:prompt_tokens_by_source,,700.0000,1.0,1.0,0,Kimi,local_compute,"By source, ""quoted"""
localhost:8001,counter,vllm:prompt_tokens_by_source,,300.0000,1.0,1.0,1,Kimi,local_compute,By source.

Endpoint,Metric,Key,Value,Description
localhost:8000,vllm:cache_config_info,block_size,64,Info.
`;

describe('parseScrapeCsv', () => {
  const scrape = parseScrapeCsv(CSV);

  it('reads each section with its own stat and label columns', () => {
    expect(scrape.get('vllm:kv_cache_usage_perc')).toEqual([
      {
        endpoint: 'localhost:8000',
        labels: { engine: '0', model_name: 'Kimi' },
        stats: { avg: 0.0559, min: 0, max: 0.1697, std: 0.04, p50: 0.05 },
      },
    ]);
    expect(scrape.get('vllm:prompt_tokens')?.[1]?.labels).toEqual({
      engine: '1',
      model_name: 'Kimi',
    });
  });

  it('skips info sections, which have no numeric series', () => {
    expect(scrape.has('vllm:cache_config_info')).toBe(false);
  });

  it('sums counter totals across endpoints and groups them by label', () => {
    expect(sumStat(scrape, 'vllm:prompt_tokens')).toBe(1500);
    expect(sumStat(scrape, 'missing')).toBeNull();
    expect(sumByLabel(scrape, 'vllm:prompt_tokens_by_source', 'source')).toEqual(
      new Map([['local_compute', 1000]]),
    );
  });

  it('takes the gauge maximum and normalizes percentages', () => {
    expect(gaugeStat(scrape, 'vllm:kv_cache_usage_perc')).toBe(0.1697);
    expect(fraction(42)).toBe(0.42);
    expect(fraction(0.42)).toBe(0.42);
  });
});
