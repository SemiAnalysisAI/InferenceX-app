import { describe, expect, it } from 'vitest';

import { generateMetadata as enAgenticMetadata } from './(dashboard)/inference/agentic/[id]/page';
import { generateMetadata as enLogMetadata } from './(dashboard)/inference/logs/[id]/page';
import { generateMetadata as zhAgenticMetadata } from './zh/(dashboard)/inference/agentic/[id]/page';
import { generateMetadata as zhLogMetadata } from './zh/(dashboard)/inference/logs/[id]/page';

const params = Promise.resolve({ id: '206885' });

describe('inference detail metadata', () => {
  it('publishes bidirectional noindex alternates for English and Chinese logs', async () => {
    const [en, zh] = await Promise.all([enLogMetadata({ params }), zhLogMetadata({ params })]);

    expect(en.robots).toMatchObject({ index: false });
    expect(zh.robots).toMatchObject({ index: false });
    expect(en.alternates?.languages).toMatchObject({
      en: expect.stringContaining('/inference/logs/206885'),
      'zh-CN': expect.stringContaining('/zh/inference/logs/206885'),
    });
    expect(zh.alternates?.languages).toEqual(en.alternates?.languages);
  });

  it('keeps Agentic details noindex and declares the Chinese Open Graph locale', async () => {
    const [en, zh] = await Promise.all([
      enAgenticMetadata({ params }),
      zhAgenticMetadata({ params }),
    ]);

    expect(en.robots).toMatchObject({ index: false });
    expect(zh.robots).toMatchObject({ index: false });
    expect(zh.alternates?.languages).toEqual(en.alternates?.languages);
    expect(zh.openGraph).toMatchObject({ locale: 'zh_CN' });
  });
});
