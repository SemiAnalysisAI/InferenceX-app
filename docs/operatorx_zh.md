# OperatorX

[English](operatorx.md) | **中文**

OperatorX 与 CollectiveX 一同位于 **Hidden**，通过 ↑↑↓↓ 解锁。`/operatorx` 和
`/zh/operatorx` 使用相同的读取器、图表、筛选和覆盖统计。`?run=<GitHub Actions run ID>`
可查看指定运行，包括功能分支。

支持 NVIDIA 和 AMD 的单卡 GEMM、MHA/GQA、物化 MLA、路由 MoE，以及 AMD AITER attention 后端。
读取器按分片最新尝试匹配计划中的测试和后端，保留局部重跑未触及的分片，并校验来源。
已测量、不支持、失败和缺失的测试分别统计。GEMM 单卡 TFLOPS 为
`2*M*N*K/(latency_us*1e6)`；零维度 GEMM 没有吞吐量。节点分配的 GPU 数不会使指标倍增。

Attention 显示 µs 延迟和有效矩阵乘法 TFLOPS，默认展示 TFLOPS，也可切换为延迟。MLA 仅测量物化 Q/K/V 的 attention，
不包含缓存投影或 RoPE。PyTorch 在计时前展开分组 KV，AITER 保留原生分组 head。
比较时需保持形状、精度和后端一致。算子选择器分别展示 GEMM、MHA/GQA、MLA 和路由 MoE。
Attention 图表以 batch size 为横轴，保留 query/KV 长度、head 数、head dimension、
KV rank、因果语义及 Q/K/V/输出精度。其他算子暂未纳入。

API 数据集版本 3 增加 `moe_gemm` 和可空的 `moe` 维度对象，并保留 `type`、原始 `args`
及可空的 `attention`。不适用的算子字段为 null。现有原始数据无需迁移表结构即可读取；
下次读取运行列表时，会根据已保存文档重建旧版读取器的摘要缓存，纳入此前未统计的 MoE。
吞吐量在读取时根据实测延迟计算。失败运行中的成功测量仍可显示。

## Attention TFLOPS

单卡 TFLOPS 为 `2*B*Hq*P*(Dqk+Dv)/(latency_us*1e6)`。
`P` 是每个 head 的有效 query/key 对数：非因果 attention 为 `Sq*Sk`；
右下对齐的因果掩码为 `R*(2*Sk-R+1)/2`，其中 `R=min(Sq,Sk)`。
该计算包含对角线；单 token decode 计入全部 KV；`Sq>Sk` 时不计入开头完全被掩码遮挡的行。
有效位置的统计方式与 [AITER prefill 基准测试](https://github.com/ROCm/aiter/blob/main/op_tests/op_benchmarks/triton/bench_batch_prefill.py)一致。

QK 和 AV 的每次乘加按两个 FLOP 计数。GQA 使用 query head 数，而非 KV head 数。
MLA 使用 `Dqk=head_dim_qk_nope+head_dim_qk_rope` 和 `Dv=head_dim_v`；
`kv_lora_rank` 不增加物化 attention 的计算量。该指标表示有效矩阵乘法吞吐量，
不是实际指令数或硬件利用率。分子不计 softmax、投影、RoPE 和被掩码遮挡位置的计算量，
分母仍是实测 attention 延迟。失败、不支持、缺失及空形状测试的 TFLOPS 为 null。
内核计时方式和已保存的测量数据均不改变。

## 路由 MoE 与 Kimi K3 benchmark profile

MoE 图表以本地 token 数为横轴，支持单卡 TFLOPS 和延迟。每个数据点保留测试配置名称、
激活/权重精度、hidden size、全局及本地专家数和 intermediate 维度、top-k、EP、
路由/共享 TP、共享专家数和路由分布。跨 GPU 比较时需选择相同形状。

`kimi_k3_moe_perf` 使用 [vLLM PR #50082](https://github.com/vllm-project/vllm/pull/50082)
中的通用维度：H=7168、I=3072、E=896、top-k=16，本地 token 数为 1/16/128/1024。
EP8 使用 112 个本地专家和 I=3072；TP8 使用 896 个专家和本地 I=384。
这些参数表示单卡权重形状，并未创建实际分布式进程组。所有选中的路由均指向本地专家，
路由在计时前生成，不测量通信。

该配置运行通用 SiLU 专家，不代表原生 K3 MoE 层。原生 K3 使用 SITU、3584 维的路由
hidden size、latent 投影和共享专家，这些均不在本次测量范围内。UI 保留配置名称，
便于区分这些测量与完整模型吞吐量。

有效 gate/up/down 矩阵乘法 TFLOPS 为
`6*T*H*(top_k*I_local+n_shared*I/shared_TP)/(latency_us*1e6)`。
其中 `I_local=I/routed_TP`；EP 改变本地专家存储量，计算时不再除以 EP。
K3 配置的 `n_shared=0`。分子不计激活和路由计算量，分母为实测融合专家内核延迟。
缺失、失败、不支持及空形状测试没有 TFLOPS 值。

## 持久化与部署

读取 API 时按需发现任意分支最近 44 天已完成的手动运行，每次最多导入四次运行。
`discovery_complete=false` 表示客户端需继续获取。原始 JSON 在 GitHub 产物过期后仍保留。

1. 配置具有 Actions 产物读取权限的 `GITHUB_TOKEN`。
2. 将 `DATABASE_OPERATORX_WRITE_URL` 指向可写 PostgreSQL 主库，建议使用独立数据库。
3. 部署前运行 `bun run admin:db:migrate:operatorx -- --yes`。

较旧的并发导入不会覆盖更新尝试。GitHub 不可用时仍可读取已存储数据；未保存且已过期的
产物无法恢复。这里不触发跨仓库运行，也不会自动迁移生产数据库。公开 API 为
`/api/v1/operatorx/runs` 和 `/api/v1/operatorx/runs/{runId}`，发现完成后缓存 60 秒，
未完成的发现响应不缓存。

## 使用真实产物本地验证

将 `OPERATORX_LOCAL_ARTIFACT_DIR` 指向包含 `<runId>.json` 的目录，文件由
`src/lib/operatorx-ingest.ts` 的 `downloadOperatorXBundle` 返回。此功能只在本机开发
环境启用，生产环境忽略该设置。预览与持久化数据使用相同的读取器和 UI；不要用合成
延迟替代实际测量进行人工验收。读取器、导入、PGlite 持久化和 Cypress 测试覆盖
指标计算、覆盖统计、来源校验、重跑、隐藏导航、中英文及移动端行为。
