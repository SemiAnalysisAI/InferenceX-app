---
title: 'PowerX 教程：我们如何测量和建模推理功耗'
description: 'PowerX 测量什么、建模什么、每张图表怎么读，以及如何在自己的 InferenceX 运行中采集功耗。'
updated: '2026-10-27'
---

PowerX 展示每颗加速器在运行基准测试时的功耗，以及每个 token 消耗的能量。所有数字都来自基准测试服务窗口内每秒采样一次的 GPU 遥测数据。凡是无法在基准测试集群上实测的部分，都由模型估算，并明确标注为建模值。

## PowerX 测量什么

- **每颗 GPU 的功耗，每秒一次。** NVIDIA 集群在每个节点上以 1 s 间隔运行 `dcgm-exporter`；AMD 集群以 1 s 间隔运行 AMD 的 `device-metrics-exporter`。头节点按同一时钟抓取所有节点。
- **每个基准测试点一个窗口。** 每个并发点都有一个服务窗口，从 warmup 结束后开始，到最后一个请求结束。只有窗口内的样本才计入统计。
- **能量由积分得到。** 每颗 GPU 的能量是其功耗样本在窗口内的梯形积分。每 token 能量 = 整个部署的 GPU 总能量 ÷ 基准测试客户端统计的 token 数（输出、输入、总量或按请求计）。
- **全部 GPU 的统计量。** 平均值、P75 和 P90 功耗按时间加权，在窗口内覆盖该部署的全部 GPU。对于 prefill/decode 分离式部署，各角色的平均值只覆盖该角色的 GPU，但使用同一个完整窗口。

> [!NOTE]
> 实测的瓦特和焦耳只覆盖加速器遥测：NVIDIA HGX 系统上是 GPU 板卡，NVL72 上是 GPU 模组，AMD 上是 GPU 封装。主机、网络、散热和设施功耗都是建模值，从未实测；PowerX 始终标明哪些是实测、哪些是建模。

## 四种功耗统计口径

**Count** 控件用来选择边界。请按要回答的问题选择。

| Count       | 包含范围                                                                                    | 来源                                            | 适用场景                                       |
| ----------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| GPU only    | exporter 上报的加速器本身                                                                   | 实测                                            | 芯片能效、J/token、TDP 占比                    |
| IT (no PUE) | GPU + CPU、内存、NIC、NVSwitch、存储、PCIe、风扇、PSU 损耗，以及机箱分摊的 scale-out 交换机 | 实测 GPU（可用时含 Grace socket）+ 其余部分建模 | 数据中心容量：每 GPU kW、每 MW 可部署的 GPU 数 |
| Facility    | IT × PUE（电源使用效率；风冷机箱 1.3，液冷 NVL72 机柜 1.1）                                 | 建模                                            | 市电功率与电费                                 |
| All         | 三条线画在同一张图上                                                                        | 两者                                            | 看清 GPU 之外还有多少功耗                      |

**Rated boundaries** 会叠加厂商标称值作为对照：GPU TDP（热设计功耗），以及运营商规划机柜时使用的每 GPU 全系统 provisioned W。在典型 decode 点上，实测功耗远低于这两个值。

> [!TIP]
> 做容量规划，看 **IT (no PUE)** 的 **P90**；比较芯片，看每 token 能量视图下的 **GPU only**。

选择芯片、工作负载、部署方式和 GPU 瓦特数，即可看到四种口径、每 MW 可部署的 GPU 数，以及每个建模部件。

![功耗口径探索器](../../public/images/powerx-tutorial/widgets/power-basis.png)

实测数据点见[功耗视图](/zh/inference?i_metric=y_measuredAvgPower)。

## 各平台的实测与建模范围

| 平台                                 | 实测                                                                                                                            | 建模                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| NVIDIA HGX（H100、H200、B200、B300） | 通过 DCGM（NVIDIA Data Center GPU Manager）读取的 GPU 板卡功耗（NVML 传感器，含模组自身的电压调节）                             | 2 颗 CPU、DRAM、NIC、PCIe 交换机、NVMe、风扇、PSU 损耗           |
| NVIDIA NVL72（GB200、GB300）         | 通过 DCGM 按计算托盘读取的 GPU 模组功耗；同一窗口通过 Grace 校验时，还包括 Grace socket 功耗（CPU、LPDDR5X 和 socket 电压调节） | NVSwitch 托盘、托盘风扇、电源架，以及 Grace 校验未通过时的 Grace |
| AMD OAM（MI300X、MI325X、MI355X）    | AMD exporter 上报的 GPU 封装功耗                                                                                                | 2 颗 CPU、DRAM、NIC、PCIe 交换机、NVMe、风扇、PSU 损耗           |

模型就是 InferenceX 仓库中开源的 `power_model` 包，逐文件移植到了应用中。它接收实测的每 GPU 瓦特数和一个工作负载状态（固定序列长度、智能体、或带 KV offload 的智能体），输出机箱或机柜级的 IT 和设施瓦特数。建模值在绘制图表时由存储的 GPU 实测值按固定的模型版本即时计算；模型一旦更新，所有数据点同时变化，不存在回填。

> [!IMPORTANT]
> AMD 的 exporter 上报的是封装功耗，NVIDIA 上报的是板卡或模组功耗。两者的边界相差板级电压调节和封装之外的元件，跨厂商比较时应当说明这一点。AgentX（智能体）数据点使用模型的智能体状态，该状态尚未用实测的系统功耗校准。

## 图表怎么读

**每 token 能量。** 每个输出 token 的焦耳数对交互性（tok/s/user）作图。越低越好，曲线是 Pareto 前沿，与仪表板其他图表一致。这是用来比较芯片的视图。

**功耗。** 每 GPU 瓦特数对交互性作图。点是实测点。曲线是该芯片各点的上包络线，而不是前沿：原始瓦特数没有"更好"的方向，包络线回答的是"在这个交互性下，这颗芯片会消耗多少功率"。**Power statistic** 可在 Average、P75 和 P90 之间切换；规划人员使用 P90，因为动态功率调度对峰值敏感。**Headroom band** 显示与 TDP 的差距，headroom 表格列出 25、50、100 和 300 tok/s/user 下的每 GPU IT 瓦特数和每 MW 可部署的 GPU 数。

**功耗去向。** 针对滑块选中的数据点，堆叠显示实测 GPU 功耗、各建模部件和设施开销，并列出每个部件的瓦特数、占 IT 的比例，以及它随负载变化的方式。CPU、内存和 NIC 基本不变；风扇和 PSU 损耗跟随 GPU 变化。

**随时间变化。** 整次运行的 1 s 功耗轨迹和负载波动统计：峰值、最小值、空闲底线、最大 1 s 和 5 s 阶跃，以及爬升速率，可按单 GPU 或单个 NVL72 机柜查看。可下载为 CSV 或 JSON，用于分析电网和爬升相关问题。

> [!NOTE]
> 瓦特和焦耳回答的是不同的问题。一个配置可以消耗更多瓦特，但只要每秒服务的 token 更多，每 token 焦耳数反而更低，例如使用投机解码或更大的 batch。

切换指标，查看同一对芯片在实时、已通过校验的数据点上的表现。

![实时图表](../../public/images/powerx-tutorial/widgets/chart.png)

全部控件都在 [/inference](/zh/inference?i_metric=y_measuredJPerOutputToken) 上。

## Validated 与 Historical

离线验证器会从原始样本重新执行所有校验，全部通过的数据点才标记为 **Validated**：

- 整个窗口内所有预期的 GPU 都有上报；
- 样本之间的间隔不超过 3 s；
- 服务窗口与基准测试客户端的窗口相差不超过 0.5 s 或 1 %；
- 生产端 commit 与固定版本一致，且记录了 exporter 镜像哈希；
- 用作能量分母的 token 数为正。

其余数据点都是 **Historical**：吞吐量照常计入，但该点没有能量指标，也不参与建模的 IT 和设施功耗。每个数据点上的审计记录会列出失败原因、样本数、最大间隔和窗口边界。

调整采样间隔、GPU 数、窗口偏差、采集端版本和 token 数，查看判定结果及其原因代码。

![有效性探索器](../../public/images/powerx-tutorial/widgets/validity.png)

Historical 数据点在其他所有视图中仍保留吞吐量。

## 在自己的运行中采集功耗

功耗采集是每次官方 InferenceX sweep 的一部分，提交的测试配置会自动被测量。要自行运行：

1. 在 InferenceX 的 matrix 配置中，为多节点条目设置 `power: true`；单节点和 AgentX 任务直接使用集群自带的 exporter。
2. 如果希望无效测量直接让任务失败而不是记录无效判定，设置 `require-power`（或 `REQUIRE_POWER=1`）。
3. 读取结果：汇总 JSON 包含 `power_valid`、`avg_power_w`、`p90_power_w` 和各 `joules_per_*` 指标；`power_audit_<result>` 产物包含 `samples.csv`、窗口文件和 `power_validation_<result>.json`。
4. 通过 API 或 `@semianalysisai/inferencex-skills` 包中的 `inferencex powerx export` 命令获取已发布的数据。

选择平台、拓扑、工作负载和严格程度，即可得到 matrix 配置行、workflow 输入和结果字段。

![运行配置生成器](../../public/images/powerx-tutorial/widgets/run-config.png)

字段参考：[configs/CONFIGS.md](https://github.com/SemiAnalysisAI/InferenceX/blob/main/inferencex-e2e/configs/CONFIGS.md)。

## 常见问题

**为什么实测功耗远低于 TDP？** 以 decode 为主的推理受限于内存和延迟目标，而不是计算，所以 GPU 很少触及功率上限。Prefill、视频生成和训练则接近 TDP。

**DCGM 和 nvidia-smi 的读数有差异吗？** 没有。两者读取的是同一个 NVML 传感器，固件本身已经按约 1 秒做了平均，因此采样快于 1 Hz 收益很小。DCGM 额外提供一个守护进程和一个能量计数器。

**为什么用 P90 而不是平均值？** 容量是按峰值配置的。P90 是窗口内 10 % 时间会超过的功率，安全余量应在它之上叠加。

**为什么提供不含 PUE 的 IT 口径？** 数据中心容量团队按每 GPU 的关键 IT kW 做规划。PUE 取决于站点，所以 Facility 口径单独应用它。

**功耗模型变化时会发生什么？** 不存储任何建模值。每个建模数字都由存储的 GPU 实测值按固定的模型版本重新计算，所以更新会同时改变所有数据点，模型版本会显示在提示框中。

**为什么同一次运行中其他点都是 Validated，只有一个点是 Historical？** 有效性按窗口判定。丢失一个样本或时钟不一致只会使该窗口失效；该点保留吞吐量，但失去能量指标。

**Facility 数值更高是否意味着站点效率更低？** 不是。PUE 是按散热类型固定的模型输入，不是对基准测试站点的测量。
