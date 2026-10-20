import { useEffect, type RefObject } from 'react';
import { installButtonSounds } from '../../brand/buttonSounds';
import { installAudioUnlock, playCamelioSound } from './sounds';

/**
 * Sons do Cama-Leão numa área (a mesa ou o lobby): libera o áudio no primeiro gesto e faz todo botão dentro de
 * `root` soar o clique baixinho. O elemento precisa ter `data-button-sounds` (assim o listener do
 * documento fica quieto lá dentro). O botão com `data-sound="none"` continua mudo.
 */
export function useCamelioSounds(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const unlock = installAudioUnlock();
    const buttons = installButtonSounds(el, () => playCamelioSound('click'));
    return () => {
      unlock();
      buttons();
    };
  }, [root]);
}
