export const MONOCHROME_LOGO_FILES: ReadonlySet<string> = new Set([
  'amd.svg',
  'openai.svg',
  'google.svg',
  'xiaomimimo.svg',
]);

export function isMonochromeLogo(file: string): boolean {
  return MONOCHROME_LOGO_FILES.has(file);
}

export const MODEL_DEVELOPER_LOGOS: Record<string, string> = {
  'Alibaba (Qwen)': 'qwen-color.svg',
  DeepSeek: 'deepseek-color.svg',
  Meta: 'meta-color.svg',
  MiniMax: 'minimax-color.svg',
  'Moonshot AI': 'kimi-color.svg',
  OpenAI: 'openai.svg',
  Xiaomi: 'xiaomimimo.svg',
  'Z.ai (Zhipu AI)': 'zai-color.svg',
};

export function getModelDeveloperLogo(developer: string): string | undefined {
  return MODEL_DEVELOPER_LOGOS[developer];
}
