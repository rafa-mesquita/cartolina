/** Controles de bots — SÓ em dev (carregado via lazy atrás de `import.meta.env.DEV`). */
import { MAX_PLAYERS } from '@cartolina/shared';
import { useSyncExternalStore } from 'react';
import { addBot, botsIn, botsVersion, removeAllBots, subscribeBots } from './bots';

export default function BotControls({ code, seats }: { code: string; seats: number }) {
  useSyncExternalStore(subscribeBots, botsVersion);
  const count = botsIn(code).length;
  // estilo inline de propósito: nada disso entra no CSS de produção
  return (
    <section
      aria-label="modo teste"
      style={{
        width: 'min(520px, 100%)',
        border: '2px dashed var(--ink)',
        borderRadius: '18px 14px 16px 12px',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        opacity: 0.9,
      }}
    >
      <p className="hint">modo teste (só no localhost)</p>
      <div className="row-inline">
        <button className="sbtn" type="button" disabled={seats >= MAX_PLAYERS} onClick={() => addBot(code)}>
          🤖 adicionar bot
        </button>
        {count > 0 && (
          <button className="sbtn" type="button" onClick={() => removeAllBots()}>
            tirar bots ({count})
          </button>
        )}
      </div>
    </section>
  );
}
