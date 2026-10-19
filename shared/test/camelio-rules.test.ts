import { describe, expect, it } from 'vitest';
import { camelioCard } from '../src/games/camelio/deck';
import { applyCamelioAction, camelioTarget, initialCamelioState } from '../src/games/camelio/rules';
import { act, allCards, C, ctxOf, ids, playing, tryAct } from './camelio-helpers';

describe('estado inicial e meta', () => {
  it('começa no lobby, sem partida', () => {
    expect(initialCamelioState()).toMatchObject({ phase: 'lobby', players: [], match: 0, turn: null, winners: [], endReason: null });
  });

  it('meta: 4 cores com 2 jogadores, 3 com 3 a 6', () => {
    expect(camelioTarget(2)).toBe(4);
    expect(camelioTarget(3)).toBe(3);
    expect(camelioTarget(6)).toBe(3);
  });
});

describe('começar', () => {
  it('host começa com 3: monte de 71, uma aberta, mesas vazias, meta 3', () => {
    const s = act(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(ids(3)));
    expect(s.phase).toBe('playing');
    expect(s.players).toEqual(['p0', 'p1', 'p2']);
    expect(s.deck).toHaveLength(71);
    expect(s.open).not.toBeNull();
    expect(new Set(allCards(s)).size).toBe(72);
    expect(s.table).toEqual({ p0: [], p1: [], p2: [] });
    expect(s.scored).toEqual({ p0: [], p1: [], p2: [] });
    expect(s.target).toBe(3);
    expect(s.players).toContain(s.turn);
    expect(s.match).toBe(1);
    expect(s.log).toEqual([]);
    expect(s.reshuffled).toBe(false);
  });

  it('com 2 jogadores a meta é 4', () => {
    expect(act(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(ids(2))).target).toBe(4);
  });

  it('quem começa é sorteado', () => {
    const firsts = new Set<string | null>();
    for (let seed = 1; seed <= 20; seed++) firsts.add(act(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(ids(3), seed)).turn);
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('o monte vem embaralhado', () => {
    const a = act(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(ids(3), 1));
    const b = act(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(ids(3), 2));
    expect(a.deck).not.toEqual(b.deck);
  });

  it('recusa: só host, só no lobby, precisa de 2', () => {
    expect(tryAct(initialCamelioState(), 'p1', { type: 'start' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'not_host' });
    expect(tryAct(initialCamelioState(), 'p0', { type: 'start' }, ctxOf(['p0']))).toEqual({ ok: false, error: 'not_enough_players' });
    expect(tryAct(playing(3), 'p0', { type: 'start' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'bad_phase' });
  });

  it('ação desconhecida é recusada', () => {
    const res = applyCamelioAction(initialCamelioState(), 'p0', { type: 'xyz' } as never, ctxOf(ids(3)));
    expect(res).toEqual({ ok: false, error: 'bad_action' });
  });
});

describe('voltar pro lobby', () => {
  it('host volta pro lobby de qualquer fase de jogo, mantendo o número da partida', () => {
    const s = act(playing(3, { match: 2 }), 'p0', { type: 'lobby' }, ctxOf(ids(3)));
    expect(s).toEqual({ ...initialCamelioState(), match: 2 });
  });

  it('recusa: só host, e não no lobby', () => {
    expect(tryAct(playing(3), 'p1', { type: 'lobby' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'not_host' });
    expect(tryAct(initialCamelioState(), 'p0', { type: 'lobby' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'bad_phase' });
  });

  it('volta pro lobby também do fim de jogo', () => {
    const over = playing(3, { phase: 'over', turn: null, winners: ['p0'], endReason: 'target', match: 3 });
    expect(act(over, 'p0', { type: 'lobby' }, ctxOf(ids(3)))).toEqual({ ...initialCamelioState(), match: 3 });
    expect(tryAct(over, 'p0', { type: 'start' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'bad_phase' });
  });
});

describe('jogar de novo', () => {
  const over = (scored: Record<string, number[]>, table: Record<string, number[]>, winners: string[]) =>
    playing(3, { phase: 'over', turn: null, winners, endReason: 'target', scored, table });

  it('partida nova com quem está ativo; começa quem ficou em último', () => {
    const prev = over(
      { p0: [C.vermelho3, C.vermelho2], p1: [C.azul2, C.azul3], p2: [] },
      { p0: [], p1: [], p2: [C.amarelo3] },
      ['p1'],
    );
    const s = act(prev, 'p0', { type: 'again' }, ctxOf(ids(3)));
    expect(s.phase).toBe('playing');
    expect(s.match).toBe(2);
    expect(s.turn).toBe('p2');
    expect(s.deck).toHaveLength(71);
    expect(s.table).toEqual({ p0: [], p1: [], p2: [] });
    expect(s.winners).toEqual([]);
    expect(s.endReason).toBeNull();
  });

  it('empate em pontos: começa quem tem menos esferas na mesa', () => {
    const prev = over({ p0: [], p1: [C.azul2, C.azul3], p2: [] }, { p0: [], p1: [], p2: [C.amarelo3] }, ['p1']);
    expect(act(prev, 'p0', { type: 'again' }, ctxOf(ids(3))).turn).toBe('p0');
  });

  it('empate em tudo: o primeiro depois do vencedor, na ordem dos assentos', () => {
    const prev = over({ p0: [], p1: [C.azul2, C.azul3], p2: [] }, { p0: [], p1: [], p2: [] }, ['p1']);
    expect(act(prev, 'p0', { type: 'again' }, ctxOf(ids(3))).turn).toBe('p2');
  });

  it('quem não está mais aqui não começa', () => {
    const prev = over({ p0: [C.vermelho3, C.vermelho2], p1: [C.azul2, C.azul3], p2: [] }, { p0: [], p1: [], p2: [] }, ['p1']);
    const s = act(prev, 'p0', { type: 'again' }, ctxOf(['p0', 'p1']));
    expect(s.players).toEqual(['p0', 'p1']);
    expect(s.turn).toBe('p0');
    expect(s.target).toBe(4);
  });

  it('quem chegou agora conta como zero e pode começar', () => {
    const prev = over(
      { p0: [C.vermelho3, C.vermelho2], p1: [C.azul2, C.azul3], p2: [C.amarelo2, C.amarelo3] },
      { p0: [], p1: [], p2: [] },
      ['p1'],
    );
    const s = act(prev, 'p0', { type: 'again' }, ctxOf([...ids(3), 'p3']));
    expect(s.turn).toBe('p3');
    expect(s.players).toEqual(['p0', 'p1', 'p2', 'p3']);
  });

  it('recusa: só host, só no fim', () => {
    expect(tryAct(playing(3), 'p0', { type: 'again' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'bad_phase' });
    const prev = over({ p0: [], p1: [], p2: [] }, { p0: [], p1: [], p2: [] }, ['p1']);
    expect(tryAct(prev, 'p1', { type: 'again' }, ctxOf(ids(3)))).toEqual({ ok: false, error: 'not_host' });
  });
});

describe('jogar', () => {
  const ctx3 = ctxOf(ids(3));

  it('pegar a aberta e ficar com ela: a do topo do monte vira a nova aberta, a vez passa', () => {
    const s = act(playing(3, { open: C.vermelho3, deck: [C.verde1, C.azul1] }), 'p0', { type: 'play', from: 'open', to: 'p0' }, ctx3);
    expect(s.table.p0).toEqual([C.vermelho3]);
    expect(s.open).toBe(C.azul1);
    expect(s.deck).toEqual([C.verde1]);
    expect(s.turn).toBe('p1');
    expect(s.log).toEqual([{ by: 'p0', from: 'open', to: 'p0', card: C.vermelho3, outcome: 'none', color: 'vermelho', sum: 3 }]);
  });

  it('pegar do monte e dar pra alguém: a aberta fica', () => {
    const s = act(playing(3, { open: C.vermelho3, deck: [C.verde1, C.azul1] }), 'p0', { type: 'play', from: 'deck', to: 'p2' }, ctx3);
    expect(s.table.p2).toEqual([C.azul1]);
    expect(s.table.p0).toEqual([]);
    expect(s.open).toBe(C.vermelho3);
    expect(s.deck).toEqual([C.verde1]);
    expect(s.turn).toBe('p1');
    expect(s.log[0]).toMatchObject({ by: 'p0', from: 'deck', to: 'p2', card: C.azul1 });
  });

  it('fechar 5 guarda as cartas na área de pontos', () => {
    const s = act(
      playing(3, { table: { p0: [], p1: [C.vermelho3], p2: [] }, open: C.vermelho2 }),
      'p0',
      { type: 'play', from: 'open', to: 'p1' },
      ctx3,
    );
    expect(s.table.p1).toEqual([]);
    expect(s.scored.p1).toEqual([C.vermelho3, C.vermelho2]);
    expect(s.log[0]!.outcome).toBe('scored');
    expect(s.phase).toBe('playing');
  });

  it('estourar manda as cartas da cor pro descarte', () => {
    const s = act(
      playing(3, { table: { p0: [C.vermelho4], p1: [], p2: [] }, open: C.vermelho2 }),
      'p0',
      { type: 'play', from: 'open', to: 'p0' },
      ctx3,
    );
    expect(s.table.p0).toEqual([]);
    expect(s.discard).toEqual([C.vermelho4, C.vermelho2]);
    expect(s.log[0]!.outcome).toBe('bust');
  });

  it('a vez pula quem não está ativo', () => {
    const s = act(playing(3), 'p0', { type: 'play', from: 'open', to: 'p0' }, ctxOf(['p0', 'p2']));
    expect(s.turn).toBe('p2');
  });

  it('chegar à meta acaba na hora, mesmo sendo quem recebeu', () => {
    const s = act(
      playing(3, {
        scored: { p0: [], p1: [C.vermelho3, C.vermelho2, C.azul2, C.azul3], p2: [] },
        table: { p0: [], p1: [C.verde3], p2: [] },
        open: C.verde2,
      }),
      'p0',
      { type: 'play', from: 'open', to: 'p1' },
      ctx3,
    );
    expect(s).toMatchObject({ phase: 'over', winners: ['p1'], endReason: 'target', turn: null });
  });

  it('com 2 jogadores, 3 cores não bastam; 4 ganham', () => {
    const three = playing(2, {
      scored: { p0: [C.vermelho3, C.vermelho2, C.azul2, C.azul3], p1: [] },
      table: { p0: [C.verde3], p1: [] },
      open: C.verde2,
    });
    expect(act(three, 'p0', { type: 'play', from: 'open', to: 'p0' }, ctxOf(ids(2))).phase).toBe('playing');
    const four = playing(2, {
      scored: { p0: [C.vermelho3, C.vermelho2, C.azul2, C.azul3, C.amarelo2, C.amarelo3], p1: [] },
      table: { p0: [C.verde3], p1: [] },
      open: C.verde2,
    });
    expect(act(four, 'p0', { type: 'play', from: 'open', to: 'p0' }, ctxOf(ids(2)))).toMatchObject({
      phase: 'over',
      winners: ['p0'],
      endReason: 'target',
    });
  });

  it('monte vazio: o descarte vira monte uma vez', () => {
    const s = act(
      playing(3, { open: C.vermelho3, deck: [C.azul1], discard: [C.verde1, C.verde2] }),
      'p0',
      { type: 'play', from: 'deck', to: 'p0' },
      ctx3,
    );
    expect([...s.deck].sort((a, b) => a - b)).toEqual([C.verde1, C.verde2]);
    expect(s.discard).toEqual([]);
    expect(s.reshuffled).toBe(true);
    expect(s.open).toBe(C.vermelho3);
    expect(s.phase).toBe('playing');
  });

  it('pegar a aberta com 1 carta no monte: ela vira a aberta e o descarte vira monte', () => {
    const s = act(
      playing(3, { open: C.vermelho3, deck: [C.azul1], discard: [C.verde1] }),
      'p0',
      { type: 'play', from: 'open', to: 'p0' },
      ctx3,
    );
    expect(s.open).toBe(C.azul1);
    expect(s.deck).toEqual([C.verde1]);
    expect(s.reshuffled).toBe(true);
  });

  it('monte acaba de novo: fim por monte, ganha quem tem mais pontos', () => {
    const s = act(
      playing(3, {
        open: C.vermelho3,
        deck: [C.azul1],
        discard: [C.verde1],
        reshuffled: true,
        scored: { p0: [], p1: [C.amarelo2, C.amarelo3], p2: [] },
      }),
      'p0',
      { type: 'play', from: 'deck', to: 'p0' },
      ctx3,
    );
    expect(s).toMatchObject({ phase: 'over', endReason: 'deck', winners: ['p1'], turn: null });
  });

  it('monte acaba sem descarte nenhum: fim por monte já na primeira vez', () => {
    const s = act(playing(3, { open: C.vermelho3, deck: [C.azul1], discard: [] }), 'p0', { type: 'play', from: 'deck', to: 'p0' }, ctx3);
    expect(s).toMatchObject({ phase: 'over', endReason: 'deck', winners: ['p0'] });
  });

  it('meta vem antes do fim do monte', () => {
    const s = act(
      playing(3, {
        scored: { p0: [C.vermelho3, C.vermelho2, C.azul2, C.azul3], p1: [], p2: [] },
        table: { p0: [C.verde3], p1: [], p2: [] },
        open: C.vermelho1,
        deck: [C.verde2],
        reshuffled: true,
      }),
      'p0',
      { type: 'play', from: 'deck', to: 'p0' },
      ctx3,
    );
    expect(s).toMatchObject({ phase: 'over', endReason: 'target', winners: ['p0'] });
  });

  it('recusas', () => {
    expect(tryAct(playing(3), 'p1', { type: 'play', from: 'open', to: 'p1' }, ctx3)).toEqual({ ok: false, error: 'not_your_turn' });
    expect(tryAct(playing(3), 'p0', { type: 'play', from: 'open', to: 'p9' }, ctx3)).toEqual({ ok: false, error: 'bad_target' });
    expect(tryAct(playing(3), 'p0', { type: 'play', from: 'open', to: 'p2' }, ctxOf(['p0', 'p1']))).toEqual({ ok: false, error: 'bad_target' });
    expect(tryAct(initialCamelioState(), 'p0', { type: 'play', from: 'open', to: 'p0' }, ctx3)).toEqual({ ok: false, error: 'not_playing' });
    expect(tryAct(playing(3, { paused: true }), 'p0', { type: 'play', from: 'open', to: 'p0' }, ctx3)).toEqual({ ok: false, error: 'not_playing' });
    const over = playing(3, { phase: 'over', turn: null, winners: ['p0'], endReason: 'target' });
    expect(tryAct(over, 'p0', { type: 'play', from: 'open', to: 'p0' }, ctx3)).toEqual({ ok: false, error: 'not_playing' });
  });
});

describe('partida inteira (simulação)', () => {
  it('nenhuma carta some nem duplica e a partida sempre termina', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const ctx = ctxOf(ids(4), seed);
      let s = act(initialCamelioState(), 'p0', { type: 'start' }, ctx);
      let steps = 0;
      while (s.phase === 'playing') {
        const from = ctx.rng() < 0.5 ? 'open' : 'deck';
        const to = s.players[Math.floor(ctx.rng() * s.players.length)]!;
        s = act(s, s.turn!, { type: 'play', from, to }, ctx);
        const cards = allCards(s);
        expect(cards).toHaveLength(72);
        expect(new Set(cards).size).toBe(72);
        steps++;
        expect(steps).toBeLessThan(150);
      }
      expect(s.phase).toBe('over');
      expect(s.winners.length).toBeGreaterThan(0);
      for (const entry of s.log) expect(entry.color).toBe(camelioCard(entry.card).color);
    }
  });
});
