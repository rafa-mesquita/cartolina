import type { CordelKind, Resource, Terrain } from '@cartolina/shared';

/**
 * Nomes do tema na tela (os ids internos ficam em inglês, como no Cúpi). Porte das tabelas de `prototipo/hexa/texts.js`.
 * As frases (diário, listas de recursos) ficam em `texts.ts`.
 */

/** Ordem em que os recursos aparecem em toda a mesa (mão, banco, listas). */
export const RES_ORDER: readonly Resource[] = ['wood', 'brick', 'leather', 'beans', 'stone'];

export const RES_NAME: Record<Resource, string> = { wood: 'madeira', brick: 'barro', leather: 'couro', beans: 'feijão', stone: 'pedra' };

export const TERRAIN_NAME: Record<Terrain, string> = {
  forest: 'caatinga',
  hills: 'barreiro',
  pasture: 'malhada',
  fields: 'roçado',
  mountains: 'lajedo',
  desert: 'rio seco',
};

export const CORDEL_NAME: Record<CordelKind, string> = {
  vaqueiro: 'Vaqueiro',
  point: 'Ponto',
  mutirao: 'Mutirão',
  chuva: 'Chuva no sertão',
  atravessador: 'Atravessador',
};

/** O que cada cordel faz (só o que faz, sem dica de estratégia). */
export const CORDEL_DESC: Record<CordelKind, string> = {
  vaqueiro: 'leva o Carcará pra outro terreno e rouba 1 carta',
  point: '+1 ponto, escondido até o fim',
  mutirao: '2 estradas de graça',
  chuva: '2 recursos quaisquer do banco',
  atravessador: 'escolhe um recurso: todo mundo te entrega o que tem dele',
};

/** Os 5 cordéis de Ponto, revelados no fim (um nome por carta, na ordem). */
export const POINT_NAMES = ['Igrejinha', 'Açude', 'Cisterna', 'Escola', 'Casa de Farinha'] as const;

export const PIECE_NAME = { road: 'estrada', house: 'casa', city: 'vila', cordel: 'cordel' } as const;
