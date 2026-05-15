import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { JsonLd } from '@/components/json-ld';

function render(data: object): string {
  return renderToStaticMarkup(createElement(JsonLd, { data }));
}

function scriptBody(html: string): string {
  const match = html.match(/<script[^>]*>([\s\S]*?)<\/script[^>]*>/iu);
  if (!match) throw new Error(`no <script> in: ${html}`);
  return match[1];
}

describe('JsonLd', () => {
  it('renders a script tag with type application/ld+json', () => {
    const html = render({ '@type': 'Thing' });
    expect(html).toContain('type="application/ld+json"');
  });

  it('emits JSON.parseable content for a typical schema.org object', () => {
    const data = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home' }],
    };
    const html = render(data);
    expect(JSON.parse(scriptBody(html))).toEqual(data);
  });

  it('escapes literal < in string values so </script> cannot break out', () => {
    const data = { description: 'inject </script><img onerror=alert(1) src=x>' };
    const html = render(data);
    const body = scriptBody(html);
    expect(body).not.toContain('</script');
    expect(body).toContain(String.raw`\u003c`);
    expect(JSON.parse(body)).toEqual(data);
  });

  it('escapes < anywhere it appears (not just in </script> sequences)', () => {
    const data = { note: '<b>bold</b>' };
    const html = render(data);
    const body = scriptBody(html);
    expect(body).not.toContain('<b>');
    expect(JSON.parse(body)).toEqual(data);
  });

  it('does NOT HTML-escape quotes (Google would reject &quot; in JSON-LD)', () => {
    const html = render({ name: 'GB200' });
    const body = scriptBody(html);
    expect(body).not.toContain('&quot;');
    expect(body).toContain('"GB200"');
  });

  it('round-trips arrays at the top level', () => {
    const data = [
      { '@type': 'A', n: 1 },
      { '@type': 'B', n: 2 },
    ];
    const html = render(data);
    expect(JSON.parse(scriptBody(html))).toEqual(data);
  });
});
