---
allowed-tools: Bash(gh issue view:*), Bash(gh search:*), Bash(gh issue list:*), Bash(gh pr diff:*), Bash(gh pr view:*), Bash(gh pr list:*), Bash(gh pr checks:*), Bash(git log:*), Bash(git blame:*), Bash(git diff:*), Bash(git rev-parse:*), Read, Glob, Grep
description: Code review a pull request (does not post to GitHub)
---

Code review the given pull request. Output results to the conversation only — do NOT post to GitHub.

**Announce at start:** "Reviewing PR — gathering context before analysis."

## Step 1: Triage

Use a Haiku agent to check if the PR (a) is closed, (b) is a draft, (c) doesn't need review (automated PR, trivially simple), or (d) already has a review from you. If any apply, stop.

## Step 2: Gather Context

Use a Haiku agent to collect:

- The root `CLAUDE.md` and any `CLAUDE.md` files in directories the PR touches
- Read `docs/index.md` to find which subsystem docs in `docs/` are relevant to the changed files
- Return all paths (not contents) for use by review agents

## Step 3: Summarize

Use a Haiku agent to view the PR and return a summary of the change.

## Step 4: Review

Launch 6 parallel Sonnet agents. Each returns a list of issues with the reason flagged (CLAUDE.md adherence, bug, historical context, etc.):

a. **CLAUDE.md + docs compliance** — Audit changes against CLAUDE.md and relevant `docs/` files (from step 2). Not all CLAUDE.md instructions apply during review.
b. **Bug scan** — Shallow scan of the diff for obvious bugs. Read `docs/pitfalls.md` and check for documented failure modes. Focus on large bugs, ignore nitpicks and likely false positives.
c. **Historical context** — Read git blame and history of modified code to identify bugs in light of that context.
d. **Prior PR comments** — Read previous PRs that touched these files. Check for comments that may also apply here.
e. **Code comment compliance** — Read code comments in modified files. Verify changes comply with any guidance in the comments.
f. **Testing + analytics** — Check that the PR meets CLAUDE.md requirements: new utility functions have colocated unit tests, new UI features have E2E tests, bug fixes have regression tests, new interactive elements use `track()` from `@/lib/analytics`. Flag missing tests.

## Step 5: Score

For each issue from step 4, launch a parallel Haiku agent with the PR, issue description, and CLAUDE.md/docs paths. Score confidence 0-100 (give this rubric to the agent verbatim):

- **0**: False positive that doesn't stand up to light scrutiny, or a pre-existing issue.
- **25**: Might be real, but may be a false positive. Agent couldn't verify. Stylistic issues not explicitly in CLAUDE.md.
- **50**: Verified real issue, but a nitpick or unlikely in practice. Not very important relative to the rest of the PR.
- **75**: Very likely real, will be hit in practice. The existing approach is insufficient. Directly impacts functionality, or directly mentioned in CLAUDE.md.
- **100**: Definitely real, will happen frequently. Evidence directly confirms this.

For CLAUDE.md-flagged issues, the agent must double-check that the CLAUDE.md actually calls it out specifically.

## Step 6: Filter

Discard issues scoring below 80. If none remain, skip to output.

## Step 7: Output

```markdown
### Code review

Found N issues:

1. <brief description> (CLAUDE.md says "<...>")

<GitHub link to file + line with full SHA, eg:
https://github.com/SemiAnalysisAI/InferenceX-app/blob/abc123.../path/file.ts#L10-L15>

2. ...
```

Or if no issues:

```markdown
### Code review

No issues found. Checked for bugs and CLAUDE.md compliance.
```

## False Positives

These are NOT real issues — filter them out in steps 4 and 5:

- Pre-existing issues
- Things that look like bugs but aren't
- Pedantic nitpicks a senior engineer wouldn't flag
- Issues a linter, typechecker, or compiler would catch (CI runs these separately)
- General code quality issues unless explicitly required in CLAUDE.md
- Issues silenced in code (e.g., lint ignore comments)
- Intentional functionality changes related to the broader PR
- Real issues on lines the user did not modify

## Notes

- Do NOT build, typecheck, or lint — CI handles this separately
- Use `gh` for all GitHub interaction, not web fetch
- Every issue must cite and link to the relevant source (CLAUDE.md, docs/, or code)
- GitHub links require the **full git SHA** — no `$(git rev-parse HEAD)` in URLs
- Link format: `https://github.com/SemiAnalysisAI/InferenceX-app/blob/{full-sha}/path/file.ts#L10-L15`
- Provide at least 1 line of context before and after the flagged line
