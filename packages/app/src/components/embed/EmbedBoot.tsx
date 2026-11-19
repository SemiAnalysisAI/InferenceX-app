import { headers } from 'next/headers';

import { embedBootScript, embedThemeFromHeaders } from '@/lib/embed/embed';

export default async function EmbedBoot() {
  const h = await headers();
  const { theme, skin } = embedThemeFromHeaders((name) => h.get(name));
  return <script dangerouslySetInnerHTML={{ __html: embedBootScript(theme, skin) }} />;
}
