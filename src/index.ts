import { serve } from '@hono/node-server';
import app from './app';
import { env } from './env';
import { setUptime } from './lib/uptime';
import { populateAuthors } from './services/author';
import { populateAdvancedGenres } from './services/advanced-genre';
import { populateBooks } from './services/book';
import { populateRegions } from './services/region';
import { populateEmpires } from './services/empire';
import { populateAlternateSlugs } from './services/alternate-slugs';

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { LangfuseExporter } from 'langfuse-vercel';
import { langfuseConfig } from './lib/langfuse';

// before the server starts, we need to populate the cache
console.log('🔄 Populating cache...');
await Promise.all([
  populateAdvancedGenres(),
  populateRegions(),
  populateEmpires(),
  populateAlternateSlugs(),
]);
console.log('✅ Populated advanced genres');
console.log('✅ Populated regions');
console.log('✅ Populated empires');
console.log('✅ Populated alternate slugs');

await populateAuthors();
console.log('✅ Populated authors');
await populateBooks();
console.log('✅ Populated books');

const sdk = new NodeSDK({
  traceExporter: new LangfuseExporter(langfuseConfig),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().finally(() => process.exit(0));
});

serve(
  {
    fetch: app.fetch,
    port: env.PORT ?? 8080,
  },
  ({ address, port }) => {
    setUptime();
    console.log(`⚡ Server is running on ${address}:${port}`);
  },
);
