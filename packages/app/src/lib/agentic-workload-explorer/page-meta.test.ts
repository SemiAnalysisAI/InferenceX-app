import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { SITE_URL } from '@semianalysisai/inferencex-constants';
import { describe, expect, it } from 'vitest';

import {
  ALL_SECTIONS,
  isActiveSection,
  versionQuery,
} from '@/components/agentic-workload-explorer/section-nav';

import {
  EXPLORER_SECTION_META,
  EXPLORER_SESSION_TAB_META,
  explorerSectionMetadata,
  explorerSessionMetadata,
} from './page-meta';

const APP_DIR = path.resolve(import.meta.dirname, '../../app');
const EN_ROOT = path.join(APP_DIR, '(dashboard)/agentic-workload-explorer');
const ZH_ROOT = path.join(APP_DIR, 'zh/(dashboard)/agentic-workload-explorer');

function routeDirs(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

describe('explorer section registry', () => {
  it('has metadata, a nav link and EN/ZH pages for every section directory', () => {
    const sections = routeDirs(EN_ROOT).map((dir) => `/${dir}`);
    expect(Object.keys(EXPLORER_SECTION_META).sort()).toEqual(sections);
    expect(
      ALL_SECTIONS.map((link) => link.path)
        .filter((p) => p !== '/')
        .sort(),
    ).toEqual(sections);
    for (const section of sections) {
      expect(existsSync(path.join(EN_ROOT, section, 'page.tsx'))).toBe(true);
      expect(existsSync(path.join(ZH_ROOT, section, 'page.tsx'))).toBe(true);
    }
  });

  it('has metadata for every session tab directory', () => {
    const tabs = routeDirs(path.join(EN_ROOT, 'sessions/[id]'));
    expect(Object.keys(EXPLORER_SESSION_TAB_META).sort()).toEqual(tabs);
  });

  it('gives every Chinese title and description Han characters', () => {
    for (const copy of Object.values(EXPLORER_SECTION_META)) {
      expect(copy.zh.description).toMatch(/\p{Script=Han}/u);
    }
  });
});

describe('explorerSectionMetadata', () => {
  it('pairs canonical URLs and hreflang alternates across locales', () => {
    const en = explorerSectionMetadata('/sessions', 'en');
    const zh = explorerSectionMetadata('/sessions', 'zh');
    expect(en.alternates?.canonical).toBe(`${SITE_URL}/agentic-workload-explorer/sessions`);
    expect(zh.alternates?.canonical).toBe(`${SITE_URL}/zh/agentic-workload-explorer/sessions`);
    expect(zh.alternates?.languages).toEqual(en.alternates?.languages);
    expect(zh.openGraph).toMatchObject({ locale: 'zh_CN' });
    expect(en.robots).toBeUndefined();
  });
});

describe('explorerSessionMetadata', () => {
  it('marks session pages noindex in both locales and encodes the id', () => {
    for (const locale of ['en', 'zh'] as const) {
      const meta = explorerSessionMetadata('a b', 'timeline', locale);
      expect(meta.robots).toEqual({ index: false, follow: true });
      expect(String(meta.alternates?.canonical)).toContain('/sessions/a%20b/timeline');
    }
  });
});

describe('isActiveSection', () => {
  it('matches a section and its children, but the overview only exactly', () => {
    expect(isActiveSection('/', '/')).toBe(true);
    expect(isActiveSection('/sessions', '/')).toBe(false);
    expect(isActiveSection('/sessions/abc/flow', '/sessions')).toBe(true);
    expect(isActiveSection('/session-reuse', '/sessions')).toBe(false);
    expect(isActiveSection(null, '/sessions')).toBe(false);
  });
});

describe('versionQuery', () => {
  it('carries the trace-version selection across section links', () => {
    expect(versionQuery(null)).toBe('');
    expect(versionQuery('all')).toBe('?version=all');
  });
});
