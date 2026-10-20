import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/** Segurar o dedo assim (ms) mostra a dica. */
export const TIP_HOLD_MS = 450;
/** A dica do toque some sozinha depois disso (ms). */
export const TIP_TOUCH_MS = 3000;
/** Foco que chega até aqui (ms) depois de um toque/clique é do ponteiro, não do teclado: não mostra a dica. */
const POINTER_FOCUS_MS = 800;
/** Distância mínima (px) do balão até a borda da tela. */
const EDGE = 8;

/** O que espalhar no elemento que tem a dica. */
export interface TipProps {
  'aria-describedby': string;
  onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onFocus: (e: FocusEvent<HTMLElement>) => void;
  onBlur: () => void;
  onClickCapture: (e: MouseEvent<HTMLElement>) => void;
  onContextMenu: (e: MouseEvent<HTMLElement>) => void;
}

/**
 * Dica rápida de um elemento (carta, ação, botão da janela). No computador aparece ao passar o mouse ou focar pelo
 * teclado; no toque, ao segurar o dedo `TIP_HOLD_MS` — e aí o clique que vem ao soltar **não** dispara o elemento; some
 * sozinha em `TIP_TOUCH_MS` ou ao tocar em outro lugar. O texto fica sempre no DOM (escondido), ligado ao elemento por
 * `aria-describedby`: o leitor de tela ouve sem precisar do balão. Devolve as `props` do elemento e o `tip` (o texto
 * escondido e, quando aparece, o balão), que vai do lado do elemento.
 */
export function useTip(text: string): { props: TipProps; tip: ReactNode } {
  const id = useId();
  // elemento com o balão aberto (null = escondido)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // o dedo segurou até a dica: o próximo clique é engolido
  const held = useRef(false);
  const lastPointer = useRef<{ at: number; type: string }>({ at: -Infinity, type: '' });

  const props = useMemo<TipProps>(() => {
    const stopTimers = () => {
      clearTimeout(holdTimer.current);
      clearTimeout(hideTimer.current);
      holdTimer.current = hideTimer.current = undefined;
    };
    const hide = () => {
      stopTimers();
      setAnchor(null);
    };
    return {
      'aria-describedby': id,
      onPointerEnter: (e) => {
        if (e.pointerType !== 'touch') setAnchor(e.currentTarget);
      },
      onPointerLeave: (e) => {
        if (e.pointerType !== 'touch') hide();
      },
      onPointerDown: (e) => {
        lastPointer.current = { at: Date.now(), type: e.pointerType };
        held.current = false;
        if (e.pointerType !== 'touch') return;
        const el = e.currentTarget;
        stopTimers();
        holdTimer.current = setTimeout(() => {
          holdTimer.current = undefined;
          held.current = true;
          setAnchor(el);
          hideTimer.current = setTimeout(() => {
            hideTimer.current = undefined;
            setAnchor(null);
          }, TIP_TOUCH_MS);
        }, TIP_HOLD_MS);
      },
      onPointerUp: () => {
        clearTimeout(holdTimer.current);
        holdTimer.current = undefined;
      },
      onPointerCancel: () => {
        clearTimeout(holdTimer.current);
        holdTimer.current = undefined;
      },
      onFocus: (e) => {
        if (Date.now() - lastPointer.current.at < POINTER_FOCUS_MS) return;
        setAnchor(e.currentTarget);
      },
      onBlur: hide,
      onClickCapture: (e) => {
        if (!held.current) return;
        held.current = false;
        e.preventDefault();
        e.stopPropagation();
      },
      onContextMenu: (e) => {
        // segurar o dedo não abre o menu do navegador
        if (lastPointer.current.type === 'touch') e.preventDefault();
      },
    };
  }, [id]);

  // relógios desligados ao desmontar
  useEffect(
    () => () => {
      clearTimeout(holdTimer.current);
      clearTimeout(hideTimer.current);
    },
    [],
  );

  // com o balão aberto, tocar/clicar em outro lugar esconde
  useEffect(() => {
    if (anchor === null) return undefined;
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && anchor.contains(e.target)) return;
      clearTimeout(hideTimer.current);
      setAnchor(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [anchor]);

  const tip = (
    <>
      <span id={id} hidden>
        {text}
      </span>
      {anchor !== null && createPortal(<TipBalloon anchor={anchor} text={text} />, anchor.closest<HTMLElement>('.coup') ?? document.body)}
    </>
  );
  return { props, tip };
}

/**
 * O balão: escuro, texto creme, seta pro elemento; acima dele (embaixo, se não couber), preso dentro da tela e sem
 * pegar cliques. Fica na raiz `.coup` (fora do palco escalado), posicionado pela tela.
 */
function TipBalloon({ anchor, text }: { anchor: HTMLElement; text: string }) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const a = anchor.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const center = a.left + a.width / 2;
    const left = Math.min(Math.max(center - b.width / 2, EDGE), Math.max(EDGE, vw - EDGE - b.width));
    const below = a.top - b.height - 10 < EDGE;
    const top = below ? a.bottom + 10 : a.top - b.height - 10;
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.setProperty('--arrow', `${Math.round(Math.min(Math.max(center - left, 12), b.width - 12))}px`);
    el.classList.toggle('below', below);
    el.classList.add('on');
  }, [anchor]);
  return (
    <div ref={box} className="cp-tip" aria-hidden="true">
      {text}
    </div>
  );
}
