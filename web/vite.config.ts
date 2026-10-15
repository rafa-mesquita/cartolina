import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Avisa (sem falhar: builds locais e testes continuam funcionando) quando um build sai sem `VITE_SERVER_URL`.
 * `config.env` já junta as variáveis do ambiente e os arquivos `.env*` do modo.
 */
function warnLocalServer(): Plugin {
  return {
    name: 'cartolina:warn-local-server',
    configResolved(config) {
      if (config.command !== 'build' || config.env.VITE_SERVER_URL) return;
      console.warn(
        '\n⚠ VITE_SERVER_URL não definida: este build vai falar com http://127.0.0.1:8787 (servidor local).\n' +
          '  Para publicar, rode com VITE_SERVER_URL=https://<seu-worker>.workers.dev npm run build\n',
      );
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), warnLocalServer()],
  server: { port: 5173, strictPort: true },
  test: { environment: 'jsdom', setupFiles: ['./test/setup.ts'] },
});
