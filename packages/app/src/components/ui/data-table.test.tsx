import { renderToString } from 'react-dom/server';
import { describe, expect, it, mock } from 'bun:test';

import { DataTable } from './data-table';

mock.module('@/lib/i18n/use-locale', () => ({
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

  it('drops the pager when every row fits on the smallest page', () => {
    const columns = [{ header: 'GPU', cell: (row: { name: string }) => row.name }];
    const short = renderToString(
      <DataTable
        data={Array.from({ length: 10 }, (_, i) => ({ name: `G${i}` }))}
        columns={columns}
      />,
    );
    const long = renderToString(
      <DataTable
        data={Array.from({ length: 11 }, (_, i) => ({ name: `G${i}` }))}
        columns={columns}
      />,
    );

    expect(short).not.toContain('data-table-pagination-summary');
    expect(long).toContain('data-table-pagination-summary');
  });

  it('hides the column toggle when presets are turned off', () => {
    const html = renderToString(
      <DataTable
        data={[{ name: 'H100 SXM', detail: 'secondary' }]}
        columns={[
          { header: 'GPU', cell: (row) => row.name, importance: 'key' },
          { header: 'Detail', cell: (row) => row.detail, importance: 'secondary' },
        ]}
        columnPresets={false}
      />,
    );

    expect(html).not.toContain('data-table-preset');
    expect(html).toContain('Detail');
  });

  it('spans grouped cells over each row group and drops the pager when unpaginated', () => {
    const data = Array.from({ length: 12 }, (_, i) => ({ trace: `t${i % 2 ? 1 : 0}`, pool: i }));
    data.sort((a, b) => a.trace.localeCompare(b.trace));
    const html = renderToString(
      <DataTable
        data={data}
        columns={[
          { header: 'Trace', cell: (row) => row.trace, spanGroup: true },
          { header: 'Pool', cell: (row) => `p${row.pool}` },
        ]}
        paginated={false}
        searchable={false}
        rowGroupKey={(row) => row.trace}
        rowGroupAttributes={(row) => ({ 'data-trace': row.trace })}
        rowAttributes={(row) => ({ 'data-testid': `pool-${row.pool}` })}
      />,
    );

    expect(html).not.toContain('data-table-pagination-summary');
    expect(html.match(/<tbody/g)).toHaveLength(2);
    expect(html.match(/rowSpan="6"/gi)).toHaveLength(2);
    expect(html).toContain('data-trace="t1"');
    expect(html).toContain('data-testid="pool-11"');
  });
});
