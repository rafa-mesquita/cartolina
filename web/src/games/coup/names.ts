import type { CoupCharacter } from '@cartolina/shared';

/** Nomes dos personagens na tela (ids internos em inglês). */
export const CHARACTER_NAMES: Record<CoupCharacter, string> = {
  duke: 'Duque',
  assassin: 'Assassino',
  captain: 'Capitão',
  ambassador: 'Embaixador',
  contessa: 'Condessa',
};

/** Ícone de cada personagem (Tabler) até as artes do Flow (Plano C3). */
export const CHARACTER_ICONS: Record<CoupCharacter, string> = {
  duke: 'ti-crown',
  assassin: 'ti-sword',
  captain: 'ti-anchor',
  ambassador: 'ti-world',
  contessa: 'ti-diamond',
};
