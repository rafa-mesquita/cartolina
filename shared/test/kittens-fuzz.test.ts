import { describe, expect, it } from 'vitest';
import type { GameContext } from '../src/game';
import { KITTENS_BICHOS, kittensCardId, kittensKindOf } from '../src/games/kittens/cards';
import { KITTENS_EXTRA_CAFUNES, kittensBaseDeck } from '../src/games/kittens/deck';
import { applyKittensAction, initialKittensState } from '../src/games/kittens/rules';
import { settleKittens } from '../src/games/kittens/settle';
import { tatusIn } from '../src/games/kittens/turn';
import type { KittensAction, KittensState } from '../src/games/kittens/types';
import { kittensViewFor } from '../src/games/kittens/view';
import { mulberry32, type Rng } from '../src/rng';
import { T0, deepFreeze, everyCard, ids, must } from './kittens-helpers';

/**
 * Simulação aleatória (mas determinística: tudo sai de `mulberry32`) de partidas inteiras. Jogadores ao acaso jogam
 * cartas e combos, dão Nem vem!, compram e escolhem; o relógio anda (inclusive além dos prazos de 5 s e 30 s) e de
 * vez em quando alguém cai de vez. Depois de cada passo, as invariantes têm que valer.
 */

/** Passos no máximo por partida: toda partida tem que acabar antes disso (nada trava). */
const STEP_CAP = 3000;
const SEEDS = 15;

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
  // Nenhuma carta some nem se duplica, em qualquer fase.
  const cards = everyCard(s);
  if (cards.join() !== deck.join()) {
    const missing = deck.filter((c) => !cards.includes(c));
    const extra = cards.filter((c, i) => !deck.includes(c) || cards[i + 1] === c);
    throw broken(`cartas não conservadas: faltam [${missing}], sobram [${extra}]`);
  }
  if (s.phase !== 'playing') {
    if (s.pending || s.choice) throw broken('fim de jogo com carta no ar ou escolha aberta');
    return;
  }
  // Monte com vivos − 1 tatus (contando o que está sendo escondido): no fim sobra exatamente 1 vivo.
  const tatus = tatusIn(s.draw) + (s.choice?.kind === 'cafune' ? 1 : 0);
  if (tatus !== s.alive.length - 1) throw broken(`${tatus} tatus no monte com ${s.alive.length} vivos`);
  if (s.current === null || !s.alive.includes(s.current)) throw broken(`vez de ${s.current}, que não está vivo`);
  if (s.owed < 1) throw broken(`vez com ${s.owed} turnos devidos`);
  // Segredo: o monte não aparece na visão de ninguém (só quem espiou vê as 3 de cima, e quem decide o par de Quati vê a
  // de cima), nem o id do tatu que está sendo escondido.
  const json = JSON.stringify(kittensViewFor(s, viewer));
  const seesTop = s.choice?.kind === 'quati' && viewer === s.choice.who ? s.draw.slice(-1) : [];
  const secret = [
    ...(viewer !== null && viewer === s.peek?.who ? [] : s.draw.filter((c) => !seesTop.includes(c))),
    ...(s.choice?.kind === 'cafune' ? [s.choice.tatu] : []),
  ];
  const leaked = secret.filter((c) => json.includes(`"${c}"`));
  if (leaked.length > 0) throw broken(`cartas escondidas [${leaked}] na visão de ${viewer}`);
}

function pick<T>(r: Rng, xs: readonly T[]): T | undefined {
  return xs[Math.floor(r() * xs.length)];
}

/** Cartas pra uma jogada: uma só, par, trio ou 5 diferentes (quando a mão permite; senão, uma só). */
function cardsToPlay(r: Rng, hand: string[]): string[] {
  const byKind = new Map<string, string[]>();
  for (const c of hand) byKind.set(kittensKindOf(c)!, [...(byKind.get(kittensKindOf(c)!) ?? []), c]);
  const groups = [...byKind.values()];
  const mode = r();
  const pairs = groups.filter((g) => g.length >= 2 && (KITTENS_BICHOS as readonly string[]).includes(kittensKindOf(g[0]!)!));
  const trios = groups.filter((g) => g.length >= 3);
  if (mode < 0.3 && pairs.length > 0) return pick(r, pairs)!.slice(0, 2);
  if (mode < 0.45 && trios.length > 0) return pick(r, trios)!.slice(0, 3);
  if (mode < 0.55 && groups.length >= 5) return groups.slice(0, 5).map((g) => g[0]!);
  return [pick(r, hand)!];
}

/** Uma ação ao acaso de `p` (pode ser inválida: aí é recusada e nada muda). */
function randomAction(r: Rng, s: KittensState, p: string): KittensAction {
  const hand = s.hands[p] ?? [];
  const c = s.choice;
  if (c && c.who === p && r() < 0.8) {
    if (c.kind === 'cafune') return { type: 'choose', position: r() < 0.2 ? 'random' : Math.floor(r() * (s.draw.length + 2)) };
    if (c.kind === 'favor') return { type: 'choose', card: pick(r, hand) ?? 'ataque-0' };
    if (c.kind === 'quati') return { type: 'choose', keep: r() < 0.5 };
    return { type: 'choose', card: pick(r, c.options) ?? 'ataque-0' };
  }
  const a = r();
  if (s.pending && a < 0.5) return { type: 'nope' };
  if (a < 0.45 && hand.length > 0) {
    return { type: 'play', cards: cardsToPlay(r, hand), target: pick(r, s.players), ask: pick(r, KITTENS_BICHOS) };
  }
  return { type: 'draw' };
}

/** Joga uma partida inteira com `n` jogadores, conferindo as invariantes a cada passo. `false` = não acabou (travou). */
function playGame(n: number, seed: number): boolean {
  const r = mulberry32(seed * 7919 + n);
  const players = ids(n);
  const deck = fullDeck(n);
  let active = [...players];
  let now = T0;
  let rngSeed = seed * 1000;
  const ctx = (): GameContext => ({ hostId: 'p0', active: [...active], rng: mulberry32(++rngSeed), now });
  const trace: string[] = [];
  const where = () => `n=${n}, semente ${seed}; últimos passos: ${trace.slice(-8).join(' | ')}`;
  /** A cada passo, a visão de um jogador (ou de quem assiste) ao acaso é conferida. */
  const someViewer = () => pick(r, [...players, null]) ?? null;

  let s = must(applyKittensAction(initialKittensState(), 'p0', { type: 'start' }, ctx()));
  checkInvariants(s, deck, someViewer(), where);
  for (let step = 0; s.phase !== 'gameover'; step++) {
    if (step === STEP_CAP) return false;
    const roll = r();
    if (roll < 0.12) {
      // Só o tempo passa (às vezes além do prazo do Nem vem! ou da escolha).
      now += pick(r, [100, 1000, 4999, 5000, 6000, 30_000, 31_000])!;
      trace.push(`+tempo ${now - T0}`);
      s = settleKittens(deepFreeze(s), ctx());
    } else if (roll < 0.135 && active.length > 1) {
      // Alguém cai e não volta: some dos ativos (a tolerância de 30 s já passou).
      const who = pick(r, active)!;
      active = active.filter((x) => x !== who);
      now += 31_000;
      trace.push(`${who} caiu`);
      s = settleKittens(deepFreeze(s), ctx());
    } else {
      // Ação: quase sempre de quem está na vez, às vezes de qualquer um (inclusive quem assiste).
      const p = r() < 0.9 ? (s.current !== null && r() < 0.7 ? s.current : pick(r, players)!) : 'espectador';
      const action = randomAction(r, s, p);
      if (r() < 0.3) now += Math.floor(r() * 3000);
      const res = applyKittensAction(deepFreeze(s), p, action, ctx());
      if (!res.ok) continue;
      trace.push(`${p} ${JSON.stringify(action)}`);
      s = res.state;
    }
    checkInvariants(s, deck, someViewer(), where);
  }
  return true;
}

describe('simulação aleatória do Tatubum', () => {
  it.each([2, 3, 5, 8])('%i jogadores: as invariantes valem a cada passo e toda partida acaba', (n) => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      expect(playGame(n, seed), `partida não acabou em ${STEP_CAP} passos (n=${n}, semente ${seed})`).toBe(true);
    }
  });
});
