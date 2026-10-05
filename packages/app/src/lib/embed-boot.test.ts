// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { embedBootScript } from './embed';
import { APP_THEMES } from './themes';

afterEach(() => {
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset.inferencexEmbed;
  delete document.documentElement.dataset.inferencexSkin;
});

describe('embed theme prepaint', () => {
  for (const savedTheme of APP_THEMES) {
    it.each(['light', 'dark'] as const)(
      `replaces saved ${savedTheme} with the requested %s skin before hydration`,
      (embedTheme) => {
        document.documentElement.className = `font-variable ${savedTheme}`;
        // oxlint-disable-next-line no-new-func, unicorn/new-for-builtins -- execute the actual emitted prepaint script.
        Function('document', embedBootScript(embedTheme, 'vllm'))(document);

        expect([...document.documentElement.classList]).toEqual(['font-variable', embedTheme]);
        expect(document.documentElement.style.colorScheme).toBe(embedTheme);
        expect(document.documentElement.dataset.inferencexEmbed).toBe('');
        expect(document.documentElement.dataset.inferencexSkin).toBe('vllm');
      },
    );
  }
});
