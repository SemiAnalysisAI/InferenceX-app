import type { Metadata } from 'next';

import {
  AUTHOR_HANDLE,
  OG_IMAGE,
  SITE_NAME,
  SITE_TITLE,
} from '@semianalysisai/inferencex-constants';

import { ZH_OG_LOCALE } from '@/lib/i18n/i18n';

export interface SocialImage {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

export const DEFAULT_SOCIAL_IMAGE: SocialImage = {
  url: OG_IMAGE,
  width: 1200,
  height: 630,
  alt: SITE_TITLE,
};

export function socialMetadata(opts: {
  title: string;
  description: string;
  url: string;
  locale: 'en' | 'zh';
  images?: SocialImage[];
  type?: 'website' | 'article';
}): Pick<Metadata, 'openGraph' | 'twitter'> {
  const images = opts.images && opts.images.length > 0 ? opts.images : [DEFAULT_SOCIAL_IMAGE];
  return {
    openGraph: {
      title: opts.title,
      description: opts.description,
      url: opts.url,
      siteName: SITE_NAME,
      locale: opts.locale === 'zh' ? ZH_OG_LOCALE : 'en_US',
      type: opts.type ?? 'website',
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: opts.title,
      description: opts.description,
      images,
      site: AUTHOR_HANDLE,
      creator: AUTHOR_HANDLE,
    },
  };
}
