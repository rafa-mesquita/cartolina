import { act as rtlAct, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ItoRoomView } from '@cartolina/shared';
import { usePhoneReveal } from '../src/table/phone/usePhoneReveal';
import { revealedItoView as revealedView, sortingRoom, viewOf } from './fixtures';

function Probe({ view, sound, instant = false }: { view: ItoRoomView; sound: (n: string, i?: number) => void; instant?: boolean }) {
  const r = usePhoneReveal(view, sound, instant);
  return <p>{`${r.shown}|${r.done}`}</p>;
}

describe('revelação no celular', () => {
  it('vira uma carta por vez, com sons, e termina com vitória ou derrota', () => {
    vi.useFakeTimers();
    try {
      const sound = vi.fn();
      const view = revealedView();
      render(<Probe view={view} sound={sound} />);
      expect(screen.getByText('0|false')).toBeTruthy();
      rtlAct(() => void vi.advanceTimersByTime(750));
      expect(screen.getByText('1|false')).toBeTruthy();
      expect(sound).toHaveBeenCalledWith('flip', 0);
      rtlAct(() => void vi.advanceTimersByTime(620));
      expect(screen.getByText('2|false')).toBeTruthy();
      expect(sound).toHaveBeenCalledWith('flip', 1);
      // mesmo ritmo do computador: o fim cai 620 + 500 ms depois da última carta virar
      rtlAct(() => void vi.advanceTimersByTime(1000));
      expect(screen.getByText('2|false')).toBeTruthy();
      rtlAct(() => void vi.advanceTimersByTime(130));
      expect(screen.getByText('2|true')).toBeTruthy();
      const won = view.game.outcome === 'round_won';
      expect(sound).toHaveBeenCalledWith(won ? 'win' : 'lose');
    } finally {
      vi.useRealTimers();
    }
  });

  it('carta errada: som de erro 330 ms depois de virar', () => {
    vi.useFakeTimers();
    try {
      const sound = vi.fn();
      const view = revealedView(true);
      const wrong = (view.game.reveal ?? []).findIndex((e) => e.error);
      render(<Probe view={view} sound={sound} />);
      rtlAct(() => void vi.advanceTimersByTime(750 + 620 * wrong + 329));
      expect(sound).not.toHaveBeenCalledWith('error');
      rtlAct(() => void vi.advanceTimersByTime(1));
      expect(sound).toHaveBeenCalledWith('error');
    } finally {
      vi.useRealTimers();
    }
  });

  it('no StrictMode (efeito rodado duas vezes) a sequência não duplica sons', () => {
    vi.useFakeTimers();
    try {
      const sound = vi.fn();
      render(
        <StrictMode>
          <Probe view={revealedView()} sound={sound} />
        </StrictMode>,
      );
      rtlAct(() => void vi.advanceTimersByTime(3000));
      expect(screen.getByText('2|true')).toBeTruthy();
      expect(sound.mock.calls.filter((c) => c[0] === 'flip')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('montou já revelado (recarregou): tudo de uma vez, sem som', () => {
    vi.useFakeTimers();
    try {
      const sound = vi.fn();
      render(<Probe view={revealedView()} sound={sound} instant />);
      expect(screen.getByText('2|true')).toBeTruthy();
      rtlAct(() => void vi.advanceTimersByTime(5000));
      expect(sound).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('desmontar no meio da sequência: nenhum som depois', () => {
    vi.useFakeTimers();
    try {
      const sound = vi.fn();
      const { unmount } = render(<Probe view={revealedView()} sound={sound} />);
      rtlAct(() => void vi.advanceTimersByTime(750));
      expect(sound).toHaveBeenCalledTimes(1);
      unmount();
      rtlAct(() => void vi.advanceTimersByTime(5000));
      expect(sound).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('revelação → escolha → revelação com os mesmos ids: toca de novo desde o começo', () => {
    vi.useFakeTimers();
    try {
      const sound = vi.fn();
      const view = revealedView();
      const { rerender } = render(<Probe view={view} sound={sound} />);
      rtlAct(() => void vi.advanceTimersByTime(3000));
      expect(screen.getByText('2|true')).toBeTruthy();
      rerender(<Probe view={viewOf(sortingRoom(2), 'p0')} sound={sound} />);
      expect(screen.getByText('0|false')).toBeTruthy();
      rerender(<Probe view={view} sound={sound} />);
      expect(screen.getByText('0|false')).toBeTruthy();
      rtlAct(() => void vi.advanceTimersByTime(750));
      expect(screen.getByText('1|false')).toBeTruthy();
      rtlAct(() => void vi.advanceTimersByTime(2000));
      expect(screen.getByText('2|true')).toBeTruthy();
      expect(sound.mock.calls.filter((c) => c[0] === 'flip')).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });
});
