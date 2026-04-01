import { describe, expect, it } from 'vitest';

import { postgresOptionsForUrl, shouldUseNeon } from './connection';

describe('shouldUseNeon', () => {
  it('defaults to Neon for neon.tech URLs', () => {
    expect(shouldUseNeon('postgres://user:pass@ep-test-123.us-east-1.aws.neon.tech/db')).toBe(true);
  });

  it('defaults to postgres.js for non-Neon URLs', () => {
    expect(shouldUseNeon('postgres://user:pass@db.example.com/app')).toBe(false);
  });

  it('honors DATABASE_DRIVER=postgres override', () => {
    expect(
      shouldUseNeon('postgres://user:pass@ep-test-123.us-east-1.aws.neon.tech/db', 'postgres'),
    ).toBe(false);
  });

  it('honors DATABASE_DRIVER=neon override', () => {
    expect(shouldUseNeon('postgres://user:pass@db.example.com/app', 'neon')).toBe(true);
  });
});

describe('postgresOptionsForUrl', () => {
  it('keeps TLS enabled for remote non-Neon hosts', () => {
    expect(postgresOptionsForUrl('postgres://user:pass@db.example.com/app')).toEqual({
      max: 5,
      ssl: 'require',
    });
  });

  it('disables TLS for localhost', () => {
    expect(postgresOptionsForUrl('postgres://user:pass@localhost:5432/app')).toEqual({
      max: 5,
      ssl: false,
    });
  });

  it('disables TLS for loopback IPv4 and IPv6 URLs', () => {
    expect(postgresOptionsForUrl('postgres://user:pass@127.0.0.1:5432/app')).toEqual({
      max: 5,
      ssl: false,
    });
    expect(postgresOptionsForUrl('postgres://user:pass@[::1]:5432/app')).toEqual({
      max: 5,
      ssl: false,
    });
  });

  it('honors DATABASE_SSL=false override for remote hosts', () => {
    expect(postgresOptionsForUrl('postgres://user:pass@db.example.com/app', 'false')).toEqual({
      max: 5,
      ssl: false,
    });
  });

  it('honors DATABASE_SSL=true override for loopback hosts', () => {
    expect(postgresOptionsForUrl('postgres://user:pass@localhost:5432/app', 'true')).toEqual({
      max: 5,
      ssl: 'require',
    });
  });
});
