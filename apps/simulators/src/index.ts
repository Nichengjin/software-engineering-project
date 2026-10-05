import { main } from './server.js';

main().catch(() => {
  // Avoid printing error objects: bad seed input or environment errors may
  // contain private values. Fail clearly without fabricating demo courses.
  console.error('Simulator startup failed: check tokens, SIM_SEED_PATH, and writable/valid SIM_STATE_PATH');
  process.exitCode = 1;
});
