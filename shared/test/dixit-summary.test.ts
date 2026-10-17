import { describe, expect, it } from 'vitest';
import { dixitMatches, summarizeDixitHistory } from '../src/games/dixit/summary';
import { PLAYER_COLORS } from '../src/players';
import { PEOPLE, dixitRound as R } from './dixit-history-helpers';

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('dixitMatches', () => {
  it('junta as rodadas por partida: a mais recente primeiro, rodadas em ordem', () => {
    const ms = dixitMatches([
      R({ at: 20, teller: 'Bia', match: 'm1' }),
      R({ at: 30, teller: 'Ana', match: 'm2' }),
      R({ at: 10, teller: 'Ana', match: 'm1' }),
    ]);
    expect(ms.map((m) => m.id)).toEqual(['m2', 'm1']);
    expect(ms[1]!.startedAt).toBe(10);
    expect(ms[1]!.roomCode).toBe('ABCD');
    expect(ms[1]!.rounds.map((r) => r.storyteller.name)).toEqual(['Ana', 'Bia']);
    expect(ms[1]!.rounds[0]).toEqual({ id: 'r10', round: 1, playedAt: 10, storyteller: PEOPLE.Ana, storyCard: 'd001', clue: '' });
  });

  it('partidas que começaram na mesma hora: desempata pelo id, o maior primeiro (como o SQL)', () => {
    const ms = dixitMatches([R({ at: 5, teller: 'Ana', match: 'm1' }), R({ at: 5, teller: 'Ana', match: 'm2' })]);
    expect(ms.map((m) => m.id)).toEqual(['m2', 'm1']);
  });

  it('terminada quando alguém chega na meta: vencedor e placar do maior pro menor', () => {
    const [m] = dixitMatches([R({ at: 1, teller: 'Ana', scores: { Ana: 12, Bia: 31, Caio: 20 } })]);
    expect(m!.finished).toBe(true);
    expect(m!.winners).toEqual([PEOPLE.Bia]);
    expect(m!.scores.map((s) => [s.name, s.score])).toEqual([['Bia', 31], ['Caio', 20], ['Ana', 12]]);
  });

  it('empate no topo: mais de um vencedor', () => {
    const [m] = dixitMatches([R({ at: 1, teller: 'Ana', scores: { Bia: 30, Ana: 30, Caio: 4 } })]);
    expect(m!.winners).toEqual([PEOPLE.Ana, PEOPLE.Bia]);
  });

  it('não terminou: sem vencedor, com o placar de onde parou; a meta vem da partida', () => {
    const [open] = dixitMatches([R({ at: 1, teller: 'Ana', target: 15, scores: { Ana: 14, Bia: 9 } })]);
    expect(open).toMatchObject({ finished: false, winners: [], target: 15 });
    expect(open!.scores.map((s) => [s.name, s.score])).toEqual([['Ana', 14], ['Bia', 9]]);
    const [done] = dixitMatches([R({ at: 1, teller: 'Ana', target: 15, scores: { Ana: 15, Bia: 9 } })]);
    expect(done!.finished).toBe(true);
  });

  it('o placar e o fim vêm da última rodada da partida', () => {
    const [m] = dixitMatches([
      R({ at: 2, teller: 'Bia', scores: { Ana: 31, Bia: 5 } }),
      R({ at: 1, teller: 'Ana', scores: { Ana: 28, Bia: 2 } }),
    ]);
    expect(m!.finished).toBe(true);
    expect(m!.scores.map((s) => s.score)).toEqual([31, 5]);
  });
});

describe('summarizeDixitHistory', () => {
  it('sem rodadas: tudo vazio', () => {
    expect(summarizeDixitHistory([])).toEqual({
      mostWins: [],
      bestFinders: [],
      bestFoolers: [],
      bestTellers: [],
      favoriteCards: [],
      trickiestCards: [],
      clueWall: [],
      impossibleCards: [],
    });
  });

  it('quem mais venceu: vitórias em partidas terminadas (empate conta pros dois), top 3', () => {
    const s = summarizeDixitHistory([
      R({ at: 1, teller: 'Ana', match: 'a', scores: { Ana: 30, Bia: 3 } }),
      R({ at: 2, teller: 'Ana', match: 'b', scores: { Ana: 30, Bia: 30 } }),
      R({ at: 3, teller: 'Ana', match: 'c', scores: { Caio: 31, Ana: 2 } }),
      R({ at: 4, teller: 'Ana', match: 'd', scores: { Duda: 31 } }),
      R({ at: 5, teller: 'Ana', match: 'e', scores: { Duda: 10, Ana: 29 } }),
    ]);
    expect(s.mostWins).toEqual([
      { ...PEOPLE.Ana, wins: 2 },
      { ...PEOPLE.Bia, wins: 1 },
      { ...PEOPLE.Caio, wins: 1 },
    ]);
  });

  it('quem mais acha: votos na carta do narrador ÷ votos dados, com mínimo de 5 votos', () => {
    // Bia: 5 votos, 4 certos. Caio: 4 votos certos (abaixo do mínimo).
    const rounds = range(5).map((at) =>
      R({ at, teller: 'Ana', cards: { d002: 'Duda' }, votes: { Bia: at === 5 ? 'd002' : 'd001', ...(at < 5 ? { Caio: 'd001' } : {}) } }),
    );
    expect(summarizeDixitHistory(rounds).bestFinders).toEqual([{ ...PEOPLE.Bia, hits: 4, total: 5, rate: 0.8 }]);
  });

  it('quem mais engana: votos na própria carta ÷ rodadas em que jogou sem narrar, com mínimo de 5 rodadas', () => {
    // Caio joga em 5 rodadas e recebe voto em 3. Duda joga em 4 (abaixo do mínimo) e recebe voto em todas.
    const rounds = range(5).map((at) =>
      R({
        at,
        teller: 'Ana',
        cards: { [`c${at}`]: 'Caio', ...(at < 5 ? { [`x${at}`]: 'Duda' } : {}) },
        votes: { Bia: at <= 3 ? `c${at}` : 'd001', ...(at < 5 ? { Caio: `x${at}` } : {}) },
      }),
    );
    expect(summarizeDixitHistory(rounds).bestFoolers).toEqual([{ ...PEOPLE.Caio, hits: 3, total: 5, rate: 0.6 }]);
  });

  it('quem mais engana: dois votos na mesma carta numa rodada → taxa passa de 1 (votos por rodada)', () => {
    const rounds = range(5).map((at) => R({ at, teller: 'Ana', cards: { c1: 'Caio' }, votes: { Bia: 'c1', Duda: 'c1' } }));
    expect(summarizeDixitHistory(rounds).bestFoolers).toEqual([{ ...PEOPLE.Caio, hits: 10, total: 5, rate: 2 }]);
  });

  it('quem mais engana: com duas cartas na mesa (partida de 3), a rodada conta uma vez e os votos nas duas somam', () => {
    // Caio põe c1 e c2 em toda rodada; Bia vota na c1 sempre e Duda na c2 só nas duas primeiras: 7 votos em 5 rodadas.
    const rounds = range(5).map((at) =>
      R({ at, teller: 'Ana', cards: { c1: 'Caio', c2: 'Caio' }, votes: { Bia: 'c1', ...(at <= 2 ? { Duda: 'c2' } : {}) } }),
    );
    expect(summarizeDixitHistory(rounds).bestFoolers).toEqual([{ ...PEOPLE.Caio, hits: 7, total: 5, rate: 1.4 }]);
  });

  it('melhor narrador: ninguém achar conta como narração sem acerto', () => {
    const s = summarizeDixitHistory([
      R({ at: 1, teller: 'Ana', cards: { d002: 'Bia' }, votes: { Bia: 'd002', Caio: 'd002' } }),
      R({ at: 2, teller: 'Ana', cards: { d002: 'Bia' }, votes: { Bia: 'd001', Caio: 'd002' } }),
      R({ at: 3, teller: 'Ana', votes: { Bia: 'd001', Caio: 'd001' } }),
    ]);
    expect(s.bestTellers).toEqual([{ ...PEOPLE.Ana, hits: 1, total: 3, rate: 1 / 3 }]);
  });

  it('melhor narrador: alguns acharam mas não todos ÷ narrações (mín. 3); rodada sem voto não conta como acerto', () => {
    const s = summarizeDixitHistory([
      R({ at: 1, teller: 'Ana', cards: { d002: 'Bia' }, votes: { Bia: 'd001', Caio: 'd002' } }),
      R({ at: 2, teller: 'Ana', votes: { Bia: 'd001', Caio: 'd001' } }),
      R({ at: 3, teller: 'Ana' }),
      R({ at: 4, teller: 'Bia', cards: { d002: 'Ana' }, votes: { Ana: 'd001', Caio: 'd002' } }),
      R({ at: 5, teller: 'Bia', cards: { d002: 'Ana' }, votes: { Ana: 'd001', Caio: 'd002' } }),
    ]);
    expect(s.bestTellers).toEqual([{ ...PEOPLE.Ana, hits: 1, total: 3, rate: 1 / 3 }]);
  });

  it('desempate dos rankings: taxa, depois mais tentativas, depois nome; só o top 3', () => {
    // Todos acertam sempre: Bia com 6 votos, Ana, Caio e Duda com 5.
    const rounds = [
      ...range(6).map((at) => R({ at, teller: 'Ana', votes: { Bia: 'd001', ...(at <= 5 ? { Caio: 'd001', Duda: 'd001' } : {}) } })),
      ...range(5).map((i) => R({ at: 10 + i, teller: 'Bia', votes: { Ana: 'd001' } })),
    ];
    expect(summarizeDixitHistory(rounds).bestFinders.map((e) => [e.name, e.total])).toEqual([['Bia', 6], ['Ana', 5], ['Caio', 5]]);
  });

  it('cartas: favoritas dos narradores e as que mais enganaram (top 5, empate pelo id)', () => {
    const s = summarizeDixitHistory([
      R({ at: 1, teller: 'Ana', story: 'd010', cards: { d020: 'Bia' }, votes: { Bia: 'd010', Caio: 'd020' } }),
      R({ at: 2, teller: 'Bia', story: 'd010', cards: { d020: 'Caio', d030: 'Ana' }, votes: { Ana: 'd020', Caio: 'd010' } }),
      // d003…d007, uma vez cada: o top 5 corta a d007
      ...range(5).map((i) => R({ at: 2 + i, teller: 'Caio', story: `d00${i + 2}` })),
    ]);
    expect(s.favoriteCards).toEqual([
      { card: 'd010', count: 2 },
      { card: 'd003', count: 1 },
      { card: 'd004', count: 1 },
      { card: 'd005', count: 1 },
      { card: 'd006', count: 1 },
    ]);
    expect(s.trickiestCards).toEqual([{ card: 'd020', count: 2 }]);
  });

  it('mural de dicas: as 12 dicas escritas mais recentes, com a carta e quem narrou', () => {
    const rounds = range(14).map((at) => R({ at, teller: 'Ana', story: `d${String(at).padStart(3, '0')}`, clue: at === 14 ? '' : `dica ${at}` }));
    const wall = summarizeDixitHistory(rounds).clueWall;
    expect(wall).toHaveLength(12);
    expect(wall[0]).toEqual({ roundId: 'r13', card: 'd013', clue: 'dica 13', storyteller: PEOPLE.Ana, playedAt: 13 });
    expect(wall.at(-1)!.clue).toBe('dica 2');
  });

  it('mural de dicas: dica só com espaços não entra', () => {
    const wall = summarizeDixitHistory([
      R({ at: 1, teller: 'Ana', clue: 'eco' }),
      R({ at: 2, teller: 'Ana', clue: '   ' }),
    ]).clueWall;
    expect(wall.map((e) => e.roundId)).toEqual(['r1']);
  });

  it('cartas impossíveis: as 8 mais recentes que ninguém achou (com pelo menos 1 voto), com a dica e quem narrou', () => {
    const s = summarizeDixitHistory([
      ...range(9).map((at) => R({ at, teller: 'Bia', story: `d10${at}`, cards: { d200: 'Caio' }, votes: { Ana: 'd200' } })),
      R({ at: 10, teller: 'Bia', story: 'd300' }),
      R({ at: 11, teller: 'Bia', story: 'd301', votes: { Ana: 'd301' } }),
    ]);
    expect(s.impossibleCards.map((e) => e.card)).toEqual(['d109', 'd108', 'd107', 'd106', 'd105', 'd104', 'd103', 'd102']);
    expect(s.impossibleCards[0]).toEqual({ roundId: 'r9', card: 'd109', clue: '', storyteller: PEOPLE.Bia, playedAt: 9 });
  });

  it('cada pessoa aparece com o personagem mais recente do nome', () => {
    const later = R({ at: 2, teller: 'Ana', match: 'b' });
    const s = summarizeDixitHistory([
      R({ at: 1, teller: 'Ana', match: 'a', scores: { Ana: 30 } }),
      { ...later, scores: [{ name: 'Ana', color: PLAYER_COLORS[5], gained: 0, score: 30 }] },
    ]);
    expect(s.mostWins).toEqual([{ name: 'Ana', color: PLAYER_COLORS[5], wins: 2 }]);
  });
});
