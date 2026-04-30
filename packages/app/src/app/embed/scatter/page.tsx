import type { Metadata } from 'next';

import { EmbedScatterClientPage } from '@/components/embed/embed-scatter-client-page';

export const metadata: Metadata = {
  title: 'InferenceX Embed Scatter',
  description: 'Embeddable InferenceX scatter chart.',
  robots: { index: false, follow: false },
};

export default function EmbedScatterPage() {
  return <EmbedScatterClientPage />;
}
