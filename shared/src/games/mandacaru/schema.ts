import { z } from 'zod';
import { MANDACARU_BANK_EACH, RESOURCES, type MandacaruAction } from './types';

const resource = z.enum(RESOURCES);
const n = z.number().int().min(0).max(MANDACARU_BANK_EACH);
const resources = z.object({ wood: n, brick: n, leather: n, beans: n, stone: n });
/** Lugares da geometria: 54 cantos, 72 lados, 19 terrenos. */
const vertex = z.number().int().min(0).max(53);
const edge = z.number().int().min(0).max(71);
const hex = z.number().int().min(0).max(18);
const playerId = z.string().min(1).max(64);

export const mandacaruActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('restart') }),
  z.object({ type: z.literal('place_house'), vertex }),
  z.object({ type: z.literal('place_road'), edge }),
  z.object({ type: z.literal('roll') }),
  z.object({ type: z.literal('discard'), cards: resources }),
  z.object({ type: z.literal('move_carcara'), hex }),
  z.object({ type: z.literal('steal'), from: playerId }),
  z.object({ type: z.literal('build_road'), edge }),
  z.object({ type: z.literal('build_house'), vertex }),
  z.object({ type: z.literal('build_city'), vertex }),
  z.object({ type: z.literal('buy_cordel') }),
  z.object({ type: z.literal('play_vaqueiro') }),
  z.object({ type: z.literal('play_mutirao') }),
  z.object({ type: z.literal('play_chuva'), resources: z.tuple([resource, resource]) }),
  z.object({ type: z.literal('play_atravessador'), resource }),
  z.object({ type: z.literal('offer'), give: resources, want: resources }),
  z.object({ type: z.literal('cancel_offer') }),
  z.object({ type: z.literal('respond'), offerId: z.number().int().nonnegative(), accept: z.boolean() }),
  z.object({ type: z.literal('propose'), give: resources, want: resources }),
  z.object({ type: z.literal('close_deal'), with: playerId, source: z.enum(['offer', 'proposal']), id: z.number().int().nonnegative() }),
  z.object({ type: z.literal('feira'), give: resource, want: resource, count: z.number().int().min(1).max(MANDACARU_BANK_EACH).optional() }),
  z.object({ type: z.literal('end_turn') }),
]);

/** Falha a compilação se o schema divergir do tipo MandacaruAction. */
type Assert<T extends true> = T;
export type MandacaruActionSchemaMatches = Assert<z.infer<typeof mandacaruActionSchema> extends MandacaruAction ? true : false>;
export type MandacaruActionTypeCovered = Assert<MandacaruAction extends z.infer<typeof mandacaruActionSchema> ? true : false>;
