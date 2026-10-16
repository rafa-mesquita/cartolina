import { GAMES, GAME_IDS, isGameId, type GameId } from '@cartolina/shared';

/** O que o site mostra de cada jogo na estante e na página do jogo. */
export interface CatalogEntry {
  id: GameId;
  name: string;
  /** Frase curta da capa. */
  tagline: string;
  players: string;
  /** "como jogar", em poucas linhas. */
  rules: string[];
  /** Já dá pra criar sala e jogar (o Diquisti chega no D2). */
  playable: boolean;
  /** Tem aba de histórico com partidas (segue `GAMES[id].recordsHistory`). */
  hasHistory: boolean;
}

// Nomes de vitrine: o ITO aparece como DITU e o Dixit como Diquisti; os ids internos não mudam.
const TEXT: Record<GameId, Omit<CatalogEntry, 'id' | 'hasHistory'>> = {
  ito: {
    name: 'DITU',
    tagline: 'adivinhem a ordem sem dizer o número',
    players: '2 a 10 pessoas',
    rules: [
      'Cada um recebe um número secreto de 1 a 100.',
      'Sem dizer o número, use o tema pra dar uma dica: quanto maior o número, mais perto do "100" do tema.',
      'Juntos, coloquem as cartas em ordem na mesa. Todo mundo pronto, as cartas viram.',
      'Modo livre: rodadas soltas. Campanha: 3 vidas e 3 níveis.',
    ],
    playable: true,
  },
  dixit: {
    name: 'Diquisti',
    tagline: 'uma imagem, uma frase, muitas interpretações',
    players: '3 a 10 pessoas',
    rules: [
      'O narrador escolhe uma carta da mão e diz uma frase sobre ela.',
      'Os outros escolhem a carta da mão que mais combina com a frase.',
      'Todo mundo vota em qual era a do narrador. Nem todos podem acertar, nem ninguém.',
    ],
    playable: false,
  },
};

export const CATALOG: CatalogEntry[] = GAME_IDS.map((id) => ({ id, ...TEXT[id], hasHistory: GAMES[id].recordsHistory }));

export function catalogEntry(id: string): CatalogEntry | null {
  return isGameId(id) ? (CATALOG.find((g) => g.id === id) ?? null) : null;
}
