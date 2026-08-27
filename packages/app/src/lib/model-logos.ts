/**
 * Maps `/model/[slug]` frontmatter `developer` names to logo files under
 * `public/logos/`. Keys must match the `developer` field in
 * `content/models/<slug>.mdx` exactly; a missing entry simply renders no logo
 * (the pages treat the logo as optional decoration).
 */
export const MODEL_DEVELOPER_LOGOS: Record<string, string> = {
  'Alibaba (Qwen)': 'qwen.webp',
  DeepSeek: 'deepseek.svg',
  // Square Meta mark — `meta.svg` is a wide wordmark that is illegible at
  // the small sizes the model pages use.
  Meta: 'meta-mark.svg',
  MiniMax: 'minimax.svg',
  'Moonshot AI': 'moonshot-ai.svg',
  OpenAI: 'openai.svg',
  'Z.ai (Zhipu AI)': 'zhipu.webp',
};

/** Logo filename under `/logos/` for a model developer, if one exists. */
export function getModelDeveloperLogo(developer: string): string | undefined {
  return MODEL_DEVELOPER_LOGOS[developer];
}
