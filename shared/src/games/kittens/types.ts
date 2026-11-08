import type { KittensBicho, KittensCardKind } from './cards';

export const KITTENS_MIN_PLAYERS = 2;
export const KITTENS_MAX_PLAYERS = 8;
/** Janela do Nem vem! (decisão do usuário, 2026-10-19): sempre corre, mesmo se ninguém tiver Nem vem!. */
export const KITTENS_NOPE_MS = 5_000;
/**
 * Espera entre um Nem vem! e o próximo na mesma carta no ar (pedido do Rafa, 2026-10-21): evita dois por engano.
 * Contada a partir do último Nem vem! aceito (= `pending.resolvesAt - KITTENS_NOPE_MS`); o primeiro não espera.
 */
export const KITTENS_NOPE_COOLDOWN_MS = 2_000;
/** Até quando o próximo Nem vem! na carta no ar tem que esperar (null: pode agora, sem nenhum Nem vem! ainda). */
export function kittensNopeCooldownUntil(pending: { nopes: readonly unknown[]; resolvesAt: number } | null | undefined): number | null {
  if (!pending || pending.nopes.length === 0) return null;
  return pending.resolvesAt - KITTENS_NOPE_MS + KITTENS_NOPE_COOLDOWN_MS;
}
/**
 * Quem manda a magia no ar agora. `by` é sempre quem está na vez e jogou a carta; depois de um Sapo, quem refletiu é quem
 * manda (pedido do Rafa, 2026-11-06).
 */
export function kittensCaster(pending: { by: string; caster?: string }): string {
  return pending.caster ?? pending.by;
}
/**
 * O par de Sapo reflete esta jogada? Favor, Mau-olhado, par de Tucano e par de Latidores, que têm um alvo só. O trio de
 * Favor é imparável. No Tucano do 1x1 ninguém é pulado (`alive` = quantos estão vivos), então não há o que refletir.
 */
export function kittensReflectable(play: Pick<KittensPlay, 'kind' | 'as' | 'target'>, alive: number): boolean {
  if (play.target === null) return false;
  if (play.kind === 'favor' || play.kind === 'olhado') return true;
  return play.kind === 'par' && (play.as === 'latido' || (play.as === 'tucano' && alive > 2));
}
/**
 * 4 bichos diferentes (pedido do Rafa, 2026-10-21): não leva Nem vem!. A carta fica no ar só o tempo de todo mundo ver
 * (sem contagem), e resolve.
 */
export const KITTENS_UNSTOPPABLE_MS = 1_500;
/**
 * A jogada aceita Nem vem!? Os 4 bichos diferentes (`cinco`, nome antigo dos 5 diferentes) e o trio de Favor (pedido do
 * Rafa, 2026-10-28) não aceitam.
 */
export function kittensNopable(play: Pick<KittensPlay, 'kind' | 'as'>): boolean {
  return play.kind !== 'cinco' && !(play.kind === 'trio' && play.as === 'favor');
}
/**
 * Quem está cego tem 50 s pra cada lance (pedido do Rafa, 2026-11-06: tentar todas as combinações às cegas estava
 * arrastando a partida). Jogada recusada não devolve o tempo; acabou, ele compra.
 */
export const KITTENS_BLIND_MS = 50_000;
/** Prazo das escolhas pessoais (Desarme, Favor, descarte e pegada do Mico, 4 bichos diferentes, Quati, Latidor, Feitiço); depois o servidor escolhe. */
export const KITTENS_CHOICE_MS = 30_000;
/** Quantas entradas do diário ficam no estado. */
export const KITTENS_LOG_SIZE = 30;

export type KittensPhase = 'lobby' | 'playing' | 'gameover';

/** O que uma jogada faz: carta de ação sozinha ou combo. */
export type KittensPlayKind =
  | 'ataque'
  | 'pular'
  | 'favor'
  | 'embaralhar'
  | 'espiar'
  | 'latido'
  | 'olhado'
  | 'feitico'
  | 'par'
  | 'trio'
  | 'cinco';

export interface KittensPlay {
  kind: KittensPlayKind;
  cards: string[];
  /** Favor, trio de Favor, Mau-olhado e par de Tucano (o par de Mico não tem alvo). */
  target: string | null;
  /** Par de Preguiça: o bicho pedido. */
  ask: KittensCardKind | null;
  /**
   * Par: o bicho que o par vale (com Boto, o que ele faz as vezes; ex.: Boto + Quati = par de Quati). Trio: o tipo das
   * cartas iguais (`boto` se forem 3 Botos). `null` nas outras jogadas.
   */
  as: KittensCardKind | null;
}

/** Carta no ar: resolve em `resolvesAt`; cada Nem vem! empurra o prazo (spec §4.2). */
export interface KittensPending {
  /** Quem está na vez e jogou a carta. Não muda ao refletir. */
  by: string;
  /** Depois de um Sapo: quem manda a magia agora (`kittensCaster`). Sem o campo, é `by`. */
  caster?: string;
  play: KittensPlay;
  nopes: { by: string; card: string }[];
  resolvesAt: number;
}

export type KittensChoice =
  /** Comprou um Tatubum e tem Desarme: `who` joga o Desarme (o tatu fica na mão dele até voltar pro monte). */
  | { kind: 'tatu'; who: string; tatu: string; deadline: number }
  /** Quem desarmou escolhe onde o `tatu` volta no monte. */
  | { kind: 'cafune'; who: string; tatu: string; deadline: number }
  /**
   * `who` (o alvo do Favor) escolhe, uma de cada vez, `left` cartas da mão pra dar pra `to`: 1 no Favor sozinho; 2 no
   * trio de Favor, depois da que saiu ao acaso (ou o que sobrou da mão, se tiver menos). Fecha quando dá todas ou a mão
   * de `who` acaba.
   */
  | { kind: 'favor'; who: string; to: string; left: number; deadline: number }
  /**
   * `who` pega do descarte, uma de cada vez, `left` cartas de `options`: nos 5 diferentes, 2 do descarte de antes da
   * jogada; no fim do par de Mico (`from: 'mico'`; pedido do Rafa, 2026-10-20), 1 das cartas descartadas nele; no par de
   * Onça (`from: 'onca'`; pedido do Rafa, 2026-11-06), 1 do descarte de antes da jogada, menos Desarme (`options` pode vir
   * vazio: ele só vê o topo e o fundo e fecha). `from` muda os textos da mesa e, na Onça, o que a visão mostra.
   */
  | { kind: 'cinco'; who: string; options: string[]; left: number; deadline: number; from?: 'mico' | 'onca' }
  /**
   * Par de Mico: cada um de `waiting` descarta uma carta da própria mão, ao mesmo tempo. `by` = quem jogou o par;
   * `discarded` = o que já foi descartado nele (público), de onde `by` pega uma quando todos terminam.
   */
  | { kind: 'mico'; by: string; waiting: string[]; discarded: string[]; deadline: number }
  /** Par de Quati: `who` vê a carta de cima do monte e decide se ela fica ou vai pro fundo. */
  | { kind: 'quati'; who: string; deadline: number }
  /**
   * Tatu Latidor jogado por `by`: `who` (um dos que têm Latidor) joga um Desarme à mão pra não explodir. Pública. Os
   * que têm Latidor se defendem um de cada vez, na ordem dos assentos a partir de `by` (pedido do Rafa, 2026-10-21): a
   * fila é quem ainda tem Latidor (quem se defende ou explode fica sem nenhum), então basta `by` pra achar o próximo.
   * Par de Latidores (pedido do Rafa, 2026-10-21; `pair`): `who` é o alvo escolhido (com ou sem Latidor), só ele se
   * defende e o Desarme vai sozinho pro descarte (os Latidores dele ficam).
   */
  | { kind: 'latido'; who: string; by: string; deadline: number; pair?: true }
  /** Feitiço: `who` vê a carta de BAIXO do monte e decide se fica com ela (como se comprasse) ou se ela vai pro topo. */
  | { kind: 'feitico'; who: string; deadline: number }
  /** Par de Peixe-beta: `who` vê as 3 de cima e decide o destino da segunda (`KittensFishFate`). */
  | { kind: 'peixe'; who: string; deadline: number };

/** O que o par de Peixe-beta faz com a segunda carta do monte: fica com ela, deixa onde está ou manda pro fundo. */
export type KittensFishFate = 'keep' | 'stay' | 'bottom';

/** Escolha como os jogadores veem: sem o id do tatu escondido; a carta de cima do Quati e a de baixo do Feitiço só pra quem escolhe. */
export type KittensChoiceView =
  | { kind: 'tatu'; who: string; deadline: number }
  | { kind: 'cafune'; who: string; deadline: number }
  /** `card` = a carta de cima, só pra quem escolhe (null pros outros). */
  | { kind: 'quati'; who: string; deadline: number; card: string | null }
  /** `card` = a carta de baixo do monte, só pra quem escolhe (null pros outros). */
  | { kind: 'feitico'; who: string; deadline: number; card: string | null }
  /** `cards` = as 3 de cima, a do topo primeiro, só pra quem escolhe (null pros outros). */
  | { kind: 'peixe'; who: string; deadline: number; cards: string[] | null }
  /** `seen`: no par de Onça, a carta do topo e a do fundo do monte, só pra quem escolhe. */
  | (Extract<KittensChoice, { kind: 'cinco' }> & { seen?: { top: string | null; bottom: string | null } })
  | Extract<KittensChoice, { kind: 'favor' | 'mico' | 'latido' }>;

/** Espiar no formato antigo (um só por vez, até 2026-10-20): só o `compat.ts` lê isso, de sala salva no meio da partida. */
export interface KittensPeek {
  who: string;
  cards: string[];
}

/** Evento do diário. A `card` de um evento só aparece pra quem está no `seenBy` da entrada. */
export type KittensEvent =
  | { t: 'play'; by: string; play: KittensPlayKind; target: string | null; ask: KittensCardKind | null; as: KittensCardKind | null }
  | { t: 'nope'; by: string }
  /** A carta no ar resolveu; `canceled` = Nem vem! ímpar, ou quem jogou/alvo saiu antes. */
  | { t: 'resolved'; by: string; play: KittensPlayKind; canceled: boolean }
  | { t: 'draw'; by: string; card: string | null }
  /** Comprou um Tatubum e tem Desarme: agora decide usá-lo (todos veem). */
  | { t: 'tatu'; by: string }
  /** Usou o Desarme (carta pro descarte) pra salvar o Tatubum que comprou ou pra se defender do Tatu Latidor. */
  | { t: 'cafune'; by: string }
  | { t: 'hid'; by: string }
  | { t: 'boom'; by: string }
  /** Caiu e não voltou em 30 s. */
  | { t: 'left'; by: string }
  /** Favor: `from` deu `card` pra `to` (só os dois veem). `random`: a carta do trio de Favor que saiu ao acaso. */
  | { t: 'gave'; from: string; to: string; card: string | null; random?: true }
  | { t: 'picked'; by: string; card: string | null }
  /** Par de Mico: `by` descartou `card` (todos veem; o efeito da carta não vale). */
  | { t: 'discarded'; by: string; card: string }
  /** Par de Quati: a carta de cima foi pro fundo (`moved`) ou ficou. Ninguém vê qual era. */
  | { t: 'delayed'; by: string; moved: boolean }
  /** Par de Tamanduá: quantos Tatubuns comprados foram pro fundo. */
  | { t: 'buried'; by: string; tatus: number }
  /**
   * Par de Preguiça: `from` = quem deu, ou null quando veio do monte (ou do descarte: `pile`); `card` null = ninguém
   * tinha, nem o monte, nem o descarte.
   */
  | { t: 'called'; by: string; ask: KittensCardKind; from: string | null; card: string | null; pile?: true }
  /** Roda de capivara: `from` passou `card` pra `to` (só os dois veem). */
  | { t: 'passed'; from: string; to: string; card: string | null }
  /** Trio: roubou o Desarme `card` de `from` (null quando ninguém tinha). */
  | { t: 'grabbed'; by: string; from: string | null; card: string | null }
  /**
   * Tatu Latidor: latiu pra `target` (um dos que têm Latidor; um evento pra cada um, na vez dele de se defender) ou,
   * ninguém mais tendo, ficou na frente de `by` (`target` null). `pair`: par de Latidores no alvo escolhido.
   */
  | { t: 'barked'; by: string; target: string | null; pair?: true }
  /** Mau-olhado: `target` ficou cego (a mão embaralhada e escondida dele até comprar). */
  | { t: 'cursed'; by: string; target: string }
  /** `by` comprou e voltou a ver a própria mão. */
  | { t: 'cured'; by: string }
  /** `by` estava cego e acabou o tempo do lance: compra a carta de cima (os eventos da compra vêm logo depois). */
  | { t: 'blind_timeout'; by: string }
  /** Feitiço: `by` ficou com a carta de baixo do monte (`kept`) ou mandou ela pro topo. Ninguém vê qual era. */
  | { t: 'conjured'; by: string; kept: boolean }
  /**
   * Par de Tucano: `by` acabou a vez sem comprar e a próxima vez de `target` vai ser pulada. `duel`: no 1x1, só a vez
   * de `by` acabou (ninguém é pulado).
   */
  | { t: 'tucano'; by: string; target: string; duel?: true }
  /** Par de Sapo: `by` refletiu a magia no ar, que agora vale pra `target`. */
  | { t: 'reflected'; by: string; target: string }
  /** Par de Peixe-beta: o que `by` fez com a segunda carta do monte (todos veem o destino, ninguém vê a carta). */
  | { t: 'fished'; by: string; fate: KittensFishFate }
  /**
   * Par de Pombo-correio: cartas destes tipos saíram do descarte e voltaram pro monte (públicos, em ordem alfabética: a
   * ordem não diz qual foi pro topo). Só os tipos: o id de uma carta que está no monte não aparece pra ninguém. Vazio = o
   * descarte estava vazio.
   */
  | { t: 'mailed'; by: string; kinds: KittensCardKind[] }
  /** A vez chegou em `who`, que tinha vez pulada (Tucano): o turno dele foi gasto sem ele jogar nem comprar. */
  | { t: 'skipped'; who: string }
  | { t: 'win'; by: string };

export interface KittensLogEntry {
  n: number;
  ev: KittensEvent;
  /** Quem vê a carta do evento; `null` = todos. */
  seenBy: string[] | null;
}

export interface KittensState {
  phase: KittensPhase;
  /** Todos da partida, na ordem dos assentos no "começar". Quem entra depois assiste. */
  players: string[];
  alive: string[];
  hands: Record<string, string[]>;
  /** Monte: o topo é o FIM do array. */
  draw: string[];
  discard: string[];
  /** Fora do jogo: Tatubuns que explodiram, mãos de quem saiu e tatus tirados do monte. */
  out: string[];
  /** Cartas na frente de cada jogador, à vista de todos (o Tatu Latidor que ninguém respondeu). Chave ausente = nada. */
  front: Record<string, string[]>;
  /**
   * Mau-olhado: quem está cego (público). A mão dele foi embaralhada no estado quando o olhado pegou, e ele a vê como
   * fichas `?0…`: a ficha `?i` é `hands[p][i]`. Cartas que chegam depois vão pro fim. Sai da lista quando ele compra.
   */
  blind: string[];
  /**
   * Prazo do lance de quem está cego e na vez, com nada no ar. `seq` = o `seq` do diário quando o prazo começou: tudo que
   * vale entra no diário e recomeça o prazo; jogada recusada não entra. Estado salvo antes disso não tem o campo.
   */
  blindClock: { seq: number; deadline: number } | null;
  current: string | null;
  /** Turnos que `current` ainda deve, contando o atual. */
  owed: number;
  pending: KittensPending | null;
  choice: KittensChoice | null;
  /**
   * Espiar (pedido do Rafa, 2026-10-20): o que cada um espiou e ainda está à mostra pra ele, a carta do topo primeiro.
   * Sempre vale `peeks[p] = draw.slice(-k).reverse()` (k = tamanho da espiada): carta comprada ou tirada do monte sai
   * das espiadas; o monte mudar de ordem perto do topo apaga todas, menos a de quem mexeu sabendo o que fez (Feitiço,
   * Desarme, Quati: pedido do Rafa, 2026-10-21), que pode passar de 3 cartas. Espiada vazia não fica. Chave ausente = nada.
   */
  peeks: Record<string, string[]>;
  /**
   * Par de Tucano (pedido do Rafa, 2026-10-21): quantas vezes de cada jogador ainda vão ser puladas (público; acumula).
   * Quando a vez chega em quem tem, um turno dele é gasto sozinho (`passTo`). Só vivos, sempre ≥ 1 (chave ausente = 0);
   * nunca de quem está na vez.
   */
  skips: Record<string, number>;
  /** Os bichos desta partida, sorteados da pool (`kittensDrawBichos`). O Boto e o Latidor entram sempre e não contam aqui. */
  bichos: KittensBicho[];
  log: KittensLogEntry[];
  /** Número da próxima entrada do diário. */
  seq: number;
  winner: string | null;
  /** Partidas da sala desde o lobby: sobe a cada "começar" e "jogar de novo" (entra no id da partida do histórico). */
  match: number;
  /** Quem saiu, na ordem (o vencedor não entra). Zera a cada partida. */
  exits: KittensExit[];
  /** Nem vem! e Desarmes de cada jogador nesta partida (chave ausente = nada ainda). Zera a cada partida. */
  stats: Record<string, KittensPlayerStats>;
}

/** Como alguém saiu da partida: explodiu (Tatubum, Tatu Latidor ou Feitiço) ou caiu e não voltou em 30 s. */
export type KittensExitHow = 'boom' | 'left';

export interface KittensExit {
  player: string;
  how: KittensExitHow;
}

/** Contadores da partida por jogador, pro histórico (públicos: tudo isso já aparece no diário). */
export interface KittensPlayerStats {
  /** Nem vem! dados (cada `nope` aceito). */
  nopes: number;
  /** Desarmes usados (contra o Tatubum comprado ou o Tatu Latidor, inclusive o jogado sozinho no fim do prazo). */
  defuses: number;
}

export type KittensAction =
  | { type: 'start' }
  /** `as`: par de 2 Botos, o bicho que o par vale. Quem está cego manda fichas (`?0`…) no lugar dos ids. */
  | { type: 'play'; cards: string[]; target?: string; ask?: KittensCardKind; as?: KittensCardKind }
  /** O alvo reflete a magia no ar com um par de Sapo (`kittensSapoPair`). `on` = a primeira carta que ele viu no ar. */
  | { type: 'sapo'; cards: string[]; on?: string }
  /**
   * `card`: qual Nem vem! usar (opcional; sem ela, o servidor usa um). Quem está cego tem que mandar uma ficha.
   * `at` e `on` (pedido do Rafa, 2026-10-20) dizem o que o jogador viu ao clicar: `at` = quantos Nem vem! já havia na
   * carta no ar (`pending.nopes.length`) e `on` = a primeira carta da jogada no ar (`pending.play.cards[0]`; os ids
   * são únicos). Se a mesa mudou nesse meio-tempo, o Nem vem! chegou atrasado: é recusado e a carta fica na mão.
   * Opcionais pra clientes antigos (sem eles, vale como antes).
   */
  | { type: 'nope'; card?: string; at?: number; on?: string }
  | { type: 'draw' }
  /**
   * Desarme: `card` (o Desarme a jogar, ao comprar um Tatubum ou contra o Tatu Latidor) e depois `position` (0 = topo,
   * tamanho do monte = fundo, ou 'random'); Favor, descarte do Mico e 5 diferentes: `card`; Quati e Feitiço: `keep`.
   */
  | { type: 'choose'; card?: string; position?: number | 'random'; keep?: boolean; fate?: KittensFishFate }
  | { type: 'again' }
  | { type: 'lobby' };

export interface KittensView {
  phase: KittensPhase;
  players: string[];
  alive: string[];
  current: string | null;
  owed: number;
  /** Sua mão (vazia pra espectador). Cego: fichas `?0`, `?1`, … no lugar das cartas. */
  hand: string[];
  handCounts: Record<string, number>;
  drawCount: number;
  tatusInDraw: number;
  discard: string[];
  out: string[];
  /** Cartas na frente de cada jogador (todos os jogadores aparecem; sem nada = []). */
  front: Record<string, string[]>;
  /** Quem está cego pelo Mau-olhado (a ordem das fichas não aparece). */
  blind: string[];
  /** Até quando quem está cego e na vez pode fazer o lance; depois ele compra. null = sem prazo correndo. */
  blindDeadline: number | null;
  pending: KittensPending | null;
  choice: KittensChoiceView | null;
  /** O que você espiou e ainda está à mostra (as de cima, a do topo primeiro; pode passar de 3); null se nada. */
  peek: string[] | null;
  /** Quem tem espiada à mostra agora (público; as cartas de cada um, só ele vê), na ordem dos assentos. */
  peekers: string[];
  /** Vezes que ainda vão ser puladas, por jogador (par de Tucano; público). Sem nada = chave ausente. */
  skips: Record<string, number>;
  /** Os bichos desta partida (público). */
  bichos: KittensBicho[];
  log: { n: number; ev: KittensEvent }[];
  winner: string | null;
}
