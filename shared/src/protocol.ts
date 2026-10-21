import { z } from 'zod';
import type { RoomView } from './room';

const cardId = z.string().min(1).max(64);
const rowIndex = z.number().int().min(0).max(100);

/** Ação do jogo: o envelope só garante `type`; a sala valida com o schema do jogo dela (`roomAction`). */
const actionEnvelope = z.object({ type: z.string().min(1).max(32) }).passthrough();

/** Coordenadas normalizadas; uma pequena folga permite cursor um pouco fora do feltro. */
const coord = z.number().min(-1).max(2);

export const ACTIVITIES = ['thinking', 'writing', 'dragging'] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const clientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('join'), token: z.string().uuid(), name: z.string().max(100), color: z.string().max(16) }),
  z.object({ t: z.literal('action'), action: actionEnvelope }),
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

export type ServerMessage =
  | { t: 'welcome'; playerId: string; code: string }
  | { t: 'state'; room: RoomView; /** Hora do servidor (ms) quando a visão saiu: o cliente mede a diferença pro próprio relógio. */ now?: number }
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

export const ERROR_CODES = [
  'not_host',
  'bad_phase',
  'not_owner',
  'unknown_card',
  'not_enough_players',
  'cards_missing',
  'bad_theme',
  'theme_random_only',
  'not_player',
  'bad_action',
  'room_full',
  'bad_name',
  'bad_color',
  'color_taken',
  'not_member',
  'bad_message',
  'not_joined',
  'already_joined',
  'card_on_table',
  'need_3_players',
  'not_storyteller',
  'is_storyteller',
  'own_card',
  'wrong_count',
  'nothing_chosen',
  'already_confirmed',
  'paused',
  'deck_too_small',
  'wrong_kit',
  'bad_work',
  'empty_work',
  'icons_too_few',
  'already_ready',
  'own_work',
  'no_work',
  'not_alive',
  'card_in_air',
  'waiting_choice',
  'not_your_turn',
  'not_in_hand',
  'bad_combo',
  'bad_target',
  'bad_ask',
  'bad_as',
  'blind_pick',
  'nothing_to_nope',
  'no_nope',
  'nope_late',
  'nope_stale',
  'nope_cooldown',
  'not_your_choice',
  'bad_choice',
  // Cúpi (`not_your_turn` e `bad_target` já vêm do Tatubum)
  'not_enough_coins',
  'must_coup',
  'cannot_react',
  'already_passed',
  'window_closed',
  'not_losing',
  'bad_exchange',
  'bad_block',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  not_host: 'Só o host pode fazer isso.',
  bad_phase: 'Agora não dá pra fazer isso.',
  not_owner: 'Essa carta não é sua.',
  unknown_card: 'Carta não encontrada.',
  not_enough_players: 'Precisa de pelo menos 2 jogadores.',
  cards_missing: 'Ainda tem carta fora da mesa.',
  bad_theme: 'Tema inválido.',
  theme_random_only: 'No modo campanha o tema é sempre sorteado.',
  not_player: 'Você está assistindo esta rodada.',
  bad_action: 'Ação inválida.',
  room_full: 'A sala está cheia.',
  bad_name: 'Escolha um nome de 1 a 16 letras.',
  bad_color: 'Personagem inválido.',
  color_taken: 'Esse personagem já foi escolhido.',
  not_member: 'Você não está nesta sala.',
  bad_message: 'Mensagem inválida.',
  not_joined: 'Entre na sala primeiro.',
  already_joined: 'Você já entrou nesta sala.',
  card_on_table: 'Tira a carta da mesa pra mudar a dica.',
  need_3_players: 'Precisa de pelo menos 3 jogadores.',
  not_storyteller: 'Só quem narra escolhe a carta da dica.',
  is_storyteller: 'Quem narra só espera nesta etapa.',
  own_card: 'Não dá pra votar na própria carta.',
  wrong_count: 'Escolha o número certo de cartas.',
  nothing_chosen: 'Escolha antes de confirmar.',
  already_confirmed: 'Você já confirmou.',
  paused: 'Esperando gente: precisa de 3 pessoas na mesa.',
  deck_too_small: 'O baralho tem poucas cartas pra tanta gente.',
  wrong_kit: 'Esse não é o seu kit nesta rodada.',
  bad_work: 'Essa obra não vale com esse kit.',
  empty_work: 'Monte alguma coisa antes de ficar pronto.',
  icons_too_few: 'Escolha pelo menos 2 cartas.',
  already_ready: 'Você já está pronto. Desmarque pra mexer.',
  own_work: 'Não dá pra palpitar na própria obra.',
  no_work: 'Essa pessoa não tem obra nesta rodada.',
  not_alive: 'Você só está assistindo esta partida.',
  card_in_air: 'Espera a carta no ar resolver.',
  waiting_choice: 'Esperando uma escolha.',
  not_your_turn: 'Não é a sua vez.',
  not_in_hand: 'Essa carta não está na sua mão.',
  bad_combo: 'Essas cartas não formam jogada.',
  bad_target: 'Escolha um adversário vivo (no Favor, um que tenha carta).',
  bad_ask: 'Escolha qual bicho puxar.',
  bad_as: 'Escolha qual bicho o Boto vira.',
  blind_pick: 'Mau-olhado: escolha uma das suas cartas viradas.',
  nothing_to_nope: 'Não tem carta no ar pra usar o Nem vem!',
  no_nope: 'Você não tem nenhum Nem vem!',
  nope_late: 'Alguém deu Nem vem! antes de você: sua carta voltou pra mão.',
  nope_stale: 'A carta no ar mudou: seu Nem vem! voltou pra mão.',
  nope_cooldown: 'Espere: acabaram de dar Nem vem! (2 s).',
  not_your_choice: 'Essa escolha não é sua.',
  bad_choice: 'Escolha inválida.',
  not_enough_coins: 'Faltam moedas pra essa ação.',
  must_coup: 'Com 10 moedas ou mais, só dá pra dar o golpe.',
  cannot_react: 'Você não pode fazer isso nesta jogada.',
  already_passed: 'Você já deixou passar.',
  window_closed: 'Essa janela já fechou.',
  not_losing: 'Não é você que perde carta agora.',
  bad_exchange: 'Fique com o mesmo número de cartas que você tinha.',
  bad_block: 'Esse personagem não bloqueia essa ação.',
};

export function errorMessage(code: string): string {
  return (ERROR_CODES as readonly string[]).includes(code) ? ERROR_MESSAGES[code as ErrorCode] : 'Algo deu errado.';
}

/** Códigos de fechamento do WebSocket enviados pelo servidor. */
export const CLOSE_REPLACED = 4000;
export const CLOSE_TIMEOUT = 4002;
export const CLOSE_GONE = 4004;

/** Heartbeat: o cliente manda "ping" de tempos em tempos; o servidor responde "pong" sozinho. */
export const HEARTBEAT_PING = 'ping';
export const HEARTBEAT_PONG = 'pong';
export const HEARTBEAT_INTERVAL_MS = 15_000;
