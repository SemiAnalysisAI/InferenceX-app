import { headers } from 'next/headers';

import { embedBootScript, embedThemeFromHeaders } from '@/lib/embed';

/**
 * Server component rendered by the embed layouts. It reads the theme/skin the
 * proxy forwarded as request headers and emits the pre-paint boot script in
 * the layout's HTML flush, ahead of `next-themes` and the streamed page, so a
 * host asking for `theme=vllm-light` never sees a frame of InferenceX dark.
 * `EmbedFrame` repeats the same script from the page for client navigations.
 */
export default async function EmbedBoot() {
  const h = await headers();
  const { theme, skin } = embedThemeFromHeaders((name) => h.get(name));
  return <script dangerouslySetInnerHTML={{ __html: embedBootScript(theme, skin) }} />;
}
