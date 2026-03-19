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
    return JSON.parse(entry.getData().toString('utf-8'));
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
    return entry.getData().toString('utf-8');
  } catch {
    return null;
  }
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
          out.set(entry.name, JSON.parse(entry.getData().toString('utf-8')));
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
