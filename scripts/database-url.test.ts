import { describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './database-url.mjs';

describe('test database isolation', () => {
  it('rejects absent URL instead of skipping integration tests', () => {
    expect(() => testDatabaseUrl({})).toThrow('required');
  });
  it('rejects development names and non-PostgreSQL URLs', () => {
    for (const url of ['postgres://localhost/wylie', 'file:///wylie_test', 'postgres://localhost/wylie_test/extra']) {
      expect(() => testDatabaseUrl({ TEST_DATABASE_URL: url })).toThrow('_test');
    }
  });
  it('rejects the same database even with a different role, scheme or implicit port', () => {
    expect(() => testDatabaseUrl({ DATABASE_URL: 'postgres://alice@localhost/wylie_test', TEST_DATABASE_URL: 'postgresql://bob@localhost:5432/wylie_test' })).toThrow('differ');
    expect(() => testDatabaseUrl({ DATABASE_URL: 'postgres://localhost/wylie_test', TEST_DATABASE_URL: 'postgres://127.0.0.1/wylie_test' })).toThrow('differ');
  });
  it('accepts a separately named test database', () => {
    expect(testDatabaseUrl({ DATABASE_URL: 'postgres://localhost/wylie', TEST_DATABASE_URL: 'postgres://localhost/wylie_test' })).toBe('postgres://localhost/wylie_test');
  });
});
