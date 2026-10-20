/** Controles de bots (modo teste). No DITU e no Tatubum aparecem também no site no ar; no Diquisti, no Retratim e no Cama-Leão, só em dev. */
import { GAMES } from '@cartolina/shared';
import { useSyncExternalStore } from 'react';
import { addBot, botsIn, botsVersion, removeAllBots, subscribeBots } from './bots';
import { addCamelioBot, camelioBotsIn, camelioBotsVersion, removeAllCamelioBots, subscribeCamelioBots } from './camelioBots';
import { addDixitBot, dixitBotsIn, dixitBotsVersion, removeAllDixitBots, subscribeDixitBots } from './dixitBots';
import { addKittensBot, kittensBotsIn, kittensBotsVersion, removeAllKittensBots, subscribeKittensBots } from './kittensBots';
import { addPicturesBot, picturesBotsIn, picturesBotsVersion, removeAllPicturesBots, subscribePicturesBots } from './picturesBots';

type GameKey = 'ito' | 'dixit' | 'pictures' | 'kittens' | 'camelio';
interface Api {
  subscribe: (fn: () => void) => () => void;
  version: () => number;
  count: (code: string) => number;
  add: (code: string) => void;
  removeAll: () => void;
}

/** Cada jogo tem o seu registro de bots; o componente só escolhe qual usar. */
const API: Partial<Record<GameKey, Api>> = {
  ito: { subscribe: subscribeBots, version: botsVersion, count: (code: string) => botsIn(code).length, add: (code: string) => void addBot(code), removeAll: removeAllBots },
  dixit: { subscribe: subscribeDixitBots, version: dixitBotsVersion, count: dixitBotsIn, add: addDixitBot, removeAll: removeAllDixitBots },
  pictures: { subscribe: subscribePicturesBots, version: picturesBotsVersion, count: picturesBotsIn, add: addPicturesBot, removeAll: removeAllPicturesBots },
  kittens: { subscribe: subscribeKittensBots, version: kittensBotsVersion, count: kittensBotsIn, add: addKittensBot, removeAll: removeAllKittensBots },
  camelio: { subscribe: subscribeCamelioBots, version: camelioBotsVersion, count: camelioBotsIn, add: addCamelioBot, removeAll: removeAllCamelioBots },
};

/** Jogo sem entrada em `API` não mostra nada. `max`: lotação da sala desse jogo (sala cheia, sem bot novo); sem ela, vale o `maxPlayers` do jogo. */
export default function BotControls({ code, seats, game = 'ito', max = GAMES[game].maxPlayers }: { code: string; seats: number; game?: GameKey; max?: number }) {
  const api = API[game];
  return api ? <Controls api={api} code={code} seats={seats} max={max} /> : null;
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
