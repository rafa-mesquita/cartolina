import { useEffect, type RefObject } from 'react';
import { installButtonSounds } from '../../brand/buttonSounds';
import { playDixitSound } from './sounds';

/**
 * Botões dentro de `root` com o clique mais baixo do Diquisti. O elemento precisa ter `data-button-sounds`
 * (assim o listener do documento fica quieto lá dentro).
 */
export function useDixitButtonSounds(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = root.current;
    return el ? installButtonSounds(el, (s) => playDixitSound(s)) : undefined;
  }, [root]);
}
