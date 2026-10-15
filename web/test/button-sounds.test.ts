import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installButtonSounds } from '../src/brand/buttonSounds';
import { resetSounds } from '../src/brand/sounds';
import { saveSoundPref } from '../src/net/identity';

function button(attrs: { sound?: string; disabled?: boolean; html?: string } = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  if (attrs.sound) b.dataset.sound = attrs.sound;
  if (attrs.disabled) b.disabled = true;
  b.innerHTML = attrs.html ?? 'ok';
  document.body.appendChild(b);
  return b;
}

describe('sons dos botões (um listener delegado)', () => {
  let uninstall: () => void = () => {};
  afterEach(() => {
    uninstall();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('qual som', () => {
    const play = vi.fn();
    beforeEach(() => {
      play.mockClear();
      uninstall = installButtonSounds(document, play);
    });

    it('botão comum faz "click"; data-sound escolhe outro', () => {
      button().click();
      button({ sound: 'pick' }).click();
      button({ sound: 'join' }).click();
      expect(play.mock.calls).toEqual([['click'], ['pick'], ['join']]);
    });

    it('data-sound="none" e valor desconhecido', () => {
      button({ sound: 'none' }).click();
      button({ sound: 'trombone' }).click();
      expect(play.mock.calls).toEqual([['click']]);
    });

    it('clique num filho do botão conta; fora de botão, nada', () => {
      const b = button({ sound: 'pick', html: '<span><svg></svg></span>' });
      b.querySelector('span')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const div = document.createElement('div');
      document.body.appendChild(div);
      div.click();
      expect(play.mock.calls).toEqual([['pick']]);
    });

    it('botão desabilitado não soa', () => {
      const b = button({ disabled: true, html: '<span>x</span>' });
      b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      b.querySelector('span')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(play).not.toHaveBeenCalled();
    });

    it('desinstalar tira o listener', () => {
      uninstall();
      button().click();
      expect(play).not.toHaveBeenCalled();
    });
  });

  it('respeita o som desligado (com o tocador de verdade)', () => {
    resetSounds();
    const mediaPlay = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    uninstall = installButtonSounds();
    saveSoundPref(false);
    button({ sound: 'pick' }).click();
    expect(mediaPlay).not.toHaveBeenCalled();
    saveSoundPref(true);
    button({ sound: 'pick' }).click();
    expect(mediaPlay).toHaveBeenCalledTimes(1);
    expect((mediaPlay.mock.contexts[0] as HTMLAudioElement).src).toMatch(/sounds\/card\.mp3$/);
  });
});
