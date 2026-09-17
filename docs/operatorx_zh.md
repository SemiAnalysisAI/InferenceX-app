# OperatorX

[English](operatorx.md) | **中文**

OperatorX 与 CollectiveX 一同位于 **Hidden**，通过 ↑↑↓↓ 解锁。`/operatorx` 和
`/zh/operatorx` 使用相同的读取器、图表、筛选和覆盖统计。`?run=<GitHub Actions run ID>`
可查看指定运行，包括功能分支。

支持 NVIDIA 和 AMD 的单卡 GEMM、MHA/GQA、物化 MLA，以及 AMD AITER attention 后端。
读取器按分片最新尝试匹配计划中的测试和后端，保留局部重跑未触及的分片，并校验来源。
已测量、不支持、失败和缺失的测试分别统计。GEMM 单卡 TFLOPS 为
`2*M*N*K/(latency_us*1e6)`；零维度 GEMM 没有吞吐量。节点分配的 GPU 数不会使指标倍增。

Attention 显示 µs 延迟和有效矩阵乘法 TFLOPS，默认展示 TFLOPS，也可切换为延迟。MLA 仅测量物化 Q/K/V 的 attention，
不包含缓存投影或 RoPE。PyTorch 在计时前展开分组 KV，AITER 保留原生分组 head。
比较时需保持形状、精度和后端一致。算子选择器分别展示 GEMM、MHA/GQA 和 MLA。
Attention 图表以 batch size 为横轴，保留 query/KV 长度、head 数、head dimension、
KV rank、因果语义及 Q/K/V/输出精度。其他算子暂未纳入。

API 数据集版本 2 增加 `type`、原始 `args` 和可空的 `attention`；attention 的 GEMM
专用字段为 null。现有原始数据无需迁移表结构即可读取；下次读取运行列表时，会根据已保存文档重建旧版
仅统计 GEMM 的摘要缓存。读取时根据原始数据计算吞吐量，因此已有 attention 运行无需重跑，
也不需要清除仅保存覆盖统计的摘要缓存。失败运行中的成功测量仍可显示。

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
