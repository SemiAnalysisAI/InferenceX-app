import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DataTable } from './data-table';

vi.mock('@/lib/use-locale', () => ({
  useLocale: () => 'en',
}));

describe('DataTable watermark', () => {
  it('omits branded markup until the client confirms the official hostname', () => {
    const html = renderToString(
      <DataTable
        data={[{ name: 'H100 SXM' }]}
        columns={[{ header: 'GPU', cell: (row) => row.name }]}
      />,
    );

    expect(html).toContain('H100 SXM');
    expect(html).not.toContain('/brand/logo-color.webp');
  });

  it('defaults opted-in tables to key metrics and pins the identifier', () => {
    const html = renderToString(
      <DataTable
        data={[{ name: 'H100 SXM', detail: 'secondary' }]}
        columns={[
          { header: 'GPU', cell: (row) => row.name, importance: 'key', pinned: true },
          { header: 'Detail', cell: (row) => row.detail, importance: 'secondary' },
        ]}
      />,
    );

    expect(html).toContain('Key metrics');
    expect(html).toContain('data-testid="data-table-preset"');
    expect(html).toContain('data-testid="data-table-preset-all"');
    expect(html).toContain('sticky left-0');
    expect(html).not.toContain('<th>Detail');
  });
});
