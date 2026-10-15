import { describe, expect, it } from 'vitest';
import type { GameContext } from '../src/game';
import { applyItoAction, initialItoState, itoViewFor, maybeReveal } from '../src/games/ito/rules';
import type { ItoAction, ItoState } from '../src/games/ito/types';
import { mulberry32 } from '../src/rng';

export function ctx(active: string[], hostId: string | null = active[0] ?? null, seed = 1): GameContext {
  return { hostId, active, rng: mulberry32(seed) };
}

/** Congela o estado recursivamente: qualquer mutação nas regras lança erro. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

export function act(state: ItoState, playerId: string, action: ItoAction, c: GameContext): ItoState {
  const res = applyItoAction(deepFreeze(state), playerId, action, c);
  if (!res.ok) throw new Error(`ação recusada: ${res.error}`);
  return res.state;
}

export function errorOf(state: ItoState, playerId: string, action: ItoAction, c: GameContext): string {
  const res = applyItoAction(deepFreeze(state), playerId, action, c);
  if (res.ok) throw new Error('esperava erro');
  return res.error;
}

/** Leva um jogo de `players` até a fase de ordenação. */
export function toSorting(players: string[], mode: 'livre' | 'campanha' = 'livre'): ItoState {
  const c = ctx(players);
  let s = initialItoState();
  s = act(s, players[0]!, { type: 'setMode', mode }, c);
  s = act(s, players[0]!, { type: 'start' }, c);
  return act(s, players[0]!, { type: 'beginRound' }, c);
}

describe('lobby', () => {
  it('começa no lobby, modo livre, 3 vidas', () => {
    const s = initialItoState();
    expect(s.phase).toBe('lobby');
    expect(s.mode).toBe('livre');
    expect(s.lives).toBe(3);
  });

  it('só o host muda o modo', () => {
    const c = ctx(['a', 'b']);
    expect(errorOf(initialItoState(), 'b', { type: 'setMode', mode: 'campanha' }, c)).toBe('not_host');
    expect(act(initialItoState(), 'a', { type: 'setMode', mode: 'campanha' }, c).mode).toBe('campanha');
  });

  it('precisa de 2 jogadores ativos para começar', () => {
    expect(errorOf(initialItoState(), 'a', { type: 'start' }, ctx(['a']))).toBe('not_enough_players');
  });

  it('start vai para a fase de tema com os ativos como jogadores', () => {
    const s = act(initialItoState(), 'a', { type: 'start' }, ctx(['a', 'b', 'c']));
    expect(s.phase).toBe('theme');
    expect(s.players).toEqual(['a', 'b', 'c']);
    expect(s.theme).not.toBeNull();
    expect(s.usedThemes).toHaveLength(1);
    expect(s.level).toBe(1);
  });

  it('não dá pra começar fora do lobby', () => {
    const c = ctx(['a', 'b']);
    const s = act(initialItoState(), 'a', { type: 'start' }, c);
    expect(errorOf(s, 'a', { type: 'start' }, c)).toBe('bad_phase');
  });
});

describe('tema', () => {
  const c = ctx(['a', 'b']);
  const inTheme = () => act(initialItoState(), 'a', { type: 'start' }, c);

  it('host sorteia outro tema sem repetir', () => {
    const s0 = inTheme();
    const s1 = act(s0, 'a', { type: 'rerollTheme' }, ctx(['a', 'b'], 'a', 99));
    expect(s1.theme?.titulo).not.toBe(s0.theme?.titulo);
    expect(s1.usedThemes).toHaveLength(2);
  });

  it('host define tema próprio (limpo)', () => {
    const s = act(inTheme(), 'a', { type: 'customTheme', theme: { titulo: ' Pizzas ', min: 'ruim', max: 'boa' } }, c);
    expect(s.theme).toEqual({ titulo: 'Pizzas', min: 'ruim', max: 'boa' });
  });

  it('rejeita tema inválido e não-host', () => {
    expect(errorOf(inTheme(), 'a', { type: 'customTheme', theme: { titulo: '', min: 'a', max: 'b' } }, c)).toBe('bad_theme');
    expect(errorOf(inTheme(), 'b', { type: 'rerollTheme' }, c)).toBe('not_host');
  });

  it('campanha: tema só sorteado (escrever é recusado; sortear outro continua valendo)', () => {
    const campaign = () => act(act(initialItoState(), 'a', { type: 'setMode', mode: 'campanha' }, c), 'a', { type: 'start' }, c);
    const s0 = campaign();
    expect(errorOf(s0, 'a', { type: 'customTheme', theme: { titulo: 'Pizzas', min: 'ruim', max: 'boa' } }, c)).toBe('theme_random_only');
    const s1 = act(s0, 'a', { type: 'rerollTheme' }, ctx(['a', 'b'], 'a', 99));
    expect(s1.theme?.titulo).not.toBe(s0.theme?.titulo);
  });
});

describe('distribuição', () => {
  it('modo livre: 1 carta por jogador, valores únicos de 1 a 100', () => {
    const s = toSorting(['a', 'b', 'c', 'd']);
    expect(s.phase).toBe('sorting');
    const cards = Object.values(s.cards);
    expect(cards).toHaveLength(4);
    expect(new Set(cards.map((x) => x.value)).size).toBe(4);
    for (const card of cards) {
      expect(card.value).toBeGreaterThanOrEqual(1);
      expect(card.value).toBeLessThanOrEqual(100);
      expect(card.clue).toBe('');
    }
    expect(cards.map((x) => x.owner).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(s.row).toEqual([]);
  });

  it('campanha nível 1 dá 1 carta por jogador', () => {
    const s = toSorting(['a', 'b'], 'campanha');
    expect(Object.values(s.cards)).toHaveLength(2);
  });

  it('10 jogadores no nível 3 recebem 30 cartas únicas', () => {
    const players = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const c = ctx(players);
    let s = toSorting(players, 'campanha');
    s = { ...s, phase: 'theme', level: 3 };
    s = act(s, 'p0', { type: 'beginRound' }, c);
    const values = Object.values(s.cards).map((x) => x.value);
    expect(values).toHaveLength(30);
    expect(new Set(values).size).toBe(30);
  });
});

describe('fila e dicas', () => {
  const c = ctx(['a', 'b', 'c']);

  it('dono coloca carta na fila na posição pedida', () => {
    let s = toSorting(['a', 'b', 'c']);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c);
    s = act(s, 'b', { type: 'place', cardId: 'b:0', index: 0 }, c);
    s = act(s, 'c', { type: 'place', cardId: 'c:0', index: 1 }, c);
    expect(s.row).toEqual(['b:0', 'c:0', 'a:0']);
  });

  it('reposicionar move a carta sem duplicar', () => {
    let s = toSorting(['a', 'b', 'c']);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c);
    s = act(s, 'b', { type: 'place', cardId: 'b:0', index: 1 }, c);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 5 }, c);
    expect(s.row).toEqual(['b:0', 'a:0']);
  });

  it('índice é limitado ao tamanho da fila', () => {
    let s = toSorting(['a', 'b', 'c']);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 99 }, c);
    expect(s.row).toEqual(['a:0']);
  });

  it('não coloca na fila carta alheia (fora da fila) nem carta inexistente', () => {
    const s = toSorting(['a', 'b', 'c']);
    expect(errorOf(s, 'b', { type: 'place', cardId: 'a:0', index: 0 }, c)).toBe('not_owner');
    expect(errorOf(s, 'b', { type: 'place', cardId: 'zz:0', index: 0 }, c)).toBe('unknown_card');
  });

  it('qualquer jogador reordena carta que já está na fila e desmarca os prontos', () => {
    let s = toSorting(['a', 'b', 'c']);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c);
    s = act(s, 'b', { type: 'place', cardId: 'b:0', index: 1 }, c);
    s = act(s, 'b', { type: 'ready', ready: true }, c);
    expect(s.row).toEqual(['a:0', 'b:0']);
    expect(s.ready).toEqual(['b']);
    s = act(s, 'c', { type: 'place', cardId: 'a:0', index: 5 }, c);
    expect(s.row).toEqual(['b:0', 'a:0']);
    expect(s.ready).toEqual([]);
  });

  it('espectador não mexe em carta da fila', () => {
    let s = toSorting(['a', 'b', 'c']);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c);
    expect(errorOf(s, 'z', { type: 'place', cardId: 'a:0', index: 0 }, ctx(['a', 'b', 'c', 'z']))).toBe('not_player');
  });

  it('return tira a carta da fila', () => {
    let s = toSorting(['a', 'b', 'c']);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c);
    s = act(s, 'a', { type: 'return', cardId: 'a:0' }, c);
    expect(s.row).toEqual([]);
  });

  it('dono escreve dica limpa', () => {
    let s = toSorting(['a', 'b', 'c']);
    s = act(s, 'a', { type: 'clue', cardId: 'a:0', text: '  Paris   Texas' }, c);
    expect(s.cards['a:0']?.clue).toBe('Paris Texas');
    expect(errorOf(s, 'b', { type: 'clue', cardId: 'a:0', text: 'x' }, c)).toBe('not_owner');
  });

  it('dica só muda com a carta na mão', () => {
    let s = toSorting(['a', 'b', 'c']);
    s = act(s, 'a', { type: 'clue', cardId: 'a:0', text: 'antes' }, c);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c);
    expect(errorOf(s, 'a', { type: 'clue', cardId: 'a:0', text: 'depois' }, c)).toBe('card_on_table');
    expect(s.cards['a:0']?.clue).toBe('antes');
    s = act(s, 'a', { type: 'return', cardId: 'a:0' }, c);
    s = act(s, 'a', { type: 'clue', cardId: 'a:0', text: 'depois' }, c);
    expect(s.cards['a:0']?.clue).toBe('depois');
  });

  it('ações de carta fora da ordenação são recusadas', () => {
    const s = act(initialItoState(), 'a', { type: 'start' }, c);
    expect(errorOf(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c)).toBe('bad_phase');
  });
});

describe('prontos', () => {
  const c = ctx(['a', 'b']);

  it('não fica pronto com carta fora da fila', () => {
    const s = toSorting(['a', 'b']);
    expect(errorOf(s, 'a', { type: 'ready', ready: true }, c)).toBe('cards_missing');
  });

  it('espectador não pode ficar pronto', () => {
    const s = toSorting(['a', 'b']);
    expect(errorOf(s, 'z', { type: 'ready', ready: true }, ctx(['a', 'b', 'z']))).toBe('not_player');
  });

  it('mexer na carta tira o pronto', () => {
    let s = toSorting(['a', 'b']);
    s = act(s, 'a', { type: 'clue', cardId: 'a:0', text: 'oi' }, c);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c);
    s = act(s, 'a', { type: 'ready', ready: true }, c);
    expect(s.ready).toEqual(['a']);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c);
    expect(s.ready).toEqual([]);
  });

  it('desmarcar pronto', () => {
    let s = toSorting(['a', 'b']);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c);
    s = act(s, 'a', { type: 'ready', ready: true }, c);
    s = act(s, 'a', { type: 'ready', ready: false }, c);
    expect(s.ready).toEqual([]);
  });
});

/** Força valores conhecidos nas cartas para testes determinísticos. */
function withValues(state: ItoState, values: Record<string, number>): ItoState {
  const cards = { ...state.cards };
  for (const [id, value] of Object.entries(values)) cards[id] = { ...cards[id]!, value };
  return { ...state, cards };
}

function placeAll(state: ItoState, order: string[], c: GameContext): ItoState {
  let s = state;
  order.forEach((cardId, i) => {
    s = act(s, cardId.split(':')[0]!, { type: 'place', cardId, index: i }, c);
  });
  return s;
}

function readyAll(state: ItoState, players: string[], c: GameContext): ItoState {
  return players.reduce((s, p) => act(s, p, { type: 'ready', ready: true }, c), state);
}

describe('revelação', () => {
  const c = ctx(['a', 'b']);

  it('revela sozinho quando todos ficam prontos', () => {
    let s = withValues(toSorting(['a', 'b']), { 'a:0': 10, 'b:0': 80 });
    s = placeAll(s, ['a:0', 'b:0'], c);
    s = readyAll(s, ['a', 'b'], c);
    expect(s.phase).toBe('reveal');
    expect(s.outcome).toBe('round_won');
    expect(s.reveal?.map((e) => e.value)).toEqual([10, 80]);
  });

  it('modo livre perde com carta fora de ordem', () => {
    let s = withValues(toSorting(['a', 'b']), { 'a:0': 90, 'b:0': 20 });
    s = readyAll(placeAll(s, ['a:0', 'b:0'], c), ['a', 'b'], c);
    expect(s.outcome).toBe('round_lost');
    expect(s.reveal?.map((e) => e.error)).toEqual([false, true]);
  });

  it('ignora jogador inativo na contagem de prontos', () => {
    let s = withValues(toSorting(['a', 'b']), { 'a:0': 10, 'b:0': 80 });
    s = placeAll(s, ['a:0', 'b:0'], c);
    s = act(s, 'a', { type: 'ready', ready: true }, c);
    expect(s.phase).toBe('sorting');
    s = maybeReveal(s, ctx(['a']));
    expect(s.phase).toBe('reveal');
  });

  it('não revela sozinho se faltar carta na fila', () => {
    let s = toSorting(['a', 'b']);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c);
    s = act(s, 'a', { type: 'ready', ready: true }, c);
    expect(maybeReveal(s, ctx(['a'])).phase).toBe('sorting');
  });

  it('host força revelação só com todas as cartas na fila', () => {
    let s = toSorting(['a', 'b']);
    expect(errorOf(s, 'a', { type: 'forceReveal' }, c)).toBe('cards_missing');
    s = placeAll(s, ['a:0', 'b:0'], c);
    expect(errorOf(s, 'b', { type: 'forceReveal' }, c)).toBe('not_host');
    expect(act(s, 'a', { type: 'forceReveal' }, c).phase).toBe('reveal');
  });
});

describe('campanha', () => {
  const c = ctx(['a', 'b']);

  function playLevel(s: ItoState, valuesInRowOrder: number[]): ItoState {
    const order = [...s.players.flatMap((p) => Object.values(s.cards).filter((x) => x.owner === p).map((x) => x.id))];
    const values: Record<string, number> = {};
    order.forEach((id, i) => {
      values[id] = valuesInRowOrder[i]!;
    });
    let next = withValues(s, values);
    next = placeAll(next, order, c);
    return readyAll(next, s.players, c);
  }

  it('sobe de nível com tema novo e mais cartas', () => {
    let s = toSorting(['a', 'b'], 'campanha');
    s = playLevel(s, [10, 20]);
    expect(s.outcome).toBe('level_cleared');
    const tema1 = s.theme?.titulo;
    s = act(s, 'a', { type: 'next' }, c);
    expect(s.phase).toBe('theme');
    expect(s.level).toBe(2);
    expect(s.theme?.titulo).not.toBe(tema1);
    s = act(s, 'a', { type: 'beginRound' }, c);
    expect(Object.values(s.cards)).toHaveLength(4);
  });

  it('perde vidas por erro (repetindo o nível) e termina em derrota', () => {
    let s = toSorting(['a', 'b'], 'campanha');
    s = playLevel(s, [50, 10]);
    expect(s.lives).toBe(2);
    expect(s.outcome).toBe('level_failed');
    s = act(act(s, 'a', { type: 'next' }, c), 'a', { type: 'beginRound' }, c);
    expect(s.level).toBe(1);
    s = playLevel(s, [90, 80]);
    expect(s.lives).toBe(1);
    expect(s.outcome).toBe('level_failed');
    s = act(act(s, 'a', { type: 'next' }, c), 'a', { type: 'beginRound' }, c);
    s = playLevel(s, [90, 80]);
    expect(s.lives).toBe(0);
    expect(s.outcome).toBe('lost');
    s = act(s, 'a', { type: 'next' }, c);
    expect(s.phase).toBe('lobby');
    expect(s.mode).toBe('campanha');
  });

  it('erro no nível 2 repete o nível 2 (tema e cartas novos, vidas a menos)', () => {
    let s = toSorting(['a', 'b'], 'campanha');
    s = playLevel(s, [1, 2]);
    s = act(act(s, 'a', { type: 'next' }, c), 'a', { type: 'beginRound' }, c);
    expect(s.level).toBe(2);
    s = playLevel(s, [1, 30, 20, 40]);
    expect(s.outcome).toBe('level_failed');
    expect(s.lives).toBe(2);
    const tema = s.theme?.titulo;
    s = act(s, 'a', { type: 'next' }, c);
    expect(s.phase).toBe('theme');
    expect(s.level).toBe(2);
    expect(s.lives).toBe(2);
    expect(s.theme?.titulo).not.toBe(tema);
    s = act(s, 'a', { type: 'beginRound' }, c);
    expect(Object.values(s.cards)).toHaveLength(4);
    expect(s.reveal).toBeNull();
    s = playLevel(s, [1, 2, 3, 4]);
    expect(s.outcome).toBe('level_cleared');
    s = act(s, 'a', { type: 'next' }, c);
    expect(s.level).toBe(3);
  });

  it('nível 3 sem erro é vitória, mesmo depois de perder vida', () => {
    let s = toSorting(['a', 'b'], 'campanha');
    s = playLevel(s, [1, 2]);
    s = act(act(s, 'a', { type: 'next' }, c), 'a', { type: 'beginRound' }, c);
    s = playLevel(s, [1, 2, 3, 4]);
    s = act(act(s, 'a', { type: 'next' }, c), 'a', { type: 'beginRound' }, c);
    s = playLevel(s, [1, 2, 3, 5, 4, 6]);
    expect(s.outcome).toBe('level_failed');
    s = act(act(s, 'a', { type: 'next' }, c), 'a', { type: 'beginRound' }, c);
    expect(s.level).toBe(3);
    s = playLevel(s, [1, 2, 3, 4, 5, 6]);
    expect(s.outcome).toBe('won');
    expect(s.lives).toBe(2);
  });

  it('vence ao passar do nível 3', () => {
    let s = toSorting(['a', 'b'], 'campanha');
    s = playLevel(s, [1, 2]);
    s = act(act(s, 'a', { type: 'next' }, c), 'a', { type: 'beginRound' }, c);
    s = playLevel(s, [1, 2, 3, 4]);
    s = act(act(s, 'a', { type: 'next' }, c), 'a', { type: 'beginRound' }, c);
    s = playLevel(s, [1, 2, 3, 4, 5, 6]);
    expect(s.outcome).toBe('won');
  });

  it('next durante a ordenação descarta a rodada sem perder vida', () => {
    let s = toSorting(['a', 'b'], 'campanha');
    s = act(s, 'a', { type: 'next' }, c);
    expect(s.phase).toBe('theme');
    expect(s.level).toBe(1);
    expect(s.lives).toBe(3);
  });

  it('modo livre: next após revelar começa nova rodada com os ativos', () => {
    let s = withValues(toSorting(['a', 'b']), { 'a:0': 1, 'b:0': 2 });
    s = readyAll(placeAll(s, ['a:0', 'b:0'], c), ['a', 'b'], c);
    s = act(s, 'a', { type: 'next' }, ctx(['a', 'b', 'c']));
    expect(s.phase).toBe('theme');
    expect(s.players).toEqual(['a', 'b', 'c']);
  });

  it('next exige host, fase certa e 2 ativos', () => {
    const s = toSorting(['a', 'b']);
    expect(errorOf(s, 'b', { type: 'next' }, c)).toBe('not_host');
    expect(errorOf(s, 'a', { type: 'next' }, ctx(['a']))).toBe('not_enough_players');
    expect(errorOf(initialItoState(), 'a', { type: 'next' }, c)).toBe('bad_phase');
  });
});

describe('visão por jogador', () => {
  const c = ctx(['a', 'b']);

  it('esconde números alheios antes da revelação', () => {
    const s = toSorting(['a', 'b']);
    const v = itoViewFor(s, 'a');
    expect(v.cards['a:0']?.value).toBe(s.cards['a:0']?.value);
    expect(v.cards['b:0']?.value).toBeNull();
    expect(JSON.stringify(itoViewFor(s, null))).not.toContain(`"value":${s.cards['b:0']?.value}`);
    expect('usedThemes' in v).toBe(false);
  });

  it('mostra todos os números na revelação', () => {
    let s = toSorting(['a', 'b']);
    s = act(placeAll(s, ['a:0', 'b:0'], c), 'a', { type: 'forceReveal' }, c);
    const v = itoViewFor(s, 'a');
    expect(v.cards['b:0']?.value).toBe(s.cards['b:0']?.value);
  });

  it('dicas são visíveis para todos', () => {
    let s = toSorting(['a', 'b']);
    s = act(s, 'b', { type: 'clue', cardId: 'b:0', text: 'Japão' }, c);
    expect(itoViewFor(s, 'a').cards['b:0']?.clue).toBe('Japão');
  });
});

describe('robustez (revisão)', () => {
  const c = ctx(['a', 'b']);

  it('beginRound dá cartas só a quem ainda está ativo', () => {
    const s = act(initialItoState(), 'a', { type: 'start' }, ctx(['a', 'b', 'c']));
    const r = act(s, 'a', { type: 'beginRound' }, ctx(['a', 'b']));
    expect(r.players).toEqual(['a', 'b']);
    expect(Object.keys(r.cards).sort()).toEqual(['a:0', 'b:0']);
  });

  it('beginRound recusa se sobrarem menos de 2 ativos', () => {
    const s = act(initialItoState(), 'a', { type: 'start' }, ctx(['a', 'b']));
    expect(errorOf(s, 'a', { type: 'beginRound' }, ctx(['a']))).toBe('not_enough_players');
  });

  it('mexer na fila desmarca o pronto de todos', () => {
    let s = toSorting(['a', 'b']);
    s = act(s, 'a', { type: 'place', cardId: 'a:0', index: 0 }, c);
    s = act(s, 'a', { type: 'ready', ready: true }, c);
    expect(s.ready).toEqual(['a']);
    s = act(s, 'b', { type: 'place', cardId: 'b:0', index: 0 }, c);
    expect(s.ready).toEqual([]);
    s = act(s, 'a', { type: 'ready', ready: true }, c);
    s = act(s, 'b', { type: 'return', cardId: 'b:0' }, c);
    expect(s.ready).toEqual([]);
  });

  it('dica recusada (carta na mesa) não mexe nos prontos', () => {
    let s = toSorting(['a', 'b']);
    s = placeAll(s, ['a:0', 'b:0'], c);
    s = act(s, 'a', { type: 'ready', ready: true }, c);
    expect(errorOf(s, 'b', { type: 'clue', cardId: 'b:0', text: 'oi' }, c)).toBe('card_on_table');
    expect(s.ready).toEqual(['a']);
  });

  it('lobby: host volta ao lobby a partir da revelação, mantendo modo e temas usados', () => {
    let s = withValues(toSorting(['a', 'b']), { 'a:0': 1, 'b:0': 2 });
    s = readyAll(placeAll(s, ['a:0', 'b:0'], c), ['a', 'b'], c);
    expect(s.phase).toBe('reveal');
    expect(errorOf(s, 'b', { type: 'lobby' }, c)).toBe('not_host');
    const l = act(s, 'a', { type: 'lobby' }, c);
    expect(l).toEqual({ ...initialItoState(), mode: 'livre', usedThemes: s.usedThemes });
  });

  it('lobby: também vale na fase de tema; recusado na ordenação e no lobby', () => {
    const t = act(initialItoState(), 'a', { type: 'setMode', mode: 'campanha' }, c);
    const theme = act(t, 'a', { type: 'start' }, c);
    const l = act(theme, 'a', { type: 'lobby' }, c);
    expect(l.phase).toBe('lobby');
    expect(l.mode).toBe('campanha');
    expect(l.usedThemes).toEqual(theme.usedThemes);
    expect(errorOf(toSorting(['a', 'b']), 'a', { type: 'lobby' }, c)).toBe('bad_phase');
    expect(errorOf(initialItoState(), 'a', { type: 'lobby' }, c)).toBe('bad_phase');
  });

  it('ids de carta como __proto__/constructor são cartas desconhecidas', () => {
    const s = toSorting(['a', 'b']);
    for (const cardId of ['__proto__', 'constructor', 'toString']) {
      expect(errorOf(s, 'a', { type: 'place', cardId, index: 0 }, c)).toBe('unknown_card');
      expect(errorOf(s, 'a', { type: 'clue', cardId, text: 'x' }, c)).toBe('unknown_card');
      expect(errorOf(s, 'a', { type: 'return', cardId }, c)).toBe('unknown_card');
    }
  });

  it('return por quem não é dono é recusado', () => {
    const s = act(toSorting(['a', 'b']), 'a', { type: 'place', cardId: 'a:0', index: 0 }, c);
    expect(errorOf(s, 'b', { type: 'return', cardId: 'a:0' }, c)).toBe('not_owner');
  });

  it('ações fora da fase certa são recusadas', () => {
    const sorting = toSorting(['a', 'b']);
    expect(errorOf(sorting, 'a', { type: 'setMode', mode: 'campanha' }, c)).toBe('bad_phase');
    expect(errorOf(sorting, 'a', { type: 'beginRound' }, c)).toBe('bad_phase');
    const theme = act(initialItoState(), 'a', { type: 'start' }, c);
    expect(errorOf(theme, 'a', { type: 'clue', cardId: 'a:0', text: 'x' }, c)).toBe('bad_phase');
    expect(errorOf(theme, 'a', { type: 'return', cardId: 'a:0' }, c)).toBe('bad_phase');
  });

  it('depois de won/lost, next volta ao lobby zerado mantendo modo e temas usados', () => {
    let s = toSorting(['a', 'b'], 'campanha');
    // Um erro por rodada no nível 1 (que se repete): 3 → 2 → 1 → 0 vidas.
    for (let round = 0; round < 3; round++) {
      if (round > 0) s = act(act(s, 'a', { type: 'next' }, c), 'a', { type: 'beginRound' }, c);
      s = readyAll(placeAll(withValues(s, { 'a:0': 50, 'b:0': 10 }), ['a:0', 'b:0'], c), ['a', 'b'], c);
    }
    expect(s.outcome).toBe('lost');
    const l = act(s, 'a', { type: 'next' }, c);
    expect(l.phase).toBe('lobby');
    expect(l.level).toBe(1);
    expect(l.lives).toBe(3);
    expect(l.players).toEqual([]);
    expect(l.usedThemes).toEqual(s.usedThemes);
    expect(l.usedThemes.length).toBeGreaterThan(0);
  });
});
