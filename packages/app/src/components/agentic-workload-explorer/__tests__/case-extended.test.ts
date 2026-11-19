import { describe, it, expect } from 'vitest';
import { jsonCamel } from '@/lib/agentic-workload-explorer/case';

describe('jsonCamel', () => {
  it('returns a Response object', () => {
    const res = jsonCamel({ hello_world: 'test' });
    expect(res).toBeInstanceOf(Response);
  });

  it('converts snake_case keys in response body', async () => {
    const res = jsonCamel({ user_name: 'alice', created_at: '2026-01-01' });
    const body = await res.json();
    expect(body).toEqual({ userName: 'alice', createdAt: '2026-01-01' });
  });

  it('converts nested snake_case keys', async () => {
    const res = jsonCamel({
      user_info: { first_name: 'Bob', last_login: '2026-01-01' },
    });
    const body = await res.json();
    expect(body).toEqual({
      userInfo: { firstName: 'Bob', lastLogin: '2026-01-01' },
    });
  });

  it('converts arrays of objects', async () => {
    const res = jsonCamel([{ api_key: 'key1' }, { api_key: 'key2' }]);
    const body = await res.json();
    expect(body).toEqual([{ apiKey: 'key1' }, { apiKey: 'key2' }]);
  });

  it('applies ResponseInit options', () => {
    const res = jsonCamel({ ok: true }, { status: 201 });
    expect(res.status).toBe(201);
  });

  it('has json content type', () => {
    const res = jsonCamel({});
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('handles null value', async () => {
    const res = jsonCamel(null);
    const body = await res.json();
    expect(body).toBeNull();
  });

  it('handles primitive value', async () => {
    const res = jsonCamel(42);
    const body = await res.json();
    expect(body).toBe(42);
  });
});
