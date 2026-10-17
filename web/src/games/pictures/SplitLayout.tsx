import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

/* Duas colunas na página de 1440 px do palco: grade | divisor | lado direito (bancada ou obras). */
const PAGE_W = 1440, PAGE_H = 900 - 84, PAD = 40, GAP = 48;
export const SIDE_DEFAULT = 600;
export const SIDE_MIN = Math.round(PAGE_W * 0.35);
export const SIDE_MAX = Math.round(PAGE_W * 0.75);
const SIDE_KEY = 'retratim:lado-direito';
/** Setas no divisor mexem ~2% da página. */
const KEY_STEP = Math.round(PAGE_W * 0.02);
const pct = (w: number) => Math.round((w / PAGE_W) * 100);

function loadSide(): number {
  try {
    const w = Number(localStorage.getItem(SIDE_KEY));
    if (w >= SIDE_MIN && w <= SIDE_MAX) return w;
  } catch {
    // sem localStorage: fica o padrão
  }
  return SIDE_DEFAULT;
}
function saveSide(w: number): void {
  try {
    localStorage.setItem(SIDE_KEY, String(w));
  } catch {
    // ignora
  }
}
const clampSide = (w: number) => Math.round(Math.min(SIDE_MAX, Math.max(SIDE_MIN, w)));

/** Larguras (px do palco) pra lateral `sideW`: fotos 4:3 na sobra da esquerda, bancada 4:3 na direita. */
export function splitVars(sideW: number): Record<'--pw' | '--ph' | '--grid-w' | '--side-x' | '--side-w' | '--div-x' | '--bw', number> {
  // respiro de GAP px de cada lado da linha do divisor, em qualquer posição (a alça fica centrada na linha)
  const sideX = PAGE_W - PAD - sideW, line = sideX - GAP, divX = line - 12, gridW = line - GAP - PAD;
  // grade = rótulo 28 + 4 fotos + 4 vãos de 12; na altura: topo 22 + rótulos 30 + 4 vãos + nota ~80
  const byW = (gridW - 28 - 48) / 4, byH = (((PAGE_H - 22 - 30 - 48 - 80) / 4 - 12) * 4) / 3 + 12;
  const pw = Math.max(16, Math.min(byW, byH)), ph = (pw - 12) * 0.75 + 12; // borda de 6 px em volta da foto 4:3
  // bancada: largura da coluna, limitada pela altura (cartão da secreta ~104 + 18 + pé ~70 + folga)
  const bw = Math.min(sideW, ((PAGE_H - 22 - 104 - 18 - 70 - 16) * 4) / 3);
  return { '--pw': pw, '--ph': ph, '--grid-w': gridW, '--side-x': sideX, '--side-w': sideW, '--div-x': divX, '--bw': bw };
}

interface Props {
  left: ReactNode;
  right: ReactNode;
  /** O divisor foi solto num tamanho novo (ou voltou ao padrão): hora de recriar o que depende do tamanho. */
  onResizeEnd?: () => void;
}

/**
 * Página em duas colunas com divisor arrastável (35%–75% pra direita); clique duplo volta ao padrão.
 * No teclado, com o divisor focado, ← e → mexem ~2%.
 */
export function SplitLayout({ left, right, onResizeEnd }: Props) {
  const [sideW, setSideW] = useState(loadSide);
  const pageRef = useRef<HTMLElement>(null);
  const drag = useRef<{ pid: number; x0: number; w0: number; sc: number; moved: boolean } | null>(null);

  /** A raiz que ganha o cursor de arraste (guardada: no desmontar a ref já pode ter sumido). */
  const root = useRef<Element | null>(null);
  const resizing = (on: boolean) => {
    if (on) root.current = pageRef.current?.closest('.pictures') ?? null;
    root.current?.classList.toggle('pc-resizing', on);
  };
  // desmontou no meio do arraste (ex.: a fase mudou): o cursor de arraste não fica preso na mesa
  useEffect(() => () => void root.current?.classList.remove('pc-resizing'), []);

  /** Novo tamanho de uma vez (duplo clique, teclado): guarda e avisa. */
  function setNow(w: number) {
    if (w === sideW) return;
    setSideW(w);
    saveSide(w);
    onResizeEnd?.();
  }
  function key(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation();
    setNow(clampSide(sideW + (e.key === 'ArrowLeft' ? KEY_STEP : -KEY_STEP)));
  }

  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const sc = (pageRef.current?.getBoundingClientRect().width ?? PAGE_W) / PAGE_W || 1;
    drag.current = { pid: e.pointerId, x0: e.clientX, w0: sideW, sc, moved: false };
    resizing(true);
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pid) return;
    // durante o arraste só muda o tamanho (os kits escalam pela folha); ao soltar a bancada é recriada
    const w = clampSide(d.w0 - (e.clientX - d.x0) / d.sc);
    if (w !== sideW) {
      d.moved = true;
      setSideW(w);
    }
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.pid) return;
    drag.current = null;
    resizing(false);
    if (d.moved) {
      saveSide(sideW);
      onResizeEnd?.();
    }
  }

  const style = Object.fromEntries(Object.entries(splitVars(sideW)).map(([k, v]) => [k, `${v.toFixed(2)}px`])) as CSSProperties;
  return (
    <main className="pc-page" ref={pageRef} style={style}>
      <section className="pc-left">{left}</section>
      <div
        className="pc-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="divisor"
        aria-valuenow={pct(sideW)}
        aria-valuemin={pct(SIDE_MIN)}
        aria-valuemax={pct(SIDE_MAX)}
        aria-valuetext={`lado direito com ${pct(sideW)}% da página`}
        tabIndex={0}
        onKeyDown={key}
        title="arraste pra mudar o espaço de trabalho · clique duplo volta ao padrão"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onDoubleClick={() => setNow(SIDE_DEFAULT)}
      >
        <span className="grip">
          <i />
          <i />
          <i />
        </span>
      </div>
      <section className="pc-side">{right}</section>
    </main>
  );
}
