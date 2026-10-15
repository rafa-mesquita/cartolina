import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Os testes usam códigos de sala e slugs aleatórios e únicos, então não dependem de isolamento de storage entre testes.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { bindings: { TEST_MIGRATIONS: await readD1Migrations('./migrations') } },
    })),
  ],
  test: { setupFiles: ['./test/apply-migrations.ts'] },
});
