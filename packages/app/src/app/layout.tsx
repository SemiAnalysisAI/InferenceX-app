import './globals.css';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';

import { Footer } from '@/components/footer/footer';
import { Header } from '@/components/header/header';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/ui/theme-provider';
import {
  AUTHOR_HANDLE,
  AUTHOR_NAME,
  AUTHOR_URL,
  DESCRIPTION,
  OG_IMAGE,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from '@semianalysisai/inferencex-constants';
import { QueryProvider } from '@/providers/query-provider';
import { PostHogProvider, PostHogPageView } from '@/providers/posthog-provider';

const dm_sans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-dm-sans',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME} by ${AUTHOR_NAME}`,
  },
  description: DESCRIPTION,
  keywords: [
    'AI inference benchmark',
    'GPU benchmark',
    'LLM benchmark',
    'inference performance',
    'NVIDIA benchmark',
    'AMD benchmark',
    'GPU performance comparison',
    'AI model benchmarks',
    'tokens per second',
    'TTFT benchmark',
    'time to first token',
    'inference latency',
    'ML inference',
    'vLLM benchmark',
    'TensorRT-LLM benchmark',
    'GPU CI/CD',
    'open source benchmark',
    AUTHOR_NAME,
    'InferenceMAX',
    SITE_NAME,
    'GB200 benchmark',
    'MI355X benchmark',
    'H100 benchmark',
    'A100 benchmark',
  ],
  authors: [{ name: AUTHOR_NAME, url: AUTHOR_URL }],
  creator: AUTHOR_NAME,
  publisher: AUTHOR_NAME,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
    types: {
      'application/rss+xml': `${SITE_URL}/feed.xml`,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32.webp', sizes: '32x32', type: 'image/webp' },
      { url: '/favicon-192.webp', sizes: '192x192', type: 'image/webp' },
    ],
    apple: '/apple-touch-icon.webp',
  },
  openGraph: {
    title: SITE_TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: SITE_TITLE }],
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
    creator: AUTHOR_HANDLE,
    site: AUTHOR_HANDLE,
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: AUTHOR_NAME,
      url: AUTHOR_URL,
      logo: { '@type': 'ImageObject', url: OG_IMAGE },
      sameAs: [
        `https://x.com/${AUTHOR_HANDLE.slice(1)}`,
        'https://github.com/SemiAnalysisAI',
        `https://www.youtube.com/@${AUTHOR_NAME}`,
      ],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: DESCRIPTION,
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#application`,
      name: SITE_NAME,
      description:
        'Open-source AI inference benchmark dashboard. Compare GPU performance for LLM inference across NVIDIA GB200, H100, AMD MI355X, and more.',
      url: SITE_URL,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      author: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://us-assets.i.posthog.com" />
        <link rel="dns-prefetch" href="https://us-assets.i.posthog.com" />
      </head>
      <body className={`${dm_sans.variable} antialiased relative min-h-screen flex flex-col`}>
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-0 left-0 -z-10 hidden lg:block',
            'bg-muted/50 dark:bg-muted',
            "mask-[url('/brand/left-pattern-full.svg')]",
            'mask-no-repeat mask-position-[top_right] mask-size-[100%]',
            'w-1/2 h-full',
          )}
        />
        <PostHogProvider>
          <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
          <QueryProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              enableSystem
              disableTransitionOnChange
            >
              <PostHogPageView />
              <Header />
              <div className="grow flex flex-col">{children}</div>
              <Footer />
            </ThemeProvider>
          </QueryProvider>
          <Analytics />
          <SpeedInsights />
        </PostHogProvider>
      </body>
    </html>
  );
}
