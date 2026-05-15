// AES-256-GCM with managed (per-message random) nonce. AAD is bound at cipher
// construction; encrypt + decrypt must use the same bytes.

import { gcm } from '@noble/ciphers/aes.js';
import { bytesToUtf8, managedNonce, utf8ToBytes } from '@noble/ciphers/utils.js';

const KEY_BYTES = 32;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/u;
const wrapped = managedNonce(gcm);

export type CipherKey = Uint8Array & { readonly __brand: 'CipherKey' };

export interface Cipher {
  encrypt(plaintext: string, aad?: Uint8Array): string;
  decrypt(ciphertextB64: string, aad?: Uint8Array): string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCodePoint(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.codePointAt(i) ?? 0;
  return out;
}

export function createCipher(key: CipherKey): Cipher {
  return {
    encrypt(plaintext, aad) {
      const cipher = aad === undefined ? wrapped(key) : wrapped(key, aad);
      return bytesToBase64(cipher.encrypt(utf8ToBytes(plaintext)));
    },
    decrypt(ciphertextB64, aad) {
      try {
        const cipher = aad === undefined ? wrapped(key) : wrapped(key, aad);
        return bytesToUtf8(cipher.decrypt(base64ToBytes(ciphertextB64)));
      } catch {
        // Opaque error so the failure mode (tag vs base64 vs utf8) isn't an oracle.
        throw new Error('decrypt failed');
      }
    },
  };
}

export function parseKey(raw: string): CipherKey {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('key is empty');
  // Reject base64url explicitly — atob silently drops `-` and `_`.
  if (!BASE64_RE.test(trimmed)) {
    throw new Error('key contains non-base64 characters (expected A-Z a-z 0-9 + / =)');
  }
  const bytes = base64ToBytes(trimmed);
  if (bytes.length !== KEY_BYTES) {
    throw new Error(`key must decode to ${KEY_BYTES} bytes`);
  }
  return bytes as CipherKey;
}

export function loadKey(envVar: string): CipherKey {
  const raw = process.env[envVar];
  if (raw === undefined || raw.trim() === '') throw new Error(`${envVar} is not set`);
  try {
    return parseKey(raw);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'malformed';
    if (msg.includes('non-base64')) {
      throw new Error(`${envVar} contains non-base64 characters (expected A-Z a-z 0-9 + / =)`, {
        cause: error,
      });
    }
    if (msg.includes('decode to')) {
      throw new Error(`${envVar} must decode to ${KEY_BYTES} bytes`, { cause: error });
    }
    throw new Error(`${envVar}: ${msg}`, { cause: error });
  }
}
