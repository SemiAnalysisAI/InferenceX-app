/** One developer-logo entry for the `/model` surfaces. */
export interface ModelDeveloperLogoEntry {
  /** Filename under `public/logos/`. */
  file: string;
  /**
   * True for logos whose brand mark is plain black (`currentColor` SVGs):
   * they need a dark-mode invert to stay visible. Full-color logos render
   * as-is in both themes.
   */
  monochrome?: boolean;
}

/**
 * Maps `/model/[slug]` frontmatter `developer` names to full-color logo files
 * under `public/logos/`. Keys must match the `developer` field in
 * `content/models/<slug>.mdx` exactly; a missing entry simply renders no logo
 * (the pages treat the logo as optional decoration).
 */
export const MODEL_DEVELOPER_LOGOS: Record<string, ModelDeveloperLogoEntry> = {
  'Alibaba (Qwen)': { file: 'qwen-color.svg' },
  DeepSeek: { file: 'deepseek-color.svg' },
  Meta: { file: 'meta-color.svg' },
  MiniMax: { file: 'minimax-color.svg' },
  // Moonshot AI's model pages are all Kimi models; the Kimi product mark is
  // the recognizable brand, and like Moonshot's own mark it is monochrome by
  // design (the color variant is a white-on-blue app tile that vanishes on
  // light backgrounds).
  'Moonshot AI': { file: 'kimi.svg', monochrome: true },
  // OpenAI's brand mark is monochrome by design — no color variant exists.
  OpenAI: { file: 'openai.svg', monochrome: true },
  'Z.ai (Zhipu AI)': { file: 'zhipu-color.svg' },
};

/** Logo entry for a model developer, if one exists. */
export function getModelDeveloperLogo(developer: string): ModelDeveloperLogoEntry | undefined {
  return MODEL_DEVELOPER_LOGOS[developer];
}
