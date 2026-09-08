# @semianalysisai/inferencex-skills

Installs the `inferencex-api` Agent Skill for Codex or Claude Code. The skill
queries existing public InferenceX observations and creates replayable evidence
bundles for PowerX, AgentX, result provenance, TCO, framework releases, and
CollectiveX. It never launches benchmarks.

## Requirements and installation

Use Node 24 or later. Public installation requires npm registry access; live
queries require public HTTPS but no repository checkout, database credentials, or
runtime dependencies.

```bash
# Codex
npm exec --yes --package @semianalysisai/inferencex-skills@0.12.0 -- \
  inferencex-skills install --target codex

# Claude Code
npm exec --yes --package @semianalysisai/inferencex-skills@0.12.0 -- \
  inferencex-skills install --target claude
```

These commands apply after 0.12.0 is published and publicly verified. For a candidate
archive, run from the target project:

```bash
INFERENCEX_SKILLS_TGZ='/absolute/path/semianalysisai-inferencex-skills-0.12.0.tgz'
npm exec --yes --offline --package "$INFERENCEX_SKILLS_TGZ" -- \
  inferencex-skills install --target codex
npm exec --yes --offline --package "$INFERENCEX_SKILLS_TGZ" -- \
  inferencex-skills status --target codex --json
npm exec --yes --offline --package "$INFERENCEX_SKILLS_TGZ" -- \
  inferencex-skills install --target codex --force --dry-run --json
```

Use that same candidate archive for every installer operation before publication.
An unpublished version returning `ETARGET` does not justify substituting `latest`.

| Target              | Installed skill                  |
| ------------------- | -------------------------------- |
| `codex` or `agents` | `.agents/skills/inferencex-api/` |
| `claude`            | `.claude/skills/inferencex-api/` |

`--dir <skills-root>` selects a custom parent directory. `list`, `status`,
`--dry-run`, and `--help` do not modify the installed skill.

## Unified CLI

The npm package exposes `inferencex` during `npm exec`. Copying the skill does not
add a persistent binary to `PATH`; invoke the copied entry with Node.

```bash
inferencex_cli=.agents/skills/inferencex-api/scripts/inferencex.mjs
node "$inferencex_cli" discover models
mkdir -p evidence
node "$inferencex_cli" powerx export --model GLM-5 --isl 8192 --osl 1024 \
  --output-dir evidence/powerx --require-hardware h200_sxm
node "$inferencex_cli" verify evidence/powerx --require-hardware h200_sxm
```

For Claude Code, set `inferencex_cli=.claude/skills/inferencex-api/scripts/inferencex.mjs`.

Formal commands create one new directory containing the result, complete decoded
responses, request ledger, hashes, coverage, policy, and a manifest written last.
Exit 0 means the bundle completed and any requested policy passed. Exit 3 means the
bundle is valid but an explicit coverage predicate failed. Completed bundles are
immutable; write reports to sibling paths and verify last.

The six formal routes are:

- `inferencex powerx export`
- `inferencex agentx export`
- `inferencex result inspect`
- `inferencex tco compare`
- `inferencex releases compare`
- `inferencex collectivex compare`

`inferencex discover`, `describe`, `schema`, `verify`, and `doctor` provide
discovery, offline contract metadata, replay, and installation diagnostics. See the
[CLI contract](skills/inferencex-api/references/cli.md) and the domain cookbooks for
options, units, dates, provenance, and interpretation.

PowerX and AgentX support contract 1 JSON and fixed-column CSV. Missing values stay
missing and real zeroes remain zero. TCO prices are explicit user assumptions.
Release and CollectiveX comparisons preserve unmatched coverage and do not establish
causality.

## Upgrade from 0.11 and earlier

```bash
npm exec --yes --package @semianalysisai/inferencex-skills@0.12.0 -- \
  inferencex-skills status --target codex --json
npm exec --yes --package @semianalysisai/inferencex-skills@0.12.0 -- \
  inferencex-skills install --target codex --force --dry-run --json
npm exec --yes --package @semianalysisai/inferencex-skills@0.12.0 -- \
  inferencex-skills install --target codex --force
```

Receipts from 0.12.0 onward use package integrity checks. A receipt from 0.11 or earlier identifies its
version and can be upgraded with `--force`. Matching packaged files are replaced;
local edits should be reviewed first. Unmanaged and obsolete files are preserved,
so a removed helper may remain on disk after upgrade without being a supported 0.12.0
command.

The 0.12.0 query interface is `inferencex` only. Direct domain scripts and
`verify-export.mjs` are not supported query commands. Exports from 0.11 and earlier need
the pinned package that created them. See the [migration guide](../../docs/inferencex-cli-compatibility.md).

The installer stages a merged destination and receipt before activation. A later
real install recovers supported interrupted transactions. `status` and
`--dry-run` inspect recovery without mutation; unsafe or foreign transaction state
remains blocked for review. These checks do not promise power-loss durability or
repair arbitrary external edits.

## Published history

Versions 0.1.0 through 0.11.0 are immutable published releases. The website remains
pinned to the anonymously verified 0.11.0 package until 0.12.0 publication and public
verification complete. Their historical interfaces remain available only by pinning
those versions; this README documents the 0.12.0 candidate. The package remains pre-1.0: later
minor releases may change the CLI. Evidence format `schema_version: 1` is separate
from the package version; a stable 1.0 release is deferred.

## 中文说明

`@semianalysisai/inferencex-skills` 为 Codex 或 Claude Code 安装
`inferencex-api` Agent Skill。它读取 InferenceX 已有的公开观测数据，为 PowerX、
AgentX、结果溯源、TCO、框架版本比较和 CollectiveX 生成可离线复核的证据目录，
不会启动新的基准测试。

### 安装

需要 Node 24 或更高版本。0.12.0 发布并完成公开验证后，可执行：

```bash
# Codex
npm exec --yes --package @semianalysisai/inferencex-skills@0.12.0 -- \
  inferencex-skills install --target codex

# Claude Code
npm exec --yes --package @semianalysisai/inferencex-skills@0.12.0 -- \
  inferencex-skills install --target claude
```

发布前审阅本地 `.tgz` 时，将 `--package` 的值换成产物绝对路径，并加上
`--offline`。安装、`status`、`--dry-run` 和重新安装均须使用同一份候选产物。
未发布版本返回 `ETARGET` 时，不能改用 `latest` 代替。Codex 安装到 `.agents/skills/inferencex-api/`，Claude Code
安装到 `.claude/skills/inferencex-api/`。`--dir` 可指定自定义 skills 根目录。

### 统一命令

0.12.0 只提供一个查询入口：`inferencex`。复制 skill 不会把命令长期加入 `PATH`，
因此应通过已安装脚本调用：

```bash
inferencex_cli=.agents/skills/inferencex-api/scripts/inferencex.mjs
node "$inferencex_cli" discover models
mkdir -p evidence
node "$inferencex_cli" powerx export --model GLM-5 --isl 8192 --osl 1024 \
  --output-dir evidence/powerx --require-hardware h200_sxm
node "$inferencex_cli" verify evidence/powerx --require-hardware h200_sxm
```

Claude Code 将变量设为 `.claude/skills/inferencex-api/scripts/inferencex.mjs`。

正式命令会创建一个新目录，保存结果、完整解码响应、请求记录、哈希、覆盖范围、
policy 和最后写入的 manifest。退出码 0 表示目录完整且显式 policy 通过或未指定；
退出码 3 表示证据有效，但显式覆盖要求未满足。完成后的证据目录不可修改，报告应写到
同级路径，并在所有其他写入完成后执行离线校验。

六个正式命令族分别是 `powerx export`、`agentx export`、`result inspect`、
`tco compare`、`releases compare` 和 `collectivex compare`。完整参数、单位、
日期和溯源规则见 [CLI 约定](skills/inferencex-api/references/cli.md)及各领域指南。

### 从 0.11 及更早版本升级

`status --json` 可查看当前安装，`install --force --dry-run --json` 可预览，
`install --force` 执行升级。0.12.0 起会校验 package 完整性；0.11 及更早版本的 receipt 只用于识别
旧版本，但仍可强制升级。安装器会保留不归当前 package 管理的文件，因此旧 helper
可能继续留在磁盘上，但不属于 0.12.0 支持的命令。

0.12.0 不支持直接执行领域脚本或 `verify-export.mjs`。需要处理旧版导出时，应固定使用
生成该导出的历史 package。0.1.0 至 0.11.0 均为不可变的已发布版本；网站在 0.12.0
发布并完成公开验证前继续固定到已验证的 0.11.0。

0.12.0 仍处于 1.0 之前的开发阶段，后续次版本可能调整 CLI。证据格式的
`schema_version: 1` 与包版本分别管理；1.0 稳定版留待后续发布。

## License / 许可证

GPL-3.0-or-later, matching the InferenceX-app repository.

采用 GPL-3.0-or-later，与 InferenceX-app 仓库一致。
