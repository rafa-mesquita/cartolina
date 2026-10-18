/**
 * O baralho do Retratim: 50 temas × 2 fotos (decisão do usuário, 2026-10-17; tabela em `docs/pictures/fotos-prompts.md`).
 * Cada tema é uma "dupla parecida" (às vezes uma pegadinha): p001+p002 são do 1º tema, p003+p004 do 2º, e assim por diante.
 * Os slugs são estáveis (o histórico grava ids de foto, não temas, mas não renomear à toa).
 */
export const PICTURES_THEMES = [
  'cachorro',
  'caneca',
  'gato',
  'pizza',
  'farol',
  'bicicleta',
  'arvore',
  'maos',
  'praia',
  'beira-mar',
  'brinquedo-de-praia',
  'areia',
  'floresta',
  'chao-da-mata',
  'mata',
  'cabana',
  'visto-de-baixo',
  'bola',
  'campo',
  'calcados',
  'luvas',
  'futebol',
  'bandeirinha',
  'aniversario',
  'festa',
  'doces',
  'fogo',
  'balada',
  'neve',
  'no-cabide',
  'janela',
  'trem',
  'trilhos',
  'locomotiva',
  'sinalizacao',
  'estacao',
  'onibus',
  'abajur',
  'casa-azul',
  'esgrima',
  'elefante',
  'safari',
  'feijoada',
  'roupa-dobrada',
  'escolar',
  'salgado',
  'pao',
  'gelado',
  'fazenda',
  'relogio',
] as const;
export type PicturesTheme = (typeof PICTURES_THEMES)[number];

/** Nome do tema pra mostrar (legenda do placeholder, `alt` da foto). */
export const PICTURES_THEME_NAMES: Record<PicturesTheme, string> = {
  cachorro: 'cachorro',
  caneca: 'caneca',
  gato: 'gato',
  pizza: 'pizza',
  farol: 'farol',
  bicicleta: 'bicicleta',
  arvore: 'árvore',
  maos: 'mãos',
  praia: 'praia',
  'beira-mar': 'beira-mar',
  'brinquedo-de-praia': 'brinquedo de praia',
  areia: 'areia',
  floresta: 'floresta',
  'chao-da-mata': 'chão da mata',
  mata: 'mata',
  cabana: 'cabana',
  'visto-de-baixo': 'visto de baixo',
  bola: 'bola',
  campo: 'campo',
  calcados: 'calçados',
  luvas: 'luvas',
  futebol: 'futebol',
  bandeirinha: 'bandeirinha',
  aniversario: 'aniversário',
  festa: 'festa',
  doces: 'doces',
  fogo: 'fogo',
  balada: 'balada',
  neve: 'neve',
  'no-cabide': 'no cabide',
  janela: 'janela',
  trem: 'trem',
  trilhos: 'trilhos',
  locomotiva: 'locomotiva',
  sinalizacao: 'sinalização',
  estacao: 'estação',
  onibus: 'ônibus',
  abajur: 'abajur',
  'casa-azul': 'casa azul',
  esgrima: 'esgrima',
  elefante: 'elefante',
  safari: 'safari',
  feijoada: 'feijoada',
  'roupa-dobrada': 'roupa dobrada',
  escolar: 'escolar',
  salgado: 'salgado',
  pao: 'pão',
  gelado: 'gelado',
  fazenda: 'fazenda',
  relogio: 'relógio',
};

/** Fotos de cada tema. */
export const PICTURES_PER_THEME = 2;

export interface PicturesPhoto {
  /** p001…p100; a imagem fica em web/public/pictures/fotos/<id>.webp (e a miniatura em <id>-thumb.webp). */
  id: string;
  theme: PicturesTheme;
}

export const PICTURES_DECK: readonly PicturesPhoto[] = PICTURES_THEMES.flatMap((theme, t) =>
  Array.from({ length: PICTURES_PER_THEME }, (_, k) => ({
    id: `p${String(t * PICTURES_PER_THEME + k + 1).padStart(3, '0')}`,
    theme,
  })),
);
