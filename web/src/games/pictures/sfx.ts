/** Sons do Retratim que a mesa pede (revelação e fim de jogo). */
export type PicturesSfx = 'tape' | 'shutter' | 'plim' | 'win';

/**
 * Ponto único dos sons da revelação e do fim. Por enquanto não toca nada: os sons próprios do Retratim
 * (`sounds.ts`, Task 9) ligam aqui.
 */
export function playPicturesSfx(name: PicturesSfx): void {
  void name;
}
