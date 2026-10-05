export function testDatabaseUrl(env = process.env) {
  if (!env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required; PostgreSQL tests cannot be skipped');
  const url = new URL(env.TEST_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/^\/[a-zA-Z0-9_]+_test$/.test(url.pathname)) {
    throw new Error('TEST_DATABASE_URL must name a PostgreSQL database ending in _test');
  }
  if (env.DATABASE_URL) {
    const development = new URL(env.DATABASE_URL);
    // Conservatively reject the same name even on different hosts: loopback/DNS aliases
    // must not allow a development database to masquerade as an isolated test target.
    if (development.pathname === url.pathname) {
      throw new Error('Test database must differ from DATABASE_URL');
    }
  }
  return url.toString();
}
