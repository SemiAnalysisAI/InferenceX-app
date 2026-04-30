/**
 * ZIP file reading utilities (used by the GCS backup ingest script only).
 */

import AdmZip from 'adm-zip';

/** Read the first JSON file from a ZIP. Returns null on any error. */
export function readZipJson(zipPath: string): unknown {
  try {
    const zip = new AdmZip(zipPath);
    const entry = zip.getEntries().find((e) => !e.isDirectory && e.name.endsWith('.json'));
    if (!entry) return null;
    return JSON.parse(entry.getData().toString('utf8'));
  } catch {
    return null;
  }
}

/** Read the first text file matching `name` from a ZIP. Returns null on any error. */
export function readZipText(zipPath: string, name: string): string | null {
  try {
    const zip = new AdmZip(zipPath);
    const entry = zip.getEntries().find((e) => !e.isDirectory && e.name === name);
    if (!entry) return null;
    return entry.getData().toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Read all text files in a ZIP whose basenames match `predicate`, keyed by basename.
 * Returns an empty map on ZIP-level errors. Used to pull all `samples_*.jsonl`
 * entries from an eval ZIP in a single pass.
 */
export function readZipTextsMatching(
  zipPath: string,
  predicate: (name: string) => boolean,
): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const zip = new AdmZip(zipPath);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      if (!predicate(entry.name)) continue;
      try {
        out.set(entry.name, entry.getData().toString('utf8'));
      } catch {}
    }
  } catch {}
  return out;
}

/**
 * Read all JSON files from a ZIP keyed by filename (basename only).
 * Returns null on any ZIP-level error; individual file parse errors yield null values.
 */
export function readZipJsonMap(zipPath: string): Map<string, unknown> | null {
  try {
    const zip = new AdmZip(zipPath);
    const out = new Map<string, unknown>();
    for (const entry of zip.getEntries()) {
      if (!entry.isDirectory && entry.name.endsWith('.json')) {
        try {
          out.set(entry.name, JSON.parse(entry.getData().toString('utf8')));
        } catch {
          out.set(entry.name, null);
        }
      }
    }
    return out;
  } catch {
    return null;
  }
}
