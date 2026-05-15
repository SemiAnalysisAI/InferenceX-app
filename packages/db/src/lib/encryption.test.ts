import { afterEach, describe, expect, it, vi } from 'vitest';
import { utf8ToBytes } from '@noble/ciphers/utils.js';
import { randomBytes } from 'crypto';

import { type CipherKey, createCipher, loadKey, parseKey } from './encryption';

const ENV = 'TEST_ENCRYPTION_KEY';

function freshKey(): CipherKey {
  return new Uint8Array(randomBytes(32)) as CipherKey;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('createCipher', () => {
  it('round-trips arbitrary UTF-8 (emoji, newlines, accents)', () => {
    const c = createCipher(freshKey());
    const plain = 'Hello! Édge case: 🚀\nline two.';
    expect(c.decrypt(c.encrypt(plain))).toBe(plain);
  });

  it('produces different ciphertext on each encrypt (managed random nonce)', () => {
    const c = createCipher(freshKey());
    const a = c.encrypt('same input');
    const b = c.encrypt('same input');
    expect(a).not.toBe(b);
    expect(c.decrypt(a)).toBe('same input');
    expect(c.decrypt(b)).toBe('same input');
  });

  it('decrypt with the wrong key throws "decrypt failed"', () => {
    const ct = createCipher(freshKey()).encrypt('secret');
    expect(() => createCipher(freshKey()).decrypt(ct)).toThrowError('decrypt failed');
  });

  it('decrypt of malformed ciphertext throws "decrypt failed" (no oracle)', () => {
    expect(() => createCipher(freshKey()).decrypt('not-valid-ciphertext')).toThrowError(
      'decrypt failed',
    );
  });

  it('AAD binds ciphertext to its context', () => {
    const c = createCipher(freshKey());
    const aadA = utf8ToBytes('user_feedback:doing_well');
    const aadB = utf8ToBytes('user_feedback:doing_poorly');
    const ct = c.encrypt('candid feedback', aadA);
    expect(c.decrypt(ct, aadA)).toBe('candid feedback');
    expect(() => c.decrypt(ct, aadB)).toThrowError('decrypt failed');
    expect(() => c.decrypt(ct)).toThrowError('decrypt failed');
  });

  it('omitting AAD on both sides round-trips', () => {
    const c = createCipher(freshKey());
    expect(c.decrypt(c.encrypt('plain'))).toBe('plain');
  });
});

describe('loadKey', () => {
  it('returns a 32-byte key for a valid base64 env var', () => {
    const raw = Buffer.from(randomBytes(32)).toString('base64');
    vi.stubEnv(ENV, raw);
    const key = loadKey(ENV);
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it('throws when env var is unset', () => {
    vi.stubEnv(ENV, undefined as unknown as string);
    expect(() => loadKey(ENV)).toThrowError(`${ENV} is not set`);
  });

  it('throws when env var is empty after trim', () => {
    vi.stubEnv(ENV, '   \n  ');
    expect(() => loadKey(ENV)).toThrowError(`${ENV} is not set`);
  });

  it('trims surrounding whitespace before decoding', () => {
    const raw = Buffer.from(randomBytes(32)).toString('base64');
    vi.stubEnv(ENV, `  ${raw}\n`);
    expect(() => loadKey(ENV)).not.toThrow();
  });

  it('rejects base64url alphabet (- and _) explicitly', () => {
    // base64url chars Node would silently drop, masking the real problem:
    vi.stubEnv(ENV, 'aaaa-_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=');
    expect(() => loadKey(ENV)).toThrowError(/non-base64 characters/u);
  });

  it('throws on wrong-length key without leaking the byte count', () => {
    vi.stubEnv(ENV, Buffer.from(randomBytes(16)).toString('base64'));
    expect(() => loadKey(ENV)).toThrowError(/must decode to 32 bytes$/u);
  });

  it('produces a key usable by createCipher', () => {
    const raw = Buffer.from(randomBytes(32)).toString('base64');
    vi.stubEnv(ENV, raw);
    const c = createCipher(loadKey(ENV));
    expect(c.decrypt(c.encrypt('via loadKey'))).toBe('via loadKey');
  });
});

describe('parseKey (universal — no env, no Buffer)', () => {
  it('returns a 32-byte key for a valid base64 string', () => {
    const raw = Buffer.from(randomBytes(32)).toString('base64');
    const key = parseKey(raw);
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it('trims whitespace before decoding', () => {
    const raw = Buffer.from(randomBytes(32)).toString('base64');
    expect(() => parseKey(`\t  ${raw}\n`)).not.toThrow();
  });

  it('rejects empty / whitespace-only input', () => {
    expect(() => parseKey('')).toThrowError(/key is empty/u);
    expect(() => parseKey('   ')).toThrowError(/key is empty/u);
  });

  it('rejects base64url alphabet (- and _)', () => {
    expect(() => parseKey('aaaa-_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=')).toThrowError(
      /non-base64 characters/u,
    );
  });

  it('rejects wrong-length keys', () => {
    const short = Buffer.from(randomBytes(16)).toString('base64');
    expect(() => parseKey(short)).toThrowError(/must decode to 32 bytes/u);
  });

  it('round-trips via createCipher (universal path)', () => {
    const raw = Buffer.from(randomBytes(32)).toString('base64');
    const c = createCipher(parseKey(raw));
    expect(c.decrypt(c.encrypt('via parseKey'))).toBe('via parseKey');
  });

  it('interoperates with loadKey — same base64 produces same ciphertext-decryptable key', () => {
    const raw = Buffer.from(randomBytes(32)).toString('base64');
    const a = createCipher(parseKey(raw));
    vi.stubEnv(ENV, raw);
    const b = createCipher(loadKey(ENV));
    const ct = a.encrypt('cross-decrypt');
    expect(b.decrypt(ct)).toBe('cross-decrypt');
  });
});
