import { afterEach, describe, expect, it } from 'bun:test';
import { stubEnv, unstubAllEnvs } from '@/test/helpers';
import { localArtifactPreviewEnabled, readLocalArtifactPreview } from './local-artifact-preview';

afterEach(() => unstubAllEnvs());
describe('local artifact preview isolation', () => {
  it('requires explicit development opt-in and a loopback host', () => {
    stubEnv('INFERENCEX_LOCAL_ARTIFACT_DIR', '/tmp/local-artifacts');
    stubEnv('NODE_ENV', 'production');
    expect(localArtifactPreviewEnabled('localhost')).toBe(false);
    stubEnv('NODE_ENV', 'development');
    expect(localArtifactPreviewEnabled('localhost')).toBe(true);
    expect(localArtifactPreviewEnabled('inferencex.com')).toBe(false);
    stubEnv('INFERENCEX_LOCAL_ARTIFACT_DIR', '');
    expect(localArtifactPreviewEnabled('localhost')).toBe(false);
  });
  it('never reads production fixtures or path traversal requests', async () => {
    stubEnv('INFERENCEX_LOCAL_ARTIFACT_DIR', '/tmp/local-artifacts');
    stubEnv('NODE_ENV', 'production');
    expect(await readLocalArtifactPreview('30864013158')).toBeNull();
    stubEnv('NODE_ENV', 'development');
    expect(await readLocalArtifactPreview('../secret')).toBeNull();
  });
});
