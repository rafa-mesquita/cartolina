import { describe, expect, it } from 'vitest';
import {
  COUP_ACTION_KINDS,
  COUP_BLOCKERS,
  COUP_CHARACTERS,
  COUP_CLAIM,
  COUP_COST,
  COUP_GAIN,
  COUP_MUST_COUP_AT,
  COUP_START_COINS,
  COUP_WINDOW_MS,
} from '@cartolina/shared';
import { CHARACTER_NAMES } from '../src/games/coup/names';
import { ACTION_ROWS, CHARACTER_INFO, HOW_IT_WORKS, actionTip, characterTip, reactionTip } from '../src/games/coup/rules';
import { actionLabel } from '../src/games/coup/texts';

const row = (k: (typeof COUP_ACTION_KINDS)[number]) => ACTION_ROWS.find((r) => r.kind === k)!;
const info = (c: (typeof COUP_CHARACTERS)[number]) => CHARACTER_INFO.find((i) => i.character === c)!;

describe('ACTION_ROWS', () => {
  it('as 7 ações, na ordem dos botões, com o nome do botão', () => {
    expect(ACTION_ROWS.map((r) => r.kind)).toEqual([...COUP_ACTION_KINDS]);
    for (const r of ACTION_ROWS) expect(r.name).toBe(actionLabel(r.kind).name);
  });

  it('quem diz ser bate com COUP_CLAIM ("—" quando é qualquer um)', () => {
    for (const k of COUP_ACTION_KINDS) {
      const claim = COUP_CLAIM[k];
      expect(row(k).claim).toBe(claim === null ? '—' : CHARACTER_NAMES[claim]);
    }
  });

  it('quem bloqueia bate com COUP_BLOCKERS ("ninguém" quando vazio)', () => {
    for (const k of COUP_ACTION_KINDS) {
      const blockers = COUP_BLOCKERS[k];
      if (blockers.length === 0) expect(row(k).blockedBy).toBe('ninguém');
      else for (const c of blockers) expect(row(k).blockedBy).toContain(CHARACTER_NAMES[c]);
    }
    expect(row('steal').blockedBy).toBe('Capitão ou Embaixador');
  });

  it('o efeito traz o custo e o ganho das tabelas', () => {
    expect(row('income').effect).toBe(`+${COUP_GAIN.income}`);
    expect(row('foreignAid').effect).toBe(`+${COUP_GAIN.foreignAid}`);
    expect(row('tax').effect).toBe(`+${COUP_GAIN.tax}`);
    expect(row('coup').effect).toBe(`−${COUP_COST.coup}, alvo perde carta`);
    expect(row('assassinate').effect).toBe(`−${COUP_COST.assassinate}, alvo perde carta`);
    expect(row('steal').effect).toBe(`tira ${COUP_GAIN.steal} do alvo`);
    expect(row('exchange').effect).toBe('compra 2, devolve 2');
  });
});

describe('CHARACTER_INFO', () => {
  it('os 5 personagens, com o nome da tela', () => {
    expect(CHARACTER_INFO.map((i) => i.character)).toEqual([...COUP_CHARACTERS]);
    for (const i of CHARACTER_INFO) expect(i.name).toBe(CHARACTER_NAMES[i.character]);
  });

  it('"na sua vez" e "bloqueia" de cada um', () => {
    expect(info('contessa').onTurn).toBe('nenhuma ação');
    expect(info('contessa').blocks).toBe('o assassinato');
    expect(info('captain').onTurn).toBe(`extorquir, tira ${COUP_GAIN.steal} de alguém`);
    expect(info('captain').blocks).toBe('a extorsão');
    expect(info('ambassador').onTurn).toContain('trocar');
    expect(info('ambassador').blocks).toBe('a extorsão');
    expect(info('duke').onTurn).toBe(`taxar, pega ${COUP_GAIN.tax}`);
    expect(info('duke').blocks).toBe('a ajuda externa');
    expect(info('assassin').onTurn).toContain(`assassinar (paga ${COUP_COST.assassinate})`);
    expect(info('assassin').blocks).toBe('nada');
  });

  it('quem age e quem bloqueia batem com as tabelas (cada ação com personagem aparece no dono dela)', () => {
    for (const k of COUP_ACTION_KINDS) {
      const claim = COUP_CLAIM[k];
      if (claim !== null) expect(info(claim).onTurn.startsWith(actionLabel(k).name)).toBe(true);
    }
    for (const c of COUP_CHARACTERS) {
      const blocks = COUP_ACTION_KINDS.filter((k) => COUP_BLOCKERS[k].includes(c));
      expect(info(c).blocks === 'nada').toBe(blocks.length === 0);
    }
  });
});

describe('HOW_IT_WORKS', () => {
  it('objetivo e de 5 a 7 frases curtas, com os números das constantes', () => {
    expect(HOW_IT_WORKS.goal.length).toBeGreaterThan(10);
    expect(HOW_IT_WORKS.goal).toContain(`${COUP_START_COINS} moedas`);
    expect(HOW_IT_WORKS.items.length).toBeGreaterThanOrEqual(5);
    expect(HOW_IT_WORKS.items.length).toBeLessThanOrEqual(7);
    const all = HOW_IT_WORKS.items.join(' ');
    expect(all).toContain(`${COUP_WINDOW_MS / 1000} segundos`);
    expect(all).toContain(`${COUP_MUST_COUP_AT} moedas`);
    for (const t of HOW_IT_WORKS.items) expect(t.length).toBeLessThan(140);
  });
});

describe('dicas rápidas', () => {
  it('actionTip: nome, quem diz ser, efeito e quem bloqueia', () => {
    expect(actionTip('tax')).toContain('Duque');
    expect(actionTip('tax')).toContain(String(COUP_GAIN.tax));
    expect(actionTip('steal')).toContain('Capitão ou o Embaixador');
    expect(actionTip('coup')).toContain(String(COUP_COST.coup));
    expect(actionTip('income')).toContain('ninguém bloqueia');
    for (const k of COUP_ACTION_KINDS) expect(actionTip(k).startsWith(actionLabel(k).name)).toBe(true);
  });

  it('characterTip: o que faz na sua vez e o que bloqueia', () => {
    expect(characterTip('duke')).toContain('taxar');
    expect(characterTip('duke')).toContain('ajuda externa');
    expect(characterTip('contessa')).toContain('na sua vez: nenhuma ação');
    expect(characterTip('contessa')).toContain('assassinato');
    expect(characterTip('assassin')).toContain('não bloqueia nada');
  });

  it('reactionTip: duvidar, deixa e bloquear como X', () => {
    expect(reactionTip('challenge')).toMatch(/^duvidar · /);
    expect(reactionTip('pass')).toMatch(/^deixa · /);
    expect(reactionTip('block', 'contessa')).toContain('Condessa');
    for (const t of [reactionTip('challenge'), reactionTip('pass'), reactionTip('block', 'captain')]) expect(t.length).toBeLessThan(110);
  });
});
