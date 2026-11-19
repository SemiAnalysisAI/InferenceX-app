import { describe, expect, it } from 'vitest';

import { AUTHOR_HANDLE, OG_IMAGE, SITE_NAME } from '@semianalysisai/inferencex-constants';

import { DEFAULT_SOCIAL_IMAGE, socialMetadata } from './social-metadata';

const base = {
  title: 'Page | InferenceX',
  description: 'About the page.',
  url: 'https://inferencex.semianalysis.com/page',
};

describe('socialMetadata', () => {
  it('falls back to the site OG image so child segments never drop og:image or the large card', () => {
    const meta = socialMetadata({ ...base, locale: 'en' });
    expect(meta.openGraph).toMatchObject({
      ...base,
      siteName: SITE_NAME,
      locale: 'en_US',
      type: 'website',
      images: [DEFAULT_SOCIAL_IMAGE],
    });
    expect(DEFAULT_SOCIAL_IMAGE.url).toBe(OG_IMAGE);
    expect(meta.twitter).toMatchObject({
      card: 'summary_large_image',
      title: base.title,
      description: base.description,
      images: [DEFAULT_SOCIAL_IMAGE],
      site: AUTHOR_HANDLE,
      creator: AUTHOR_HANDLE,
    });
  });

  it('uses the zh_CN og:locale and keeps an explicit entity image and article type', () => {
    const image = { url: 'https://inferencex.semianalysis.com/x.png', width: 1200, height: 630 };
    const meta = socialMetadata({ ...base, locale: 'zh', images: [image], type: 'article' });
    expect(meta.openGraph).toMatchObject({ locale: 'zh_CN', type: 'article', images: [image] });
    expect(meta.twitter).toMatchObject({ images: [image] });
  });

  it('treats an empty image list as missing', () => {
    const meta = socialMetadata({ ...base, locale: 'en', images: [] });
    expect(meta.openGraph).toMatchObject({ images: [DEFAULT_SOCIAL_IMAGE] });
  });
});
