// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { reportPath, renderReportHtml } from './report';

describe('verified artifact report links', () => {
  it('resolves both paired-export and serving-matrix media within the artifact', () => {
    expect(reportPath('media/baseline.mp4')).toBe('report/media/baseline.mp4');
    expect(reportPath('../gpu/c2/baseline/artifacts/measurement-r001-c001.mp4')).toBe(
      'gpu/c2/baseline/artifacts/measurement-r001-c001.mp4',
    );
    expect(reportPath('../serving-smoke.json')).toBe('serving-smoke.json');
  });
  it.each([
    '../../outside.mp4',
    '/gpu/clip.mp4',
    '//remote.test/clip.mp4',
    'https://remote.test/clip.mp4',
    '%2e%2e/media.mp4',
    String.raw`..\media.mp4`,
    'clip.mp4?token=x',
  ])('rejects unsafe report reference %s', (path) => {
    expect(reportPath(path)).toBeNull();
  });
  it('rewrites only known assets and removes active content and unknown external references', () => {
    const html = renderReportHtml(
      '<script>alert(1)</script><base href="https://remote.test"><video src="../gpu/c1/clip.mp4"></video><a href="../serving-smoke.json">Data</a><img src="https://remote.test/x"><a href="../../outside">Outside</a>',
      new Map([
        ['gpu/c1/clip.mp4', 'https://storage.test/verified.mp4'],
        ['serving-smoke.json', 'blob:verified-json'],
      ]),
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('video')?.getAttribute('src')).toBe(
      'https://storage.test/verified.mp4',
    );
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('blob:verified-json');
    expect(doc.querySelector('img')?.hasAttribute('src')).toBe(false);
    expect(doc.querySelectorAll('a')[1].hasAttribute('href')).toBe(false);
    expect(doc.querySelector('script,base')).toBeNull();
    expect(doc.querySelector('meta')?.content).toContain("default-src 'none'");
  });
});
