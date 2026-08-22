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

export interface ZipJsonAndText {
  jsonFiles: Map<string, unknown>;
  textFiles: Map<string, string>;
}

/**
 * Traverse a ZIP once, parsing every JSON entry and reading only selected text entries.
 * Returns null on ZIP-level errors; individual JSON parse errors yield null values and
 * individual text read errors omit that entry.
 */
export function readZipJsonAndText(
  zipPath: string,
  selectText?: (name: string) => boolean,
): ZipJsonAndText | null {
  try {
    const zip = new AdmZip(zipPath);
    const jsonFiles = new Map<string, unknown>();
    const textFiles = new Map<string, string>();

    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;

      if (entry.name.endsWith('.json')) {
        try {
          jsonFiles.set(entry.name, JSON.parse(entry.getData().toString('utf8')));
        } catch {
          jsonFiles.set(entry.name, null);
        }
      } else if (selectText?.(entry.name)) {
        try {
          textFiles.set(entry.name, entry.getData().toString('utf8'));
        } catch {}
      }
    }

    return { jsonFiles, textFiles };
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
