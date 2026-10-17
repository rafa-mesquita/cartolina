import type { KitId } from '@cartolina/shared';
import { blocks } from './blocks';
import { cubes } from './cubes';
import { dots } from './dots';
import { icons } from './icons';
import { laces } from './laces';
import { sticks } from './sticks';
import type { KitModule } from './types';

/** A bancada e a mostra de cada kit. O three.js (blocos) só carrega quando a bancada/mostra de blocos aparece. */
export const KITS_UI: { [K in KitId]: KitModule<K> } = { cubes, laces, sticks, blocks, icons, dots };

export type { KitModule } from './types';

/** O módulo do kit, sem o tipo da obra amarrado (quem chama garante que a obra é desse kit). */
export const kitModule = (kit: KitId): KitModule<KitId> => KITS_UI[kit] as unknown as KitModule<KitId>;
