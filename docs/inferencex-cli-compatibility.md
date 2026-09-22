# InferenceX CLI 1.x compatibility and migration

InferenceX 1.0.0 has one query entry: `inferencex`. Formal commands create a new
contract 1 evidence directory and `inferencex verify` replays it offline.

Starting with 1.0.0, supported commands and arguments, documented required output
fields and their meanings, and exit-code semantics remain compatible across 1.x.
Minor releases may add commands, optional arguments, and optional output fields;
breaking changes to these guarantees require a new major package version. Human
summary wording and diagnostic message text are not machine-readable contracts.

Evidence format `schema_version: 1` is versioned independently from the npm
package. A package version bump alone does not select a new evidence format; consumers
inspect the recorded schema and contract versions. The 1.0.0 candidate uses the
existing contract 1 format and remains unpublished until the release gates pass.

## Supported contract

- Linux and macOS on Node 24 and 26 form the qualified release matrix. Windows is
  outside this qualification.
- Contract 1 JSON may add optional fields. Required fields, nullability, units, and
  closed status enums remain stable within contract 1.
- PowerX and AgentX CSV headers and order are fixed. IDs are strings; observation
  dates and UTC evidence timestamps are separate fields.
- `inferencex describe` publishes command metadata and `inferencex schema` publishes
  the contract schemas. Their metadata uses `output_schema: null`: neither utility
  emits a bundle summary or claims a domain-result schema.
- Exit 0 means a completed bundle whose requested policy passed or was absent; exit
  3 means valid evidence with an unmet policy. Exit 2 is invalid input, exit 1 is an
  operational or verification failure, and exit 130 is pre-commit cancellation.

Every formal operation requires `--output-dir <new-directory>`. A directory without
`manifest.json` is incomplete. Completed bundles are immutable; reports belong at
sibling paths.

## Move from 0.11 and earlier

| 0.11 and earlier                                | 1.0.0                                     |
| ----------------------------------------------- | ----------------------------------------- |
| `export-powerx.mjs --output x --evidence-dir e` | `inferencex powerx export --output-dir e` |
| `export-agentx.mjs --output x --evidence-dir e` | `inferencex agentx export --output-dir e` |
| `investigate-result.mjs`                        | `inferencex result inspect`               |
| `compare-tco.mjs`                               | `inferencex tco compare`                  |
| `compare-releases.mjs`                          | `inferencex releases compare`             |
| `compare-collectivex.mjs`                       | `inferencex collectivex compare`          |
| `verify-export.mjs --export x --evidence-dir e` | `inferencex verify e`                     |

The old commands and separately saved export formats from 0.11 and earlier are not supported query
interfaces in 1.0.0. Use the pinned historical package when an old export must be
replayed. The installer can upgrade an earlier installation with `--force`; this upgrade
compatibility does not promise that old query commands run under 1.0.0.

The installer preserves unmanaged files. An obsolete helper can therefore remain
on disk after upgrade, but it is not part of the current package or interface.
See the installed [CLI reference](../packages/skills/skills/inferencex-api/references/cli.md)
for commands, policy predicates, and bundle semantics.

## 1.1 skill entry and installation scope

The new `inferencex/` entry exposes `/inferencex` in Claude Code and `$inferencex`
(or selection through `/skills`) in Codex. It reads the shared guide under
`inferencex-api/`; CLI paths, arguments, output and evidence contracts are unchanged.
Both directories are installed together with separate recoverable transactions.
If interrupted between them, `status --json` reports the runtime at its existing
fields and the new entry under `entrypoint`; rerunning the same install completes
missing work. `--force` repairs managed files while preserving unrelated files.
Each directory has its own integrity manifest and receipt. The additive `ready`
field is true only when both entries are healthy and match
the executing installer version. A successful runtime status alone does not establish
that the task entry is installed. Cancellation between directory commits may leave
a healthy runtime with a missing entry; rerunning installation completes it.

`install` and `status` accept `--scope project|user` (default `project`). User scope
uses `~/.claude/skills` for Claude Code and `~/.agents/skills` for Codex/agents.
Explicit `--dir` cannot be combined with `--scope`. A project installation does not
replace a personal installation; check the same scope used for installation.

`discover configs` and `discover dates` accept the DB model key that
`discover models` lists (for example `dsv4`) in addition to the OpenAPI display
selector (for example `DeepSeek-V4-Pro`). A key is resolved through the public
`/api/v1/views/options` registry only when the target endpoint does not accept the
requested form; the extra request is recorded in `sources`. The discovery `scope`
gains the optional fields `model_resolution` (`openapi_selector` or `db_model_key`)
for configs and `requested_model`, `raw_models`, and `model_selector` for dates.
An ambiguous or unknown key is still reported as unresolved without a benchmark
request. Existing display-selector calls make the same requests as before.

### 中文说明

1.1 新增 `inferencex/` 入口：Claude Code 使用 `/inferencex`，Codex 使用
`$inferencex` 或从 `/skills` 选择。入口读取 `inferencex-api/` 中的共用指南，
CLI 路径、参数、输出和证据契约均未改变。

两个目录一同安装，各自使用可恢复的安装事务。中途退出时，`status --json` 的原有字段
报告运行时（`inferencex-api/`）状态，新增 `entrypoint` 报告任务入口；重新执行相同
安装命令即可补齐未完成的部分。`--force` 修复由安装器管理的文件，并保留无关文件。
每个目录都有独立的 integrity 清单和安装记录。新增 `ready` 字段仅在两个目录均正常，
且版本都与当前安装器一致时为 true。运行时正常不代表入口已安装；两个目录提交之间
取消安装，可能留下正常的运行时和缺失的入口，重新安装即可补齐。

`install` 和 `status` 支持 `--scope project|user`，默认 `project`。
用户级安装时，Claude Code 使用 `~/.claude/skills`，Codex/agents 使用 `~/.agents/skills`。
显式指定 `--dir` 时不能同时使用 `--scope`。
项目级与用户级安装彼此独立，检查状态时应使用安装时选择的 scope。

`discover configs` 和 `discover dates` 的 `--model` 除 OpenAPI 展示名称（如
`DeepSeek-V4-Pro`）外，也接受 `discover models` 列出的数据库模型键（如 `dsv4`）。
仅当目标接口不接受所给形式时，才通过公开的 `/api/v1/views/options` 注册表解析，
额外请求记录在 `sources` 中。discovery 的 `scope` 新增可选字段：configs 的
`model_resolution`（`openapi_selector` 或 `db_model_key`），dates 的
`requested_model`、`raw_models` 和 `model_selector`。无法解析或有歧义的键仍报告为
未解析，不会发起 benchmarks 请求；原有展示名称调用的请求序列不变。
