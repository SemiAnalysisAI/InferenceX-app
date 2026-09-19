import AdmZip from 'adm-zip';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { extractVerifiedArchive, inspectArchive } from './artifact-archive';

const roots: string[] = [];
function root() {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-archive-'));
  roots.push(value);
  return value;
}
afterEach(() => roots.forEach((value) => fs.rmSync(value, { recursive: true, force: true })));
it('extracts checked bytes and refuses overwrites and altered members', () => {
  const zip = new AdmZip();
  zip.addFile('raw/result.json', Buffer.from('{"ok":true}'));
  const bytes = zip.toBuffer();
  const target = path.join(root(), '123');
  const expected = [
    {
      path: 'raw/result.json',
      size: 11,
      sha256: '4062edaf750fb8074e7e83e0c9028c94a8e32468a8b6e6c0fc692be0f1cc83875',
    },
  ];
  expect(() => extractVerifiedArchive(bytes, target, expected)).toThrow('digest/size mismatch');
  expect(fs.existsSync(target)).toBe(false);
  extractVerifiedArchive(bytes, target);
  expect(fs.readFileSync(path.join(target, 'raw/result.json'), 'utf8')).toBe('{"ok":true}');
  expect(() => extractVerifiedArchive(bytes, target)).toThrow('overwrite');
});
it('rejects links and file-directory collisions before filesystem writes', () => {
  const links = new AdmZip();
  links.addFile('link', Buffer.from('/tmp/target'));
  links.getEntries()[0].attr = (0o120777 << 16) >>> 0;
  expect(() => inspectArchive(links.toBuffer())).toThrow('Unsafe');
  const collision = new AdmZip();
  collision.addFile('raw', Buffer.from('file'));
  collision.addFile('raw/result.json', Buffer.from('{}'));
  expect(() => inspectArchive(collision.toBuffer())).toThrow('collision');
});
