import { repositoryFromRunUrl } from '../lib/runtime-metadata-artifacts';
import { REDACTED, redactText } from './log-redaction';

const visibility = new Map<string, Promise<boolean>>();

/**
 * Whether a GitHub API read reports `owner/repo` as public; 404 means not. Reads use
 * `GITHUB_TOKEN` when it is set, as the unauthenticated limit is 60 requests an hour.
 */
export function isPublicRepository(repository: string): Promise<boolean> {
  let result = visibility.get(repository);
  if (!result) {
    const token = process.env.GITHUB_TOKEN;
    const init = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined;
    result = fetch(`https://api.github.com/repos/${repository}`, init).then(async (response) => {
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
    result.catch(() => visibility.delete(repository));
  }
  return result;
}

/** The `owner/repo` of a run URL when that repository is not public, else null. */
export async function nonPublicRepository(runUrl: string | null): Promise<string | null> {
  const repository = repositoryFromRunUrl(runUrl);
  return repository !== null && !(await isPublicRepository(repository)) ? repository : null;
}

const escapeRegExp = (value: string) => value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

/** `name` as a pattern where `-` and `_` match each other, as checkout and compose names swap them. */
const nameVariants = (name: string) =>
  name
    .split(/[-_]/u)
    .map((part) => escapeRegExp(part))
    .join('[-_]');

/**
 * `redactText`, then the `owner/repo` (also URL-encoded as `owner%2Frepo`) and bare names of
 * `repositories`. Only letters and digits end a name, so `name-server-1` and `name_default` lose it.
 */
export function sanitizeLogText(text: string, repositories: readonly string[]): string {
  let out = redactText(text);
  for (const repository of repositories) {
    const [owner = '', name = ''] = repository.split('/');
    const pattern = new RegExp(
      String.raw`(?<![A-Za-z0-9])(?:${nameVariants(owner)}(?:/|%2F))?${nameVariants(name)}(?![A-Za-z0-9])`,
      'giu',
    );
    out = out.replaceAll(pattern, REDACTED);
  }
  return out;
}
