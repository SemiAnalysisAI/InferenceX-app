# KV cache hit-rate anomaly on agentic benchmarks (dsv4, b200, vllm)

## Core issue

vLLM's prefix cache should be hitting at ~98% on multi-turn agentic conversation replay (each turn extends the prior turn's context). It isn't. Something in the **dataset definition** or **aiperf replay** is producing requests whose token streams aren't actually prefix-compatible turn-to-turn.

| Concurrency | Theoretical max hit % | vLLM actual hit % |
| ----------: | --------------------: | ----------------: |
|           1 |                97.45% |            83.15% |
|           2 |                98.34% |            46.78% |
|           4 |                97.99% |            12.43% |

This is **not** a capacity problem. KV cache is sized at 3.29M tokens (12,868 blocks × 256). The conc=4 workload's unique-content footprint is **~1.11M DSV4 tokens** — would fit in ~34% util. Observed peak util is 49.8%, so the cache is holding more blocks than the workload needs, yet vLLM can't find them on lookup.

## Data sources

- **Benchmark points**:
  - http://localhost:3002/inference/agentic/206252 (conc=1)
  - http://localhost:3002/inference/agentic/206245 (conc=2)
  - http://localhost:3002/inference/agentic/206247 (conc=4)
- **Neon DB**: project `silent-pond-29172997`, branch `br-cold-sky-ai0c09cy` (agentx-dev). Connection via `DATABASE_WRITE_URL` in `.env`. Console: https://console.neon.tech/app/projects/silent-pond-29172997/branches/br-cold-sky-ai0c09cy
  - `agentic_trace_replay.profile_export_jsonl_gz` — gzipped aiperf per-request records
  - `agentic_trace_replay.server_metrics_json_gz` — gzipped vllm per-scrape prometheus metrics
  - `agentic_trace_replay.request_timeline` (jsonb) — pre-computed per-request timeline used by the simulation
- **Trace replay dataset** (the source-of-truth for "what should be cacheable"): https://huggingface.co/datasets/semianalysisai/cc-traces-weka-with-subagents-051926. Each row has pre-computed 64-token block `hash_ids` per turn; `hash_id_scope: 'local'` (per-conversation).

## Theoretical max simulation

For each replayed request, look up the matching turn in the HF dataset and walk a per-conversation trie of 64-token block hash IDs. Hits = longest contiguous prefix from block 0 that has appeared in any prior request (mirrors vLLM's chained-hash semantics).

Confirms: the workload IS prefix-cacheable end-to-end. Theoretical max ≈ 98% across all three concurrency levels — same dataset, same conversations, just different dispatch order.

## Why this points at the dataset/replay, not vLLM

- **Capacity is not the bottleneck.** Cache holds ~3× the unique content of the workload. Cache util tops out below capacity.
- **The metric isn't lying.** vLLM's own counters cross-check: `prefill_kv_computed_tokens + prefix_cache_hits ≈ request_prompt_tokens` (67.85M + 9.61M ≈ 77.47M for conc=4).
- **It's not a tokenizer artifact.** DSV4 tokens are ~54% the count of Claude tokens, but BPE is left-monotonic on stable text — hit-rate ratio is invariant to tokenizer choice for prefix-growth workloads.
- **It's not the multi-engine DP bug** we found earlier (commit `f2618f4`) — this deployment has 1 engine.

What's left: the bytes that vLLM actually receives turn-to-turn are not the same prefix + delta that the dataset's `hash_ids` describe. Most likely culprits:

1. **aiperf isn't sending the cumulative chat history** the way the dataset assumes — each turn is being assembled differently than the previous, breaking the byte-level prefix.
2. **Something in the request payload varies per request** (timestamps, request IDs, tool result serialization order, etc.) — invalidates block 0's hash, cascades to every subsequent block via vLLM's chained hashing.
3. **BPE re-merging across message boundaries** when aiperf re-tokenizes the full history each turn instead of appending tokens.

## Root cause: `ConversationReconstructor` strips the prev user's `partial_tail` every turn

The bug is in `utils/aiperf/src/aiperf/dataset/loader/weka_synth_buf.py` — specifically the **boundary case** in `truncate_synth_buf_at_block` (line 453–464) combined with `turn_delta`'s reset logic (line 354–360).

What happens turn-to-turn:

1. `init_turn_0` builds a trailing user segment whose `tokens` = `[block_aligned_tokens] + [partial_tail_tokens]` where `partial_tail_n = in_tokens % bs`. The wire prompt for turn 0 includes these tail tokens.
2. `advance_turn` computes `lcp = longest_common_prefix(prev_hash_ids, curr_hash_ids)`. When the LCP equals the prev turn's total block count (the normal append-only case), `truncate_synth_buf_at_block` hits its boundary branch: `cursor + seg.block_count == target_blocks`.
3. That branch **strips `prev_partial_tail` tokens off the trailing user segment in place** and re-decodes its `content`. This sets `_last_disturbance_at = i` (the index of the prev trailing user segment).
4. New `assistant` + `user` segments are appended.
5. `turn_delta` sees `_last_disturbance_at < _emitted_segment_count` and forces `reset_context=True`, re-emitting **the whole conversation** with the now-stripped trailing user.

The endpoint (`utils/aiperf/src/aiperf/endpoints/base_endpoint.py:110-140`) honors `reset_context=True` via `messages = list(turn.raw_messages)` instead of `messages.extend(...)`.

Result: every turn sends the full chat history, but the bytes of the prev user message differ from what was sent the turn before — the trailing `partial_tail` chars are missing. vLLM tokenizes the new prompt, hashes 256-token blocks, and the chained-hash invariant breaks at the first block containing the trimmed boundary. That block + every subsequent block of the new turn miss the cache.

### Empirical confirmation

Reproducer at `/tmp/test-reconstructor.py` instantiates `ConversationReconstructor` with mock decoders and walks a synthetic 3-turn conversation:

```
=== Turn 0 ===
  delta msgs: 2, reset=False
  wire len: 21683

=== Turn 1 ===
  delta msgs: 4, reset=True            ← every turn resets
  wire len: 25307

=== DIFF turn 0 vs turn 1 (wire-level) ===
  common prefix chars: 21549 / wire0 21683 (99.4%)
  wire0[...] = '... 983406 12 1 133 184 16 57 71 155 37 '     ← partial_tail decoded
  wire1[...] = '... 983406<|im_end|>\n<|im_start|>assista'    ← stripped, template marker next
  turn0 user content len: 19812, turn1 user[0] content len: 19711   ← 101 chars stripped
```

Across the conc=1 run (point 206252), **280/280 (100%)** consecutive turn-pairs have `prev_in_tokens % bs != 0` — i.e., every single turn hits this boundary disturbance.

### Why the gap widens with concurrency

At conc=1 the gap (97.45% − 83.15% = 14pp) is roughly the fraction of each turn's blocks lost to the trimmed-tail invalidation (last user block + chat-template delta). At higher conc:

- `reset_context=True` makes every request re-send the **entire** conversation prompt, so wire bandwidth + prefill work scale superlinearly per turn.
- Concurrent conversations all do this simultaneously; each writes long sequences of "new" blocks past their respective divergence points, evicting other conversations' usable prefix blocks even though aggregate unique content (1.11M tokens) fits comfortably in the 3.29M-token cache.

### Fix sketch

The boundary-cut strip exists to keep the next turn's `assistant` segment block-aligned. Two viable fixes:

1. **Don't mutate the prev trailing user segment.** Leave its `partial_tail` tokens intact; append the new asst+user as strict-append (no reset_context). The wire-prefix becomes byte-stable turn-to-turn. Cost: the new asst content's block_start no longer aligns to the prev_hash_ids tail, so hash_id accounting for asst blocks loses 1 block of fidelity per turn.
2. **Track `partial_tail` separately** from the prev user segment so the segment's emitted content stays byte-stable, and only the trailing tail (which is regenerated each turn anyway) is allowed to vary.

Option 1 is the minimal change. Validate with the reproducer above — remove the strip in `truncate_synth_buf_at_block`'s boundary case and re-run; turn N+1's wire prefix should equal turn N's wire byte-for-byte up to the end of the prev assistant template.

## Re-running the simulation

```bash
# 1. dump request timelines from DB
pnpm --filter @semianalysisai/inferencex-db exec dotenv -e ../../.env -- tsx /tmp/dump-rt-multi.ts

# 2. run analysis (needs `pip3 install --break-system-packages --user datasets`)
python3 /tmp/cache-sim-multi.py

# 3. reproduce the partial_tail strip
python3 /tmp/test-reconstructor.py
```

Scripts live in `/tmp/` from this session; recreate from inline code in the previous version of this doc if missing.
