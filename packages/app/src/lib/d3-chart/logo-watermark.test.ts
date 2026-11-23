import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { LOGO_WATERMARK_HREF } from './logo-watermark';

describe('LOGO_WATERMARK_HREF', () => {
  it('inlines the current public/brand/logo-color.webp', () => {
    const file = readFileSync(join(__dirname, '../../../public/brand/logo-color.webp'));
    expect(LOGO_WATERMARK_HREF).toBe(`data:image/webp;base64,${file.toString('base64')}`);
  });
});
