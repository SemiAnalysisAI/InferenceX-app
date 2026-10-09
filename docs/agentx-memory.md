# AgentX memory view

The Memory tab is available on every persisted AgentX model's point page at
`/inference/agentic/<id>?view=memory` and its `/zh` sibling. It compares aggregated
serving points in the same workflow run and topology. This is a startup-log
diagnostic, not a new GPU-memory telemetry collector.

## Accounting

- vLLM: parse the worker's post-capture `Actual usage is ...` report. Keep weight,
  peak activation, non-torch, graph and current KV-pool GiB separately. Use the
  explicit device total, not startup free memory or the configured utilization
  target, for percentages.
- SGLang: weight-loading and graph-capture values are free-memory deltas. Keep
  this basis in the API. Parse explicit `KV Cache is allocated` reports, including
  separate K/V buffers and combined MLA buffers. Do not treat `available_bytes`,
  `Memory pool end. avail mem`, or `VA upper bound` as allocated KV memory.
- SGLang reports these quantities as `GB`, but the inspected implementation uses
  binary GiB: [allocation size conversion](https://github.com/sgl-project/sglang/blob/e7530a3a26a7a7e260ba51ae003a0c8d6b422837/python/sglang/srt/mem_cache/memory_pool.py#L2056-L2084),
  [available-memory conversion](https://github.com/sgl-project/sglang/blob/e7530a3a26a7a7e260ba51ae003a0c8d6b422837/python/sglang/srt/utils/common.py#L432-L580),
  and [weight delta calculation](https://github.com/sgl-project/sglang/blob/e7530a3a26a7a7e260ba51ae003a0c8d6b422837/python/sglang/srt/model_executor/model_runner.py#L1290-L1306).
  This source inspection is not verification of every historical image.
- Both backend adapters use max-first statistics and a max across series for
  `gpu_kv_cache_usage_pct`: [vLLM adapter](https://github.com/SemiAnalysisAI/InferenceX/blob/a13bc359ce399c59e02a6fb786d78a564eb8342f/inferencex-e2e/infx/results/agentic/backends/vllm.py#L99-L105)
  and [SGLang adapter](https://github.com/SemiAnalysisAI/InferenceX/blob/a13bc359ce399c59e02a6fb786d78a564eb8342f/inferencex-e2e/infx/results/agentic/backends/sglang.py#L79-L87).
  Keep it separate from allocated GiB. It is not the mean GPU usage or a
  simultaneous deployment occupancy measurement.

No token-to-byte conversion, rank replication, deployment total, or presumed
constant KV reservation is inferred. Same-rank conflicting vLLM reprints and
ambiguous repeated SGLang allocation labels produce null components. Files and
process lifetimes remain distinct. A missing component is not zero.

## Evidence checked

| Observation                                                                                                                                                                                         | Result                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [B300 vLLM DeepSeek V4 Pro, result 440197](https://inferencex.semianalysis.com/api/v1/server-log?id=440197&offset=0&limit=262144)                                                                   | Four reported workers: 205.08 GiB weights, 43.85 GiB current KV, 3.75 GiB activation, 1.63 GiB non-torch, 0.14 GiB graph, 267.69 GiB device total. Short report excerpts are regression fixtures.                                                                      |
| [B300 SGLang DeepSeek V4 Pro, result 439758](https://inferencex.semianalysis.com/api/v1/server-log?id=439758&offset=0&limit=262144)                                                                 | Eight workers report target/draft load deltas; TP0 reports 106.84 GiB combined and 0.31 GiB across recorded graph phases. Other ranks only report part of graph capture. KV allocation and device total remain unknown. Short report excerpts are regression fixtures. |
| [B200 SGLang Qwen 3.5 397B, result 438945](https://inferencex.semianalysis.com/api/v1/server-log?id=438945&offset=0&limit=262144)                                                                   | Target/draft load deltas are visible. Two unlabeled KV allocations per rank cannot be safely attributed or deduplicated; the parser retains evidence and marks the summed component unknown.                                                                           |
| [Newer vLLM result 443284](https://inferencex.semianalysis.com/api/v1/server-log-files?id=443284) and [SGLang result 443441](https://inferencex.semianalysis.com/api/v1/server-log-files?id=443441) | The inspected bundles contain benchmark/setup logs rather than worker startup reports. The view must show missing data.                                                                                                                                                |

These checks establish parser behavior on the inspected logs, not complete
measurement coverage for all models, versions or topologies. In particular,
SGLang HBM percentages need an explicit per-device total that these logs do not
provide. Do not publish an all-model allocation completeness claim.

## Read-only contract and control coverage

`GET /api/v1/agentic-memory?id=<positive integer>` uses the same parser as the
frontend. Unknown or duplicate parameters return 400; non-AgentX/missing points
return 404; source failures return 500. A successful response distinguishes
`reported`, `missing` and `unsupported`. `reported` only means some recognized
measurements exist. It does not mean all ranks or components were captured.

| UI control or behavior                        | Read-only equivalent                                                                                                                                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Result ID / existing model and SKU navigation | Resolve IDs through existing benchmark and sibling APIs, then query each memory ID. No model allowlist.                                                                                                     |
| Same-run concurrency comparison               | Existing `benchmark-siblings` scope, filtered by identical prefill/decode TP/EP/PP/DCP/PCP, DP-attention, worker/GPU counts, multinode flag, offload mode, and `disagg=false`. Sort by concurrency then ID. |
| Eight-result pagination                       | Select the matching eight IDs; one bounded request per ID, fetched sequentially.                                                                                                                            |
| Worker selection                              | Match `file` and `rank`. More than one process lifetime for that pair is ambiguous, so no comparison bar is drawn.                                                                                          |
| GiB / percentage                              | API returns both `gib` and `percent`, with the same five nullable component keys. This is presentation-only.                                                                                                |
| Evidence disclosure                           | `ranks[].evidence`, `file`, `rank`, `process`, `weightBasis`, and `conflicts`.                                                                                                                              |
| Missing/truncated reports                     | `status`, `files[].truncated`, `filesOmitted`.                                                                                                                                                              |

Reads are bounded to 16 files and 262144 characters per file. Partial final lines
are discarded. Later startup reports or restarts may be outside that window;
opening Logs remains the route to full inspection. The endpoint uses the normal
read-only DB connection and API cache. There is no migration, ingestion rewrite,
new credential, or production mutation.

Unpersisted unofficial overlays have no DB result ID or stored startup log and
are explicitly excluded. Disaggregated deployment aggregation is not enabled.
Different images are displayed separately in each result card; comparison alone
does not establish that concurrency caused a memory change.

## Verification

Unit coverage includes live-log excerpts, zero/missing values, ANSI, truncation,
rank/process/file separation, conflicting allocations, virtual-address bounds,
topology filtering, API validation/parity/error cases, and bounded reads.
Component coverage exercises units, evidence, errors/retry, Chinese copy and
mobile overflow. The existing point-page integration suite tests the new tab,
URL reload, return navigation, and missing trace behavior.

The source query has unit tests but was not run against a connected Neon database
in this change. Real-log checks used the existing public API. A separate Claude
review checked Chinese fidelity and naturalness; its terminology suggestions
were applied. Human Chinese maintainer review and complete historical parser
coverage remain open.

## 中文说明

所有已存储的 AgentX 模型数据点均可进入显存标签页，比较同次运行、同一拓扑下不同并发数
的启动报告。vLLM 使用逐 worker 的显存分项报告；SGLang 的权重加载与 CUDA graph
捕获数据保留为可用显存变化量。只有明确的 KV 分配日志才计入已分配容量；预算、可用显存和虚拟地址上界
不算实际分配。

缺失或有歧义的字段保留为 null。不按 token 数推算字节数，不把一个 rank 的数据复制到
其他 rank，也不推算整个部署的总量。上述样本验证不代表所有历史模型、镜像和拓扑都已
覆盖。SGLang 样本缺少设备总显存，无法计算 HBM 百分比。已完成独立 Claude 中文审核并
采纳术语建议，仍需中文维护者人工审核；尚未直接连接 Neon 验证新查询。未存储的
unofficial overlay 和分离式部署总量统计不在本次范围内。
