export const MANDACARU_MIN_PLAYERS = 3;
export const MANDACARU_MAX_PLAYERS = 4;
/** Turno de 5 minutos (decisão do usuário, 2026-11-09). Vale também pra cada vez da preparação. */
export const MANDACARU_TURN_MS = 300_000;
/** Prazo do descarte quando sai 7. */
export const MANDACARU_DISCARD_MS = 60_000;
export const MANDACARU_WIN_POINTS = 10;
export const MANDACARU_BANK_EACH = 19;
/** Mais que isso na mão = descarta metade quando sai 7. */
export const MANDACARU_HAND_LIMIT = 7;
/** Tamanho máximo do diário guardado (as últimas entradas). */
export const MANDACARU_LOG_MAX = 80;
export const MANDACARU_PIECES = { road: 15, house: 5, city: 4 } as const;
export const LONGEST_ROAD_MIN = 5;
export const LARGEST_ARMY_MIN = 3;

/** Recursos (o site mostra madeira, barro, couro, feijão, pedra). */
export const RESOURCES = ['wood', 'brick', 'leather', 'beans', 'stone'] as const;
export type Resource = (typeof RESOURCES)[number];
export type Resources = Record<Resource, number>;

/** Terrenos (o site mostra caatinga, barreiro, malhada, roçado, lajedo, rio seco). */
export const TERRAINS = ['forest', 'hills', 'pasture', 'fields', 'mountains', 'desert'] as const;
export type Terrain = (typeof TERRAINS)[number];
export const TERRAIN_RESOURCE: Record<Terrain, Resource | null> = {
  forest: 'wood',
  hills: 'brick',
  pasture: 'leather',
  fields: 'beans',
  mountains: 'stone',
  desert: null,
};
export const TERRAIN_COUNTS: Record<Terrain, number> = { forest: 4, hills: 3, pasture: 4, fields: 4, mountains: 3, desert: 1 };
export const NUMBER_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12] as const;

export type PortKind = 'generic' | Resource;
export const PORT_KINDS: readonly PortKind[] = ['generic', 'generic', 'generic', 'generic', 'wood', 'brick', 'leather', 'beans', 'stone'];

/** Cordéis (cartas de desenvolvimento). Nomes nossos. */
export const CORDEIS = ['vaqueiro', 'point', 'mutirao', 'chuva', 'atravessador'] as const;
export type CordelKind = (typeof CORDEIS)[number];
export const CORDEL_COUNTS: Record<CordelKind, number> = { vaqueiro: 14, point: 5, mutirao: 2, chuva: 2, atravessador: 2 };

export type Piece = 'road' | 'house' | 'city' | 'cordel';
const r = (wood: number, brick: number, leather: number, beans: number, stone: number): Resources => ({ wood, brick, leather, beans, stone });
export const COSTS: Record<Piece, Resources> = {
  road: r(1, 1, 0, 0, 0),
  house: r(1, 1, 1, 1, 0),
  city: r(0, 0, 0, 2, 3),
  cordel: r(0, 0, 1, 1, 1),
};
export const noResources = (): Resources => r(0, 0, 0, 0, 0);

export interface HexTile {
  terrain: Terrain;
  /** null no rio seco. */
  number: number | null;
}

/** O que foi sorteado: um item por terreno e por posição de feira da geometria, na mesma ordem. */
export interface BoardLayout {
  hexes: HexTile[];
  ports: PortKind[];
}

export interface Building {
  owner: string;
  kind: 'house' | 'city';
}

export interface CordelCard {
  kind: CordelKind;
  /** Comprado neste turno (não pode ser jogado ainda). */
  fresh: boolean;
}

export interface PlayerHand {
  res: Resources;
  cordeis: CordelCard[];
}

/** Oferta de quem está na vez pra mesa: `give` é o que ele dá, `want` o que ele quer. */
export interface Offer {
  id: number;
  give: Resources;
  want: Resources;
  accepted: string[];
  rejected: string[];
}

/** Proposta de outro jogador pra quem está na vez: `give` é o que `from` dá, `want` o que `from` quer. */
export interface Proposal {
  id: number;
  from: string;
  give: Resources;
  want: Resources;
}

/** Preparação: posição na ordem em cobra (0..2N-1) e a casa recém-posta esperando a estrada. */
export interface SetupState {
  index: number;
  house: number | null;
}

export type MandacaruPhase = 'lobby' | 'setup' | 'roll' | 'discard' | 'carcara' | 'steal' | 'main' | 'mutirao' | 'over';

/** Uma linha do diário (dados; o site escreve a frase). O recurso roubado não aparece aqui. */
export type MandacaruLogEntry =
  | { t: 'start'; order: string[] }
  | { t: 'place'; player: string; piece: 'house' | 'road'; at: number }
  | { t: 'setup_gain'; player: string; gain: Resources }
  | { t: 'roll'; player: string; dice: [number, number]; gains: Record<string, Resources>; short: Resource[] }
  | { t: 'discard'; player: string; count: number }
  | { t: 'carcara'; player: string; hex: number }
  | { t: 'steal'; player: string; from: string }
  | { t: 'build'; player: string; piece: 'road' | 'house' | 'city'; at: number }
  | { t: 'buy_cordel'; player: string }
  | { t: 'play'; player: string; kind: Exclude<CordelKind, 'point'>; resources?: Resource[]; total?: number }
  | { t: 'trade'; a: string; b: string; aGives: Resources; bGives: Resources }
  | { t: 'feira'; player: string; give: Resource; gave: number; want: Resource; got: number }
  | { t: 'award'; award: 'longest' | 'army'; player: string | null }
  | { t: 'timeout'; player: string }
  | { t: 'end_turn'; player: string }
  | { t: 'win'; player: string; points: number };

export interface MandacaruState {
  phase: MandacaruPhase;
  /** Partidas começadas nesta sala (1 na primeira). */
  match: number;
  /** Placar de vitórias da noite (sobrevive ao "jogar de novo"). */
  wins: Record<string, number>;
  /** Ordem de jogo (sorteada no começo). */
  players: string[];
  layout: BoardLayout | null;
  /** Terreno onde está o Carcará. */
  carcara: number;
  /** Por canto da geometria (54). */
  buildings: (Building | null)[];
  /** Por lado da geometria (72): dono da estrada. */
  roads: (string | null)[];
  hands: Record<string, PlayerHand>;
  bank: Resources;
  /** Monte de cordel (topo = índice 0). Não vai pra visão. */
  deck: CordelKind[];
  turn: string | null;
  setup: SetupState | null;
  /** Já rolou os dados neste turno. */
  rolled: boolean;
  dice: [number, number] | null;
  /** Quantas vezes saiu cada soma; índices 2..12 (13 posições, 0 e 1 sempre 0). */
  diceCounts: number[];
  /** Já jogou um cordel neste turno. */
  cordelPlayed: boolean;
  /** Na fase `discard`: quantas cartas cada um ainda precisa descartar (só quem precisa). */
  discards: Record<string, number>;
  /** Pra onde volta depois do Carcará/roubo. */
  afterCarcara: 'roll' | 'main';
  /** No Mutirão: quantas estradas grátis faltam. */
  mutiraoLeft: number;
  offer: Offer | null;
  proposals: Proposal[];
  /** Último id de oferta/proposta usado (não zera na revanche). */
  tradeSeq: number;
  longestRoad: string | null;
  largestArmy: string | null;
  /** Vaqueiros jogados por jogador. */
  knights: Record<string, number>;
  turnEndsAt: number | null;
  discardEndsAt: number | null;
  /** Hora do servidor quando a partida começou. */
  startedAt: number | null;
  /** Turnos completos jogados (fora da preparação). */
  turns: number;
  winner: string | null;
  /** Último roubo (o recurso só aparece pros dois envolvidos). */
  lastSteal: { thief: string; victim: string; resource: Resource } | null;
  log: MandacaruLogEntry[];
}

export type MandacaruAction =
  | { type: 'start' }
  | { type: 'restart' }
  | { type: 'place_house'; vertex: number }
  | { type: 'place_road'; edge: number }
  | { type: 'roll' }
  | { type: 'discard'; cards: Resources }
  | { type: 'move_carcara'; hex: number }
  | { type: 'steal'; from: string }
  | { type: 'build_road'; edge: number }
  | { type: 'build_house'; vertex: number }
  | { type: 'build_city'; vertex: number }
  | { type: 'buy_cordel' }
  | { type: 'play_vaqueiro' }
  | { type: 'play_mutirao' }
  | { type: 'play_chuva'; resources: [Resource, Resource] }
  | { type: 'play_atravessador'; resource: Resource }
  | { type: 'offer'; give: Resources; want: Resources }
  | { type: 'cancel_offer' }
  | { type: 'respond'; offerId: number; accept: boolean }
  /** Contraproposta ou proposta pra quem está na vez: `give` = o que você dá. */
  | { type: 'propose'; give: Resources; want: Resources }
  /** Quem está na vez fecha: com quem aceitou a oferta (`source: 'offer'`) ou aceitando a proposta dele (`'proposal'`). */
  | { type: 'close_deal'; with: string; source: 'offer' | 'proposal' }
  /** Troca com o banco: dá `give` na taxa da feira e recebe `count` (padrão 1) de `want`. */
  | { type: 'feira'; give: Resource; want: Resource; count?: number }
  | { type: 'end_turn' };

export interface MandacaruSeat {
  id: string;
  /** Pontos que todos veem (sem os cordéis de Ponto; no fim, com eles). */
  points: number;
  resCount: number;
  cordelCount: number;
  knights: number;
  roadLength: number;
  piecesLeft: { road: number; house: number; city: number };
}

/** O que quem vê pode fazer agora. Listas de lugar já filtradas por regra e por dinheiro. */
export interface MandacaruCan {
  placeHouse: number[];
  placeRoad: number[];
  roll: boolean;
  /** Quantas cartas você precisa descartar agora (0 = nada). */
  discard: number;
  carcara: number[];
  steal: string[];
  buildRoad: number[];
  buildHouse: number[];
  buildCity: number[];
  buyCordel: boolean;
  /** Cordéis que dá pra jogar agora. */
  play: Exclude<CordelKind, 'point'>[];
  /** Taxa da feira por recurso dado (4, 3 ou 2); vazio fora da sua fase principal. */
  feira: Partial<Record<Resource, number>>;
  /** Pode mandar oferta pra mesa (quem está na vez, fase principal). */
  offer: boolean;
  /** Pode responder a oferta aberta / mandar proposta (os outros, na fase principal de alguém). */
  respond: boolean;
  propose: boolean;
  endTurn: boolean;
}

export interface MandacaruView {
  phase: MandacaruPhase;
  match: number;
  wins: Record<string, number>;
  players: string[];
  layout: BoardLayout | null;
  carcara: number;
  buildings: (Building | null)[];
  roads: (string | null)[];
  bank: Resources;
  deckSize: number;
  turn: string | null;
  setup: SetupState | null;
  rolled: boolean;
  dice: [number, number] | null;
  diceCounts: number[];
  /** Quem ainda precisa descartar e quantas (público). */
  discards: Record<string, number>;
  mutiraoLeft: number;
  offer: Offer | null;
  proposals: Proposal[];
  longestRoad: string | null;
  largestArmy: string | null;
  seats: MandacaruSeat[];
  turnEndsAt: number | null;
  discardEndsAt: number | null;
  winner: string | null;
  log: MandacaruLogEntry[];
  /** Suas cartas (null pra quem assiste). */
  myRes: Resources | null;
  myCordeis: CordelCard[];
  /** Seus pontos contando os cordéis de Ponto (null pra quem assiste). */
  myPoints: number | null;
  /** Só no fim: cordéis de Ponto de cada um. */
  pointCards: Record<string, number> | null;
  /** O último roubo, só pra quem roubou e quem foi roubado. */
  stolen: { thief: string; victim: string; resource: Resource } | null;
  can: MandacaruCan;
}
