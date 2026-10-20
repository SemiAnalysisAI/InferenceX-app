# InferenceX skills 1.2.0

Adds `inferencex-pr-improvements` for historical throughput gains and modeled
cost reductions at a fixed interactivity target. Codex and Claude Code
installations include the skill and its renderer.

The skill produces a waterfall chart, CSV, and summary with available source PR
and benchmark-run links. It accepts live API queries or saved waterfall responses,
keeps AgentX P90 and single-turn median interactivity distinct, and reports missing
data and provenance. Source links do not establish isolated causal PR effects.

Existing CLI commands and evidence formats remain compatible. The new skill's
raw-view artifacts are not formal CLI verification bundles.

## 中文说明

新增 `inferencex-pr-improvements`，在固定交互速度目标下展示历史吞吐量提升和模型估算的成本下降。
Codex 和 Claude Code 安装均包含该入口及其渲染脚本。

该入口支持线上 API 查询或已保存的 waterfall 响应，生成瀑布图、CSV 和汇总，
并保留可用的来源 PR 与基准测试运行链接。AgentX 使用 P90 交互速度，单轮工作负载使用中位数，
缺失数据及来源信息会明确标注。来源链接不代表已单独验证每个 PR 的因果贡献。

现有 CLI 命令和证据格式保持兼容。新增入口生成的视图产物不属于正式 CLI 核验包。
