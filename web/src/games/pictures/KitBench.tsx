import type { KitId, Work } from '@cartolina/shared';
import { useEffect, useRef } from 'react';
import { kitModule } from './kits';

interface Props {
  kit: KitId;
  round: number;
  /** Muda quando o divisor é solto: recria a bancada no tamanho novo (com o rascunho local). */
  rebuild: number;
  /** Obra pra começar (lida só na hora de montar): o rascunho local, ou a do servidor ao reconectar. */
  work: () => Work | null;
  onChange: (work: Work) => void;
  /** Pronto: a bancada fica a 60% e sem interação. */
  ready: boolean;
}

/**
 * Embrulho da bancada imperativa do kit. Monta só quando `rodada:kit` muda ou o divisor é solto; nunca por
 * re-render nem pelo eco do servidor (o local manda). `destroy()` na saída.
 */
export function KitBench({ kit, round, rebuild, work, onChange, ready }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ work, onChange });
  latest.current = { work, onChange };

  useEffect(() => {
    const box = ref.current;
    if (!box) return undefined;
    // A folha é do kit (ele mexe no innerHTML); o React só cuida da caixa em volta.
    const sheet = document.createElement('div');
    sheet.className = 'pc-bench-sheet';
    box.appendChild(sheet);
    const start = latest.current.work();
    let handle: { destroy(): void } | null = null;
    try {
      handle = kitModule(kit).build(sheet, start && start.kit === kit ? start : null, (w) => latest.current.onChange(w));
    } catch (err) {
      console.error('kit quebrou no build', kit, err);
    }
    return () => {
      try {
        handle?.destroy();
      } catch (err) {
        console.error('kit quebrou no destroy', kit, err);
      }
      sheet.remove();
    };
  }, [kit, round, rebuild]);

  return <div ref={ref} className={`pc-bench${ready ? ' ready' : ''}`} aria-disabled={ready || undefined} data-kit={kit} />;
}
