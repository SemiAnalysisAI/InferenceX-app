# Running GLM-4.7-Flash on Intel Gaudi 3 — Setup Guide & Benchmark

## Summary

`zai-org/GLM-4.7-Flash` runs successfully on Intel Gaudi 3 using vllm-gaudi with minimal setup. No code patches required — only a transformers library upgrade.

## Hardware

- **Server**: Ubuntu 24.04, kernel 6.8.0-106-generic
- **Accelerators**: 8x Intel Gaudi 3 HL-325L (128GB HBM each, 1TB total)
- **Driver**: hl-1.23.0-fw-62.2.1.1
- **CPU**: 240 cores, ~2TB system RAM

## Model Details

| Property     | Value                             |
| ------------ | --------------------------------- |
| Model        | `zai-org/GLM-4.7-Flash`           |
| Architecture | `Glm4MoeLiteForCausalLM`          |
| Model type   | `glm4_moe_lite`                   |
| Size         | 31.2 GB (BF16)                    |
| Layers       | 47                                |
| Hidden size  | 2048                              |
| Experts      | 64 routed, 4 active per token     |
| Attention    | MLA (Multi-head Latent Attention) |
| HPU Backend  | `HPUAttentionMLA`                 |

## Prerequisites

### 1. Build the vllm-gaudi Docker image

```bash
git clone https://github.com/vllm-project/vllm-gaudi.git
cd vllm-gaudi/.cd
docker build -f Dockerfile.ubuntu.pytorch.vllm -t vllm-gaudi:latest .
```

This pulls the base image from `vault.habana.ai/gaudi-docker/1.23.0/ubuntu24.04/habanalabs/pytorch-installer-2.9.0:latest`, then installs vLLM and the Gaudi plugin inside the container.

### 2. Prepare storage

The model is ~31GB. Ensure you have a volume with enough space for the HuggingFace cache. We used `/mnt/data/huggingface`.

```bash
sudo mkdir -p /mnt/data/huggingface
sudo chown $USER:$USER /mnt/data/huggingface
```

## Launch Command

```bash
docker run -d --name vllm-glm \
  --runtime=habana \
  -e HABANA_VISIBLE_DEVICES=all \
  -e OMPI_MCA_btl_vader_single_copy_mechanism=none \
  -e HF_TOKEN=$HF_TOKEN \
  -e HF_HOME=/mnt/data/huggingface \
  --cap-add=SYS_NICE \
  --ipc=host \
  -p 8000:8000 \
  -v /mnt/data/huggingface:/mnt/data/huggingface \
  --entrypoint bash \
  vllm-gaudi:latest \
  -c 'pip install --upgrade transformers && exec vllm serve zai-org/GLM-4.7-Flash \
    --tensor-parallel-size 2 \
    --dtype bfloat16 \
    --max-model-len 8192 \
    --port 8000'
```

### Key notes

- **`pip install --upgrade transformers`** is required at container start. The bundled transformers 4.57.6 does not recognize the `glm4_moe_lite` model type. The upgrade brings it to 5.3.0+.
- **TP=2** is sufficient for this 31GB model. Each card uses ~28GB for weights, leaving ~79GB per card for KV cache.
- **Warmup takes ~11 minutes** on first launch due to HPU graph compilation (72 prompt buckets + 63 decode buckets). Subsequent requests are fast.
- The model downloads on first run (~31GB). After that it's cached in the HF cache directory.

## Startup Timeline

| Phase                            | Duration                   |
| -------------------------------- | -------------------------- |
| Container start + pip upgrade    | ~60s                       |
| Model download (first run only)  | ~5 min (network dependent) |
| Model weight loading (48 shards) | ~20s                       |
| KV cache allocation              | <1s                        |
| Sampler warmup                   | ~35s                       |
| Prompt graph warmup (72 buckets) | ~3.5 min                   |
| Decode graph warmup (63 buckets) | ~7 min                     |
| **Total (first run)**            | **~17 min**                |
| **Total (cached model)**         | **~12 min**                |

## Verification

```bash
# Check available models
curl http://localhost:8000/v1/models

# Test inference
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"zai-org/GLM-4.7-Flash","messages":[{"role":"user","content":"What is 2+2?"}],"max_tokens":100}'
```

## Benchmark Results

**Configuration**: TP=2 on 2x Intel Gaudi 3 HL-325L (128GB each), BF16, max_model_len=8192

### Single Request Decode Throughput

| Max Tokens | Time  | Tokens Generated | Throughput |
| ---------- | ----- | ---------------- | ---------- |
| 50         | 0.90s | 50               | 55.8 tok/s |
| 100        | 1.71s | 100              | 58.4 tok/s |
| 200        | 3.48s | 200              | 57.4 tok/s |
| 500        | 8.78s | 500              | 56.9 tok/s |

Consistent **~57 tok/s** decode regardless of output length.

### Prefill Latency (Time to First Token)

| Prompt Tokens | TTFT |
| ------------- | ---- |
| 86            | 33ms |
| 406           | 46ms |
| 1,606         | 75ms |

Sub-100ms TTFT even for long prompts.

### Concurrent Request Throughput

| Concurrency | Wall Time | Total Tokens | Aggregate Throughput | Avg Latency | P99 Latency |
| ----------- | --------- | ------------ | -------------------- | ----------- | ----------- |
| 1           | 3.47s     | 200          | 57.7 tok/s           | 3.47s       | —           |
| 2           | 3.69s     | 400          | 108.5 tok/s          | 3.67s       | —           |
| 4           | 3.81s     | 800          | 209.9 tok/s          | 3.80s       | —           |
| 8           | 4.03s     | 1,600        | 396.7 tok/s          | 4.02s       | —           |
| 16          | 4.94s     | 3,200        | 647.3 tok/s          | 4.92s       | —           |
| 32          | 5.69s     | 6,400        | 1,124.5 tok/s        | 5.65s       | 5.67s       |
| 64          | 6.87s     | 12,800       | 1,862.7 tok/s        | 6.80s       | 6.84s       |
| 128         | 8.56s     | 25,600       | **2,990.2 tok/s**    | 8.43s       | 8.51s       |

### Key Observations

- **Near-linear scaling**: throughput roughly doubles with each doubling of concurrency.
- **Latency stays reasonable**: even at 128 concurrent requests, average latency is only 8.4s (vs 3.5s at concurrency=1).
- **Only 2 of 8 cards used**: running TP=8 or deploying multiple model replicas could push aggregate throughput significantly higher.
- **MLA attention works natively** on HPU via the `HPUAttentionMLA` backend — no patches or workarounds needed.

## Memory Profile

Per Gaudi 3 card (TP=2):

| Component         | Memory               |
| ----------------- | -------------------- |
| Model weights     | ~28 GiB              |
| KV cache (usable) | 79.6 GiB             |
| HPU graph reserve | 8.8 GiB              |
| Warmup overhead   | ~2 GiB               |
| **Total used**    | ~119 GiB / 126.5 GiB |

KV cache capacity: **1,578,496 tokens** across the 2 cards.

## Troubleshooting

### "Transformers does not recognize this architecture"

The bundled transformers version (4.57.6) is too old. Add `pip install --upgrade transformers` before launching vllm.

### Slow first inference after startup

This is normal — HPU graph compilation happens during warmup. After the ~11 minute warmup, inference is fast.

### Container exits immediately

Check `docker logs <container>` for errors. Common issues:

- Missing `--runtime=habana`
- Missing `--ipc=host`
- HF_TOKEN not set or invalid

## Next Steps

- Try **TP=8** for lower single-request latency
- Try the full **GLM-4.7** (358GB, `Glm4MoeForCausalLM`) which should fit across all 8 cards
- Consider baking the transformers upgrade into a custom Docker image to skip the pip install at startup

## Date

March 14, 2026
