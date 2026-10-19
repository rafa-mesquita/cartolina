import { z } from 'zod';
import type { CamelioAction } from './types';

export const camelioActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('play'), from: z.enum(['open', 'deck']), to: z.string().min(1).max(64) }),
  z.object({ type: z.literal('again') }),
  z.object({ type: z.literal('lobby') }),
]);

/** Falha a compilação se o schema divergir do tipo CamelioAction. */
type Assert<T extends true> = T;
export type CamelioActionSchemaMatches = Assert<z.infer<typeof camelioActionSchema> extends CamelioAction ? true : false>;
export type CamelioActionTypeCovered = Assert<CamelioAction extends z.infer<typeof camelioActionSchema> ? true : false>;
