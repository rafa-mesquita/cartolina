import { describe, expect, it } from 'vitest';
import type { KittensMatchRecord, KittensPerson } from '../src/games/kittens/record';
import {
  KITTENS_BOARD_TOP,
  KITTENS_RATE_MIN_MATCHES,
  KITTENS_STATS_MIN_MATCHES,
  KITTENS_TARGET_MIN_MATCHES,
  KITTENS_TOP_PEOPLE,
  summarizeKittensHistory,
} from '../src/games/kittens/summary';
import { PLAYER_COLORS } from '../src/players';

const P = (name: string, i: number): KittensPerson => ({ name, color: PLAYER_COLORS[i]! });
const ANA = P('Ana', 0);
const BETO = P('Beto', 1);
const CAIO = P('Caio', 2);
const DUDA = P('Duda', 3);
const ELI = P('Eli', 4);

let seq = 0;
/** Partida: `players` na ordem dos assentos, o vencedor, quem saiu (na ordem) e os Nem vem! de cada um (padrão 0). */
function match(
  players: KittensPerson[],
  winner: KittensPerson,
  exits: KittensPerson[],
  nopes: Record<string, number> = {},
  playedAt = ++seq,
  targeted?: Record<string, number>,
): KittensMatchRecord {
  return {
    id: `m${playedAt}`,
    matchId: `TATU-1-${playedAt}`,
    roomCode: 'TATU',
    playedAt,
    players,
    exits: exits.map((who) => ({ who, how: 'boom' })),
    winner,
    perPlayer: players.map((who) => ({
      who,
      nopes: nopes[who.name] ?? 0,
      defuses: 0,
      ...(targeted ? { targeted: targeted[who.name] ?? 0 } : {}),
    })),
  };
}

const times = (n: number, make: () => KittensMatchRecord) => Array.from({ length: n }, make);

describe('estatísticas da galera do Tatubum', () => {
  it('pontos de partida: top 3, mínimo de 3 partidas (10 na % de vitórias)', () => {
    expect(KITTENS_TOP_PEOPLE).toBe(3);
    expect(KITTENS_STATS_MIN_MATCHES).toBe(3);
    expect(KITTENS_RATE_MIN_MATCHES).toBe(10);
  });

  it('sem partidas: quadros vazios', () => {
    expect(summarizeKittensHistory([])).toEqual({ bestRate: [], mostWins: [], firstOut: [], nopeKings: [], targeted: [] });
  });

  it('quem tem menos de 3 partidas só entra em "mais vitórias" (que não tem mínimo)', () => {
    const s = summarizeKittensHistory([match([ANA, BETO], ANA, [BETO], { Ana: 3 }), match([ANA, BETO], ANA, [BETO], { Ana: 1 })]);
    expect(s).toEqual({ bestRate: [], mostWins: [{ name: 'Ana', color: ANA.color, count: 2, matches: 2, rate: 1 }], firstOut: [], nopeKings: [], targeted: [] });
  });

  it('maior % de vitórias (só com 10 partidas ou mais) e mais vitórias no geral', () => {
    const ms = [
      ...times(6, () => match([ANA, BETO, DUDA], ANA, [BETO, DUDA])),
      ...times(3, () => match([ANA, BETO, DUDA], BETO, [ANA, DUDA])),
      match([ANA, BETO, DUDA], DUDA, [ANA, BETO]),
      ...times(9, () => match([CAIO, ELI], CAIO, [ELI])),
    ];
    // Ana 6 de 10, Beto 3 de 10, Duda 1 de 10; Caio 9 de 9 (fora da %: 9 partidas); Eli 0 de 9.
    const s = summarizeKittensHistory(ms);
    expect(s.bestRate).toEqual([
      { name: 'Ana', color: ANA.color, count: 6, matches: 10, rate: 0.6 },
      { name: 'Beto', color: BETO.color, count: 3, matches: 10, rate: 0.3 },
      { name: 'Duda', color: DUDA.color, count: 1, matches: 10, rate: 0.1 },
    ]);
    expect(s.mostWins.map((e) => [e.name, e.count, e.matches])).toEqual([
      ['Caio', 9, 9],
      ['Ana', 6, 10],
      ['Beto', 3, 10],
      ['Duda', 1, 10],
    ]);
  });

  it('mais vitórias: empate desempata pela % e depois pelo nome', () => {
    const ms = [
      ...times(3, () => match([ANA, BETO], ANA, [BETO])),
      ...times(3, () => match([ANA, BETO], BETO, [ANA])),
      ...times(3, () => match([CAIO, DUDA], CAIO, [DUDA])),
      ...times(3, () => match([CAIO, DUDA], DUDA, [CAIO])),
      ...times(2, () => match([ELI, ANA], ELI, [ANA])),
    ];
    // Ana 3/8, Beto 3/6 = 50%, Caio 3/6, Duda 3/6, Eli 2/2 (menos vitórias).
    const s = summarizeKittensHistory(ms);
    expect(s.mostWins.map((e) => [e.name, e.count, e.matches])).toEqual([
      ['Beto', 3, 6],
      ['Caio', 3, 6],
      ['Duda', 3, 6],
      ['Ana', 3, 8],
      ['Eli', 2, 2],
    ]);
  });

  it('quem explode primeiro: vezes que foi o 1º a sair (explodiu ou caiu); empate pela proporção, depois o nome', () => {
    const left = (m: KittensMatchRecord): KittensMatchRecord => ({ ...m, exits: m.exits.map((e, i) => (i === 0 ? { ...e, how: 'left' } : e)) });
    const ms = [
      match([ANA, BETO, CAIO], ANA, [BETO, CAIO]),
      left(match([ANA, BETO, CAIO], ANA, [BETO, CAIO])),
      match([ANA, BETO, CAIO], BETO, [CAIO, ANA]),
      match([ANA, BETO, CAIO, DUDA], ANA, [CAIO, DUDA, BETO]),
      match([ANA, BETO, CAIO, DUDA], CAIO, [DUDA, ANA, BETO]),
      match([ANA, BETO, CAIO, DUDA], CAIO, [DUDA, BETO, ANA]),
    ];
    // Beto: 2 vezes em 6; Caio: 2 em 6; Duda: 2 em 3; Ana: 0 (fora).
    const s = summarizeKittensHistory(ms);
    expect(s.firstOut.map((e) => [e.name, e.count, e.matches])).toEqual([
      ['Duda', 2, 3],
      ['Beto', 2, 6],
      ['Caio', 2, 6],
    ]);
  });

  it('rei do Nem vem!: média por partida; ninguém com zero', () => {
    const ms = times(3, () => match([ANA, BETO, CAIO, DUDA, ELI], ANA, [BETO, CAIO, DUDA, ELI], { Ana: 1, Beto: 3, Caio: 2, Duda: 2 }));
    ms.push(match([DUDA, ANA], DUDA, [ANA], { Duda: 4 }));
    const s = summarizeKittensHistory(ms);
    // Duda: 10 em 4 = 2,5; Beto: 9 em 3 = 3; Caio: 6 em 3 = 2; Ana: 3 em 4; Eli: 0 (fora).
    expect(s.nopeKings).toEqual([
      { name: 'Beto', color: BETO.color, count: 9, matches: 3, rate: 3 },
      { name: 'Duda', color: DUDA.color, count: 10, matches: 4, rate: 2.5 },
      { name: 'Caio', color: CAIO.color, count: 6, matches: 3, rate: 2 },
      { name: 'Ana', color: ANA.color, count: 3, matches: 4, rate: 0.75 },
    ]);
  });

  it('todos os quadros vão até o top 10 (a tela mostra 3 e abre o resto)', () => {
    expect(KITTENS_BOARD_TOP).toBe(10);
    const people = Array.from({ length: 12 }, (_, i) => P(`J${String(i).padStart(2, '0')}`, i % PLAYER_COLORS.length));
    const nopes = Object.fromEntries(people.map((p, i) => [p.name, i + 1]));
    const s = summarizeKittensHistory(times(3, () => match(people, people[0]!, people.slice(1), nopes)));
    expect(s.nopeKings).toHaveLength(10);
    expect(s.nopeKings[0]!.name).toBe('J11');
  });

  it('alvo preferido: % das magias com alvo nas partidas dele, mínimo de 7 partidas com a contagem', () => {
    expect(KITTENS_TARGET_MIN_MATCHES).toBe(7);
    const FRED = P('Fred', 5);
    const GABI = P('Gabi', 6);
    const ms = [
      // Partidas antigas (sem a contagem): não entram na conta de ninguém.
      ...times(5, () => match([ANA, BETO, CAIO], ANA, [BETO, CAIO])),
      // 5 magias por partida: Beto 4 (80%), Ana 1 (20%), Caio nenhuma (fica de fora).
      ...times(7, () => match([ANA, BETO, CAIO], ANA, [BETO, CAIO], {}, ++seq, { Ana: 1, Beto: 4, Caio: 0 })),
      // Duda: só 6 partidas com a contagem, fica de fora mesmo com 90%.
      ...times(6, () => match([DUDA, ELI], DUDA, [ELI], {}, ++seq, { Duda: 9, Eli: 1 })),
      // Fred e Gabi: muito mais magias que o Beto, mas só 50%: a ordem é pela %. Empate: pelo nome.
      ...times(7, () => match([FRED, GABI], FRED, [GABI], {}, ++seq, { Fred: 10, Gabi: 10 })),
    ];
    expect(summarizeKittensHistory(ms).targeted).toEqual([
      { name: 'Beto', color: BETO.color, count: 28, matches: 7, total: 35, rate: 0.8 },
      { name: 'Fred', color: FRED.color, count: 70, matches: 7, total: 140, rate: 0.5 },
      { name: 'Gabi', color: GABI.color, count: 70, matches: 7, total: 140, rate: 0.5 },
      { name: 'Ana', color: ANA.color, count: 7, matches: 7, total: 35, rate: 0.2 },
    ]);
  });

  it('alvo preferido mostra até o top 10', () => {
    expect(KITTENS_BOARD_TOP).toBe(10);
    const people = Array.from({ length: 12 }, (_, i) => P(`J${String(i).padStart(2, '0')}`, i % PLAYER_COLORS.length));
    const hits = Object.fromEntries(people.map((p, i) => [p.name, i + 1]));
    const ms = times(7, () => match(people, people[0]!, people.slice(1), {}, ++seq, hits));
    const top = summarizeKittensHistory(ms).targeted!;
    expect(top).toHaveLength(10);
    expect(top.map((e) => e.name)).toEqual(people.slice(2).reverse().map((p) => p.name));
  });

  it('a pessoa é o nome; o bichinho é o da partida mais recente (pela data, não pela ordem da lista)', () => {
    const anaNew = { ...ANA, color: PLAYER_COLORS[5]! };
    const ms = [match([anaNew, BETO], anaNew, [BETO], {}, 1000), ...times(3, () => match([ANA, BETO], ANA, [BETO]))];
    const s = summarizeKittensHistory(ms);
    expect(s.mostWins[0]).toEqual({ name: 'Ana', color: anaNew.color, count: 4, matches: 4, rate: 1 });
  });
});
