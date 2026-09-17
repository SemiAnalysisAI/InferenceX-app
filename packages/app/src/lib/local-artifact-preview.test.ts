import { afterEach, describe, expect, it, vi } from 'vitest';
import { localArtifactPreviewEnabled, readLocalArtifactPreview } from './local-artifact-preview';

afterEach(() => vi.unstubAllEnvs());
describe('local artifact preview isolation', () => {
  it('requires explicit development opt-in and a loopback host', () => {
    vi.stubEnv('INFERENCEX_LOCAL_ARTIFACT_DIR', '/tmp/local-artifacts');
    vi.stubEnv('NODE_ENV', 'production');
    expect(localArtifactPreviewEnabled('localhost')).toBe(false);
    vi.stubEnv('NODE_ENV', 'development');
    expect(localArtifactPreviewEnabled('localhost')).toBe(true);
    expect(localArtifactPreviewEnabled('inferencex.com')).toBe(false);
    vi.stubEnv('INFERENCEX_LOCAL_ARTIFACT_DIR', '');
    expect(localArtifactPreviewEnabled('localhost')).toBe(false);
  });
  it('never reads production fixtures or path traversal requests', async () => {
    vi.stubEnv('INFERENCEX_LOCAL_ARTIFACT_DIR', '/tmp/local-artifacts');
    vi.stubEnv('NODE_ENV', 'production');
    expect(await readLocalArtifactPreview('30864013158')).toBeNull();
    vi.stubEnv('NODE_ENV', 'development');
    expect(await readLocalArtifactPreview('../secret')).toBeNull();
  });
});
