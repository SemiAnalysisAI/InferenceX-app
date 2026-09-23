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
(or selection through `/skills`) in Codex. The `inferencex-to-chart/` and
`inferencex-to-table/` shortcuts use the same invocation conventions and default to
AgentX charts or tables and CSV. All three read the shared guide and CLI under
`inferencex-api/`; existing CLI paths and evidence contracts remain compatible.

All four directories are installed together with separate recoverable transactions.
`status --json` retains the runtime's existing fields and the general entry under
`entrypoint`; the additive `shortcuts` object maps `inferencex-to-chart` and
`inferencex-to-table` to their status records. Each directory has its own integrity
manifest and receipt. The additive `ready` field is true only when all four directories
are healthy and match the executing installer version. A successful runtime status
alone does not establish that the task entries are installed. Cancellation between
directory commits may leave healthy installed entries alongside missing ones;
rerunning the same installation completes the missing work. `--force` repairs
managed files while preserving unrelated files.

`install` and `status` accept `--scope project|user` (default `project`). User scope
uses `~/.claude/skills` for Claude Code and `~/.agents/skills` for Codex/agents.
Explicit `--dir` cannot be combined with `--scope`. A project installation does not
replace a personal installation; check the same scope used for installation.

`discover configs` and `discover dates` also accept the other model-name form:
DB keys such as `dsv4` or display selectors such as `DeepSeek-V4-Pro`.
Resolution adds optional `scope` fields and records the registry request in `sources`.
See the [CLI reference](../packages/skills/skills/inferencex-api/references/cli.md).

### 中文说明

1.1 新增 `inferencex/` 入口：Claude Code 使用 `/inferencex`，Codex 使用
`$inferencex` 或从 `/skills` 选择。`inferencex-to-chart/` 和 `inferencex-to-table/`
采用相同的调用方式，前者默认生成 AgentX 图表，后者默认生成表格与 CSV。三个入口共用
`inferencex-api/` 中的指南与 CLI，现有 CLI 路径和证据契约保持兼容。

四个目录一同安装，各自使用可恢复的安装事务。`status --json` 仍用原有字段报告运行时
（`inferencex-api/`）状态，用 `entrypoint` 报告通用入口；新增的 `shortcuts` 对象以
`inferencex-to-chart` 和 `inferencex-to-table` 为键，分别记录两者的状态。
每个目录都有独立的 integrity 清单和安装记录。新增 `ready` 字段仅在四个目录均正常，
且版本都与当前安装器一致时为 true。运行时正常不代表任务入口均已安装；目录提交之间
取消安装，可能出现部分入口已正常安装、部分入口缺失的情况。重新执行相同安装命令即可补齐；
`--force` 修复由安装器管理的文件，并保留无关文件。

`install` 和 `status` 支持 `--scope project|user`，默认 `project`。
用户级安装时，Claude Code 使用 `~/.claude/skills`，Codex/agents 使用 `~/.agents/skills`。
显式指定 `--dir` 时不能同时使用 `--scope`。
项目级与用户级安装彼此独立，检查状态时应使用安装时选择的 scope。

`discover configs` 和 `discover dates` 均支持数据库模型键（如 `dsv4`）和展示名称
（如 `DeepSeek-V4-Pro`）。解析结果写入可选的 `scope` 字段，注册表请求记录在 `sources`
中，详见 [CLI 参考](../packages/skills/skills/inferencex-api/references/cli.md)。
