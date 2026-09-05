# @semianalysisai/inferencex-skills

One Agent Skill, `inferencex-api`, for querying the
[InferenceX public API](https://inferencex.semianalysis.com/api) from Codex or Claude Code.
It supports current OpenAPI discovery, benchmark, evaluation, dataset and history
lookups, plus worked PowerX and AgentX exports that preserve request context,
observation identity and source links.

The [public API cookbook](skills/inferencex-api/references/public-api-examples.md)
also provides evaluation lookups and dataset-to-conversation inspection, with
request context, exact identifiers, missing values, and page/sample boundaries.
It also covers benchmark history filtered by GPU, workload and observation-date range.

The npm commands below pin version `0.4.0` and require that version to be published.
For review before publication, use the local archive instructions below.

## New in 0.4.0

AgentX summaries now export existing observations as deterministic CSV by default
or explicit JSON. Exact, case-sensitive configuration filters and a positive
concurrency filter are reported as applied or omitted. The exporter joins only the
four documented summary endpoint families and can save every consumed response
with `--evidence-dir`; missing and null values remain missing, while `0` and `false`
remain explicit. The AgentX cookbook also provides a bounded recipe for one selected
result ID, including an early stop before heavy trace routes when availability is
false or the selected key is absent. These workflows do not run benchmarks or
evaluate answer quality.

## Prerequisites

Node 24 or later with npm, and Codex or Claude Code. Installing from npm requires
registry access; benchmark queries need public HTTPS access. The installed skill
works outside this repository without database credentials or additional runtime
dependencies.

## Install from npm

Run the command for your agent from the project where it should discover the skill:

```bash
# Codex
npm exec --yes --package @semianalysisai/inferencex-skills@0.4.0 -- inferencex-skills install --target codex

# Claude Code
npm exec --yes --package @semianalysisai/inferencex-skills@0.4.0 -- inferencex-skills install --target claude
```

| Target              | Skill location relative to the current project |
| ------------------- | ---------------------------------------------- |
| `codex` or `agents` | `.agents/skills/inferencex-api/`               |
| `claude` (default)  | `.claude/skills/inferencex-api/`               |

For an explicit skills-root directory or inspection:

```bash
npm exec --yes --package @semianalysisai/inferencex-skills@0.4.0 -- inferencex-skills install --dir './my project/.agents/skills'
npm exec --yes --package @semianalysisai/inferencex-skills@0.4.0 -- inferencex-skills list
npm exec --yes --package @semianalysisai/inferencex-skills@0.4.0 -- inferencex-skills --help
```

`--dir` selects the parent skills directory; the installer appends `inferencex-api`.
A relative directory resolves from the current working directory and takes precedence
over `--target`. Help and list leave files unchanged.

### Review a local archive

To review a maintainer-supplied `.tgz` before publication, replace the path with the
actual archive and run from the target project. Use `--target claude` for Claude Code.

```bash
INFERENCEX_SKILLS_TGZ='/absolute/path/semianalysisai-inferencex-skills-0.4.0.tgz'
npm exec --yes --offline --package "$INFERENCEX_SKILLS_TGZ" -- inferencex-skills install --target codex
```

Keep the quotes for paths containing spaces. The archive has no runtime dependencies,
so `--offline` installs without accessing the npm registry. API queries still need
internet access. The same installer commands and options apply.

## Use and upgrade

Open an agent session in the project and ask:

> Use inferencex-api to show five latest available DeepSeek-V4-Pro observations for
> single-turn requests with 8192 input and 1024 output tokens. Include the actual
> measurement dates, raw model keys, request URL, and source run links.

The installed [SKILL.md](skills/inferencex-api/SKILL.md) contains the lookup example.
It reads supported operations and model names from the
[current OpenAPI document](https://inferencex.semianalysis.com/api/openapi.json).
Latest available data may contain historical measurements; the requested cutoff and
each observation's date remain separate.

The skill helps navigate the public API; the single-turn PowerX exporter below is
one worked export example, not the boundary of API lookup support.

### Export measured PowerX data

Ask the installed skill:

> Use inferencex-api to export measured PowerX data for DeepSeek-V4-Pro, single-turn
> requests with 8192 input and 1024 output tokens, as CSV. Require strictV2, preserve
> source identities and measurement dates, and report the selected scope and counts.

The [PowerX cookbook](skills/inferencex-api/references/powerx.md) explains measured
per-GPU watts, whole-deployment GPU energy, validity, and provenance. You can also
run the bundled Node 24 exporter from your project:

```bash
# Codex installation: CSV (the default format)
node .agents/skills/inferencex-api/scripts/export-powerx.mjs \
  --model DeepSeek-V4-Pro --isl 8192 --osl 1024 --output powerx.csv 2> powerx-report.log

# Claude Code installation: JSON with an as-of cutoff
node .claude/skills/inferencex-api/scripts/export-powerx.mjs \
  --model DeepSeek-V4-Pro --isl 8192 --osl 1024 \
  --date 2026-09-04 --format json --output powerx.json
```

For a custom installation, use its actual `inferencex-api/scripts/export-powerx.mjs`
path. Output paths resolve from your current directory. `--raw-model` optionally
narrows a returned model key; omitted `--date` means latest available observations.
Both formats retain request and package-version metadata. JSON preserves optional
nested worker/audit data; CSV leaves missing metrics blank and preserves real zeros.
Status and coverage go to stderr; omitting `--output` sends the export to stdout.
The report log includes a JSON metadata record even when CSV has no selected rows.
It records the applied filters, disjoint exclusion counts, and `metric_coverage`: each
field's finite-value and unavailable counts among selected rows. A validated row can
still lack a requested metric. Keep that row and report the missing metric; never
fill it with zero. Some role-specific metrics may not apply to every configuration.

The exporter downloads complete JSON and selects numeric validity `1`, schema `2`,
and the exact single-turn workload. Empty results report that no strictV2 rows
matched the requested scope; request/response failures exit unsuccessfully. These
are existing observations, not new benchmark runs. The cookbook describes the
measurement units and limitations; strict validity alone does not establish an
energy-efficiency advantage.

For the original response behind an export, add `--evidence-dir ./powerx-evidence`.
The directory must be new. It receives the complete same-request decoded response
and a manifest linking its SHA-256 to the output, request context and extraction
metadata. CSV, JSON, stdout and empty selections are supported. Evidence is optional;
requested evidence-write failures fail the command. See the [capture contract](skills/inferencex-api/references/powerx.md#save-the-response-used-by-an-export).

### Export AgentX summaries and inspect one point

Ask the installed skill:

> Use inferencex-api to export the latest AgentX summaries for DeepSeek-V4-Pro as
> CSV and JSON. Save the complete response evidence, preserve missing, null, zero
> and false values, and explain the exact filters and counts.

Or run the installed Node 24 exporter directly:

```bash
# Codex installation: deterministic CSV (the default format)
node .agents/skills/inferencex-api/scripts/export-agentx.mjs \
  --model DeepSeek-V4-Pro --output agentx.csv \
  --evidence-dir ./agentx-csv-evidence 2> agentx-report.log

# Claude Code installation: explicit JSON
node .claude/skills/inferencex-api/scripts/export-agentx.mjs \
  --model DeepSeek-V4-Pro --format json --output agentx.json \
  --evidence-dir ./agentx-json-evidence
```

Optional `--raw-model`, `--hardware`, `--framework`, `--precision`,
`--spec-method`, and `--offload-mode` values match returned values exactly and
case-sensitively; `--concurrency` requires an exact positive integer. The optional
`--date YYYY-MM-DD` applies an as-of cutoff; omitting it selects the latest available
observations. The exporter reads `/api/v1/benchmarks` and locally selects rows whose
`benchmark_type` is exactly `agentic_traces`. It adds enrichments only through the
request-size-bounded `/api/v1/agentic-aggregates`,
`/api/v1/derived-agentic-metrics`, and `/api/v1/trace-availability` endpoints.
CSV leaves missing and null cells blank and preserves `0` and `false`; JSON keeps
each selected benchmark object separate from its enrichment. Every evidence path
must be new and contains the complete responses consumed by that export plus a
manifest linking them to the output.

`no_agentx_rows` means the benchmark response contained no AgentX observations;
`no_matching_rows` means the requested exact filters excluded the AgentX rows in
that response. Neither outcome describes jobs, artifacts, or data outside the
response. After the user chooses one exact result ID, follow the bounded recipe in
the [AgentX cookbook](skills/inferencex-api/references/agentx.md). It validates a
positive JavaScript safe integer, keeps trace diagnostics bound to that ID, and
stops before timeline, histogram, and server-metric requests when trace
availability is false or omitted.

### Inspect the installed version

```bash
npm exec --yes --package @semianalysisai/inferencex-skills@0.4.0 -- inferencex-skills status --target codex
```

Use `--target claude` or `--dir './my project/.agents/skills'` to inspect another
destination. `status` reports the invoking installer version, the version last
successfully installed in that destination, and the installed skill directory's
absolute path separately.
It only reads local files and makes no API requests. npm may fetch the installer
first; add npm's `--offline` when the selected package version is already cached.

Legacy installations without a version record, including `0.1.0`, report an
unknown installed version. Invalid or unreadable records are also reported as
unknown. For `0.4.0` and later receipts, the record must agree with the static
version declarations in both the PowerX and AgentX exporters. Earlier receipts
are checked against PowerX only; a stale AgentX file left by a forced downgrade is
ignored. Missing, unreadable, or disagreeing required declarations report unknown.
`status` reads these declarations without executing either exporter. This limited
check is not a full integrity check and cannot detect every local edit.
`--version` reports only the invoking installer version, not the project's installed copy.

### JSON output and installation preview

```bash
npm exec --yes --package @semianalysisai/inferencex-skills@0.4.0 -- inferencex-skills status --target codex --json
npm exec --yes --package @semianalysisai/inferencex-skills@0.4.0 -- inferencex-skills install --target codex --force --dry-run --json
```

`--json` on `status` or `install` emits one JSON document to stdout; diagnostics go
to stderr. Without it, existing text output remains available. Schema version 1:

| Field                          | Meaning                                                         |
| ------------------------------ | --------------------------------------------------------------- |
| `schema_version`               | `1`                                                             |
| `package`, `installer_version` | Executing npm package and version                               |
| `skill_path`                   | Resolved absolute destination                                   |
| `installation_state`           | `installed`, `not_installed`, or `unknown`                      |
| `installed_version`            | Verified receipt/exporter version, otherwise `null`             |
| `reason`                       | Human-readable explanation or `null`; do not parse it for state |

Install output also includes `dry_run`, `outcome`, `write_paths`, and
`preserves_extra_files`. Outcomes are `installed`, `overwritten`, or `skipped`;
previews use `would_install`, `would_overwrite`, or `would_skip`. Written paths are
relative to `skill_path` and include the version receipt; skip writes nothing.
A skipped install and a preview report the existing installation's state, not the
version that the executing package would install.

`--dry-run` uses the same destination and conflict checks as installation, supports
`--target`, `--dir`, and `--force`, and lists the packaged paths it would write.
It changes no files, directories, receipts or permissions and makes no API request.
The npm launcher may download the selected package before the installer starts.
Unrelated and obsolete files remain untouched, including during a forced upgrade.

Exit codes: `0` for successful installation, skip, preview or inspection (including
unknown/absent installations); `2` for invalid arguments; `1` for operational
failure. JSON failures use `{ "schema_version": 1, "outcome": "failed", "reason": "..." }`
without stale installation fields; use the exit code to determine success.

### Upgrade

Repeated installation skips an existing skill. Add `--force` to reinstall a pinned
version. To upgrade, replace `0.4.0` with the published version you intend to install:

```bash
npm exec --yes --package @semianalysisai/inferencex-skills@0.4.0 -- inferencex-skills install --target codex --force
npm exec --yes --package @semianalysisai/inferencex-skills@0.4.0 -- inferencex-skills install --target claude --force
```

Force merges the packaged files into the existing skill and overwrites matching
files. It preserves unrelated neighboring skills and leaves obsolete files in the
skill directory. Keep a copy of local edits before choosing an overwrite.

## 中文说明

本包提供一个 Agent Skill（智能体技能）`inferencex-api`，供 Codex 或 Claude Code
查询 [InferenceX 公开 API](https://inferencex.semianalysis.com/zh/api)。技能支持查阅
实时 OpenAPI，查询基准测试、评估、数据集和历史记录，并提供 PowerX 与 AgentX
导出示例；导出结果保留请求上下文、观测数据标识和来源链接。技能面向整个公开 API，
这些导出示例并不限定技能的查询范围。

[公开 API 指南](skills/inferencex-api/references/public-api-examples.md) 还提供评估查询和
数据集到会话详情的完整示例，说明如何保留请求上下文、原始标识符、缺失值，以及分页和
抽样范围；还提供按 GPU、工作负载和观测日期范围筛选历史基准测试数据的示例。

上面的 npm 命令固定使用 `0.4.0`，需在该版本发布后执行。发布前审阅请使用本地产物
安装流程。

0.4.0 新增 AgentX 汇总导出：默认生成行列顺序稳定的 CSV，也可显式选择 JSON；硬件、
框架、精度、投机解码方式、offload 模式等配置筛选均区分大小写并要求精确匹配，并支持
精确的正整数并发数筛选。导出器会标明每项筛选是已应用还是未指定，只从四类已记录的
汇总接口补充数据，并可用 `--evidence-dir` 保存本次导出实际使用的全部响应。缺失值和
`null` 保持缺失，`0` 与 `false` 保留原值。AgentX 指南还提供范围限定为一个已选结果
ID 的诊断流程；trace availability 为 `false` 或未返回所选 ID 时，会在读取高开销
trace 接口前停止。这些流程只读取现有观测数据，不运行基准测试，也不评估模型回答质量。

需要 Node 24 或更新版本、npm，以及 Codex 或 Claude Code。从 npm 安装需要访问
npm 仓库，查询需要访问公开 HTTPS 接口；安装后的技能无需检出本仓库，也不需要
数据库凭据或额外运行时依赖。

在目标项目目录中执行上面对应智能体的安装命令。`--target codex` 和 `--target agents`
将技能安装到 `.agents/skills/inferencex-api/`；`--target claude` 安装到
`.claude/skills/inferencex-api/`，也是省略目标时的默认行为。

`--dir` 指定存放各项技能的目录，安装器在其中创建 `inferencex-api`。相对路径以
当前工作目录为基准，且 `--dir` 优先于 `--target`。`list` 和 `--help` 不修改文件。

发布前审阅可使用维护者提供的 `.tgz`：在目标项目目录中执行上面的本地产物安装
命令，将 `INFERENCEX_SKILLS_TGZ` 改为实际路径，并保留引号以支持带空格的路径。
Claude Code 使用 `--target claude`。本地产物没有运行时依赖，因此可用 `--offline`
在不访问 npm 仓库的情况下安装；后续 API 查询仍需要联网。安装器的命令和选项用法不变。

安装后，在该项目的智能体会话中提出请求，例如：

> 使用 inferencex-api 查询 DeepSeek-V4-Pro 最新可用的五条基准测试观测数据，限定为
> 输入 8192、输出 1024 个 token 的单轮请求。请附上实际测量日期、原始模型键、
> 请求 URL 和来源运行记录链接。

已安装的 [SKILL.md](skills/inferencex-api/SKILL.md) 包含查询示例，并从
[实时 OpenAPI 文档](https://inferencex.semianalysis.com/api/openapi.json) 获取受支持的接口
和模型名称。最新可用数据可能包含历史测量值；查询指定的截止日期与每条数据自身的
测量日期是两项独立信息。

也可以提出 PowerX 导出请求：

> 使用 inferencex-api 将 DeepSeek-V4-Pro 的实测 PowerX 数据导出为 CSV，限定为输入
> 8192、输出 1024 个 token 的单轮请求，并要求 strictV2。请保留来源标识和测量日期，
> 说明筛选范围及返回、选中的数据条数。

[PowerX 指南](skills/inferencex-api/references/powerx.md) 说明实测单 GPU 功率、整个
部署的 GPU 能耗、验证状态和溯源字段。也可直接在项目目录中执行上面的 Node 24 导出
命令：Codex 默认使用 `.agents/skills/inferencex-api/scripts/export-powerx.mjs`，
Claude Code 使用 `.claude/skills/inferencex-api/scripts/export-powerx.mjs`；自定义
安装则使用实际路径。输出文件路径以当前工作目录为基准。

`--raw-model` 可进一步筛选响应中的原始模型键；省略 `--date` 表示查询最新可用观测值。
默认格式为 CSV，也支持 JSON；两种格式均记录请求与包版本元数据。JSON 保留可选的嵌套
worker/审计信息；CSV 将缺失指标留空，并保留真实零值。状态和覆盖范围输出到 stderr，
省略 `--output` 时将导出内容写入 stdout。
即使 CSV 没有选中任何数据行，示例中的报告日志也会包含一条 JSON 格式的元数据记录。
该记录包含实际筛选条件、互不重叠的排除数量，以及 `metric_coverage`：即每个字段在
选中数据行中有限数值的条数与不可用的条数。已通过验证的数据行仍可能缺少用户请求的
指标；此时应保留该行并说明指标缺失，不能补零。部分按角色拆分的指标可能并不适用于
所有配置。

导出器下载完整 JSON，只保留验证值为数字 `1`、schema 为数字 `2` 且满足指定单轮工作
负载的数据。结果为空时，导出器会报告该范围内没有匹配的 strictV2 数据；请求或响应失败会以非零
状态退出。导出使用已有观测值，不会启动新的基准测试。指标单位和限制见 PowerX 指南；
通过严格验证本身并不能证明具有能效优势。

需要保留导出所用的完整原始响应时，添加 `--evidence-dir ./powerx-evidence`，并使用
尚不存在的目录。该目录中会保存同一次请求解压后的完整响应体，以及一份清单，将该
响应体的 SHA-256 与导出结果、请求上下文和提取元数据关联起来。
该选项支持 CSV、JSON、stdout 和空结果；默认不保存响应。显式请求保存证据后，写入失败
会导致命令失败。详细字段和适用范围见 [PowerX 指南中的响应保存约定](skills/inferencex-api/references/powerx.md#save-the-response-used-by-an-export)。

### 导出 AgentX 汇总并检查单个数据点

可让已安装的技能导出 DeepSeek-V4-Pro 最新的 AgentX CSV 与 JSON 汇总：保存完整响应
证据，保留缺失值、`null`、零值和 `false`，并说明精确筛选条件和数据条数。也可在项目
目录中直接运行已安装的 Node 24 导出器：

```bash
# Codex 安装：默认生成行列顺序稳定的 CSV
node .agents/skills/inferencex-api/scripts/export-agentx.mjs \
  --model DeepSeek-V4-Pro --output agentx.csv \
  --evidence-dir ./agentx-csv-evidence 2> agentx-report.log

# Claude Code 安装：显式选择 JSON
node .claude/skills/inferencex-api/scripts/export-agentx.mjs \
  --model DeepSeek-V4-Pro --format json --output agentx.json \
  --evidence-dir ./agentx-json-evidence
```

`--raw-model`、`--hardware`、`--framework`、`--precision`、`--spec-method` 和
`--offload-mode` 均为可选筛选；一经提供，必须与响应中的值完全一致并区分大小写。
`--concurrency` 必须是精确的正整数。`--date YYYY-MM-DD` 为可选项，用于限定观测日期不
晚于该日；省略时选择最新可用观测数据。导出器读取 `/api/v1/benchmarks`，并在本地仅选择
`benchmark_type` 恰为 `agentic_traces` 的数据，再只通过有请求规模上限的
`/api/v1/agentic-aggregates`、`/api/v1/derived-agentic-metrics` 和
`/api/v1/trace-availability` 三个接口补充 AgentX 汇总与 trace availability 信息。CSV
中的缺失值和 `null` 留空，`0` 与 `false` 原样保留；JSON 将每条基准测试观测数据与其
补充信息分开保存。每次使用的证据目录都必须尚未存在，其中包含本次导出实际使用的完整
响应，以及将这些响应与输出关联起来的清单。

`no_agentx_rows` 表示本次基准测试响应中没有 AgentX 观测数据；`no_matching_rows`
表示精确筛选排除了响应中的 AgentX 数据。两者都不能说明响应以外的任务、产物或数据
是否存在。用户选定一个结果 ID 后，再按照
[AgentX 指南](skills/inferencex-api/references/agentx.md)中限定范围的单点流程检查。该
流程先验证 ID 能够无损表示为正的 JavaScript 安全整数，并将后续 trace 诊断限定在该
ID；如果 trace availability 为 `false` 或未返回对应键，则不会继续请求 timeline、
histogram 和 server metrics。

可执行上面的 `status --target codex` 命令查看项目内已安装的技能；其他目标使用
`--target claude` 或 `--dir`。输出会分别列出本次调用的安装器版本、目标目录中上次成功
安装的技能版本，以及技能目录的绝对路径。`status` 只读取本地文件，不会请求 API；但 npm 可能先
下载安装器。如指定版本已经缓存，可给 npm 加上 `--offline`。

包括 `0.1.0` 在内、没有版本记录的旧安装会显示版本未知。记录无效或无法读取时，同样
显示为未知。对于 `0.4.0` 及更新版本，版本记录必须同时与 PowerX 和 AgentX 导出器中的
静态版本声明一致；早于 `0.4.0` 的记录只核对 PowerX，强制降级后残留的 AgentX 文件不
参与判断。需要核对的声明缺失、无法读取或版本不一致时，状态也会显示为未知。`status`
只读取声明，不执行任何导出器。这项检查不是完整的文件完整性校验，也不能识别所有本地
修改。`--version` 只显示本次调用的安装器版本，不显示项目中已安装技能的版本。

`status` 和 `install` 支持 `--json`：stdout 只输出一个 JSON 文档，诊断信息写入
stderr。不加该选项时保留原有文字输出。上表定义 `schema_version: 1` 的字段：
`installer_version` 是执行中的安装器版本；`installed_version` 是经版本记录和导出器
声明核对后的已安装版本，无法确认时为 `null`。`installation_state` 分别用
`installed`、`not_installed`、`unknown` 表示已确认安装、未安装和状态未知；
`skill_path` 是绝对路径。`reason` 是供人阅读的说明或 `null`，程序应使用结构化状态字段。

安装结果还包含 `dry_run`、`outcome`、`write_paths`、`preserves_extra_files`。
实际结果为 `installed`、`overwritten` 或 `skipped`；预览结果为 `would_install`、
`would_overwrite` 或 `would_skip`。`write_paths` 相对于技能目录，包含版本记录文件；
跳过安装时为空。预览和跳过安装均报告目标目录的实际状态，不将安装器版本当作已安装版本。

`install --dry-run` 复用正式安装的目标路径与冲突检查，支持 `--target`、`--dir`、
`--force` 和 `--json`。它列出将写入的路径，不创建目录、不改动文件、版本记录或权限，
也不请求 API。不过 npm 可能在启动安装器前下载所选包。安装会保留其他文件和
不再随包提供的旧文件，强制升级也一样。

退出码 `0` 表示操作成功，包括跳过、预览，以及对未安装或版本未知状态的正常检查；
`2` 表示参数错误，`1` 表示操作失败。失败时的 JSON 为
`{ "schema_version": 1, "outcome": "failed", "reason": "..." }`，不包含可能已失效的
安装状态字段；请用退出码判断操作是否成功。

重复安装默认跳过已有技能。添加 `--force` 可重新安装指定版本；需要升级时，将命令中
的 `0.4.0` 改为计划安装的已发布版本。该选项会将包内文件合并进已有技能目录，并覆盖
同名文件；相邻的其他技能不受影响，技能目录中已不再随包提供的旧文件也不会被删除。
覆盖前请自行备份本地修改。

## License / 许可证

GPL-3.0-or-later, matching the InferenceX-app repository.

采用 GPL-3.0-or-later，与 InferenceX-app 仓库一致。
