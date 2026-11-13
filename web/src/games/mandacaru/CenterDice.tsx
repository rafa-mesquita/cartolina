import { DiceFace } from './art';
import { useRollingFaces } from './TopBar';

interface Props {
  /** O resultado de verdade (aparece quando os dados param). */
  dice: [number, number];
  /** Rolando agora (faces sorteadas, caindo e girando). */
  rolling: boolean;
  /** Com animação; falso (movimento reduzido ou aba escondida) = já aparecem parados, sem quique nem sumiço suave. */
  motion: boolean;
}

/**
 * Os dois dados grandes no meio do tabuleiro, junto com os do topo: caem girando com faces sorteadas, param no resultado
 * e somem sozinhos (quem monta e desmonta é a mesa, por `setTimeout`). Camada sem `pointer-events`: não atrapalha clique.
 */
export function CenterDice({ dice, rolling, motion }: Props) {
  const faces = useRollingFaces(rolling, 0);
  const shown = rolling ? faces : dice;
  const fx = !motion ? ' parado' : rolling ? ' rolando' : ' parou';
  return (
    <div className={`mc-dados-centro${fx}`} aria-hidden="true">
      {shown.map((n, i) => (
        <svg key={i} className="mc-dado-g" viewBox="0 0 100 100" data-face={n}>
          <DiceFace n={n} />
        </svg>
      ))}
    </div>
  );
}
