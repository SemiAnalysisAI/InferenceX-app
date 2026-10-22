import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCollectiveXDb, getDb, resolveDatabaseConnection } from './connection';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveDatabaseConnection', () => {
  it('resolves an environment URL and Neon HTTP defaults', () => {
    vi.stubEnv('TEST_DATABASE_URL', 'postgres://user:pass@ep-test-123.us-east-1.aws.neon.tech/app');

    expect(resolveDatabaseConnection({ envVar: 'TEST_DATABASE_URL' })).toEqual({
      url: 'postgres://user:pass@ep-test-123.us-east-1.aws.neon.tech/app',
      driver: 'neon',
      ssl: 'require',
    });
  });

  it('uses an explicit URL instead of the configured environment URL', () => {
    vi.stubEnv('TEST_DATABASE_URL', 'postgres://user:pass@db.example.com/app');

    expect(
      resolveDatabaseConnection({
        envVar: 'TEST_DATABASE_URL',
        url: 'postgres://postgres:postgres@localhost:5432/local',
        driver: 'postgres',
      }),
    ).toEqual({
      url: 'postgres://postgres:postgres@localhost:5432/local',
      driver: 'postgres',
      ssl: false,
    });
  });

  it('defaults remote non-Neon URLs to postgres.js with required TLS', () => {
    expect(
      resolveDatabaseConnection({
        envVar: 'UNUSED',
        url: 'postgres://user:pass@db.example.com/app',
      }),
    ).toMatchObject({ driver: 'postgres', ssl: 'require' });
  });

  it('allows each driver to be selected explicitly', () => {
    const neonUrl = 'postgres://user:pass@ep-test-123.us-east-1.aws.neon.tech/app';
    const remoteUrl = 'postgres://user:pass@db.example.com/app';

    expect(
      resolveDatabaseConnection({
        envVar: 'UNUSED',
        url: neonUrl,
        driver: 'postgres',
      }).driver,
    ).toBe('postgres');
    expect(
      resolveDatabaseConnection({
        envVar: 'UNUSED',
        url: remoteUrl,
        driver: 'neon',
      }).driver,
    ).toBe('neon');
  });

  it('disables TLS for every loopback URL', () => {
    for (const url of [
      'postgres://user:pass@localhost:5432/app',
      'postgres://user:pass@127.0.0.1:5432/app',
      'postgres://user:pass@[::1]:5432/app',
    ]) {
      expect(resolveDatabaseConnection({ envVar: 'UNUSED', url }).ssl).toBe(false);
    }
  });

  it('requires TLS for remote hostnames inherited from Object.prototype', () => {
    for (const hostname of ['constructor', 'toString', '__proto__']) {
      expect(
        resolveDatabaseConnection({
          envVar: 'UNUSED',
          url: `postgres://user:pass@${hostname}/app`,
        }).ssl,
      ).toBe('require');
    }
  });

  it('lets explicit TLS inputs override hostname defaults', () => {
    expect(
      resolveDatabaseConnection({
        envVar: 'UNUSED',
        url: 'postgres://user:pass@db.example.com/app',
        ssl: false,
      }).ssl,
    ).toBe(false);
    expect(
      resolveDatabaseConnection({
        envVar: 'UNUSED',
        url: 'postgres://user:pass@localhost:5432/app',
        ssl: 'true',
      }).ssl,
    ).toBe('require');
  });

  it('memoizes clients by effective connection identity rather than environment name', () => {
    const url = 'postgres://user:pass@ep-memo-test.us-east-1.aws.neon.tech/app';
    const first = getDb({ url, driver: 'neon' });
    const sameConnectionFromAnotherClient = getCollectiveXDb({ url, driver: 'neon' });
    const otherUrl = getDb({
      url: 'postgres://user:pass@ep-memo-other.us-east-1.aws.neon.tech/app',
      driver: 'neon',
    });

    expect(sameConnectionFromAnotherClient).toBe(first);
    expect(otherUrl).not.toBe(first);
  });

  it('reports the selected environment variable when no URL is configured', () => {
    vi.stubEnv('MISSING_DATABASE_URL', '');
    expect(() => resolveDatabaseConnection({ envVar: 'MISSING_DATABASE_URL' })).toThrow(
      'MISSING_DATABASE_URL is not set',
    );
  });
});
