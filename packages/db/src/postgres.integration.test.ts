import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
// The guard must run before opening any database connection.
import { testDatabaseUrl } from '../../../scripts/database-url.mjs';

const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
afterAll(async () => { await prisma.$disconnect(); });

describe('real PostgreSQL integration', () => {
  it('connects to the independent PostgreSQL 15 test database', async () => {
    const rows = await prisma.$queryRaw<Array<{ database: string; version: string }>>`
      SELECT current_database() AS database, current_setting('server_version') AS version
    `;
    expect(rows[0]?.database).toMatch(/_test$/);
    expect(rows[0]?.version).toMatch(/^15\./);
  });

  it('rolls back failed transactions, leaving no temporary table', async () => {
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRaw`CREATE TEMP TABLE foundation_rollback_probe (value integer)`;
      await tx.$executeRaw`INSERT INTO foundation_rollback_probe VALUES (17)`;
      const values = await tx.$queryRaw<Array<{ value: number }>>`SELECT value FROM foundation_rollback_probe`;
      expect(values).toEqual([{ value: 17 }]);
      throw new Error('intentional rollback');
    })).rejects.toThrow('intentional rollback');
    const tables = await prisma.$queryRaw<Array<{ name: string | null }>>`SELECT to_regclass('pg_temp.foundation_rollback_probe')::text AS name`;
    expect(tables).toEqual([{ name: null }]);
  });
});
