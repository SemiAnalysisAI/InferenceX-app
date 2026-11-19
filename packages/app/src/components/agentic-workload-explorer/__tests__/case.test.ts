import { describe, it, expect } from 'vitest';
import { camelKeys } from '@/lib/agentic-workload-explorer/case';

describe('camelKeys', () => {
  it('converts flat object with snake_case keys', () => {
    expect(camelKeys({ first_name: 'Alice', last_name: 'Smith' })).toEqual({
      firstName: 'Alice',
      lastName: 'Smith',
    });
  });

  it('converts nested objects with snake_case keys', () => {
    expect(
      camelKeys({
        user_info: {
          first_name: 'Alice',
          home_address: { zip_code: '12345' },
        },
      }),
    ).toEqual({
      userInfo: {
        firstName: 'Alice',
        homeAddress: { zipCode: '12345' },
      },
    });
  });

  it('converts array of objects', () => {
    expect(
      camelKeys([
        { user_id: 1, user_name: 'Alice' },
        { user_id: 2, user_name: 'Bob' },
      ]),
    ).toEqual([
      { userId: 1, userName: 'Alice' },
      { userId: 2, userName: 'Bob' },
    ]);
  });

  it('passes through string primitives', () => {
    expect(camelKeys('hello')).toBe('hello');
  });

  it('passes through number primitives', () => {
    expect(camelKeys(42)).toBe(42);
  });

  it('passes through null', () => {
    expect(camelKeys(null)).toBeNull();
  });

  it('passes through undefined', () => {
    expect(camelKeys(undefined)).toBeUndefined();
  });

  it('passes through boolean primitives', () => {
    expect(camelKeys(true)).toBe(true);
    expect(camelKeys(false)).toBe(false);
  });

  it('passes through Date instances without treating them as objects', () => {
    const date = new Date('2025-01-01T00:00:00Z');
    expect(camelKeys(date)).toBe(date);
  });

  it('leaves already camelCase keys unchanged', () => {
    expect(camelKeys({ firstName: 'Alice', lastName: 'Smith' })).toEqual({
      firstName: 'Alice',
      lastName: 'Smith',
    });
  });

  it('returns empty object for empty object', () => {
    expect(camelKeys({})).toEqual({});
  });

  it('returns empty array for empty array', () => {
    expect(camelKeys([])).toEqual([]);
  });

  it('handles deeply nested mixed arrays and objects', () => {
    const input = {
      top_level: [
        {
          nested_key: 'value',
          inner_list: [{ deep_key: 1 }, { another_deep: [{ leaf_node: true }] }],
        },
      ],
    };
    expect(camelKeys(input)).toEqual({
      topLevel: [
        {
          nestedKey: 'value',
          innerList: [{ deepKey: 1 }, { anotherDeep: [{ leafNode: true }] }],
        },
      ],
    });
  });

  it('converts keys with multiple underscores like cache_read_input_tokens', () => {
    expect(
      camelKeys({
        cache_read_input_tokens: 100,
        cache_write_input_tokens: 50,
        total_output_tokens: 200,
      }),
    ).toEqual({
      cacheReadInputTokens: 100,
      cacheWriteInputTokens: 50,
      totalOutputTokens: 200,
    });
  });

  it('renames raw payload fields but keeps their snake_case contents', () => {
    expect(
      camelKeys({
        request_id: 'r1',
        request_body: { max_tokens: 1, system: [{ cache_control: { type: 'ephemeral' } }] },
        response_body: { body: { stop_reason: 'end_turn' } },
      }),
    ).toEqual({
      requestId: 'r1',
      requestBody: { max_tokens: 1, system: [{ cache_control: { type: 'ephemeral' } }] },
      responseBody: { body: { stop_reason: 'end_turn' } },
    });
  });
});
