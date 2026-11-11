import {
  CORDEIS,
  CORDEL_COUNTS,
  LARGEST_ARMY_MIN,
  LONGEST_ROAD_MIN,
  MANDACARU_DISCARD_MS,
  MANDACARU_HAND_LIMIT,
  MANDACARU_PIECES,
  MANDACARU_TURN_MS,
  MANDACARU_WIN_POINTS,
  type Piece,
} from '@cartolina/shared';
import { memo, useEffect, useRef } from 'react';
import { CostIcons } from './Actions';
import { CordelIcon, WOODCUT } from './art';
import { CORDEL_DESC, CORDEL_NAME, PIECE_NAME, POINT_NAMES } from './names';
import { joinE } from './texts';

const PIECES: Piece[] = ['road', 'house', 'city', 'cordel'];

interface Props {
  onClose: () => void;
}

/**
 * A folha de regras (porte do `#regras` do protótipo; resumo da §2 da spec): painel que entra pela direita, com os
 * números vindos do shared (custos, prazos, peças, contagem de cordéis). A partida segue por baixo; fecha no "✕" ou
 * no Esc (a mesa cuida do Esc). Abre com o foco no "fechar".
 */
export const RulesSheet = memo(function RulesSheet({ onClose }: Props) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, []);
  const min = MANDACARU_TURN_MS / 60_000;
  const discardS = MANDACARU_DISCARD_MS / 1000;
  return (
    <aside className="mc-regras" role="dialog" aria-label="regras">
      <button ref={close} type="button" className="mc-x" aria-label="fechar as regras" title="fechar" onClick={onClose}>
        ✕
      </button>
      <h2>regras</h2>
      <p>
        Quem chega a <b>{MANDACARU_WIN_POINTS} pontos na própria vez</b> vence na hora (contando os Pontos escondidos).
      </p>
      <h3>o turno</h3>
      <ul>
        <li>
          Antes dos dados dá pra jogar <b>1 Vaqueiro</b>.
        </li>
        <li>
          <b>Dados:</b> cada terreno com o número (sem o Carcará em cima) rende 1 carta por casa e 2 por vila nos cantos dele.
        </li>
        <li>Se o banco não tem um recurso pra todos que iam receber, ninguém recebe dele (se só um ia receber, leva o que tiver).</li>
        <li>
          Depois, em qualquer ordem: trocar, ir à feira, construir, comprar cordel e jogar <b>1 cordel</b>. Termina com “passar a vez”.
        </li>
        <li>
          Cada turno tem <b>{min} minutos</b>; o relógio fica vermelho no último minuto. Acabou o tempo, a mesa termina a vez sozinha.
        </li>
      </ul>
      <h3>quanto custa</h3>
      {PIECES.map((k) => (
        <div key={k} className="mc-custo">
          <b>{PIECE_NAME[k]}</b>
          <CostIcons piece={k} />
        </div>
      ))}
      <p className="mc-regras-nota">
        Casa: canto livre com os 3 cantos vizinhos vazios, encostado numa estrada sua. Vila: no lugar de uma casa sua. Estrada: encostada numa
        estrada, casa ou vila sua. Peças: {MANDACARU_PIECES.road} estradas, {MANDACARU_PIECES.house} casas, {MANDACARU_PIECES.city} vilas.
      </p>
      <h3>saiu 7: lá vem o Carcará</h3>
      <ul>
        <li>
          Quem tem <b>mais de {MANDACARU_HAND_LIMIT} cartas</b> descarta a metade (pra baixo), em até <b>{discardS} s</b>; sem escolher, é
          sorteado.
        </li>
        <li>Quem rolou leva o Carcará pra outro terreno: ele não produz enquanto o Carcará estiver lá.</li>
        <li>E rouba 1 carta sorteada de alguém com casa ou vila naquele terreno.</li>
      </ul>
      <h3>troca</h3>
      <ul>
        <li>Só na sua vez, depois dos dados: monte “dou X, quero Y” e mande pra mesa.</li>
        <li>
          Os outros respondem <b>aceito</b>, <b>não</b> ou mandam <b>contraproposta</b>. Você fecha com quem quiser.
        </li>
        <li>Na vez dos outros, você pode mandar uma proposta pra quem está jogando.</li>
      </ul>
      <h3>feira</h3>
      <p>
        Troca com o banco: <b>4 por 1</b> sempre; <b>3 por 1</b> com casa ou vila numa feira comum; <b>2 por 1</b> do recurso da feira de 2:1
        onde você está.
      </p>
      <h3>cordéis</h3>
      <p>Comprado agora só pode ser jogado no próximo turno. Um por turno.</p>
      {CORDEIS.map((k) => (
        <div key={k} className="mc-cord">
          <span className="mc-xilo">
            <CordelIcon kind={k} size={30} s={WOODCUT} />
          </span>
          <span>
            <b>
              {CORDEL_NAME[k]}
              {k === 'point' ? ` (${joinE([...POINT_NAMES])})` : ''} ×{CORDEL_COUNTS[k]}:
            </b>{' '}
            {CORDEL_DESC[k]}.
          </span>
        </div>
      ))}
      <h3>pontos</h3>
      <ul>
        <li>
          Casa <b>1</b>, vila <b>2</b>, cordel de Ponto <b>1</b> (escondido até o fim).
        </li>
        <li>
          <b>Maior estrada</b> ({LONGEST_ROAD_MIN} ou mais seguidas, maior que todas): <b>+2</b>. Casa de outro no meio corta a estrada.
        </li>
        <li>
          <b>Maior comitiva</b> ({LARGEST_ARMY_MIN} ou mais Vaqueiros jogados, mais que todos): <b>+2</b>.
        </li>
        <li>Empate: quem já tinha o selo continua com ele.</li>
      </ul>
    </aside>
  );
});
