import { useEffect, type RefObject } from 'react';
import { installButtonSounds } from '../../brand/buttonSounds';
import { installAudioUnlock, playPicturesSound } from './sounds';

/**
 * Sons do Retratim numa área (a mesa ou o lobby): libera o áudio no primeiro gesto e faz todo botão dentro de
 * `root` soar o clique baixinho do Retratim. O elemento precisa ter `data-button-sounds` (assim o listener do
 * documento fica quieto lá dentro). O botão com `data-sound="none"` continua mudo.
 */
export function usePicturesSounds(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const unlock = installAudioUnlock();
    const buttons = installButtonSounds(el, () => playPicturesSound('click'));
    return () => {
      unlock();
      buttons();
    };
  }, [root]);
}
