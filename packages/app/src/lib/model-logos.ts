/**
 * Logo files under `public/logos/` whose brand mark is plain black
 * (`currentColor` SVGs): they need a dark-mode invert to stay visible.
 * Full-color logos render as-is in both themes. Shared by every surface that
 * renders model/developer logos (`/model` pages, inference chart captions).
 */
export const MONOCHROME_LOGO_FILES: ReadonlySet<string> = new Set(['openai.svg']);

/** Whether a logo file needs a dark-mode invert to stay visible. */
export function isMonochromeLogo(file: string): boolean {
  return MONOCHROME_LOGO_FILES.has(file);
}

/**
 * Maps `/model/[slug]` frontmatter `developer` names to full-color logo files
 * under `public/logos/`. Keys must match the `developer` field in
 * `content/models/<slug>.mdx` exactly; a missing entry simply renders no logo
 * (the pages treat the logo as optional decoration).
 */
export const MODEL_DEVELOPER_LOGOS: Record<string, string> = {
  'Alibaba (Qwen)': 'qwen-color.svg',
  DeepSeek: 'deepseek-color.svg',
  Meta: 'meta-color.svg',
  MiniMax: 'minimax-color.svg',
  // Moonshot AI's model pages are all Kimi models; the Kimi product mark is
  // the recognizable brand. `kimi-color.svg` sets the white-and-blue mark on
  // its brand black rounded tile (the Kimi app icon), so it stays full-color
  // AND visible on light backgrounds — unlike the bare color variant.
  'Moonshot AI': 'kimi-color.svg',
  // OpenAI's brand mark is monochrome by design — no color variant exists.
  OpenAI: 'openai.svg',
  'Z.ai (Zhipu AI)': 'zhipu-color.svg',
};

/** Logo filename under `/logos/` for a model developer, if one exists. */
export function getModelDeveloperLogo(developer: string): string | undefined {
  return MODEL_DEVELOPER_LOGOS[developer];
}
