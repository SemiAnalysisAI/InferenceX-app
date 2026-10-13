import { createHash } from 'node:crypto';
import { globSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export function cypressSourceFingerprint(appRoot: string): string {
  const root = resolve(appRoot, '../..');
  const files = globSync(
    [
      'packages/*/src/**/*.{ts,tsx,js,jsx,json,css,scss,svg,mjs,cjs}',
      'packages/app/cypress/**/*.{ts,tsx,js,json}',
      'packages/app/content/**/*',
      'packages/app/public/**/*',
      'packages/app/*config*.{ts,js,json,mjs}',
      'packages/*/package.json',
      'package.json',
      'bun.lock',
      'tsconfig.json',
    ],
    { cwd: root },
  )
    .filter((file) => statSync(resolve(root, file)).isFile())
    .sort();
  if (files.length === 0) throw new Error('No Cypress source files found');
  const hash = createHash('sha256');
  for (const file of files) {
    hash
      .update(file)
      .update('\0')
      .update(readFileSync(resolve(root, file)))
      .update('\0');
  }
  return hash.digest('hex');
}
