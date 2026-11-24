// @test-environment jsdom
import { describe, expect, it, mock } from 'bun:test';

import { click, get, render } from '@/test/dom';

import { DataTable } from './data-table';

mock.module('@/lib/i18n/use-locale', () => ({ useLocale: () => 'en' }));

const columns = [{ header: 'GPU', cell: (row: { name: string }) => row.name }];
const rows = (count: number) => Array.from({ length: count }, (_, i) => ({ name: `G${i}` }));

describe('DataTable pager', () => {
  it('steps back from the last page after the rows shrink', () => {
    const { rerender } = render(<DataTable data={rows(30)} columns={columns} searchable={false} />);
    click(get('[aria-label="Next page"]'));
    click(get('[aria-label="Next page"]'));
    expect(get('[data-testid="data-table"]').textContent).toContain('3 / 3');

    rerender(<DataTable data={rows(15)} columns={columns} searchable={false} />);
    expect(get('[data-testid="data-table"]').textContent).toContain('2 / 2');

    click(get('[aria-label="Previous page"]'));
    expect(get('[data-testid="data-table"]').textContent).toContain('1 / 2');
  });
});
