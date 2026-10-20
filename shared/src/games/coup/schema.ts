import { z } from 'zod';
import { COUP_ACTION_KINDS, COUP_CHARACTERS, type CoupAction } from './types';

const character = z.enum(COUP_CHARACTERS);
/** Id da janela que o jogador viu (sem ele o zod descartaria o campo e a reação atrasada voltaria a valer). */
const windowId = z.number().int().nonnegative().optional();

export const coupActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('restart') }),
  z.object({ type: z.literal('act'), kind: z.enum(COUP_ACTION_KINDS), target: z.string().min(1).max(64).optional() }),
  z.object({ type: z.literal('pass'), windowId }),
  z.object({ type: z.literal('challenge'), windowId }),
  z.object({ type: z.literal('block'), as: character, windowId }),
  z.object({ type: z.literal('lose'), card: character }),
  z.object({ type: z.literal('exchange'), keep: z.array(character).min(1).max(2) }),
]);

/** Falha a compilação se o schema divergir do tipo CoupAction. */
type Assert<T extends true> = T;
export type CoupActionSchemaMatches = Assert<z.infer<typeof coupActionSchema> extends CoupAction ? true : false>;
export type CoupActionTypeCovered = Assert<CoupAction extends z.infer<typeof coupActionSchema> ? true : false>;
