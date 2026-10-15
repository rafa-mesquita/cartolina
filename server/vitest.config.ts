import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// O plugin atual (sucessor do pool-workers) roda tudo num único worker e não isola o
// storage por teste, que é o que queremos para WebSockets abertos em Durable Objects.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
});
