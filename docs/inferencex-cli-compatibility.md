# InferenceX CLI compatibility

Contract 1 adds one versioned `inferencex` entry while retaining the direct helper
scripts. Formal commands create a new evidence directory, write the manifest last,
and can be replayed offline.

## Supported consumers

- The release target matrix is Node 24 and 26 on Linux and macOS. Qualification
  requires retained passes for all four jobs. Windows is not yet qualified.
- JSON consumers may ignore additive optional fields. Required fields, nullability,
  scoped units, and closed status enums remain contract fields.
- PowerX and AgentX contract 1 CSV headers and order are fixed. Dynamic future API
  metrics remain in response evidence or JSON extensions.
- IDs are strings. Observation dates and evidence timestamps have separate fields.
- `inferencex describe` publishes command input, schema, format, limit, and policy
  metadata. `inferencex schema` publishes the twelve JSON Schemas.

## Automation boundary

Branch on exit before parsing stdout: 0 is a completed bundle whose explicit policy
passed or was absent; 3 is a completed bundle whose explicit policy failed. Exit 2
is invalid input, 1 is an operational or verification failure, and 130 is a
pre-commit cancellation. Errors are JSON by default on stderr.

Every formal operation requires `--output-dir <new-directory>`. It never overwrites
or resumes a directory. A directory without `manifest.json` is incomplete; retain
its saved complete responses and attempt records for diagnosis. A stdout failure can
occur after the manifest commits. That error records `bundle_complete: true` and the
directory, which can then be checked with `inferencex verify`.

## Legacy migration

| Before contract 1                                       | Contract 1                                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Separate `--output` and `--evidence-dir`                | One create-new `--output-dir`                                                         |
| Direct `export-powerx.mjs` / `export-agentx.mjs`        | `inferencex powerx export` / `inferencex agentx export`                               |
| Direct result and comparison helpers                    | `inferencex result inspect`, `tco compare`, `releases compare`, `collectivex compare` |
| `verify-export.mjs` with export plus evidence arguments | `inferencex verify <bundle-directory>`                                                |
| Empty success interpreted by ad hoc stderr              | Manifest coverage plus optional explicit policy; unmet policy exits 3                 |

Direct scripts preserve their historical interfaces, default text errors, and output
bytes. No removal date is declared. The legacy verifier accepts only known producers
0.9.0, 0.10.0, 0.11.0, and 1.0.0; unknown versions are rejected. New directory
bundles dispatch by `contract_version: 1` and record producer identity separately.

The installed [CLI reference](../packages/skills/skills/inferencex-api/references/cli.md)
contains all command examples and domain policy predicates. The six domain cookbooks
remain authoritative for units, dates, selection, and interpretation.
