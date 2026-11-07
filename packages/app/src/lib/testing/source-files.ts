import { readdirSync } from 'node:fs';
import path from 'node:path';

/** Every `.ts` and `.tsx` file under `dir`, recursively. */
export function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.tsx?$/u.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}
