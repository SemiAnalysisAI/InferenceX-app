import { describe, expect, it } from 'vitest';

import { classifyOutboundLink } from './outbound-links';

const HOST = 'inferencex.semianalysis.com';

describe('classifyOutboundLink', () => {
  it('ignores same-host and non-http links', () => {
    expect(classifyOutboundLink('https://inferencex.semianalysis.com/inference', HOST)).toBeNull();
    expect(classifyOutboundLink('https://InferenceX.SemiAnalysis.com/about', HOST)).toBeNull();
    expect(classifyOutboundLink('mailto:hi@semianalysis.com', HOST)).toBeNull();
    expect(classifyOutboundLink(['javascript', 'void(0)'].join(':'), HOST)).toBeNull();
    expect(classifyOutboundLink('not a url', HOST)).toBeNull();
  });

  it('flags the newsletter host as newsletter and SemiAnalysis', () => {
    expect(classifyOutboundLink('https://newsletter.semianalysis.com/p/post?ref=x', HOST)).toEqual({
      host: 'newsletter.semianalysis.com',
      path: '/p/post',
      is_newsletter: true,
      is_semianalysis: true,
    });
  });

  it('flags subscribe paths on semianalysis.com but not other SemiAnalysis pages', () => {
    expect(classifyOutboundLink('https://semianalysis.com/subscribe/', HOST)?.is_newsletter).toBe(
      true,
    );
    expect(classifyOutboundLink('https://semianalysis.com/subscriber-faq', HOST)).toMatchObject({
      is_newsletter: false,
      is_semianalysis: true,
    });
  });

  it('does not treat lookalike hosts as SemiAnalysis', () => {
    expect(classifyOutboundLink('https://notsemianalysis.com/subscribe', HOST)).toEqual({
      host: 'notsemianalysis.com',
      path: '/subscribe',
      is_newsletter: false,
      is_semianalysis: false,
    });
  });

  it('classifies third-party links and Substack newsletters', () => {
    expect(classifyOutboundLink('https://github.com/SemiAnalysisAI/InferenceX', HOST)).toEqual({
      host: 'github.com',
      path: '/SemiAnalysisAI/InferenceX',
      is_newsletter: false,
      is_semianalysis: false,
    });
    expect(classifyOutboundLink('https://foo.substack.com/', HOST)?.is_newsletter).toBe(true);
  });
});
