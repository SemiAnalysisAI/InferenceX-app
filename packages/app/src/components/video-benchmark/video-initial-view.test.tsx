// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import VideoPage from '@/app/(dashboard)/video/page';
import VideoPageZh from '@/app/zh/(dashboard)/video/page';

it('renders Performance history in the initial server response', async () => {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(
    await VideoPage({ searchParams: Promise.resolve({}) }),
  );
  expect(container.querySelector('[data-testid="video-history"]')).not.toBeNull();
  const history = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === 'Performance history',
  );
  expect(history?.getAttribute('aria-pressed')).toBe('true');
});

for (const [route, Page] of [
  ['/video', VideoPage],
  ['/zh/video', VideoPageZh],
] as const) {
  it.each([
    { params: { run: '123' }, selected: 'Videos & result' },
    { params: { view: 'history', run: '123' }, selected: 'Performance history' },
    { params: { view: ['tradeoff', 'history'] }, selected: 'Hardware tradeoffs' },
  ])(
    `renders the requested ${route} view before hydration: $selected`,
    async ({ params, selected }) => {
      const container = document.createElement('div');
      container.innerHTML = renderToStaticMarkup(
        await Page({ searchParams: Promise.resolve(params) }),
      );
      expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toBe(selected);
      expect(container.querySelector('[data-testid="video-history"]') !== null).toBe(
        selected === 'Performance history',
      );
      const refresh = [...container.querySelectorAll('button')].find(
        (button) => button.textContent === 'Refresh',
      );
      expect(refresh?.disabled).toBe(selected === 'Videos & result');
    },
  );
}
