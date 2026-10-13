import { isCjkTerm, tokenize } from './tokenize';

/**
 * Concept groups give the site search its semantic reach without shipping an
 * embedding model. A query term that belongs to a group also matches the
 * other members at a reduced weight, so "energy" finds "J/token" and "power"
 * pages, and "cheapest" finds TCO and $/M tok content.
 *
 * Keep groups tight: every member should be a reasonable answer when the user
 * types any other member. Multi-word phrases are tokenized and each resulting
 * term joins the group. Chinese terms let /zh queries reach the same concepts.
 */
const CONCEPT_GROUPS: readonly (readonly string[])[] = [
  ['power', 'energy', 'watt', 'joule', 'efficiency', 'powerx', '功耗', '能耗', '能效', '功率'],
  ['cost', 'price', 'cheap', 'cheapest', 'tco', 'dollar', 'spend', 'pricing', '成本', '价格'],
  ['throughput', 'tok/s', 'tokens per second', 'speed', 'fast', 'fastest', '吞吐量', '速度'],
  ['latency', 'ttft', 'tpot', 'itl', 'delay', 'slow', 'responsiveness', '延迟'],
  ['interactivity', 'tok/s/user', 'per user', 'user speed', '交互性'],
  ['gpu', 'chip', 'accelerator', 'hardware', 'sku', 'silicon', '芯片', '加速器', '硬件'],
  ['nvidia', 'h100', 'h200', 'b200', 'b300', 'gb200', 'gb300', 'blackwell', 'hopper', 'rubin'],
  ['amd', 'mi300x', 'mi325x', 'mi355x', 'mi455x', 'instinct', 'rocm'],
  ['tpu', 'google', 'trillium', 'ironwood'],
  ['agentic', 'agent', 'agentx', 'coding', 'multi-turn', 'trace', 'replay', '智能体'],
  ['cache', 'kv', 'prefix', 'reuse', 'offload', 'hit rate', '缓存'],
  ['memory', 'hbm', 'dram', 'vram', 'capacity', 'nand', '内存', '显存'],
  ['accuracy', 'evaluation', 'eval', 'quality', 'score', 'gsm8k', '评估', '准确率'],
  ['reliability', 'failure', 'error', 'uptime', 'stability', '可靠性'],
  ['quantization', 'precision', 'fp8', 'fp4', 'nvfp4', 'mxfp4', 'bf16', 'int4', '精度', '量化'],
  ['speculative', 'spec decode', 'mtp', 'draft', 'eagle', 'acceptance', '投机解码'],
  ['disaggregated', 'disagg', 'prefill', 'decode', 'p/d', 'multinode', 'multi-node', '分离'],
  ['framework', 'engine', 'vllm', 'sglang', 'tensorrt', 'trt-llm', 'dynamo', 'atom', '框架'],
  ['network', 'interconnect', 'nvlink', 'infiniband', 'ethernet', 'scale-up', 'topology', '网络'],
  ['rank', 'ranking', 'leaderboard', 'best', 'top', '排名', '排行'],
  ['compare', 'comparison', 'versus', 'vs', 'head-to-head', '对比', '比较'],
  ['history', 'historical', 'trend', 'over time', 'changelog', '历史', '趋势'],
  ['article', 'blog', 'post', 'whitepaper', 'paper', 'research', '文章', '白皮书'],
  ['api', 'endpoint', 'openapi', 'json', 'csv', 'export', 'download', '接口'],
  ['deepseek', 'dsv4', 'r1'],
  ['kimi', 'moonshot', 'k2', 'k3'],
  ['qwen', 'alibaba'],
  ['model', 'llm', 'weights', '模型'],
];

export type ConceptMap = ReadonlyMap<string, readonly string[]>;

function buildConceptMap(): ConceptMap {
  const map = new Map<string, Set<string>>();
  for (const group of CONCEPT_GROUPS) {
    // Single Latin letters (from "tok/s", "p/d") are too ambiguous to expand.
    const terms = new Set(
      group.flatMap((phrase) => tokenize(phrase)).filter((t) => t.length > 1 || isCjkTerm(t)),
    );
    for (const term of terms) {
      const related = map.get(term) ?? new Set<string>();
      for (const other of terms) if (other !== term) related.add(other);
      map.set(term, related);
    }
  }
  return new Map([...map].map(([term, related]) => [term, [...related]]));
}

let cached: ConceptMap | null = null;

/** Lazily built term -> related-terms map. */
export function conceptMap(): ConceptMap {
  cached ??= buildConceptMap();
  return cached;
}

/** Related concept terms for a normalized query term (empty when none). */
export function relatedTerms(term: string): readonly string[] {
  return conceptMap().get(term) ?? [];
}
