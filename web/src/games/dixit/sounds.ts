import { playSound, type SoundName } from '../../brand/sounds';

/** O Diquisti toca tudo mais baixo que o DITU (pedido do usuário): arquivo a 45%, sintetizados à metade, erro e virar carta mais baixos ainda. */
const GAIN: Partial<Record<SoundName, number>> = { card: 0.45, pick: 0.45, land: 0.45, error: 0.3, flip: 0.35 };
const SYNTH_GAIN = 0.5;

/** Som do Diquisti: use este em vez de `playSound` em todo o código do jogo. */
export function playDixitSound(name: SoundName, index = 0, now: number = performance.now()): void {
  playSound(name, index, now, GAIN[name] ?? SYNTH_GAIN);
}
