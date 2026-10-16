import { playSound, type SoundName } from './sounds';

/** Sons que um botão pode pedir com `data-sound`; `none` silencia; sem atributo (ou desconhecido), `click`. */
const BUTTON_SOUNDS: ReadonlySet<string> = new Set<SoundName>(['click', 'pick', 'join', 'card']);

export function soundForButton(button: HTMLButtonElement): SoundName | null {
  if (button.disabled) return null;
  const wanted = button.dataset.sound;
  if (wanted === 'none') return null;
  return wanted && BUTTON_SOUNDS.has(wanted) ? (wanted as SoundName) : 'click';
}

/**
 * Um único listener (delegado) para o som de todos os botões do app: menus, telas e controles da mesa.
 * O som desligado é respeitado por `playSound`. Devolve a função que desinstala.
 *
 * Uma área com sons próprios (ex.: a mesa do Diquisti, mais baixa) se marca com `data-button-sounds` e instala
 * o próprio listener nela (`root` = a área): lá dentro só ele toca, o do documento fica quieto.
 */
export function installButtonSounds(root: Document | HTMLElement = document, play: (name: SoundName) => void = playSound): () => void {
  const onClick = (e: Event) => {
    const target = e.target;
    const button = target instanceof Element ? target.closest('button') : null;
    if (!button) return;
    const area = button.closest('[data-button-sounds]');
    if (area && area !== root) return;
    const sound = soundForButton(button);
    if (sound) play(sound);
  };
  // Fase de captura: roda antes do onClick do React, que pode desabilitar o botão na hora ("criar sala" → "criando…").
  root.addEventListener('click', onClick, true);
  return () => root.removeEventListener('click', onClick, true);
}
