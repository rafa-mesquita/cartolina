import { noResources, type Resources } from '@cartolina/shared';
import { useEffect, useRef, type ReactNode } from 'react';
import { ResIcon } from './art';
import { RES_NAME, RES_ORDER } from './names';

/** Peças pequenas das janelas sobre a mesa (troca, feira, cordéis, descarte): contas de recurso, +/−, fichas e a moldura. */

export const none = noResources;
export const total = (r: Resources): number => RES_ORDER.reduce((n, k) => n + r[k], 0);
/** `have` cobre `cost`? */
export const covers = (have: Resources, cost: Resources): boolean => RES_ORDER.every((k) => have[k] >= cost[k]);

interface StepperProps {
  n: number;
  /** Nome do que conta, pros botões ("madeira que você dá" → "mais madeira que você dá"). */
  label: string;
  minus: boolean;
  plus: boolean;
  onStep: (d: 1 | -1) => void;
}

/** − n + (porte do `stepper` do protótipo). */
export function Stepper({ n, label, minus, plus, onStep }: StepperProps) {
  return (
    <span className="mc-step">
      <button type="button" aria-label={`menos ${label}`} disabled={!minus} onClick={() => onStep(-1)}>
        −
      </button>
      <b>{n}</b>
      <button type="button" aria-label={`mais ${label}`} disabled={!plus} onClick={() => onStep(1)}>
        +
      </button>
    </span>
  );
}

/** "[ícone]2 [ícone]1" pra um punhado de recursos ("nada" se vazio). */
export function Chips({ res, size = 24 }: { res: Resources; size?: number }) {
  const parts = RES_ORDER.filter((r) => res[r] > 0);
  if (!parts.length) return <span className="mc-chips">nada</span>;
  return (
    <>
      {parts.map((r) => (
        <span key={r} className="mc-chips" title={`${res[r]} ${RES_NAME[r]}`}>
          <ResIcon kind={r} size={size} />
          <i>{res[r]}</i>
        </span>
      ))}
    </>
  );
}

interface WindowProps {
  title: ReactNode;
  /** Nome acessível da janela (quando o título não é só texto). */
  label?: string;
  className?: string;
  /** Sem `onClose`, a janela não tem "✕" (o descarte não fecha). */
  onClose?: () => void;
  closeLabel?: string;
  /** Fita no alto (cartão de oferta). */
  ribbon?: string;
  /** Leva o foco pro título ao abrir (o cartão de oferta, que aparece sozinho, não rouba o foco). */
  focus?: boolean;
  children: ReactNode;
}

/** A moldura de uma janela sobre o tabuleiro (`role="dialog"`, título e "✕"). */
export function Window({ title, label, className = '', onClose, closeLabel = 'fechar', ribbon, focus = true, children }: WindowProps) {
  const head = useRef<HTMLHeadingElement>(null);
  const focusOnOpen = useRef(focus);
  useEffect(() => {
    if (focusOnOpen.current) head.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className={`mc-janela ${className}`} role="dialog" aria-label={label ?? (typeof title === 'string' ? title : undefined)}>
      {ribbon && <span className="mc-fita">{ribbon}</span>}
      {onClose && (
        <button type="button" className="mc-x" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
          ✕
        </button>
      )}
      {title !== null && (
        <h3 ref={head} tabIndex={-1}>
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

/** Uma linha de recurso com ícone, nome, um extra ("tem 3", "banco 5") e o +/−. */
export function ResRow({ r, extra, children }: { r: keyof Resources; extra?: string; children: ReactNode }) {
  return (
    <div className="mc-linha">
      <ResIcon kind={r} size={26} />
      <span className="mc-nm">
        {RES_NAME[r]} {extra && <span className="mc-tem">{extra}</span>}
      </span>
      {children}
    </div>
  );
}
