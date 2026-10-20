import { describe, expect, it } from 'vitest';
import type { GameContext } from '../src/game';
import { KITTENS_BICHOS, kittensCardId, kittensKindOf } from '../src/games/kittens/cards';
import { KITTENS_EXTRA_CAFUNES, KITTENS_LATIDOS, kittensBaseDeck } from '../src/games/kittens/deck';
import { applyKittensAction, initialKittensState } from '../src/games/kittens/rules';
import { settleKittens } from '../src/games/kittens/settle';
import { tatusIn } from '../src/games/kittens/turn';
import type { KittensAction, KittensState } from '../src/games/kittens/types';
import { kittensViewFor } from '../src/games/kittens/view';
import { mulberry32, type Rng } from '../src/rng';
import { T0, deepFreeze, everyCard, ids, must } from './kittens-helpers';

/**
 * Simulação aleatória (mas determinística: tudo sai de `mulberry32`) de partidas inteiras. Jogadores ao acaso jogam
 * cartas e combos (inclusive Boto, Latidor, Mau-olhado e Feitiço), dão Nem vem!, compram e escolhem; quem está cego
 * joga por ficha; o relógio anda (inclusive além dos prazos de 5 s e 30 s) e de vez em quando alguém cai de vez.
 * Depois de cada passo, as invariantes têm que valer.
 */

/** Passos no máximo por partida: toda partida tem que acabar antes disso (nada trava). */
const STEP_CAP = 3000;
const SEEDS = 15;
/** Teto de sementes da conferência de cobertura (ela para assim que viu tudo). */
const COVERAGE_SEEDS = 40;

/** Todas as cartas de uma partida com `n` jogadores, em ordem alfabética. */
function fullDeck(n: number): string[] {
  const cafunes = Array.from({ length: n + KITTENS_EXTRA_CAFUNES }, (_, i) => kittensCardId('cafune', i));
  const tatus = Array.from({ length: n - 1 }, (_, i) => kittensCardId('tatubum', i));
  return [...kittensBaseDeck(n), ...cafunes, ...tatus].sort();
}

/**
 * Confere as invariantes depois de um passo; `where` descreve a partida e os últimos passos (vai na mensagem de erro).
 * Comparações à mão em vez de `expect`: são dezenas de milhares de passos e o teste tem que ser rápido.
 */
function checkInvariants(s: KittensState, deck: string[], viewer: string | null, where: () => string): void {
  const broken = (what: string) => new Error(`${what}\n  ${where()}`);
  // Nenhuma carta some nem se duplica, em qualquer fase (contando as cartas na frente dos jogadores).
  const cards = everyCard(s);
  if (cards.join() !== deck.join()) {
    const missing = deck.filter((c) => !cards.includes(c));
    const extra = cards.filter((c, i) => !deck.includes(c) || cards[i + 1] === c);
    throw broken(`cartas não conservadas: faltam [${missing}], sobram [${extra}]`);
  }
  // Na frente de alguém só fica Tatu Latidor, e só na frente de quem está vivo.
  for (const [p, front] of Object.entries(s.front)) {
    if (front.some((c) => kittensKindOf(c) !== 'latido')) throw broken(`carta que não é Latidor na frente de ${p}: [${front}]`);
    if (front.length > 0 && s.phase === 'playing' && !s.alive.includes(p)) throw broken(`${p} saiu com [${front}] na frente`);
  }
  if (s.phase !== 'playing') {
    if (s.pending || s.choice) throw broken('fim de jogo com carta no ar ou escolha aberta');
    if (Object.keys(s.peeks).length > 0) throw broken(`fora de partida com espiadas: ${JSON.stringify(s.peeks)}`);
    if (s.blind.length > 0) throw broken('fim de jogo com gente cega');
    return;
  }
  if (s.blind.some((p) => !s.alive.includes(p)) || new Set(s.blind).size !== s.blind.length) throw broken(`cegos inválidos: [${s.blind}]`);
  // Monte com vivos − 1 tatus (contando o que está sendo escondido): no fim sobra exatamente 1 vivo.
  const heldTatu = s.choice?.kind === 'cafune' || s.choice?.kind === 'tatu' ? s.choice.tatu : null;
  const tatus = tatusIn(s.draw) + (heldTatu !== null ? 1 : 0);
  if (tatus !== s.alive.length - 1) throw broken(`${tatus} tatus no monte com ${s.alive.length} vivos`);
  if (s.current === null || !s.alive.includes(s.current)) throw broken(`vez de ${s.current}, que não está vivo`);
  if (s.owed < 1) throw broken(`vez com ${s.owed} turnos devidos`);
  // Espiadas (pedido do Rafa, 2026-10-20): só de quem está vivo, de 1 a 3 cartas, e sempre o topo do monte, na ordem
  // (a do topo primeiro). Se alguma regra deixasse a espiada desatualizada, ela teria que apagar ou cortar.
  for (const [p, xs] of Object.entries(s.peeks)) {
    if (!s.alive.includes(p)) throw broken(`espiada de ${p}, que não está vivo`);
    const top = s.draw.slice(-xs.length).reverse();
    if (xs.length < 1 || xs.length > 3 || xs.join() !== top.join()) {
      throw broken(`espiada de ${p} [${xs}] não é o topo do monte [${top}]`);
    }
  }
  // Segredo: o monte não aparece na visão de ninguém (cada um vê só a própria espiada, quem decide o par de Quati vê a
  // de cima e quem decide o Feitiço vê a de baixo), nem o id do tatu que está sendo escondido. Quem está cego não vê
  // nenhum id da própria mão (nem no diário).
  const json = JSON.stringify(kittensViewFor(s, viewer));
  const mine = (kind: string) => viewer !== null && s.choice?.kind === kind && 'who' in s.choice && s.choice.who === viewer;
  const ownPeek = viewer !== null && Object.hasOwn(s.peeks, viewer) ? s.peeks[viewer]! : [];
  const sees = [...(mine('quati') ? s.draw.slice(-1) : []), ...(mine('feitico') ? s.draw.slice(0, 1) : []), ...ownPeek];
  const secret = [
    ...s.draw.filter((c) => !sees.includes(c)),
    ...(heldTatu !== null ? [heldTatu] : []),
    ...(viewer !== null && s.blind.includes(viewer) ? s.hands[viewer]! : []),
  ];
  const leaked = secret.filter((c) => json.includes(`"${c}"`));
  if (leaked.length > 0) throw broken(`cartas escondidas [${leaked}] na visão de ${viewer}`);
}

function pick<T>(r: Rng, xs: readonly T[]): T | undefined {
  return xs[Math.floor(r() * xs.length)];
}

/** Cartas pra uma jogada: uma só, par (com ou sem Boto), trio, 5 diferentes (quando a mão permite; senão, uma só). */
function cardsToPlay(r: Rng, hand: string[]): string[] {
  const byKind = new Map<string, string[]>();
  for (const c of hand) byKind.set(kittensKindOf(c)!, [...(byKind.get(kittensKindOf(c)!) ?? []), c]);
  const groups = [...byKind.values()];
  const mode = r();
  const isBicho = (c: string) => (KITTENS_BICHOS as readonly string[]).includes(kittensKindOf(c)!);
  const pairs = groups.filter((g) => g.length >= 2 && isBicho(g[0]!));
  const trios = groups.filter((g) => g.length >= 3);
  const botos = byKind.get('boto') ?? [];
  const bichos = hand.filter(isBicho);
  const news = hand.filter((c) => ['latido', 'olhado', 'feitico'].includes(kittensKindOf(c)!));
  if (mode < 0.15 && news.length > 0) return [pick(r, news)!];
  if (mode < 0.25 && botos.length > 0 && bichos.length > 0) return [botos[0]!, pick(r, bichos)!];
  if (mode < 0.3 && botos.length >= 2) return botos.slice(0, 2);
  if (mode < 0.33 && botos.length > 0 && pairs.length > 0) return [...pick(r, pairs)!.slice(0, 2), botos[0]!];
  if (mode < 0.5 && pairs.length > 0) return pick(r, pairs)!.slice(0, 2);
  if (mode < 0.6 && trios.length > 0) return pick(r, trios)!.slice(0, 3);
  if (mode < 0.7 && groups.length >= 5) return groups.slice(0, 5).map((g) => g[0]!);
  return [pick(r, hand)!];
}

/** Outro nome pra mesma ficha (`?3` → `?03`, `?003`): nunca pode valer. */
const aliasOf = (r: Rng, token: string): string => `?${r() < 0.5 ? '0' : '00'}${token.slice(1)}`;

/** Ficha fora da escrita canônica (`?00`, `?01`…). */
const isAlias = (card: string | undefined): boolean => card !== undefined && /^\?0\d/.test(card);

/**
 * Fichas `?i` ao acaso (1, 2, 3 ou 5, sem repetir) da mão de quem está cego. Às vezes uma delas vai com outro nome,
 * ou repetida por outro nome (tentativa de jogar a mesma carta duas vezes): tem que ser recusado.
 */
function tokensToPlay(r: Rng, size: number): string[] {
  const n = Math.min(size, pick(r, [1, 1, 1, 2, 2, 3, 5])!);
  const all = Array.from({ length: size }, (_, i) => `?${i}`);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  const tokens = all.slice(0, n);
  const roll = r();
  if (roll < 0.15) return [...tokens, aliasOf(r, tokens[0]!)];
  if (roll < 0.25) return [aliasOf(r, tokens[0]!), ...tokens.slice(1)];
  return tokens;
}

/** Uma ação ao acaso de `p` (pode ser inválida: aí é recusada e nada muda). */
function randomAction(r: Rng, s: KittensState, p: string): KittensAction {
  const hand = s.hands[p] ?? [];
  const blind = s.blind.includes(p);
  /**
   * Uma carta da própria mão: id, ou ficha pra quem está cego (às vezes o id mesmo assim, ou a ficha com outro nome
   * tipo `?00`: tem que ser recusado).
   */
  const own = (): string => {
    if (!blind || r() >= 0.9) return pick(r, hand) ?? 'ataque-0';
    const token = `?${Math.floor(r() * (hand.length + 1))}`;
    return r() < 0.15 ? aliasOf(r, token) : token;
  };
  const c = s.choice;
  // Par de Mico: qualquer um da espera descarta uma carta da própria mão.
  if (c?.kind === 'mico' && c.waiting.includes(p) && r() < 0.8) return { type: 'choose', card: own() };
  if (c && c.kind !== 'mico' && c.who === p && r() < 0.8) {
    // Tatu comprado ou Latidor: joga um Desarme da mão (às cegas, qualquer ficha).
    if (c.kind === 'tatu' || c.kind === 'latido') {
      if (blind) return { type: 'choose', card: own() };
      return { type: 'choose', card: pick(r, hand.filter((x) => kittensKindOf(x) === 'cafune')) ?? 'cafune-0' };
    }
    if (c.kind === 'cafune') return { type: 'choose', position: r() < 0.2 ? 'random' : Math.floor(r() * (s.draw.length + 2)) };
    if (c.kind === 'favor') return { type: 'choose', card: own() };
    if (c.kind === 'quati' || c.kind === 'feitico') return { type: 'choose', keep: r() < 0.5 };
    // 5 diferentes: uma das opções que ainda estão no descarte.
    return { type: 'choose', card: pick(r, c.options.filter((x) => s.discard.includes(x))) ?? 'ataque-0' };
  }
  const a = r();
  if (s.pending && a < 0.5) return blind || r() < 0.2 ? { type: 'nope', card: own() } : { type: 'nope' };
  const extra = { target: pick(r, s.players), ask: pick(r, KITTENS_BICHOS), as: pick(r, KITTENS_BICHOS) };
  // Quem está cego joga às cegas de vez em quando; na maioria das vezes compra (e volta a ver).
  if (blind) return a < 0.3 && hand.length > 0 ? { type: 'play', cards: tokensToPlay(r, hand.length), ...extra } : { type: 'draw' };
  // Jogadas com o que é público (senão o cego que tem que se defender do Latidor quase nunca aparece): com alguém com
  // Latidor na frente, segura o outro Latidor até ele ficar cego, bota mau-olhado nele e aí late.
  const others = s.alive.filter((x) => x !== p);
  const barking = others.filter((x) => (s.front[x]?.length ?? 0) > 0);
  const latido = hand.find((x) => kittensKindOf(x) === 'latido');
  if (latido && barking.some((x) => s.blind.includes(x)) && r() < 0.8) return { type: 'play', cards: [latido] };
  const olhado = hand.find((x) => kittensKindOf(x) === 'olhado');
  const seeing = barking.filter((x) => !s.blind.includes(x));
  if (olhado && seeing.length > 0 && r() < 0.6) return { type: 'play', cards: [olhado], target: pick(r, seeing)! };
  const hold = latido !== undefined && seeing.length > 0 && r() < 0.9;
  const playable = hold ? hand.filter((x) => x !== latido) : hand;
  if (a < 0.45 && playable.length > 0) return { type: 'play', cards: cardsToPlay(r, playable), ...extra };
  return { type: 'draw' };
}

/** As cartas que a ação aponta na própria mão (pra ver se alguma ficha foi com outro nome). */
function cardsOf(action: KittensAction): (string | undefined)[] {
  if (action.type === 'play') return action.cards;
  if (action.type === 'nope' || action.type === 'choose') return [action.card];
  return [];
}

/**
 * Começo arranjado (só move cartas, não cria nem some com nenhuma): p1 está cego com um Latidor na frente, e o outro
 * está na mão de p0, que joga primeiro. Ao acaso, um cego ter que se defender do Latidor é raríssimo; daqui as
 * partidas seguem ao acaso como as outras.
 */
function blindBark(s: KittensState): KittensState {
  const [a, b] = ['latido-0', 'latido-1'];
  const without = (cs: string[]) => cs.filter((c) => c !== a && c !== b);
  const hands = Object.fromEntries(Object.entries(s.hands).map(([p, cs]) => [p, without(cs)]));
  return { ...s, hands: { ...hands, p0: [...hands.p0!, a] }, draw: without(s.draw), front: { p1: [b] }, blind: ['p1'] };
}

/**
 * Joga uma partida inteira com `n` jogadores, conferindo as invariantes a cada passo. `false` = não acabou (travou).
 * `seen` junta o que a partida exercitou (pra conferir que as cartas novas apareceram de verdade). `rig` arranja o
 * começo (ex.: `blindBark`).
 */
function playGame(n: number, seed: number, seen: Set<string> = new Set(), rig?: (s: KittensState) => KittensState): boolean {
  const r = mulberry32(seed * 7919 + n);
  const players = ids(n);
  const deck = fullDeck(n);
  let active = [...players];
  let now = T0;
  let rngSeed = seed * 1000;
  const ctx = (): GameContext => ({ hostId: 'p0', active: [...active], rng: mulberry32(++rngSeed), now });
  const trace: string[] = [];
  const where = () => `n=${n}, semente ${seed}; últimos passos: ${trace.slice(-8).join(' | ')}`;
  /** A cada passo, a visão de um jogador (ou de quem assiste) ao acaso é conferida; às vezes, a de quem está cego. */
  const someViewer = (s: KittensState) => (s.blind.length > 0 && r() < 0.5 ? pick(r, s.blind)! : (pick(r, [...players, null]) ?? null));

  let s = must(applyKittensAction(initialKittensState(), 'p0', { type: 'start' }, ctx()));
  if (rig) s = rig(s);
  checkInvariants(s, deck, someViewer(s), where);
  for (let step = 0; s.phase !== 'gameover'; step++) {
    if (step === STEP_CAP) return false;
    const roll = r();
    const c = s.choice;
    if (c?.kind === 'latido' && s.blind.includes(c.who)) seen.add('latido:blind');
    /** Prazo ou queda: o servidor resolve; o Feitiço sem resposta sempre manda a carta de baixo pro topo. */
    const settle = () => {
      const seq = s.seq;
      s = settleKittens(deepFreeze(s), ctx());
      if (c?.kind !== 'feitico' || s.choice === c) return;
      const conjured = s.log.find((e) => e.n >= seq && e.ev.t === 'conjured')?.ev;
      // Sem `conjured`, só se a partida acabou (o outro caiu e sobrou quem escolhia).
      if (conjured === undefined && s.phase === 'gameover') return;
      if (conjured?.t !== 'conjured' || conjured.kept) throw new Error(`Feitiço sem resposta ficou com a carta\n  ${where()}`);
      seen.add('feitico:timeout');
    };
    if (roll < 0.12) {
      // Só o tempo passa (às vezes além do prazo do Nem vem! ou da escolha).
      now += pick(r, [100, 1000, 4999, 5000, 6000, 30_000, 31_000])!;
      trace.push(`+tempo ${now - T0}`);
      settle();
    } else if (roll < 0.135 && active.length > 1) {
      // Alguém cai e não volta: some dos ativos (a tolerância de 30 s já passou).
      const who = pick(r, active)!;
      active = active.filter((x) => x !== who);
      now += 31_000;
      trace.push(`${who} caiu`);
      settle();
    } else {
      // Ação: quase sempre de quem está na vez (ou de quem a escolha aberta espera), às vezes de qualquer um (inclusive
      // quem assiste).
      const owner = c === null ? s.current : c.kind === 'mico' ? (pick(r, c.waiting) ?? null) : c.who;
      const p = r() < 0.9 ? (owner !== null && r() < 0.7 ? owner : pick(r, players)!) : 'espectador';
      const action = randomAction(r, s, p);
      if (r() < 0.3) now += Math.floor(r() * 3000);
      const res = applyKittensAction(deepFreeze(s), p, action, ctx());
      const alias = cardsOf(action).some(isAlias);
      if (alias) seen.add('alias');
      if (res.ok && alias) throw new Error(`ficha com outro nome aceita: ${p} ${JSON.stringify(action)}\n  ${where()}`);
      if (!res.ok) continue;
      if (c?.kind === 'latido' && c.who === p && s.blind.includes(p) && res.state.choice === null) seen.add('latido:blind-defended');
      trace.push(`${p} ${JSON.stringify(action)}`);
      s = res.state;
    }
    for (const e of s.log.slice(-3)) seen.add(e.ev.t === 'play' ? `play:${e.ev.play}` : e.ev.t);
    const air = s.pending?.play;
    if (air && air.cards.some((c) => kittensKindOf(c) === 'boto')) seen.add(`boto:${air.kind}`);
    if (s.blind.length > 0) seen.add('blind');
    if (s.choice) seen.add(`choice:${s.choice.kind}`);
    // Trio de Favor: o alvo dá até 3 cartas, uma de cada vez (a escolha continua aberta entre uma e outra).
    if (air?.kind === 'trio' && air.as === 'favor') seen.add('trio:favor');
    if (s.choice?.kind === 'favor' && c?.kind === 'favor' && s.choice.left < c.left) seen.add('favor:again');
    // Espiada que fica à mostra fora da vez de quem espiou, e mais de uma ao mesmo tempo.
    const peekers = Object.keys(s.peeks);
    if (peekers.some((p) => p !== s.current)) seen.add('peek:kept');
    if (peekers.length >= 2) seen.add('peek:many');
    checkInvariants(s, deck, someViewer(s), where);
  }
  return true;
}

describe('simulação aleatória do Tatubum', () => {
  it.each([2, 3, 5, 8])('%i jogadores: as invariantes valem a cada passo e toda partida acaba', (n) => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      expect(playGame(n, seed), `partida não acabou em ${STEP_CAP} passos (n=${n}, semente ${seed})`).toBe(true);
    }
  });

  it.each([2, 3, 5, 8])('%i jogadores, começando com um cego com Latidor na frente: idem', (n) => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      expect(playGame(n, seed, undefined, blindBark), `partida não acabou (n=${n}, semente ${seed})`).toBe(true);
    }
  });

  it('as cartas novas aparecem nas simulações (com as próprias partidas, sem depender da ordem dos testes)', () => {
    expect(KITTENS_LATIDOS).toBe(2);
    const wanted = [
      'barked',
      'cursed',
      'cured',
      'conjured',
      'play:latido',
      'play:olhado',
      'play:feitico',
      'blind',
      'choice:latido',
      'choice:feitico',
      'boto:par',
      'boto:trio',
      'alias',
      'latido:blind',
      'latido:blind-defended',
      'feitico:timeout',
      'trio:favor',
      'favor:again',
      'peek:kept',
      'peek:many',
    ];
    const seen = new Set<string>();
    // Joga partidas (as mesmas sementes dos testes de cima, em ordem) até ver tudo, com um teto.
    for (let seed = 1; seed <= COVERAGE_SEEDS && wanted.some((w) => !seen.has(w)); seed++) {
      for (const n of [2, 3, 5, 8]) {
        playGame(n, seed, seen);
        playGame(n, seed, seen, blindBark);
      }
    }
    for (const what of wanted) expect(seen, what).toContain(what);
  });
});
