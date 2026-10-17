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
