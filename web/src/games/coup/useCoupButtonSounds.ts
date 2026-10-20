import { useEffect, type RefObject } from 'react';
import { installButtonSounds } from '../../brand/buttonSounds';
import { installAudioUnlock, playCoupSound } from './sounds';

/**
 * Sons do Cúpi numa área (a mesa ou o lobby): libera o áudio no primeiro gesto e faz todo botão dentro de `root`
 * soar o estalinho `click`. O elemento precisa ter `data-button-sounds` (assim o listener do documento fica quieto
 * lá dentro). O botão com `data-sound="none"` continua mudo.
 */
export function useCoupButtonSounds(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const unlock = installAudioUnlock();
    const buttons = installButtonSounds(el, () => playCoupSound('click'));
    return () => {
      unlock();
      buttons();
    };
  }, [root]);
}
