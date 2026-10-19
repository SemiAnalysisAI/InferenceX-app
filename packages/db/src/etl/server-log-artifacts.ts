import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface ServerLogFile {
  fileName: string;
  logText: string;
}

export interface ServerLogFilePath {
  fileName: string;
  path: string;
}

export interface ServerLogArtifact {
  artifactName: string;
  artifactDir: string;
}

const SERVER_LOG_PREFIXES = ['multinode_server_logs_', 'server_logs_'] as const;

export function isLogFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.log') || lower.endsWith('.out');
}

export function cleanLogText(value: string): string {
  return value.replaceAll('\u0000', '');
}

export function serverLogArtifactSuffix(artifactName: string): string | null {
  for (const prefix of SERVER_LOG_PREFIXES) {
    if (artifactName.startsWith(prefix)) return artifactName.slice(prefix.length);
  }
  return null;
}

export function listServerLogFilePaths(root: string): ServerLogFilePath[] {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  const files: ServerLogFilePath[] = [];

  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const pathname = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(pathname);
      else if (entry.isFile() && isLogFileName(entry.name)) {
        files.push({
          fileName: path.relative(root, pathname).split(path.sep).join('/'),
          path: pathname,
        });
      }
    }
  };

  visit(root);
  return files.toSorted((a, b) => a.fileName.localeCompare(b.fileName));
}

export function readServerLogFiles(root: string): ServerLogFile[] {
  return readServerLogFilePaths(listServerLogFilePaths(root));
}

export function readServerLogFilePaths(files: readonly ServerLogFilePath[]): ServerLogFile[] {
  return files.map((file) => ({
    fileName: file.fileName,
    logText: cleanLogText(fs.readFileSync(file.path, 'utf8')),
  }));
}

export function primaryServerLogFile(files: readonly ServerLogFile[]): ServerLogFile | null {
  return (
    files.find((file) => path.posix.basename(file.fileName).toLowerCase() === 'server.log') ??
    files[0] ??
    null
  );
}

function extractArchiveOnce(archivePath: string, extractedDir: string): boolean {
  if (!fs.existsSync(extractedDir) && fs.existsSync(archivePath)) {
    fs.mkdirSync(extractedDir, { recursive: true });
    execFileSync('tar', ['-xzf', archivePath, '-C', extractedDir], { stdio: 'ignore' });
  }
  return fs.existsSync(extractedDir) && fs.statSync(extractedDir).isDirectory();
}

export function serverLogArtifactRoot(artifactDir: string, artifactName: string): string | null {
  if (artifactName.startsWith('server_logs_')) {
    extractArchiveOnce(
      path.join(artifactDir, 'srt-single-node-logs.tar.gz'),
      path.join(artifactDir, 'srt-single-node-logs'),
    );
    return artifactDir;
  }
  if (!artifactName.startsWith('multinode_server_logs_')) return null;

  const extractedDir = path.join(artifactDir, 'multinode_server_logs');
  return extractArchiveOnce(path.join(artifactDir, 'multinode_server_logs.tar.gz'), extractedDir)
    ? extractedDir
    : null;
}

export function readServerLogArtifact(artifact: ServerLogArtifact): ServerLogFile[] {
  const root = serverLogArtifactRoot(artifact.artifactDir, artifact.artifactName);
  return root ? readServerLogFiles(root) : [];
}

export function readServerLogArtifactZip(zipPath: string, artifactName: string): ServerLogFile[] {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'server-log-artifact-'));
  try {
    execFileSync('unzip', ['-oq', zipPath, '-d', tempDir], { stdio: 'ignore' });
    return readServerLogArtifact({ artifactName, artifactDir: tempDir });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export function discoverServerLogArtifacts(artifactsDir: string): Map<string, ServerLogArtifact> {
  const discovered = new Map<string, ServerLogArtifact>();
  if (!fs.existsSync(artifactsDir)) return discovered;

  for (const artifactName of fs.readdirSync(artifactsDir)) {
    const suffix = serverLogArtifactSuffix(artifactName);
    if (!suffix) continue;
    const artifactDir = path.join(artifactsDir, artifactName);
    if (!fs.statSync(artifactDir).isDirectory()) continue;
    discovered.set(suffix, { artifactName, artifactDir });
  }
  return discovered;
}
