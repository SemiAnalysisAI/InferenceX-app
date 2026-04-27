# System Configuration — GLM-4.7 on Intel Gaudi 3

## Date

March 14, 2026

## Server

| Component  | Details                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| Hostname   | gaudi-115ck74                                                           |
| OS         | Ubuntu 24.04.4 LTS (Noble Numbat)                                       |
| Kernel     | 6.8.0-106-generic                                                       |
| CPU        | 2x Intel Xeon Platinum 8580 (60 cores/socket, HT on, 240 threads total) |
| System RAM | 2.0 TiB                                                                 |

## Accelerators

| Property     | Value                 |
| ------------ | --------------------- |
| Model        | Intel Gaudi 3 HL-325L |
| Count        | 8                     |
| HBM per card | 128 GiB (131,072 MiB) |
| Total HBM    | 1 TiB                 |
| Driver       | 1.23.0-2eae87a        |

### PCIe Bus IDs

```
0000:19:00.0  0000:3b:00.0  0000:4c:00.0  0000:5d:00.0
0000:9b:00.0  0000:bb:00.0  0000:cb:00.0  0000:db:00.0
```

## Software Stack

| Component     | Version                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------- |
| Docker image  | vllm-gaudi:latest                                                                         |
| Base image    | vault.habana.ai/gaudi-docker/1.23.0/ubuntu24.04/habanalabs/pytorch-installer-2.9.0:latest |
| vLLM          | 0.17.1rc1.dev127+gf296a1966                                                               |
| Transformers  | 5.3.0 (upgraded from bundled 4.57.6)                                                      |
| Habana driver | 1.23.0                                                                                    |

## Model

| Property                | Value                          |
| ----------------------- | ------------------------------ |
| Model                   | `zai-org/GLM-4.7`              |
| Architecture            | `Glm4MoeForCausalLM`           |
| Type                    | Mixture-of-Experts             |
| Total parameters        | ~355B                          |
| Active parameters/token | ~32B                           |
| Layers                  | 47                             |
| Hidden size             | 3584                           |
| Experts                 | 64 routed, 4 active per token  |
| Precision               | BF16                           |
| Weight size on disk     | ~400 GB (96 safetensor shards) |

## vLLM Serving Configuration

```bash
vllm serve zai-org/GLM-4.7 \
  --tensor-parallel-size 8 \
  --dtype bfloat16 \
  --max-model-len 8192 \
  --port 8000
```

| Parameter            | Value               |
| -------------------- | ------------------- |
| Tensor parallel size | 8 (all cards)       |
| Data type            | bfloat16            |
| Max model length     | 8192 tokens         |
| Attention backend    | HPUAttentionV1      |
| MoE backend          | OOT Unquantized MoE |
| Bucketing            | ON                  |

## Docker Launch Command

```bash
docker run -d --name vllm-glm47 \
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
  -c 'pip install --upgrade transformers && exec vllm serve zai-org/GLM-4.7 \
    --tensor-parallel-size 8 \
    --dtype bfloat16 \
    --max-model-len 8192 \
    --port 8000'
```

## Benchmark Tool

| Property          | Value                                                      |
| ----------------- | ---------------------------------------------------------- |
| Tool              | [InferenceX](https://github.com/SemiAnalysisAI/InferenceX) |
| Script            | `utils/bench_serving/benchmark_serving.py`                 |
| Backend           | vllm (OpenAI Completions API)                              |
| Dataset           | random                                                     |
| Input length      | 1024 tokens                                                |
| Output length     | 1024 tokens                                                |
| Concurrency sweep | 1, 2, 4, 8, 16, 32, 64, 128                                |
| Prompts per level | concurrency × 10                                           |
