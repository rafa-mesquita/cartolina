import { playSound, type SoundName } from '../../brand/sounds';

/**
 * O Diquisti toca tudo mais baixo que o DITU (pedido do usuário): arquivo a 45% (o `land` efetivo
 * fica 0.4 × 0.45 = 0.18), sintetizados à metade, erro e virar carta mais baixos ainda.
 * Tabela completa de propósito: som novo em `SoundName` só compila depois de ganhar seu volume aqui.
 */
const GAIN: Record<SoundName, number> = {
  card: 0.45,
  pick: 0.45,
  land: 0.45,
  error: 0.3,
  flip: 0.35,
  slide: 0.5,
  win: 0.5,
  lose: 0.5,
  join: 0.5,
  click: 0.5,
};

/** Som do Diquisti: use este em vez de `playSound` em todo o código do jogo. */
export function playDixitSound(name: SoundName, index = 0, now: number = performance.now()): void {
  playSound(name, index, now, GAIN[name]);
}
