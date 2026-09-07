# Command errors and unattended exports

Read this when a scheduler consumes an InferenceX helper, a command fails, or an
installed skill needs an upgrade. Domain selection, units and interpretation stay
in the relevant PowerX, AgentX or comparison cookbook.

## Keep success and failure separate

All six data helpers and the installer accept `--error-format json`. This changes
failure diagnostics, not the successful export format. A failed command writes
one JSON document to stderr:

```json
{
  "schema_version": 1,
  "package": "@semianalysisai/inferencex-skills",
  "package_version": "0.10.0",
  "command": "export-powerx",
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "--model requires a display model name"
  }
}
```

Branch on the exit code first. Parse stderr as this error envelope only when the
command fails in JSON error mode. Successful commands may put domain coverage or
status information on stderr. Read the successful export from its selected
destination; an empty selection is a successful, scoped result.

| Exit  | Meaning in JSON error mode                          |
| ----- | --------------------------------------------------- |
| `0`   | Command completed, including valid empty selections |
| `2`   | Invalid arguments                                   |
| `1`   | An operational or unexpected failure                |
| `130` | Graceful cancellation                               |

| `error.code`       | Meaning                                                             |
| ------------------ | ------------------------------------------------------------------- |
| `INVALID_ARGUMENT` | Invalid or missing command input                                    |
| `HTTP_ERROR`       | The server returned a non-success status; `http_status` is included |
| `NETWORK_ERROR`    | The HTTP request could not complete                                 |
| `TIMEOUT`          | A request or HTTP sequence deadline expired                         |
| `INVALID_RESPONSE` | The response failed decoding, shape or domain validation            |
| `OUTPUT_ERROR`     | An export, evidence or output-stream write failed                   |
| `CANCELLED`        | The process handled an interrupt or termination signal              |
| `INTERNAL_ERROR`   | An unexpected failure outside the classified boundaries             |

Use `error.code` and optional `http_status` for decisions; retain `message` for
diagnosis. Human-readable wording is not a stable parsing interface. The default
and `--error-format text` preserve the existing text diagnostics and argument exit
behavior. The installer's existing `--json` controls its stdout result; explicit
`--error-format json` takes precedence for failures and emits no legacy stdout
error object.

For example, run the installed PowerX helper and preserve each result separately:

```python
import json
import subprocess
import sys
from pathlib import Path

attempt = Path("powerx-attempt-1")
attempt.mkdir()  # A fresh directory preserves earlier successes and failures.
command = [
    "node", ".agents/skills/inferencex-api/scripts/export-powerx.mjs",
    "--model", "DeepSeek-V4-Pro", "--isl", "8192", "--osl", "1024",
    "--format", "json", "--output", str(attempt / "powerx.json"),
    "--evidence-dir", str(attempt / "evidence"), "--error-format", "json",
]
result = subprocess.run(command, capture_output=True, text=True, check=False)
(attempt / "stdout.txt").write_text(result.stdout)
(attempt / "stderr.txt").write_text(result.stderr)
(attempt / "exit-code.txt").write_text(f"{result.returncode}\n")
if result.returncode:
    failure = json.loads(result.stderr)
    print(f"{failure['error']['code']}: {failure['error']['message']}", file=sys.stderr)
    raise SystemExit(result.returncode)
export = json.loads((attempt / "powerx.json").read_text())
print(f"Selected observations: {len(export['rows'])}")
```

Use the `.claude/skills` path for a Claude installation. The helpers do not retry
HTTP automatically. After an operational failure, inspect the retained evidence
and fix the reported condition before choosing a fresh attempt.
Before delivering an export command for a scheduler, run that exact command once
with a fresh attempt path. Verify directory creation, child exit status and retained
output files, including when the proposed command calls a wrapper you created.

## Output and cancellation limits

PowerX JSON carries `schema_version: 1` from package 0.10.0; its `metadata` and
`rows` retain their existing meanings. AgentX and comparison payloads retain
their own schema and domain fields. CSV contracts are unchanged.

Graceful `SIGINT`/`SIGTERM` cancellation aborts active HTTP work and follows the
helper's existing output rollback. Stdout must finish writing within five seconds; a stalled consumer yields
`OUTPUT_ERROR`. A consumer may already
have received part of a failed stdout stream: accept the export only after exit 0. A file export and its evidence manifest remain separate writes; verify both
before treating an evidence bundle as complete. `SIGKILL` prevents immediate cleanup
in the killed process. A later installer invocation can still recover supported
persisted installation transactions after `SIGKILL`, as described below.

## Inspect and recover an installation

Run the pinned installer's `status --json` to inspect the destination and
`install --force --dry-run --json` to preview the selected package. Both operations
leave files unchanged and report pending recovery. The invoking installer version
and the destination's installed version are separate facts. Count planned writes
from the returned `write_paths` entries.

An upgrade stages a complete merged skill directory and version receipt before
activation. Packaged files replace matching files; unrelated and obsolete files
are retained. Supported interrupted activation is recovered by the next real
installation. Keep transaction data intact when inspection reports a live owner,
foreign metadata or an unsafe path; resolve that reported condition before retrying.

These guarantees cover detected failures and supported process interruption.
They do not promise durability after power loss, repair arbitrary external edits,
or replace a backup of local changes.
