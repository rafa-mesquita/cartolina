/**
 * Controles de bots (modo teste). No DITU aparecem também no site no ar; nos outros jogos (Diquisti, Retratim, Cúpi), só em dev
 * (o lobby deles só renderiza isto em dev). Os bots do Cúpi ainda saem do build de produção pelo teste `import.meta.env.DEV` no `API`.
 */
import { GAMES, type GameId } from '@cartolina/shared';
import { useSyncExternalStore } from 'react';
import { addBot, botsIn, botsVersion, removeAllBots, subscribeBots } from './bots';
import { addCoupBot, coupBotsIn, coupBotsVersion, removeAllCoupBots, subscribeCoupBots } from './coupBots';
import { addDixitBot, dixitBotsIn, dixitBotsVersion, removeAllDixitBots, subscribeDixitBots } from './dixitBots';
import { addPicturesBot, picturesBotsIn, picturesBotsVersion, removeAllPicturesBots, subscribePicturesBots } from './picturesBots';

type GameKey = GameId;
interface Api {
  subscribe: (fn: () => void) => () => void;
  version: () => number;
  count: (code: string) => number;
  add: (code: string) => void;
  removeAll: () => void;
}

const NO_BOTS: Api = { subscribe: () => () => {}, version: () => 0, count: () => 0, add: () => {}, removeAll: () => {} };

/** Cada jogo tem o seu registro de bots; o componente só escolhe qual usar. */
const API: Record<GameKey, Api> = {
  ito: { subscribe: subscribeBots, version: botsVersion, count: (code: string) => botsIn(code).length, add: (code: string) => void addBot(code), removeAll: removeAllBots },
  dixit: { subscribe: subscribeDixitBots, version: dixitBotsVersion, count: dixitBotsIn, add: addDixitBot, removeAll: removeAllDixitBots },
  pictures: { subscribe: subscribePicturesBots, version: picturesBotsVersion, count: picturesBotsIn, add: addPicturesBot, removeAll: removeAllPicturesBots },
  // os bots do Cúpi só existem em dev: no build de produção este ramo some e leva o módulo junto (o lobby do Cúpi nem renderiza isto)
  coup: import.meta.env.DEV
    ? { subscribe: subscribeCoupBots, version: coupBotsVersion, count: coupBotsIn, add: addCoupBot, removeAll: removeAllCoupBots }
    : NO_BOTS,
};

/** O teto de bots vem do jogo (`GAMES[game].maxPlayers`): o Cúpi lota com 6, o DITU com 10. */
export default function BotControls({ code, seats, game = 'ito' }: { code: string; seats: number; game?: GameKey }) {
  return <Controls api={API[game]} code={code} seats={seats} max={GAMES[game].maxPlayers} />;
}

function Controls({ api, code, seats, max }: { api: Api; code: string; seats: number; max: number }) {
  useSyncExternalStore(api.subscribe, api.version);
  const count = api.count(code);
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
      <p className="hint">modo teste: os bots jogam daqui do seu aparelho e a rodada não entra no histórico</p>
      <div className="row-inline">
        <button className="sbtn" type="button" disabled={seats >= max} onClick={() => api.add(code)}>
          🤖 adicionar bot
        </button>
        {count > 0 && (
          <button className="sbtn" type="button" onClick={() => api.removeAll()}>
            tirar bots ({count})
          </button>
        )}
      </div>
    </section>
  );
}
