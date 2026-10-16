import { describe, expect, it } from 'vitest';
import { dixitActionSchema } from '../src/games/dixit/schema';
import { ERROR_CODES, errorMessage } from '../src/protocol';

describe('dixitActionSchema', () => {
  it('aceita as ações do Dixit', () => {
    for (const a of [
      { type: 'setTarget', target: 15 },
      { type: 'start' },
      { type: 'tell', cardId: 'd001', clue: 'saudade' },
      { type: 'submit', cardIds: ['d002', 'd003'] },
      { type: 'vote', cardId: 'd004' },
      { type: 'confirm' },
      { type: 'forceNext' },
      { type: 'next' },
      { type: 'again' },
      { type: 'lobby' },
    ]) {
      expect(dixitActionSchema.safeParse(a).success).toBe(true);
    }
  });

  it('recusa meta fora de 15/30, escolha vazia ou grande demais, e ações do ITO', () => {
    expect(dixitActionSchema.safeParse({ type: 'setTarget', target: 20 }).success).toBe(false);
    expect(dixitActionSchema.safeParse({ type: 'submit', cardIds: [] }).success).toBe(false);
    expect(dixitActionSchema.safeParse({ type: 'submit', cardIds: ['a', 'b', 'c'] }).success).toBe(false);
    expect(dixitActionSchema.safeParse({ type: 'place', cardId: 'x', index: 0 }).success).toBe(false);
  });
});

describe('erros do Dixit', () => {
  it('têm mensagem em português', () => {
    for (const code of [
      'need_3_players',
      'not_storyteller',
      'is_storyteller',
      'own_card',
      'wrong_count',
      'nothing_chosen',
      'already_confirmed',
      'paused',
      'deck_too_small',
    ]) {
      expect(ERROR_CODES).toContain(code);
      expect(errorMessage(code)).not.toBe('Algo deu errado.');
    }
  });
});
