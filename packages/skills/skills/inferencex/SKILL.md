---
name: inferencex
description: 'Analyze InferenceX benchmark data, compare token costs and hardware, check spreadsheet TCO assumptions, inspect provenance and traces, export dashboard views, render AgentX charts, and verify saved evidence. Use for existing public InferenceX observations and related follow-up analysis.'
---

# InferenceX

Use this skill for the user's InferenceX task and related follow-up questions.
Choose the relevant CLI command or documented public-view recipe on the user's
behalf; they can describe the result they want in natural language.

Read [the shared workflow guide](../inferencex-api/SKILL.md), then only the
cookbook relevant to the task. It covers every existing CLI workflow and utility,
as well as dashboard views and chart templates. Resolve its relative paths from `../inferencex-api/`;
the executable is `../inferencex-api/scripts/inferencex.mjs` relative to this
skill directory. Run it with Node.js 24 or later. No global binary or API key is
required.

If invoked without a task, briefly offer benchmark lookup, token-cost comparison,
power/AgentX analysis, result provenance, release/CollectiveX comparison, dashboard
views, or offline verification, and ask which result the user needs. For a
spreadsheet task, use the supplied file and its stated workload, units and price
assumptions; report missing assumptions before choosing a cost winner.

If the shared guide or executable is missing, report an incomplete installation
and recommend rerunning `inferencex-skills install` for the same target and scope.
Preserve the user's existing files; repairing modified package files requires the
installer's explicit `--force` option.
