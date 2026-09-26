# OperatorX

[English](operatorx.md) | **中文**

OperatorX 与 CollectiveX 一同位于 **Hidden**，通过 ↑↑↓↓ 解锁。`/operatorx` 和
`/zh/operatorx` 使用相同的读取器、图表、筛选和覆盖统计。`?run=<运行键>`
可查看指定的已存储运行。

支持 NVIDIA 和 AMD 的单卡 GEMM、MHA/GQA、物化 MLA、路由 MoE，以及 AMD AITER attention 后端。
读取器按分片最新尝试匹配计划中的测试和后端，保留局部重跑未触及的分片，并校验来源。
已测量、不支持、失败和缺失的测试分别统计。GEMM 单卡 TFLOPS 为
`2*M*N*K/(latency_us*1e6)`；零维度 GEMM 没有吞吐量。节点分配的 GPU 数不会使指标倍增。

Attention 显示 µs 延迟和有效矩阵乘法 TFLOPS，默认展示 TFLOPS，也可切换为延迟。MLA 仅测量物化 Q/K/V 的 attention，
不包含缓存投影或 RoPE。PyTorch 在计时前展开分组 KV，AITER 保留原生分组 head。
比较时需保持形状、精度和后端一致。算子选择器分别展示 GEMM、MHA/GQA、MLA 和路由 MoE。
Attention 图表以 batch size 为横轴，保留 query/KV 长度、head 数、head dimension、
KV rank、因果语义及 Q/K/V/输出精度。其他算子暂未纳入。

跨运行比较会按 GPU、测试用例和后端选取最新的有效结果。明确报错或不支持的结果会保留；
缺失的结果可由较早存储运行中的结果补齐。Kernel timeline 从结果所属的运行读取，
因此新运行替换比较中的条目后，已打开的旧 profile 仍可查看。
时间线引用包含存储版本。重新导入同一运行会生成新版本，新的比较结果不会误用旧缓存中的时间线。

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

运行以原始文档形式保存在独立的 OperatorX 数据库（`opx_runs` 与 `opx_run_docs`）中：
每次运行的清单及各分片的 operatorx 结果 JSON 原样保存。读取时由规范化器转换为仪表板
数据；导入时也会执行一次，无法读取的运行不会被保存。运行通过推送导入：

- `bun run admin:db:ingest:operatorx -- --download <运行 URL 或 ID>` 导入任意分支已完成的
  `operatorx-sweep.yml` 运行，并下载其清单与分片产物。
- CI 中 `admin:db:ingest:operatorx:ci` 从 `INGEST_ARTIFACTS_PATH` 读取 `INGEST_RUN_ID`
  的预下载产物。
- `bun run admin:db:ingest:operatorx -- --bundle <file.json> ...` 原样导入原始数据包，
  用于非 sweep 采集的运行。

重新导入会替换该运行。配置：

InferenceX 的 `operatorx-sweep.yml` 手动触发的运行结束后（包括有分片失败的运行），
会携带运行 ID 发送 `ingest-operatorx` repository dispatch，由 `Ingest OperatorX Results`
工作流导入该运行。GitHub 只会把 repository dispatch 投递给默认分支上的工作流，
因此需等 `ingest-operatorx.yml` 合入 InferenceX-app 默认分支后才会自动触发。
回填或重新导入某次运行时，可手动输入运行 ID 运行该工作流。

1. `DATABASE_OPERATORX_WRITE_URL`：所有者连接（直连、非连接池），仅用于迁移和导入。
2. `DATABASE_OPERATORX_READONLY_URL`：连接池端点上的只读角色，应用仅使用此连接。
3. 部署前运行 `bun run admin:db:migrate:operatorx -- --yes`。

## 本地验证

设置 `OPERATORX_SOURCE=local` 后，`OPERATORX_LOCAL_ARTIFACT_DIR` 指向包含 `<runKey>.json`
原始数据包的目录。此功能只在开发环境启用，生产环境忽略该设置。不要用合成延迟替代实际
测量进行人工验收。
