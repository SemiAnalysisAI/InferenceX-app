# Running InferenceX Benchmarks Against vLLM on Gaudi 3

## What InferenceX Does

InferenceX (by SemiAnalysis) is a benchmark client that stress-tests LLM inference servers. It sends synthetic prompts at controlled concurrency levels and measures:

- **Output throughput** (tok/s) — how many tokens the server generates per second
- **TTFT** (Time to First Token) — how long until the first token comes back (prefill latency)
- **TPOT** (Time Per Output Token) — average time between tokens (decode latency)
- **ITL** (Inter-Token Latency) — similar to TPOT but measured per-gap
- **End-to-end latency** — total time per request

By sweeping concurrency (1, 2, 4, 8, ... 128), you build a throughput-vs-latency curve that shows how the server scales under load.

## Prerequisites

You need:

1. A running vLLM server with an OpenAI-compatible API (already done if you followed the GLM-4.7 setup)
2. Python 3 with `aiohttp`, `transformers`, `sentencepiece`, `tabulate`
3. The InferenceX repo

## Setup

### Option A: Run from inside the vLLM container (what we did)

This is easiest since the container already has all Python deps.

```bash
# Clone InferenceX on the host
cd ~
git clone https://github.com/SemiAnalysisAI/InferenceX.git

# Copy it into the running container
docker cp ~/InferenceX vllm-glm47:/workspace/InferenceX

# Install any missing deps inside the container
docker exec vllm-glm47 pip install aiohttp sentencepiece tabulate
```

### Option B: Run from the host

```bash
cd ~
git clone https://github.com/SemiAnalysisAI/InferenceX.git
pip3 install aiohttp transformers sentencepiece tabulate
```

Then run the benchmark commands below without the `docker exec` prefix, pointing at `http://localhost:8000`.

## Running a Single Benchmark

The core script is `utils/bench_serving/benchmark_serving.py`. Here's what each flag does:

```bash
python benchmark_serving.py \
  --backend vllm \                    # Use OpenAI Completions API format (/v1/completions)
  --base-url http://localhost:8000 \  # Your vLLM server address
  --endpoint /v1/completions \        # API endpoint
  --model "zai-org/GLM-4.7" \        # Must match the model name vLLM is serving
  --dataset-name random \             # Generate random token prompts (no real dataset needed)
  --random-input-len 1024 \           # Each prompt is 1024 tokens
  --random-output-len 1024 \          # Request 1024 output tokens
  --random-range-ratio 1.0 \          # All prompts are exactly this length (no variance)
  --num-prompts 40 \                  # Total number of requests to send
  --max-concurrency 4 \              # Max simultaneous in-flight requests
  --save-result \                     # Save JSON output
  --result-dir ./results/ \           # Where to write the JSON
  --result-filename "my_test.json"    # Output filename
```

### Common sequence length configs

| Name | Input | Output | Use case                                  |
| ---- | ----- | ------ | ----------------------------------------- |
| 1k1k | 1024  | 1024   | Balanced — general throughput test        |
| 1k8k | 1024  | 8192   | Long generation — tests decode throughput |
| 8k1k | 8192  | 1024   | Long context — tests prefill/TTFT         |

## Running a Full Concurrency Sweep

This is how you build the throughput-vs-latency curve. Run the benchmark at each concurrency level, sending `concurrency × 10` prompts per level:

```bash
mkdir -p results

for CONC in 1 2 4 8 16 32 64 128; do
  echo "=== Concurrency: $CONC ==="
  python utils/bench_serving/benchmark_serving.py \
    --backend vllm \
    --base-url http://localhost:8000 \
    --endpoint /v1/completions \
    --model "zai-org/GLM-4.7" \
    --dataset-name random \
    --random-input-len 1024 \
    --random-output-len 1024 \
    --random-range-ratio 1.0 \
    --num-prompts $((CONC * 10)) \
    --max-concurrency $CONC \
    --save-result \
    --result-dir ./results/ \
    --result-filename "glm47_conc${CONC}.json"
done
```

If running inside the container, prefix with `docker exec vllm-glm47`.

### How long does it take?

- Low concurrency (1-4): ~5-8 min each (few requests, each takes ~50s for 1k tokens)
- Medium concurrency (8-32): ~5-10 min each
- High concurrency (64-128): ~10-15 min each (more requests, but higher throughput)
- **Full sweep: ~45-90 minutes total**

## Understanding the Output

Each run prints a summary like:

```
============ Serving Benchmark Result ============
Successful requests:                     10
Benchmark duration (s):                  363.79
Total input tokens:                      10240
Total generated tokens:                  6739
Request throughput (req/s):              0.03
Output token throughput (tok/s):         18.52
Total Token throughput (tok/s):          46.67
---------------Time to First Token----------------
Mean TTFT (ms):                          166.45
Median TTFT (ms):                        164.41
P99 TTFT (ms):                           222.20
-----Time per Output Token (excl. 1st token)------
Mean TPOT (ms):                          53.69
Median TPOT (ms):                        52.88
P99 TPOT (ms):                           59.26
==================================================
```

Key metrics to watch:

- **Output token throughput** — goes up with concurrency (good)
- **Mean TTFT** — goes up with concurrency (expected, more queuing)
- **Mean TPOT** — should stay relatively stable until the server saturates

## The JSON Output

Each saved JSON file contains all the metrics above plus statistical breakdowns. Example fields:

```json
{
  "max_concurrency": 4,
  "output_throughput": 64.02,
  "mean_ttft_ms": 301.52,
  "mean_tpot_ms": 59.88,
  "p99_ttft_ms": 425.54,
  "p99_tpot_ms": 63.4,
  "total_input_tokens": 40960,
  "total_output_tokens": 31445,
  "completed": 40
}
```

## After the Sweep

### Summarize results

```bash
python utils/summarize.py --result-dir ./results/
```

This prints a markdown table of all runs.

### Copy results off the container

If you ran inside the container, back them up:

```bash
docker cp vllm-glm47:/workspace/results/ ~/glm47-benchmarks/
```

### What InferenceX does NOT do

- It does not generate charts or plots. The JSON data powers the curves on [inferencex.com](https://inferencex.com/).
- It does not test accuracy — only throughput and latency. For accuracy evals, use lm-eval-harness separately.

## Quick Reference

```bash
# Check if your server is ready
curl http://localhost:8000/v1/models

# Quick smoke test (5 prompts, concurrency 1)
python utils/bench_serving/benchmark_serving.py \
  --backend vllm --base-url http://localhost:8000 \
  --endpoint /v1/completions --model "zai-org/GLM-4.7" \
  --dataset-name random --random-input-len 1024 --random-output-len 1024 \
  --random-range-ratio 1.0 --num-prompts 5 --max-concurrency 1

# Full sweep (save results)
for CONC in 1 2 4 8 16 32 64 128; do
  python utils/bench_serving/benchmark_serving.py \
    --backend vllm --base-url http://localhost:8000 \
    --endpoint /v1/completions --model "zai-org/GLM-4.7" \
    --dataset-name random --random-input-len 1024 --random-output-len 1024 \
    --random-range-ratio 1.0 --num-prompts $((CONC * 10)) --max-concurrency $CONC \
    --save-result --result-dir ./results/ --result-filename "conc${CONC}.json"
done
```
