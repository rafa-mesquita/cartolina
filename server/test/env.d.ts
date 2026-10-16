// Na @cloudflare/vitest-plugin 1.4, o `env` de `cloudflare:test` é tipado como `Cloudflare.Env`
// (não há mais `ProvidedEnv`), então os bindings só de teste entram por aqui.
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
    MIGRATION_DB: D1Database;
  }
}
