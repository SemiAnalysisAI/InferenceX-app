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
});
