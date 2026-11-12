import { repositoryFromRunUrl } from '../lib/runtime-metadata-artifacts';
import { REDACTED, redactText } from './log-redaction';

const visibility = new Map<string, Promise<boolean>>();

/** Whether an unauthenticated GitHub API read reports `owner/repo` as public; 404 means not. */
export function isPublicRepository(repository: string): Promise<boolean> {
  let result = visibility.get(repository);
  if (!result) {
    result = fetch(`https://api.github.com/repos/${repository}`).then(async (response) => {
      if (response.status === 404) return false;
      if (response.status !== 200) {
        throw new Error(`GitHub visibility check failed with status ${response.status}`);
      }
      const body: unknown = await response.json();
      return (
        typeof body === 'object' && body !== null && 'private' in body && body.private === false
      );
    });
    visibility.set(repository, result);
  }
  return result;
}

/** The `owner/repo` of a run URL when that repository is not public, else null. */
export async function nonPublicRepository(runUrl: string | null): Promise<string | null> {
  const repository = repositoryFromRunUrl(runUrl);
  return repository !== null && !(await isPublicRepository(repository)) ? repository : null;
}

const escapeRegExp = (value: string) => value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

/** `redactText`, then the `owner/repo` and bare names of `repositories`. */
export function sanitizeLogText(text: string, repositories: readonly string[]): string {
  let out = redactText(text);
  for (const repository of repositories) {
    const [owner = '', name = ''] = repository.split('/');
    const pattern = new RegExp(
      String.raw`(?<![\w-])(?:${escapeRegExp(owner)}/)?${escapeRegExp(name)}(?![\w-])`,
      'giu',
    );
    out = out.replaceAll(pattern, REDACTED);
  }
  return out;
}
