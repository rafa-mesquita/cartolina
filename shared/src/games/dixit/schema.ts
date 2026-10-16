import { z } from 'zod';
import type { DixitAction } from './types';

const cardId = z.string().min(1).max(16);

export const dixitActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setTarget'), target: z.union([z.literal(15), z.literal(30)]) }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('tell'), cardId, clue: z.string().max(400) }),
  z.object({ type: z.literal('submit'), cardIds: z.array(cardId).min(1).max(2) }),
  z.object({ type: z.literal('vote'), cardId }),
  z.object({ type: z.literal('confirm') }),
  z.object({ type: z.literal('forceNext') }),
  z.object({ type: z.literal('next') }),
  z.object({ type: z.literal('again') }),
  z.object({ type: z.literal('lobby') }),
]);

/** Falha a compilação se o schema divergir do tipo DixitAction. */
type Assert<T extends true> = T;
export type DixitActionSchemaMatches = Assert<z.infer<typeof dixitActionSchema> extends DixitAction ? true : false>;
export type DixitActionTypeCovered = Assert<DixitAction extends z.infer<typeof dixitActionSchema> ? true : false>;
