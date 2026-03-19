---
allowed-tools: Bash(pnpm build*), Bash(pnpm typecheck*), Bash(pnpm lint*), Bash(pnpm fmt*), Read, Edit, Glob, Grep
description: Incrementally fix build, type, and lint errors with minimal safe changes
---

Incrementally fix build and type errors with minimal, safe changes.

**Announce at start:** "Fixing build errors — one at a time, smallest possible changes."

## Step 1: Identify Errors

Run all checks and capture errors:

```bash
pnpm typecheck 2>&1
pnpm lint 2>&1
```

If both pass, run the full build:

```bash
pnpm build 2>&1
```

If everything passes, announce "All checks pass — nothing to fix." and stop.

## Step 2: Parse and Prioritize

1. Group errors by file path
2. Sort by dependency order (fix imports/types before logic errors)
3. Count total errors for progress tracking
4. Announce: "Found N errors across M files. Fixing one at a time."

## Step 3: Fix Loop

For each error:

1. **Read the file** — see 10 lines of context around the error
2. **Diagnose** — identify root cause (missing import, wrong type, syntax error)
3. **Fix minimally** — smallest change that resolves the error. No refactoring, no "while I'm here" improvements.
4. **Re-run the failing check** — verify the error is gone
5. **Check for regressions** — confirm no new errors were introduced
6. **Move to next**

## Step 4: Guardrails — STOP and ask the user if:

- A fix introduces **more errors than it resolves**
- The **same error persists after 3 attempts**
- The fix requires **architectural changes** or touching >3 files
- Errors stem from **missing dependencies** (need `pnpm install`)

## Step 5: Summary

Report: errors fixed (with file paths), errors remaining (if any), and confirm no regressions.
