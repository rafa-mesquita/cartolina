import { z } from 'zod';
import { COORDS, type PicturesAction } from './types';
import { workSchema } from './works';

const coord = z.enum(COORDS);

export const picturesActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('draft'), work: workSchema }),
  z.object({ type: z.literal('ready'), on: z.boolean(), work: workSchema.optional() }),
  z.object({ type: z.literal('guess'), artist: z.string().min(1).max(64), coord: coord.nullable() }),
  z.object({ type: z.literal('confirm') }),
  z.object({ type: z.literal('unconfirm') }),
  z.object({ type: z.literal('hurry') }),
  z.object({ type: z.literal('next') }),
  z.object({ type: z.literal('again') }),
  z.object({ type: z.literal('lobby') }),
]);

/** Falha a compilação se o schema divergir do tipo PicturesAction. */
type Assert<T extends true> = T;
export type PicturesActionSchemaMatches = Assert<z.infer<typeof picturesActionSchema> extends PicturesAction ? true : false>;
export type PicturesActionTypeCovered = Assert<PicturesAction extends z.infer<typeof picturesActionSchema> ? true : false>;
