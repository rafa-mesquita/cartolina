import type { Work } from '@cartolina/shared';
import { useEffect, useRef } from 'react';
import { kitModule } from './kits';

/** Desenha uma obra (só leitura) com o `show` do kit, de novo só quando a obra muda de verdade. */
export function KitShow({ work, className = 'pc-show' }: { work: Work; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(work);
  const latest = useRef(work);
  latest.current = work;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      kitModule(latest.current.kit).show(el, latest.current);
    } catch (err) {
      console.error('kit quebrou no show', latest.current.kit, err);
    }
  }, [key]);
  return <div ref={ref} className={className} />;
}
