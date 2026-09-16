# CollectiveX swap_blocks 视图

[English](./collectivex.md#vllm-swap_blocks) | **中文**

独立的 `backend=swap-blocks` 扫描通过现有 matrix/shard 产物流程发现。仅包含一个
swap-blocks 单元的执行矩阵映射到应用契约版本 1。共享读取器验证
`collectivex-swap-blocks-v1` 文档的正确性标记、有效载荷计算、有限且递增的正延迟分位值、
样本数量，以及与运行记录一致的源代码 SHA。EP/KV 保持原有读取流程。
原始 JSON 仍是数据来源，无需数据库迁移。

数据集新增 `swap_blocks` 字段，保存运行环境来源和实测数据点；运行摘要通过 `swap_cases`
区分 EP/KV 与块交换。每份校验通过的产物计为一个用例，每个实测的传输方向、布局、块大小、
块数量和 seed 组合计为一个数据点。因预算限制而未测量的组合单独统计，不绘制为实测数据。

运行表支持按 swap_blocks 筛选，多运行对比沿用现有勾选操作及线型。图表可选择传输方向、
布局和延迟分位点，横轴以 B/KiB/MiB/GiB 显示块大小。带宽采用从零开始的线性坐标，
延迟采用对数坐标。带宽按复制的有效载荷除以主机侧观测延迟计算，延迟包含提交与 CUDA
同步时间；即使是 d2d，字节数也只计算一次。英文和 `/zh/collectivex` 页面均提供控件和提示框。
