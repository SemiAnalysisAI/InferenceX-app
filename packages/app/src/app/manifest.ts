import type { MetadataRoute } from 'next';

import { AUTHOR_NAME, SITE_NAME } from '@semianalysisai/inferencex-constants';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} by ${AUTHOR_NAME}`,
    short_name: SITE_NAME,
    description:
      'Open-source AI inference benchmark. Compare GPU performance across NVIDIA, AMD, and more.',
    start_url: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#09090b',
    icons: [
      { src: '/favicon-192.webp', sizes: '192x192', type: 'image/webp' },
      { src: '/apple-touch-icon.webp', sizes: '180x180', type: 'image/webp' },
    ],
  };
}
