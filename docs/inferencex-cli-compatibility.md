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
