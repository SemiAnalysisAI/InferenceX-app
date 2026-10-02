import fs from 'node:fs';
import path from 'node:path';
import { compile } from '@mdx-js/mdx';
import { describe, expect, it } from 'vitest';

import { GET as fullText } from '@/app/llms-full.txt/route';
import { getAllPosts, getPostBySlug } from './blog';

const slug = 'sparse-savings-persistent-demand-inside-glm53';
const source = `https://newsletter.semianalysis.com/p/${slug}`;
const publicDir = path.resolve(import.meta.dirname, '../../public');

describe('GLM-5.3 newsletter port', () => {
  it.each(['en', 'zh'] as const)(
    'publishes compilable %s content and all 21 original figures',
    async (locale) => {
      const post = getPostBySlug(slug, locale);
      expect(post).not.toBeNull();
      expect(post!.meta).toMatchObject({
        date: '2026-09-28',
        publishDate: '2026-09-28',
        modifiedDate: '2026-09-29',
      });
      expect(getAllPosts(locale).map((item) => item.slug)).toContain(slug);
      await expect(compile(post!.raw)).resolves.toBeDefined();

      const images = [...post!.raw.matchAll(/src="(?<src>\/images\/[^"]+)"/gu)].map(
        (match) => match.groups!.src,
      );
      expect(images).toHaveLength(21);
      expect(new Set(images).size).toBe(21);
      for (const image of images) {
        const bytes = fs.readFileSync(path.join(publicDir, image));
        expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      }
      for (const author of [
        'Kimbo Chen',
        'Alec Ibarra',
        'Wenyao Gao',
        'Pratt Bhatt',
        'Bryan Shan',
        'Dylan Patel',
      ]) {
        expect(post!.raw).toContain(author);
      }
      expect(post!.raw).toContain(source);
      expect(post!.raw).toContain('g_rundate=2026-09-28');
      expect(post!.raw).toContain('Dynamo-TRT-LLM');
      expect(post!.raw).toContain('Dynamo-SGLang');
      expect(post!.raw).toContain('$0.0607');
      expect(post!.raw).toContain('$0.0666');
      expect(post!.raw).toContain('$0.0451');
    },
  );

  it('includes the historical public article and subscription boundary in the existing text feed', async () => {
    const response = await fullText();
    const text = await response.text();
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(text).toContain(`https://inferencex.semianalysis.com/blog/${slug}`);
    expect(text).toContain('including its September 28 benchmark snapshot');
    expect(text).toContain('The subscriber-only cybersecurity analysis remains on the');
    expect(text).toContain('multi-task-rollout-orchestrator.png');
  });
});
