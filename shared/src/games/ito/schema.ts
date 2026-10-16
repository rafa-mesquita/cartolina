import { z } from 'zod';
import type { ItoAction } from './types';

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

/** Falha a compilação se o schema divergir do tipo ItoAction. */
type Assert<T extends true> = T;
export type ItoActionSchemaMatches = Assert<z.infer<typeof itoActionSchema> extends ItoAction ? true : false>;
export type ItoActionTypeCovered = Assert<ItoAction extends z.infer<typeof itoActionSchema> ? true : false>;
