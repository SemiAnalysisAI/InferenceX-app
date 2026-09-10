# Power planning in the profit estimator

The per-gigawatt profit estimator retains its provisioned-power chart and adds a
current-run power comparison. It reads the existing full benchmark API response,
so GPU telemetry and physical topology survive the calculator transformation.
No new API, database column, producer change, or power formula is introduced.

Each throughput point retains its source observation. The comparison accepts
only an exact measured operating point; it never pairs interpolated throughput
with another point's GPU watts. JSON and CSV exports include observation IDs,
run URLs, model revision, power inputs, settings, assumptions, and unavailable
reasons. The section excludes historical comparisons.

The shared system model still supports only the fixed 8192-input/1024-output
workload. The profit estimator currently serves AgentX: its system estimates
remain unavailable until appropriate workload assumptions are established.
The low CPU/DRAM utilization model is not enabled for AgentX by this change. Missing telemetry
also remains unavailable, independently of model support.

For supported observations, capacity uses complete measured chassis and deployment
units. Partial-chassis extrapolation used elsewhere in PowerX is insufficient to
establish deployable capacity here. Separate CPU-only hosts are also unsupported
because their power lies outside the chassis estimate.

- Modeled facility watts = chassis AC watts × PUE, using the source rounding order.
- Planning watts per deployment = facility watts × 1.10.
- Deployments per utility GW = floor(1,000,000,000 / planning watts).
- GPUs = deployments × measured GPUs per deployment.

The supported model profiles describe air-cooled chassis and use PUE 1.3. This is
a model assumption, not verified site cooling. DLC is not modeled. The model's
pinned revision and component assumptions are documented in
[system power](powerx-system-power.md).

Both planning modes use the same exact-point throughput, token prices,
utilization, license fee, and bundled TCO per GPU-hour. All bundled costs scale
with GPU count. The calculator has no independent electricity-rate or cost
breakdown, so this comparison does not claim power-driven electricity savings
within TCO. The 10% headroom reserves capacity; it is not additional consumed
power. Expected facility watts are exported separately from planning watts and
are not converted into annual energy without an idle/load model.

The original chart keeps its continuous GPU-count denominator. A supported
comparison separately floors both provisioned and modeled deployment counts;
those figures can differ slightly from the chart.

## 中文说明

每吉瓦利润估算器保留原有预配功率图表，并新增当前运行的功耗规划对比。它读取现有
完整基准测试 API，保留 GPU 遥测与物理拓扑；不新增 API、数据库字段、生产端改动
或功耗公式。

每个吞吐量点关联来源记录。对比仅接受实际测量的运行点，不会把插值吞吐量与另一
运行点的 GPU 功率拼接。JSON 和 CSV 包含记录 ID、运行链接、模型版本、功率输入、
参数、假设及不可用原因。此区域不包含历史对比。

共用系统模型仍仅支持 8192 输入、1024 输出的固定长度工作负载。利润估算器目前
使用 AgentX；在确立适用假设之前，系统功耗估算保持不可用。本次改动不会为 AgentX
启用低 CPU/DRAM 利用率模型；缺少遥测也会独立导致结果不可用。

容量规划只采用完整实测机箱和完整部署。PowerX 其他视图采用的部分机箱外推不足以
确定此处的可部署容量；独立的纯 CPU 主机也不受支持，因为其功耗不在机箱估算范围内。
设施功率按机箱交流功率乘 PUE 计算，再增加 10% 电力余量得到规划功率。每个市电侧
GW 可容纳的部署数为 1,000,000,000 W 除以每个部署的规划功率并向下取整。
设施功率沿用模型源码的取整顺序。GPU 数 = 部署数 × 每个部署的实测 GPU 数。

支持的模型描述风冷机箱，采用 PUE 1.3；这是模型假设，并非已核实的测试站点
冷却方式。未对 DLC 建模。模型版本和组件假设见[系统功耗文档](powerx-system-power.md)。

两种规划方式沿用同一运行点的吞吐量、token 价格、利用率、许可费及综合 TCO
$/GPU/hr，并按 GPU 数量计算总成本。计算器没有独立电价或成本分项，因此不额外
计入电费节省。10% 余量是预留容量，不是额外耗电。预期设施功率与规划功率分别
导出；缺少空闲与负载模型时，不据此计算全年能耗。

原图表保留连续 GPU 数量分母。可用的规划对比对两种方式的完整部署数分别向下取整，
因此结果可能与图表略有差异。
