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
  /** Já dá pra criar sala e jogar (sem mesa pronta, fica `false` e a capa ganha o selo "em breve"). */
  playable: boolean;
  /** Tem aba de histórico com partidas (segue `GAMES[id].recordsHistory`). */
  hasHistory: boolean;
}

// Nomes de vitrine: o ITO aparece como DITU, o Dixit como Diquisti e o Pictures como Retratim; os ids internos não mudam.
const TEXT: Record<GameId, Omit<CatalogEntry, 'id' | 'hasHistory' | 'players'>> = {
  ito: {
    name: 'DITU',
    tagline: 'adivinhem a ordem sem dizer o número',
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
    rules: [
      'O narrador escolhe uma carta da mão e diz uma frase sobre ela.',
      'Os outros escolhem a carta da mão que mais combina com a frase.',
      'Todo mundo vota em qual era a do narrador. Nem todos podem acertar, nem ninguém.',
    ],
    playable: true,
  },
  pictures: {
    name: 'Retratim',
    tagline: 'remonte a foto secreta com o que tiver na mão',
    rules: [
      'Na mesa há 16 fotos. Cada um tira uma coordenada secreta: essa é a sua foto.',
      'Cada rodada você recebe um kit diferente (cubos, cadarços, palitos e pedras, blocos, símbolos ou pontos e linhas) e remonta a foto do jeito que der.',
      'Depois, todo mundo palpita qual foto cada um montou: +1 por acerto, e +1 pro artista por cada um que acertou a dele.',
      '6 rodadas: cada um usa cada kit uma vez.',
    ],
    playable: true,
  },
};

export const CATALOG: CatalogEntry[] = GAME_IDS.map((id) => ({
  id,
  ...TEXT[id],
  players: `${GAMES[id].minPlayers} a ${GAMES[id].maxPlayers} pessoas`,
  hasHistory: GAMES[id].recordsHistory,
}));

export function catalogEntry(id: string): CatalogEntry | null {
  return isGameId(id) ? (CATALOG.find((g) => g.id === id) ?? null) : null;
}
