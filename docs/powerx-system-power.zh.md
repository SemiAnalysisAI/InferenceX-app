# PowerX 系统功耗与智能容量规划

[English](./powerx-system-power.md) | [简体中文](./powerx-system-power.zh.md)

本指南介绍如何查看实测曲线、估算系统功耗，以及比较固定设施功率预算下的 GPU 容量。
先按[仪表板操作步骤](#查看实测曲线)选择数据；结果缺失时，再查阅
[硬件要求](#硬件与遥测要求)和[排查说明](#曲线或估算结果缺失时如何排查)。

系统模型仍为 **DRAFT / pending human verification（草稿，待人工核验）**。
回归用例只能证明数值实现一致，不能证明已完成实机校准。包括 Kimi K3 在内的
AgentX 估算属于容量规划预览，不代表已完成 AgentX 校准，也不能作为安全峰值供电规划的依据。

## 选择功耗边界

| 仪表板边界                  | 数值含义                                                         |
| --------------------------- | ---------------------------------------------------------------- |
| GPU Level Measured          | 基准测试窗口内通过验证的 GPU 板卡实测功率。                      |
| GPU Level Provisioned (TDP) | 硬件 TDP 参考值，不是本次运行的测量值。                          |
| All in Provisioned          | 硬件注册表中固定的设施 kW/GPU 配额。                             |
| All in Measured             | 实测输入加上系统组件和设施开销的模型估算，不是墙上功率计的读数。 |

下文示例采用 W/GPU 和 J/输出 token。系统模型不支持某条记录，并不影响
该记录有效 GPU 测量值的展示。实测 P75/P90 是全部 GPU 同步汇总功率的时间加权
分位数，再除以 GPU 数量；平均值和单卡分位数都不能替代。

## 查看实测曲线

**前提：**所选基准测试保留了功耗数据。若实验性功耗控件未显示，用 ↑↑↓↓ 解锁。

1. 打开 `/inference`，选择模型（如 Kimi K3）、工作负载、日期/运行、引擎、精度和
   硬件。比较不同功耗边界时保持这些选项一致；不同引擎或历史运行属于不同曲线。
2. 选择实测功耗指标和 **GPU Level Measured**，通过 **Table** 查看数值记录，点击
   图表上的数据点查看测量来源。先看平均 W/GPU：能耗还需要有效的 token 分母，
   P75/P90 则需要保留相应分位数测量值。
3. 切换到 **All in Measured** 查看设施功率估算。该边界支持 8K/1K 单轮结果和
   AgentX 预览；独立的 **Modeled Chassis AC** 指标仍仅支持 8K/1K 单轮结果。
4. 要比较容量，打开 `/profit-estimator-per-gigawatt`，选择模型和曲线支持的
   交互性目标，再在 Benchmark Config 中选择 **Compare both**。逐项核对结果的
   工作负载、引擎和精度是否与推理页面所选一致。悬停或选中柱形查看功耗依据，
   并阅读图表下方的公式说明。

**预期结果：**推理表格列出所选指标有效的记录，包括满足要求的 B200/H200 多节点
部署。All in Measured 不会包含所有 GPU 功耗有效的记录，还需满足下述输入要求。
利润估算器另有目标范围和财务输入要求，且只使用官方性能前沿上的数据点；推理
图表和表格同时支持非官方运行叠加。

## 硬件与遥测要求

| 硬件 / 部署方式                                | 系统估算所需输入                                                                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H100、H200、B200、B300、MI300X、MI325X、MI355X | 有效 GPU 板卡遥测；八卡机箱模型估算 CPU、DRAM、网络、存储、主板、风扇和 PSU 损耗。                                                                              |
| B200/H200 等受支持机箱的多主机部署             | GPU 数量与功率须一致。逐 worker 数据须明确每台独立主机对应一个机箱。没有 worker 数据的非分离式多节点记录，可按完整八卡主机使用部署平均负载（`uniform-hosts`）。 |
| Prefill/decode 分离式部署                      | 逐 worker 的主机分布和角色功率须与部署总量一致。仅有角色平均值无法确定各主机负载。独立的纯 CPU frontend/router 主机不在估算范围内。                             |
| GB200 / GB300 NVL72                            | 有效 GPU 遥测，**以及**同一窗口内完整且独立通过验证的计算模块或 Grace socket 遥测：每个计算 tray 为四张 GPU、两个 socket。                                      |

常规输入要求数值型 `power_valid=1`、`power_metric_schema_version=2`，
`avg_power_w`（W/GPU）和 `avg_total_gpu_power_w`（部署总 W）均为正值，且物理
GPU 数量一致。模型对已验证但没有 schema 标记的历史单节点记录保留例外，并标为
`validated-unversioned-single-node`；该例外不适用于未标版本的多节点、分离式或
NVL72 记录。利润规划始终要求 schema 2。

**NVL72 传感器边界：**要求 `cpu_power_valid=1`，且 `power_audit.cpu` 记录的预期
和实际 socket 数量一致，每个 tray 两个 socket。支持两种输入：

- `avg_total_module_power_w` 配合 `sensor_kind: module`，已覆盖 GPU、HBM、Grace
  和 LPDDR5X，不能再次加上 GPU 或 Grace 功率。
- `avg_total_cpu_power_w` 和 `avg_cpu_socket_power_w` 配合
  `sensor_kind: grace_socket`，总功率须与单 socket 平均功率及 socket 数量相符。
  模型另加 GPU 板卡功率，
  以及 GPU W × 0.15 / 0.85 的稳压损耗估算。

仅有 CPU rail 读数、缺少来源信息或传感器类型未知，都不满足要求。module 字段
存在但无效时，结果保持不可用，不会自动改用 Grace 读数。模型支持某字段，并不
代表每个生产端版本都已采集该字段。

**部分 GPU 分配：**单机箱仅测量一至七张 GPU 时，按实测单卡负载外推到八卡机箱，
标为 `extrapolated`；部署总量只计入已测 GPU 的份额。利润规划接受单节点 1/2/4 卡
机箱配置的整副本外推，前提是假设副本共置不改变性能和功耗。其他部分分配方式，
包括未测满的 NVL72 tray，不用于利润规划。module 传感器已覆盖整个 tray，因此
不会放大其读数来补足未测 GPU。

## 一个 NVL72 计算示例

**输入：**[GB300 参考用例](../packages/app/src/lib/system-power-model.reference.json)
中，每个完整 tray 的 module 功率为 **3,000.75 W**，PUE 为 1.1。这是数值回归
用例，不是 Kimi K3 实测结果。实际基准测试还须分别通过 GPU 和 CPU/module 验证。

1. 将实测平均 module 输入扩展到 18 个计算 tray，加上模型中的 tray 组件、九个
   NVSwitch tray、转换损耗及管理交换机。
2. 在整个机架的合计负载上计算一次电源架效率。每个已测 tray 分得 1/18 的机架
   功率；这是假设其余 tray 也处于相同平均负载，并非测量了实际机架占用情况。
3. 对机架 AC 功率应用一次 PUE，再除以 72 张 GPU。
4. 利润估算器另加 10% 的规划余量。

| 阶段                           | 功率（W） |
| ------------------------------ | --------: |
| Module 输入 × 18 个 tray       |  54,013.5 |
| 建模的计算 tray 组件           |  11,466.0 |
| 建模的 NVSwitch tray           |   4,107.6 |
| Tray 转换损耗                  |   1,967.8 |
| 机架 DC，包含 200 W 管理交换机 |  71,754.9 |
| 计入电源架损耗后的机架 AC      |  74,904.6 |
| 应用 PUE 1.1 后的设施功率      |  82,395.1 |

```text
规划 kW/GPU = 82,395.1 / 72 / 1,000 × 1.10 ≈ 1.258814
每 GW 的 GPU 容量 = 1,000,000 / 1.258814 ≈ 794,399
每 GW 每年的 GPU 小时 = GPU 容量 × 8,760
```

若基准测试使用两个完整 tray、共八张 GPU，其设施功率份额为
82,395.1 × 8 / 72 ≈ 9,155.0 W，归一到每张 GPU 后结果相同。这不代表测量了全部
72 张 GPU。中间值经过舍入，展示值相加可能相差 0.1 W。规划计算使用保留的设施
总功率，不使用参考用例中已舍入的单卡展示值。

## 估算采用的假设

- **PUE：**仪表板对风冷机箱使用 1.3，对 NVL72 使用 1.1，均在 AC 转换损耗之后
  应用。历史 profile 的默认值 1.2 不是仪表板默认值。冷却类型描述的是模型，不是
  经核实的现场实际冷却方式；改变 PUE 不会把风冷机箱模型变成 DLC 模型。
- **机箱开销：**系数采用固定假设：CPU/DRAM 利用率 20%、PCIe 利用率 5%、NVMe
  空闲。这些不是实时利用率读数。各主机的非线性风扇/PSU 模型按本机负载计算；
  `uniform-hosts` 则明确假设每台主机都采用部署平均负载。
- **NVL72 开销：**Grace 和 LPDDR5X 使用实测值；机架网络、交换机、风扇、主板
  其余开销、转换损耗和电源架由模型估算。[Profiles](../packages/app/src/lib/system-power-model.profiles.json)
  保留组件参数、来源状态和未核实参数的范围。机架 DC 超过已安装电源架容量
  264 kW 时，超出模型定义域。
- **规划余量：**设施 kW/GPU × 1.10 是独立的容量缓冲。平均功率加此余量不等于
  经过验证的供电峰值上限。
- **匹配比较：**各利润模式保持原性能前沿、目标、token 价格、利用率、授权分成
  和每 GPU 小时成本一致。目标位于两个前沿数据点之间时，只在这两个原始点之间
  插值规划功率，且模型版本、PUE、拓扑和传感器边界须兼容；不做范围外推，也不
  换用其他功耗有效的数据点。

较低的规划功率会提高每 GW 可容纳的 GPU 数量。在固定单卡假设下，收入、计算成本
和授权费用都随容量变化；利润率和每芯片小时的经济指标不会改善，也不会另行重算电费。

## 曲线或估算结果缺失时如何排查

先确认比较的是同一模型、工作负载、日期/运行、引擎、精度和指标。图表/表格记录与
按性能目标计算的利润估算，回答的问题不同。

| 现象 / 原因                                                       | 检查项与下一步                                                                                                  |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 有 GPU 曲线，但没有 All in Measured                               | 检查工作负载、硬件是否受支持，以及该记录的系统模型状态。GPU 功耗有效不等于系统估算可用。                        |
| B200/H200 多节点记录缺失（`topology`、`role-power`、`gpu-count`） | 检查物理 GPU 数量、主机分布和总功率/角色功率。使用原生产端拓扑，不从展示名称推断机箱分布，也不累加 TP/EP 别名。 |
| NVL72 返回 `cpu-telemetry` / `no-cpu-power`                       | 检查同一窗口的 CPU 审计、传感器类型和完整 socket 覆盖；GPU 有效性独立判断。                                     |
| `telemetry` / `no-measured-power`                                 | 检查原验证审计及原始样本。只有保留证据足以支持原窗口时才重处理，否则须重新采集匹配的性能和功耗。                |
| `outside-measured-range`，或目标区间端点功耗无效                  | 选择当前所选曲线支持的目标。两个原始端点的功耗都须有效，曲线上其他位置的有效点不能补齐这个缺口。                |
| `incompatible-power-basis`                                        | 不在 module 读数与 GPU 加 Grace 读数之间插值，也不在不同模型版本或 PUE 取值之间插值。                           |
| 缺少成本、token 组成或预配功率                                    | 检查财务输入；即使功耗有效，也可能无法计算两种利润结果。                                                        |
| `workload`、`hardware`、`model-domain`                            | 使用受支持的工作负载/profile 和定义域内的输入，不以零值或 TDP 替代缺失估算。                                    |

**Compare both** 在实测估算不可用时仍保留有效预配结果。仅实测模式不会用预配
功率代替。保留遥测和定向修复方式见[持久化与恢复](./powerx-persistence-recovery.md)；新采集的功率不能附到旧吞吐量上。

## 来源与可复现导出

核对数据点的测量来源，以及估算的模型版本、PUE、传感器边界和拓扑。利润图表提示框
标明功耗依据；公式说明及 CSV 中的 `Power basis`、`Power sensor`、
`System power profile` 列提供假设和来源细节。模型版本是 `app-sha256:` 摘要，不是基准
测试运行 ID，也不是 Git commit。

[离线导出器](../packages/app/scripts/export-modeled-system-power.ts)读取本地
`ComparisonInput`，其中包含原始 `BenchmarkRow`、元数据，以及可选的原始产物/
审计。完整结构以脚本中的类型为准；保留运行、attempt、生产端版本、获取时间和哈希。
导出器采用常规 8K/1K 模型策略，不启用 AgentX 预览。安装项目依赖后，从仓库根目录
运行，并指定一个新输出路径：

```sh
bun packages/app/scripts/export-modeled-system-power.ts \
  --input /path/to/cohort.input.json \
  --output /path/to/new-comparison
```

输出包括 `comparison.json`、`comparison.csv` 和可选的 `cells.csv`。JSON 保留原始
记录、审计、有效性、模型输出和来源；CSV 中不可用数值留空。可选参数 `--pue 1.3`
会覆盖**所有**记录的设施系数，并写入元数据；不传时采用各硬件默认值。实测数据提取
方法见 [API 示例](./inferencex-api-examples.md)。

建模能耗要求匹配的审计提供精确遥测时长、物理 GPU 数量，以及成功请求/token 分母。
计算为建模部署功率 × 时长，不是实测墙上功率的积分，也不会推断 kernel 级
prefill/decode 能耗。各次重复测试先独立建模再聚合；只要范围内任一次不可用，该单元
的均值就保持不可用。

## 维护模型

| 职责                                | 源码                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| 公式、非线性曲线和舍入              | [system-power-model.ts](../packages/app/src/lib/system-power-model.ts)       |
| 组件参数、假设和来源状态            | [profiles](../packages/app/src/lib/system-power-model.profiles.json)         |
| 工作负载、遥测、拓扑和 PUE 接纳规则 | [modelSystemPower](../packages/app/src/lib/modeled-system-power.ts)          |
| 匹配前沿和规划余量                  | [profit-power.ts](../packages/app/src/components/calculator/profit-power.ts) |
| 冻结的数值基线                      | [参考用例](../packages/app/src/lib/system-power-model.reference.json)        |
| 模型标识和源码哈希                  | [provenance](../packages/app/src/lib/system-power-model.provenance.json)     |

修改公式或生效系数时，同时提供有依据的期望值和假设元数据。仅修改 `u_cpu` 等标签
不会改变功率。刷新并检查 manifest：

```sh
bun packages/app/scripts/update-system-power-provenance.ts
bun packages/app/scripts/update-system-power-provenance.ts --check
```

运行受影响的模型、接纳规则、规划、views API 和导出检查。保留 496 个历史参考用例，
不要重写其基线；数值一致不代表完成校准。模型和参数由应用维护，不依赖私有 Python
仓库。历史测量数据在读取时建模，因此仅修改模型需要更新应用包并刷新 API 缓存或
等待其过期，不需要回填原始数据。冻结的导出文件需另行生成，缺失的源测量仍然缺失。
