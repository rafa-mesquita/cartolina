import { describe, expect, it } from 'vitest';
import { ERROR_MESSAGES, parseClientMessage } from '../src/protocol';

const parse = (v: unknown) => parseClientMessage(JSON.stringify(v));

describe('parseClientMessage', () => {
  it('aceita join válido', () => {
    expect(parse({ t: 'join', token: '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b', name: 'Ana', color: '#8EC5FF' })).toEqual({
      t: 'join',
      token: '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b',
      name: 'Ana',
      color: '#8EC5FF',
    });
  });

  it('aceita ações do ITO', () => {
    expect(parse({ t: 'action', action: { type: 'place', cardId: 'a:0', index: 2 } })).not.toBeNull();
    expect(parse({ t: 'action', action: { type: 'customTheme', theme: { titulo: 'x', min: 'a', max: 'b' } } })).not.toBeNull();
  });

  it('aceita a ação lobby do host', () => {
    expect(parse({ t: 'action', action: { type: 'lobby' } })).not.toBeNull();
  });

  it('aceita fx de cursor com e sem arrasto', () => {
    expect(parse({ t: 'fx.cursor', zone: 'table', x: 0.5, y: 0.2, drag: null })).not.toBeNull();
    expect(parse({ t: 'fx.cursor', zone: 'hand', x: 0.1, y: 0.9, drag: { cardId: 'a:0', index: 1 } })).not.toBeNull();
  });

  it('aceita token no formato de crypto.randomUUID() (UUID v4)', () => {
    expect(parse({ t: 'join', token: 'c9bf9e57-1685-4c89-bafb-ff5af830be8a', name: 'Ana', color: '#8EC5FF' })).not.toBeNull();
  });

  it('rejeita token que não é UUID', () => {
    for (const token of ['__proto__', 'toString', 'abcdefgh-1234', 'x'.repeat(36)]) {
      expect(parse({ t: 'join', token, name: 'Ana', color: '#8EC5FF' })).toBeNull();
    }
  });

  it('rejeita lixo', () => {
    expect(parseClientMessage('não é json')).toBeNull();
    expect(parseClientMessage(42)).toBeNull();
    expect(parse({ t: 'hack' })).toBeNull();
    expect(parse({ t: 'action', action: { type: 'place', cardId: 'a:0', index: -1 } })).toBeNull();
    expect(parse({ t: 'join', token: 'curto', name: 'A', color: '#8EC5FF' })).toBeNull();
    expect(parse({ t: 'fx.ping', x: 50, y: 0 })).toBeNull();
  });

  it('tem mensagem em português para todos os códigos de erro conhecidos', () => {
    for (const code of [
      'not_host', 'bad_phase', 'not_owner', 'unknown_card', 'not_enough_players', 'cards_missing',
      'bad_theme', 'not_player', 'bad_action', 'room_full', 'bad_name', 'bad_color', 'color_taken',
      'not_member', 'bad_message', 'not_joined', 'already_joined',
    ]) {
      expect(ERROR_MESSAGES[code]).toBeTruthy();
    }
  });
});
