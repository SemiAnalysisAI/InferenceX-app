# CollectiveX swap_blocks 视图

[English](./collectivex.md#vllm-swap_blocks) | **中文**

`cases.json` 以 `suite: "swap-blocks"` 请求 swap_blocks 用例，每个 GPU 池的每种布局各一个；
这些用例没有 EP token 阶梯，不会计入 EP 覆盖范围。对应结果为 `collectivex-swap-blocks-v1`
文档，记录 `case_id`、`profile`、`generated_at` 和 `runtime.sku`。共享读取器只接受恰好对应
本 GPU 池一个已请求 swap_blocks 用例的文档，并验证正确性标记、有效载荷计算、有限且递增的
正延迟分位值、样本数量和运行环境来源（`runtime.source_sha` 是实际测量时的提交，可能早于
快照所用的提交）。EP/KV 保持原有读取流程。

数据集新增 `swap_blocks` 字段，保存运行环境来源和实测数据点；运行摘要通过 `swap_cases`
单独统计已请求和已测量的 swap_blocks 用例，与 EP/KV 区分。每份校验通过的文档计为一个
已测量用例；没有结果文档的已请求用例保持待处理状态。每个实测的传输方向、布局、块大小、
块数量和 seed 组合计为一个数据点。因预算限制而未测量的组合单独统计，不绘制为实测数据。

运行表支持按 swap_blocks 筛选，多运行对比沿用现有勾选操作及线型。图表可选择传输方向、
布局和延迟分位点，横轴以 B/KiB/MiB/GiB 显示块大小。带宽采用从零开始的线性坐标，
延迟采用对数坐标。带宽按复制的有效载荷除以主机侧观测延迟计算，延迟包含提交与 CUDA
同步时间；即使是 d2d，字节数也只计算一次。英文和 `/zh/collectivex` 页面均提供控件和提示框。

带宽图用虚线标出当前可见 GPU 的标称硬件上限，支持同时勾选多个运行进行比较。
已注册 x86 平台的主机传输按 PCIe 5.0 x16 单向 **64 GB/s** 计算（包括 HGX B300
的 CPU 上行链路）。GB200/GB300 的 Grace C2C 双向总带宽 900 GB/s 由两个 GPU
分配，每个 GPU 每个方向按 **225 GB/s** 计算。同一 GPU 内的复制需要读取和写入
每个有效载荷字节，因此使用 GPU Specs 中 HBM 带宽的一半作为参考。
这些数值是硬件参考值，并非实测极限：缓存命中时可能超过 HBM 参考线；主机内存、
内存放置位置和协议开销则可能限制主机传输速度。未知 SKU 不显示推测的上限。
切换至延迟模式或隐藏所有匹配曲线时，参考线一并隐藏；带宽纵轴始终为线性，并覆盖参考值。

来源见[英文文档](./collectivex.md#vllm-swap_blocks)中的硬件规格和拓扑链接。
测量标识包含 SKU，避免不同平台相同网格点之间发生冲突。
