import { playSound, type SoundName } from './sounds';

/** Metade do volume do "pick": passar o mouse é mais suave que clicar. */
export const HOVER_GAIN = 0.5;
/** No máximo um som por intervalo, pra varrer as capas não gaguejar. */
export const HOVER_GAP_MS = 150;

let last = -Infinity;

/** Som baixinho de quando o mouse entra numa capa da estante. `playSound` já respeita o som desligado. */
export function playHover(
  now: number = performance.now(),
  play: (name: SoundName, index?: number, now?: number, gain?: number) => void = playSound,
): void {
  if (now - last < HOVER_GAP_MS) return;
  last = now;
  play('pick', 0, now, HOVER_GAIN);
}

/** Só para testes. */
export function resetHover(): void {
  last = -Infinity;
}
