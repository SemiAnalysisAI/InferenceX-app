---
name: review-zh-copy
description: Use when reviewing PRs or diffs that add or modify user-visible Simplified Chinese in InferenceX, including refactors and files whose names do not contain zh.
---

# Review Simplified Chinese copy

## Operating mode: advisory

Every finding produced by this skill is non-blocking. Do not label a Chinese-copy finding
`BLOCKING`, submit a request-changes review for it, or otherwise hold another contributor's merge.
Do not mention `@edwingao28` for a clean review, routine coverage, or an ordinary wording or
naturalness suggestion. Report an ordinary finding without a CC. Mention `@edwingao28` only for a
high-confidence semantic or factual error, changed attribution or speaker voice, or high-impact
ambiguity that cannot be resolved from the source and context. Label that finding
`Needs Chinese maintainer confirmation` and ask for review. It remains a suggestion while the
Chinese maintainer decides whether any follow-up is needed.

The Chinese maintainer makes the final wording decision and manually reviews every changed
Chinese passage.

## Editorial source of truth

Read [docs/chinese-copy.md](../../../docs/chinese-copy.md) completely before reviewing. Apply its
audience, surface-specific register, context-aware terminology, rewrite method, and checklist.

Semantic fidelity and natural Chinese are independent gates. Every changed passage must pass
both:

- **Fidelity:** facts, scope, modality, metrics, numbers, links, product names, and attribution
  retain the English source's meaning.
- **Naturalness:** the result reads as original Chinese technical writing in the register of its
  surface, without preserving English clause order or noun stacking.

A fluent mistranslation fails fidelity. An accurate sentence shaped like English fails
naturalness.

## Find the complete review scope

Review every added or modified user-visible Chinese passage in the complete diff against its
actual base. Do not infer scope from filenames. Chinese may appear in:

- `zh:` dictionaries inside otherwise English TypeScript or TSX files;
- locale-aware ternaries and registry labels;
- `/zh` routes, Chinese MDX, JSON, metadata, schema.org content, alt text, and captions;
- tooltips, modals, controls, option labels, empty/loading/error states, and feature-gated UI.

Include the full UI element or paragraph, not only the changed word or source line. When an
English/Chinese dictionary entry changes, inspect both siblings even if only one side is in the
diff. Do not report awkward pre-existing Chinese that the diff did not touch; record it separately
if it matters to a later rollout.

Exclude identifiers, test data that is not rendered, DB-stored benchmark content, logs, and code
syntax unless the changed text is presented to a user.

## Build context before judging

For each passage, collect:

1. the complete English source;
2. the route, component, and UI surface;
3. the surrounding heading, control, paragraph, or attributed quotation;
4. the intended meaning in plain language;
5. facts, qualifications, modality, metrics, links, names, and attribution that cannot change;
6. rendered desktop and mobile context when width, hierarchy, or interaction affects wording.

If no English source exists, say so. Infer intent from adjacent UI and product behavior, and lower
confidence rather than inventing a source claim.

## Review workflow

For every changed passage:

1. State the source intent without copying the English sentence structure.
2. Evaluate fidelity. Reject additions, omissions, changed scope, stronger certainty, altered
   metric definitions, or a changed speaker voice.
3. Hide the old Chinese and draft from the stated intent.
4. Evaluate naturalness without looking at the English. Check information order, sentence
   structure, register, and established Chinese ML infrastructure usage.
5. Compare the proposed rewrite with the source again.
6. Check the complete rendered element or paragraph. A locally natural word can still be wrong in
   its button, tooltip, metadata, marketing, technical-prose, or quotation context.

Do not use fixed substitutions for contextual questions. In particular:

- sentence length alone is not evidence of translationese;
- technical English is not wrong merely because a Chinese equivalent exists;
- one concept may need different wording in a UI action, prose, a unit, or an attributed quote;
- established English technical terms and phrases that Chinese ML infrastructure engineers
  normally use in English should remain English in first-party UI and technical prose; judge this
  from real industry usage and the surface, not from a closed list. `warmup`, `seed`, and `offload`
  are examples, not the whole category. Chinese-first explanations such as `预热（warmup）` remain
  valid for a broader audience, and attributed quotations preserve the speaker's wording;
- `您` is normally omitted in controls and tooltips but may be intentional in a respectful CTA;
- #819 and other bulk-rewrite outputs are not automatic editorial ground truth; only their
  separately verified mechanical cases may seed deterministic CI fixtures.

## Report high-signal findings

For each finding provide:

- `file:line` and route or surface;
- the exact English source and a one-sentence statement of its intent;
- which gate failed: fidelity, naturalness, or both;
- the specific defect and its user impact;
- one complete suggested replacement, not an isolated word swap;
- confidence and advisory severity.

Do not report only “this reads awkwardly.” Stay silent when the existing wording is accurate,
natural, and appropriate for its surface, even if another wording is also possible.

End with coverage: list the changed Chinese surfaces reviewed and any surface that could not be
rendered or whose English source could not be identified.
