import { z } from 'zod';
import { KITTENS_CARD_KINDS } from './cards';
import type { KittensAction } from './types';

const cardId = z.string().min(1).max(32);

export const kittensActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }),
  z.object({
    type: z.literal('play'),
    cards: z.array(cardId).min(1).max(5),
    target: z.string().min(1).max(64).optional(),
    ask: z.enum(KITTENS_CARD_KINDS).optional(),
  }),
  z.object({ type: z.literal('nope') }),
  z.object({ type: z.literal('draw') }),
  z.object({
    type: z.literal('choose'),
    card: cardId.optional(),
    position: z.union([z.number().int().min(0).max(200), z.literal('random')]).optional(),
    keep: z.boolean().optional(),
  }),
  z.object({ type: z.literal('again') }),
  z.object({ type: z.literal('lobby') }),
]);

/** Falha a compilação se o schema divergir do tipo KittensAction. */
type Assert<T extends true> = T;
export type KittensActionSchemaMatches = Assert<z.infer<typeof kittensActionSchema> extends KittensAction ? true : false>;
export type KittensActionTypeCovered = Assert<KittensAction extends z.infer<typeof kittensActionSchema> ? true : false>;
