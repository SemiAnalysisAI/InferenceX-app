# Command errors, scheduling, and installation recovery

Read this when automation consumes `inferencex`, a command fails, or an installed
skill needs an upgrade. Domain selection and interpretation stay in the domain
cookbooks; the complete interface is in [the CLI contract](cli.md).

## Handle one attempt

Each attempt needs a new output directory. Branch on the exit code before parsing
stdout or stderr:

| Exit  | Meaning                                                 |
| ----- | ------------------------------------------------------- |
| `0`   | Complete bundle; requested policy passed or was absent  |
| `3`   | Complete, valid bundle; explicit coverage policy failed |
| `2`   | Invalid arguments                                       |
| `1`   | Operational, response, verification, or output failure  |
| `130` | Cancelled before the bundle committed                   |

Machine errors are one JSON document on stderr. Use `error.code` and optional
`http_status`; retain `message` for diagnosis. `--error-format text` selects text
errors. `--human` changes successful stdout only.

```python
import json
import subprocess
from pathlib import Path

attempt = Path("attempt-1")
attempt.mkdir()
command = [
    "inferencex", "powerx", "export",
    "--model", "DeepSeek-V4-Pro", "--isl", "8192", "--osl", "1024",
    "--output-dir", str(attempt / "powerx"),
]
result = subprocess.run(command, capture_output=True, text=True, check=False)
(attempt / "stdout.txt").write_text(result.stdout)
(attempt / "stderr.txt").write_text(result.stderr)
(attempt / "exit-code.txt").write_text(f"{result.returncode}\n")
if result.returncode not in (0, 3):
    failure = json.loads(result.stderr)
    raise SystemExit(failure["error"]["code"])
summary = json.loads(result.stdout)
```

Exit 3 is a policy outcome, not invalid evidence. Consume the committed bundle only
after reviewing the failed predicate in `policy.reasons`. A directory without
`manifest.json` is incomplete. If stdout fails after the manifest commits, the
error records `bundle_complete: true`; verify that directory offline.

The CLI bounds decoded response bytes, total bytes, deadlines, and attempts per
command. It records every retry and complete response. `SIGINT` and `SIGTERM`
cancel active work; cancellation before commit leaves diagnostic files but no valid
bundle. A completed bundle is immutable.

## Inspect and recover an installation

Use the pinned installer to inspect the destination and preview an upgrade:

```bash
npm exec --yes --package @semianalysisai/inferencex-skills@1.0.0 -- \
  inferencex-skills status --target codex --json
npm exec --yes --package @semianalysisai/inferencex-skills@1.0.0 -- \
  inferencex-skills install --target codex --force --dry-run --json
```

`status` and `--dry-run` do not change the installation. A real install stages the
merged destination and receipt, then recovers supported interrupted transactions.
Before committed activation it restores the previous installation; after commit it
keeps the new installation and finishes cleanup. Unsafe or foreign transaction
state remains blocked for inspection.

Receipts from 1.0 onward use package integrity checks. An old 0.x receipt identifies
the installed version only and can be upgraded with `--force`. The installer
preserves unmanaged files, so an old helper such as `verify-export.mjs` may remain
after upgrade; its presence does not make it a supported 1.0 command. Review local
edits before overwriting packaged files.
