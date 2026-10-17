export const PICTURES_THEMES = ['bichos', 'casa', 'comida', 'lugares', 'transporte', 'natureza', 'gente'] as const;
export type PicturesTheme = (typeof PICTURES_THEMES)[number];

export interface PicturesPhoto {
  /** p001…p100; a imagem fica em web/public/pictures/fotos/<id>.webp (Plano R3). */
  id: string;
  theme: PicturesTheme;
}

/**
 * Quantas fotos de cada tema (100 no total). Provisório: o Plano R3 gera as fotos de verdade e o script
 * `npm run pictures:fotos` reescreve este arquivo com os temas reais.
 */
const PER_THEME: Record<PicturesTheme, number> = {
  bichos: 15,
  casa: 14,
  comida: 14,
  lugares: 15,
  transporte: 14,
  natureza: 14,
  gente: 14,
};

export const PICTURES_DECK: readonly PicturesPhoto[] = PICTURES_THEMES.flatMap((theme) =>
  Array.from({ length: PER_THEME[theme] }, () => theme),
).map((theme, i) => ({ id: `p${String(i + 1).padStart(3, '0')}`, theme }));
