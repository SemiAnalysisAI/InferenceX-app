import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

import { clearIdbStore, createIDBStorage } from '@/lib/indexdb-cache';
import type { AsyncStorage } from '@tanstack/react-query-persist-client';

describe('createIDBStorage', () => {
  let storage: AsyncStorage;

  beforeEach(() => {
    storage = createIDBStorage();
  });

  it('returns null when no item is stored', async () => {
    expect(await storage.getItem('missing-key')).toBeNull();
  });

  it('stores and retrieves an item', async () => {
    const value = JSON.stringify({ queryHash: 'test', state: { data: [1, 2] } });
    await storage.setItem('query-1', value);
    expect(await storage.getItem('query-1')).toEqual(value);
  });

  it('removes a stored item', async () => {
    await storage.setItem('query-1', 'data');
    await storage.removeItem('query-1');
    expect(await storage.getItem('query-1')).toBeNull();
  });

  it('overwrites previous value on re-set', async () => {
    await storage.setItem('query-1', 'old');
    await storage.setItem('query-1', 'new');
    expect(await storage.getItem('query-1')).toEqual('new');
  });

  it('clearIdbStore removes all entries', async () => {
    await storage.setItem('query-1', 'a');
    await storage.setItem('query-2', 'b');
    await clearIdbStore();
    expect(await storage.getItem('query-1')).toBeNull();
    expect(await storage.getItem('query-2')).toBeNull();
  });
});
