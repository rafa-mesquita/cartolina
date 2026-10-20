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
  /** Joga no celular (aparelho de toque). Sem isso, o celular vê "abre no computador". Ausente = só no computador. */
  mobile?: boolean;
}

// Nomes de vitrine: o ITO aparece como DITU, o Dixit como Diquisti, o Pictures como Retratim, o Exploding Kittens como
// Tatubum e o Coup como Cúpi; os ids internos não mudam.
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
    mobile: true,
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
    mobile: false,
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
    mobile: false,
  },
  kittens: {
    name: 'Tatubum',
    tagline: 'compre do monte e torça pra não vir o tatu',
    rules: [
      'Todo mundo compra do mesmo monte, e lá dentro tem tatus-bola com o pavio aceso.',
      'Comprou o Tatubum sem ter Desarme? Explodiu, tá fora. Com Desarme, você esconde o tatu de volta onde quiser.',
      'Na sua vez, jogue quantas cartas quiser (Ataque, Pular, Espiar, Favor…) e termine comprando. Nem vem! cancela qualquer jogada.',
      'Quem sobrar vivo vence.',
    ],
    playable: true,
    mobile: false,
  },
  coup: {
    name: 'Cúpi',
    tagline: 'blefe, duvide e tome o poder',
    rules: [
      'Cada um tem 2 cartas secretas de personagem e 2 moedas.',
      'Na sua vez, faça uma ação. Algumas dizem que você tem um personagem (Duque, Assassino, Capitão ou Embaixador): pode ser verdade ou blefe.',
      'Os outros têm 10 segundos pra duvidar, ou pra bloquear dizendo ter outro personagem (a Condessa barra o Assassino). Quem erra a dúvida, ou é pego blefando, perde uma carta.',
      'Com 7 moedas dá pra dar o golpe: o alvo perde uma carta, sem bloqueio. Com 10, é obrigatório. Quem perde as 2 cartas sai; o último com carta vence.',
    ],
    playable: true,
    mobile: true,
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
