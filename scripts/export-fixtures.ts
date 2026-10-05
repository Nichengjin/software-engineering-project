import { writeFile } from 'node:fs/promises';
import { catalogSeedSchema } from '@wylie/contracts';
import { demoCatalogSeed } from '../packages/db/seed/fixtures.js';

const data = catalogSeedSchema.parse(demoCatalogSeed);
await writeFile(new URL('../packages/db/seed/catalog.json', import.meta.url), `${JSON.stringify(data, null, 2)}\n`);
console.log('Exported fictional simulator catalogs (no credentials).');
