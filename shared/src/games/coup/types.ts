export const COUP_MIN_PLAYERS = 2;
export const COUP_MAX_PLAYERS = 6;
/** Janela pra duvidar/bloquear (decisão do usuário, 2026-10-19). Quem clica "deixa" encurta. */
export const COUP_WINDOW_MS = 10_000;
/** Moedas da caixa: o tesouro é isso menos as moedas dos jogadores. */
export const COUP_TOTAL_COINS = 50;
export const COUP_START_COINS = 2;
/** Com tantas moedas ou mais, a única ação é o golpe. */
export const COUP_MUST_COUP_AT = 10;
export const COUP_COPIES = 3;

/** Personagens (ids internos; o site mostra Duque, Assassino, Capitão, Embaixador e Condessa). */
export const COUP_CHARACTERS = ['duke', 'assassin', 'captain', 'ambassador', 'contessa'] as const;
export type CoupCharacter = (typeof COUP_CHARACTERS)[number];

/** Ações: renda, ajuda externa, golpe, taxar, assassinar, extorquir, trocar. */
export const COUP_ACTION_KINDS = ['income', 'foreignAid', 'coup', 'tax', 'assassinate', 'steal', 'exchange'] as const;
export type CoupActionKind = (typeof COUP_ACTION_KINDS)[number];

/** Personagem que a ação declara (null = qualquer um pode fazer e ninguém duvida). */
export const COUP_CLAIM: Record<CoupActionKind, CoupCharacter | null> = {
  income: null,
  foreignAid: null,
  coup: null,
  tax: 'duke',
  assassinate: 'assassin',
  steal: 'captain',
  exchange: 'ambassador',
};

/** Custo pago na hora da declaração. */
export const COUP_COST: Record<CoupActionKind, number> = {
  income: 0,
  foreignAid: 0,
  coup: 7,
  tax: 0,
  assassinate: 3,
  steal: 0,
  exchange: 0,
};

/** A ação tem alvo (outro jogador vivo). */
export const COUP_TARGETED: Record<CoupActionKind, boolean> = {
  income: false,
  foreignAid: false,
  coup: true,
  tax: false,
  assassinate: true,
  steal: true,
  exchange: false,
};

/** Com que personagens dá pra bloquear a ação ([] = ninguém bloqueia). */
export const COUP_BLOCKERS: Record<CoupActionKind, readonly CoupCharacter[]> = {
  income: [],
  foreignAid: ['duke'],
  coup: [],
  tax: [],
  assassinate: ['contessa'],
  steal: ['captain', 'ambassador'],
  exchange: [],
};

export interface CoupCard {
  character: CoupCharacter;
  /** Virada pra cima = perdida (fica à vista de todos). */
  revealed: boolean;
}

export interface CoupHand {
  coins: number;
  /** Sempre 2 cartas; as viradas pra baixo são as que ainda valem. */
  cards: CoupCard[];
}

/** A ação da vez em andamento. */
export interface CoupDeclared {
  actor: string;
  kind: CoupActionKind;
  target: string | null;
}

export interface CoupBlock {
  by: string;
  as: CoupCharacter;
}

/** action: duvidar/bloquear a ação; block: duvidar do bloqueio; blockOnly: só o alvo bloqueia (depois de uma dúvida errada). */
export type CoupWindowKind = 'action' | 'block' | 'blockOnly';

export interface CoupWindow {
  /** Número da janela na partida (1, 2, 3…): a reação diz de qual janela é, e reação atrasada pra uma janela que já fechou não vale. */
  id: number;
  kind: CoupWindowKind;
  /** Quem pode reagir nesta janela (vivos, na ordem dos assentos). */
  eligible: string[];
  /** Quem já clicou "deixa" (ou está ausente). */
  passed: string[];
  /** Fim do prazo (ms, hora do servidor). */
  endsAt: number;
}

/** coup/assassinated: alvo da ação; challengeWrong: duvidou e errou; caught: foi pego blefando. */
export type CoupLossReason = 'coup' | 'assassinated' | 'challengeWrong' | 'caught';

/**
 * O que acontece depois da carta perdida: next = vez seguinte; resolve = a ação acontece; proceed = a ação segue
 * (pode abrir a janela só de bloqueio pro alvo); blocked = a ação foi bloqueada.
 */
export type CoupThen = 'next' | 'resolve' | 'proceed' | 'blocked';

export interface CoupLoss {
  player: string;
  reason: CoupLossReason;
  then: CoupThen;
}

/** Uma linha do diário (dados; o site escreve a frase). */
export type CoupLogEntry =
  | { t: 'start'; first: string }
  | { t: 'act'; actor: string; kind: CoupActionKind; target: string | null }
  | { t: 'challenge'; by: string; of: string; claim: CoupCharacter; had: boolean }
  | { t: 'block'; by: string; as: CoupCharacter }
  | { t: 'blocked'; actor: string; kind: CoupActionKind; by: string; as: CoupCharacter }
  | { t: 'resolved'; actor: string; kind: CoupActionKind; target: string | null; amount: number }
  | { t: 'lose'; player: string; card: CoupCharacter }
  | { t: 'out'; player: string }
  | { t: 'win'; player: string };

export type CoupPhase = 'lobby' | 'turn' | 'reaction' | 'losing' | 'exchange' | 'over';

export interface CoupState {
  phase: CoupPhase;
  /** Partidas começadas nesta sala (1 na primeira). */
  match: number;
  /** Quem joga a partida, na ordem dos assentos no começo. Quem entra depois assiste e joga a próxima. */
  players: string[];
  hands: Record<string, CoupHand>;
  /** Baralho (topo = índice 0). Não vai pra visão. */
  deck: CoupCharacter[];
  /** De quem é a vez (null fora da partida). */
  turn: string | null;
  declared: CoupDeclared | null;
  block: CoupBlock | null;
  window: CoupWindow | null;
  loss: CoupLoss | null;
  /** Na troca: as 2 cartas compradas, fora do baralho até a escolha. */
  drawn: CoupCharacter[];
  /** Ordem em que saíram. */
  out: string[];
  winner: string | null;
  /** Placar de vitórias da noite, por jogador (sobrevive ao "jogar de novo"). */
  wins: Record<string, number>;
  /** Último id de janela usado na sala; não zera no "jogar de novo", pra reação atrasada de outra partida não casar com a janela nova. */
  windowSeq: number;
  /** Diário da partida (recomeça a cada partida). */
  log: CoupLogEntry[];
}

export type CoupAction =
  | { type: 'start' }
  /** "jogar de novo" (só o anfitrião, no fim da partida). */
  | { type: 'restart' }
  | { type: 'act'; kind: CoupActionKind; target?: string }
  /** "deixa" */
  | { type: 'pass'; windowId?: number }
  /** Nas três reações (deixa, duvidar, bloquear), `windowId` = id da janela que o jogador viu (o site sempre manda; sem ele, vale a janela aberta). */
  | { type: 'challenge'; windowId?: number }
  | { type: 'block'; as: CoupCharacter; windowId?: number }
  | { type: 'lose'; card: CoupCharacter }
  | { type: 'exchange'; keep: CoupCharacter[] };

export interface CoupSeat {
  id: string;
  coins: number;
  /** Quantas cartas viradas pra baixo. */
  hidden: number;
  /** As cartas já perdidas (à vista). */
  revealed: CoupCharacter[];
  out: boolean;
}

/** O que quem vê pode fazer agora (a mesa mostra só esses botões; as regras conferem de novo). */
export interface CoupCan {
  /** Ações que dá pra declarar (só na sua vez). */
  act: CoupActionKind[];
  challenge: boolean;
  /** Personagens com que dá pra bloquear agora. */
  block: CoupCharacter[];
  pass: boolean;
  /** Você precisa escolher a carta que vai revelar. */
  lose: boolean;
  /** Na sua troca: quantas cartas ficam (0 = não é sua troca). */
  keep: number;
}

export interface CoupView {
  phase: CoupPhase;
  match: number;
  players: string[];
  seats: CoupSeat[];
  turn: string | null;
  declared: CoupDeclared | null;
  block: CoupBlock | null;
  window: CoupWindow | null;
  /** Quem está escolhendo a carta perdida, e por quê. */
  loss: { player: string; reason: CoupLossReason } | null;
  deckSize: number;
  treasury: number;
  out: string[];
  winner: string | null;
  /** As cartas com que o vencedor terminou (só no fim). */
  winnerCards: CoupCharacter[];
  wins: Record<string, number>;
  log: CoupLogEntry[];
  /** Suas cartas viradas pra baixo ([] pra quem assiste). */
  myCards: CoupCharacter[];
  /** Na sua troca: as 2 cartas compradas. */
  myDrawn: CoupCharacter[];
  can: CoupCan;
}
