import { z } from 'zod';
import type { ItoAction } from './games/ito/types';
import type { RoomView } from './room';

const themeSchema = z.object({
  titulo: z.string().max(200),
  min: z.string().max(100),
  max: z.string().max(100),
});

const cardId = z.string().min(1).max(64);
const rowIndex = z.number().int().min(0).max(100);

export const itoActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setMode'), mode: z.enum(['livre', 'campanha']) }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('rerollTheme') }),
  z.object({ type: z.literal('customTheme'), theme: themeSchema }),
  z.object({ type: z.literal('beginRound') }),
  z.object({ type: z.literal('place'), cardId, index: rowIndex }),
  z.object({ type: z.literal('return'), cardId }),
  z.object({ type: z.literal('clue'), cardId, text: z.string().max(200) }),
  z.object({ type: z.literal('ready'), ready: z.boolean() }),
  z.object({ type: z.literal('forceReveal') }),
  z.object({ type: z.literal('next') }),
  z.object({ type: z.literal('lobby') }),
]);

/** Coordenadas normalizadas; uma pequena folga permite cursor um pouco fora do feltro. */
const coord = z.number().min(-1).max(2);

export const ACTIVITIES = ['thinking', 'writing', 'dragging'] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const clientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('join'), token: z.string().uuid(), name: z.string().max(100), color: z.string().max(16) }),
  z.object({ t: z.literal('action'), action: itoActionSchema }),
  z.object({
    t: z.literal('fx.cursor'),
    zone: z.enum(['table', 'hand']),
    x: coord,
    y: coord,
    drag: z.object({ cardId, index: rowIndex.nullable() }).nullable(),
  }),
  z.object({ t: z.literal('fx.activity'), activity: z.enum(ACTIVITIES) }),
  z.object({ t: z.literal('fx.ping'), x: coord, y: coord }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type CursorFx = Omit<Extract<ClientMessage, { t: 'fx.cursor' }>, 't'>;

/** Falha a compilação se o schema divergir do tipo ItoAction. */
type Assert<T extends true> = T;
export type ActionSchemaMatches = Assert<z.infer<typeof itoActionSchema> extends ItoAction ? true : false>;
export type ActionTypeCovered = Assert<ItoAction extends z.infer<typeof itoActionSchema> ? true : false>;

export type ServerMessage =
  | { t: 'welcome'; playerId: string; code: string }
  | { t: 'state'; room: RoomView }
  | ({ t: 'fx.cursor'; from: string } & CursorFx)
  | { t: 'fx.activity'; from: string; activity: Activity }
  | { t: 'fx.ping'; from: string; x: number; y: number }
  | { t: 'error'; code: string; message: string };

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    const result = clientMessageSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export const ERROR_MESSAGES: Record<string, string> = {
  not_host: 'Só o host pode fazer isso.',
  bad_phase: 'Agora não dá pra fazer isso.',
  not_owner: 'Essa carta não é sua.',
  unknown_card: 'Carta não encontrada.',
  not_enough_players: 'Precisa de pelo menos 2 jogadores.',
  cards_missing: 'Ainda tem carta fora da mesa.',
  bad_theme: 'Tema inválido.',
  not_player: 'Você está assistindo esta rodada.',
  bad_action: 'Ação desconhecida.',
  room_full: 'A sala está cheia (máx. 10).',
  bad_name: 'Escolha um nome de 1 a 16 letras.',
  bad_color: 'Cor inválida.',
  color_taken: 'Essa cor já foi escolhida.',
  not_member: 'Você não está nesta sala.',
  bad_message: 'Mensagem inválida.',
  not_joined: 'Entre na sala primeiro.',
};
