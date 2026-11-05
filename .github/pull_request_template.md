<!-- Title: <English title> / <中文标题>. Keep English visible; put the Chinese translation in the collapsed section below. -->

## Summary

<!-- Briefly explain the problem, what changes, and why it matters. A human reviewer should understand the PR without expanding any sections. Keep material risks, breaking changes, and unresolved failures visible here. Add related issue links only when relevant; remove unused placeholders. -->

<!-- Validation reporting: report only actual integration or end-to-end runs, with a concise outcome and a run link when available. For chart features, cover official runs and ?unofficialrun= overlays. Put supporting validation evidence, verbose check output, or logs in a <details><summary>Validation details</summary> block without the open attribute. Keep material failures and regressions visible. Omit routine local-check inventories and empty or pending validation sections; continue running appropriate checks. -->

<details>
<summary>AI model disclosure</summary>

<!-- Required: name the exact model/version used to prepare this PR and its role. List every contributing model, including delegated agents; a tool name alone (Claude Code, Cursor, Perplexity Computer) is insufficient. Use the identifier exposed by the runtime, never a guessed identifier. If unavailable, explicitly state that the exact model could not be verified. For human-only PRs, write "No AI used". Update this section if later edits use another model. -->

- Model/version:
- Role:

</details>

<details>
<summary>PR checklist</summary>

- [ ] I have completed the AI model disclosure and kept it current
- [ ] Added, changed, or removed filters, views, or pages include the matching API and `inferencex-skills` changes
- [ ] New or changed indexable pages ship their `/zh` sibling
- [ ] Changed Chinese copy follows the [PR review checklist](../docs/chinese-copy.md#pull-request-checklist--pr-审核清单) in `docs/chinese-copy.md`

</details>

<details>
<summary>中文</summary>

<!-- 用自然的简体中文翻译上方的改动说明、AI 模型使用说明、验证结果及注意事项。AI 模型使用说明必须列出实际使用的完整模型名称/版本及各自的工作内容（包括委派给其他 agent 的工作），不能只写工具名，也不能猜测运行环境未提供的模型标识；无法确认时须明确说明。未使用 AI 时填写 “No AI used”。后续修改使用其他模型时须更新说明。模型标识、代码、命令及日志保持原样；检查清单只需在上方填写一次。 -->

</details>
