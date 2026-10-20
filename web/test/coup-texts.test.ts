import { describe, expect, it } from 'vitest';
import type { CoupLogEntry, CoupView } from '@cartolina/shared';
import { actionLabel, declaration, logLine, lossTitle, nameFrom, phraseText } from '../src/games/coup/texts';
import { coupRoom, viewOf } from './coup-fixtures';

// Sala de 3 (Ana p0, Beto p1, Caio p2); quem vê é a Ana ("você").
const view = viewOf(coupRoom(3), 'p0');
const nameOf = nameFrom(view);

function game(over: Partial<CoupView>): CoupView {
  return { ...view.game, ...over };
}
const win = (kind: 'action' | 'block' | 'blockOnly', eligible: string[]) => ({ id: 1, kind, eligible, passed: [], endsAt: 5 });

describe('nameFrom', () => {
  it('traduz assento em nome, você em "você" e desconhecido em "alguém"', () => {
    expect(nameOf('p0')).toBe('você');
    expect(nameOf('p1')).toBe('Beto');
    expect(nameOf('p2')).toBe('Caio');
    expect(nameOf('p9')).toBe('alguém');
  });

  it('quem assiste vê todos pelo nome', () => {
    const n = nameFrom(viewOf(coupRoom(3), null));
    expect(n('p0')).toBe('Ana');
  });
});

describe('actionLabel', () => {
  it('as 7 ações, com os números das regras', () => {
    expect(actionLabel('income')).toEqual({ name: 'renda', hint: '+1' });
    expect(actionLabel('foreignAid')).toEqual({ name: 'ajuda externa', hint: '+2 · o Duque bloqueia' });
    expect(actionLabel('coup')).toEqual({ name: 'golpe', hint: '−7 · alvo perde carta' });
    expect(actionLabel('tax')).toEqual({ name: 'taxar', hint: 'Duque · +3' });
    expect(actionLabel('assassinate')).toEqual({ name: 'assassinar', hint: 'Assassino · −3 · alvo perde carta' });
    expect(actionLabel('steal')).toEqual({ name: 'extorquir', hint: 'Capitão · tira 2' });
    expect(actionLabel('exchange')).toEqual({ name: 'trocar', hint: 'Embaixador · troca cartas' });
  });
});

describe('declaration', () => {
  it('sem janela ou sem ação declarada: nada', () => {
    expect(declaration(game({ window: null, declared: null }), nameOf)).toBeNull();
    expect(declaration(game({ window: win('action', ['p0']), declared: null }), nameOf)).toBeNull();
  });

  it('janela de ação com personagem: "diz: sou X e …"', () => {
    const g = game({ window: win('action', ['p0', 'p2']), declared: { actor: 'p1', kind: 'tax', target: null } });
    expect(declaration(g, nameOf)).toEqual({ main: ['Beto diz: sou ', { char: 'duke' }, ' e pega 3'], sub: null });
  });

  it('quando é você, "você diz: sou …"', () => {
    const g = game({ window: win('action', ['p1']), declared: { actor: 'p0', kind: 'tax', target: null } });
    expect(declaration(g, nameOf)?.main).toEqual(['você diz: sou ', { char: 'duke' }, ' e pega 3']);
  });

  it('ajuda externa: sem personagem', () => {
    const g = game({ window: win('action', ['p0']), declared: { actor: 'p1', kind: 'foreignAid', target: null } });
    expect(declaration(g, nameOf)).toEqual({ main: ['Beto pede ajuda externa (+2)'], sub: null });
  });

  it('extorquir tem alvo', () => {
    const g = game({ window: win('action', ['p0']), declared: { actor: 'p1', kind: 'steal', target: 'p2' } });
    expect(declaration(g, nameOf)?.main).toEqual(['Beto diz: sou ', { char: 'captain' }, ' e extorque Caio']);
  });

  it('janela de bloqueio: quem bloqueia e a ação bloqueada', () => {
    const g = game({
      window: win('block', ['p0', 'p1']),
      declared: { actor: 'p1', kind: 'steal', target: 'p2' },
      block: { by: 'p2', as: 'captain' },
    });
    expect(declaration(g, nameOf)).toEqual({
      main: ['Caio bloqueia como ', { char: 'captain' }],
      sub: ['contra a ação: Beto extorque Caio'],
    });
  });

  it('janela só de bloqueio: o alvo pode bloquear', () => {
    const g = game({ window: win('blockOnly', ['p2']), declared: { actor: 'p1', kind: 'assassinate', target: 'p2' } });
    expect(declaration(g, nameOf)).toEqual({
      main: ['Caio pode bloquear o Assassino com a ', { char: 'contessa' }],
      sub: null,
    });
  });

  it('janela só de bloqueio com dois jeitos de bloquear (extorquir)', () => {
    const g = game({ window: win('blockOnly', ['p0']), declared: { actor: 'p1', kind: 'steal', target: 'p0' } });
    expect(declaration(g, nameOf)?.main).toEqual([
      'você pode bloquear o Capitão com o ',
      { char: 'captain' },
      ' ou o ',
      { char: 'ambassador' },
    ]);
  });

  it('janela de bloqueio sem bloqueio na visão: nada', () => {
    const g = game({ window: win('block', ['p0']), declared: { actor: 'p1', kind: 'steal', target: 'p2' }, block: null });
    expect(declaration(g, nameOf)).toBeNull();
  });
});

describe('logLine', () => {
  const line = (e: CoupLogEntry) => {
    const p = logLine(e, nameOf);
    return p === null ? null : phraseText(p);
  };

  it('começo da partida', () => {
    expect(line({ t: 'start', first: 'p1' })).toBe('Partida nova. Começa Beto.');
    expect(line({ t: 'start', first: 'p0' })).toBe('Partida nova. Começa você.');
  });

  it('ação: com personagem (e alvo), renda, ajuda externa e golpe', () => {
    expect(logLine({ t: 'act', actor: 'p1', kind: 'tax', target: null }, nameOf)).toEqual(['Beto disse ', { char: 'duke' }]);
    expect(logLine({ t: 'act', actor: 'p1', kind: 'steal', target: 'p2' }, nameOf)).toEqual([
      'Beto disse ',
      { char: 'captain' },
      ' contra Caio',
    ]);
    expect(line({ t: 'act', actor: 'p1', kind: 'income', target: null })).toBe('Beto pegou renda');
    expect(line({ t: 'act', actor: 'p1', kind: 'foreignAid', target: null })).toBe('Beto pediu ajuda externa');
    expect(line({ t: 'act', actor: 'p1', kind: 'coup', target: 'p0' })).toBe('Beto deu o golpe em você');
  });

  it('dúvida: tinha ou não tinha', () => {
    const base = { t: 'challenge', by: 'p2', of: 'p1', claim: 'duke' } as const;
    expect(line({ ...base, had: true })).toBe('Caio duvidou de Beto: tinha o Duque');
    expect(line({ ...base, had: false })).toBe('Caio duvidou de Beto: não tinha o Duque');
    expect(line({ ...base, claim: 'contessa', had: false })).toBe('Caio duvidou de Beto: não tinha a Condessa');
  });

  it('bloqueio e ação bloqueada', () => {
    expect(line({ t: 'block', by: 'p2', as: 'contessa' })).toBe('Caio bloqueou como Condessa');
    expect(line({ t: 'blocked', actor: 'p0', kind: 'steal', by: 'p2', as: 'captain' })).toBe('sua ação foi bloqueada');
    expect(line({ t: 'blocked', actor: 'p1', kind: 'steal', by: 'p2', as: 'captain' })).toBe('a ação de Beto foi bloqueada');
  });

  it('resolvida: com valor em ajuda, taxar e extorquir; sem linha em renda, golpe, assassinato e troca', () => {
    expect(line({ t: 'resolved', actor: 'p1', kind: 'tax', target: null, amount: 3 })).toBe('Beto pegou 3');
    expect(line({ t: 'resolved', actor: 'p1', kind: 'foreignAid', target: null, amount: 2 })).toBe('Beto pegou 2');
    expect(line({ t: 'resolved', actor: 'p1', kind: 'tax', target: null, amount: 0 })).toBe('Beto não pegou nada (tesouro vazio)');
    expect(line({ t: 'resolved', actor: 'p1', kind: 'steal', target: 'p2', amount: 2 })).toBe('Beto tirou 2 de Caio');
    expect(line({ t: 'resolved', actor: 'p1', kind: 'steal', target: 'p2', amount: 0 })).toBe('Beto não tirou nada de Caio');
    expect(line({ t: 'resolved', actor: 'p1', kind: 'income', target: null, amount: 1 })).toBeNull();
    expect(line({ t: 'resolved', actor: 'p1', kind: 'coup', target: 'p2', amount: 0 })).toBeNull();
    expect(line({ t: 'resolved', actor: 'p1', kind: 'assassinate', target: 'p2', amount: 0 })).toBeNull();
    expect(line({ t: 'resolved', actor: 'p1', kind: 'exchange', target: null, amount: 0 })).toBeNull();
  });

  it('perdeu carta (um/uma), saiu e venceu', () => {
    expect(line({ t: 'lose', player: 'p2', card: 'duke' })).toBe('Caio perdeu um Duque');
    expect(line({ t: 'lose', player: 'p2', card: 'contessa' })).toBe('Caio perdeu uma Condessa');
    expect(line({ t: 'out', player: 'p2' })).toBe('Caio está fora');
    expect(line({ t: 'win', player: 'p1' })).toBe('Beto tomou o poder');
  });
});

describe('lossTitle', () => {
  it('um título pra cada motivo', () => {
    expect(lossTitle('coup')).toBe('Você levou um golpe');
    expect(lossTitle('assassinated')).toBe('Você foi assassinado');
    expect(lossTitle('challengeWrong')).toBe('Você errou a dúvida');
    expect(lossTitle('caught')).toBe('Pegaram seu blefe');
  });
});

describe('phraseText', () => {
  it('junta as partes em texto corrido, com o nome do personagem', () => {
    expect(phraseText(['Beto diz: sou ', { char: 'duke' }, ' e pega 3'])).toBe('Beto diz: sou Duque e pega 3');
    expect(phraseText([])).toBe('');
  });
});
