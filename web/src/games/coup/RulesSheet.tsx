import { memo, useEffect, useRef } from 'react';
import { characterArtUrl } from './art';
import { ACTION_ROWS, CHARACTER_INFO, HOW_IT_WORKS } from './rules';

interface Props {
  /** Celular: folha que sobe de baixo (modal, com fundo escurecido); no computador, painel à direita (a partida segue). */
  phone: boolean;
  onClose: () => void;
}

/**
 * A colinha do botão "regras": objetivo, a tabela das 7 ações, os 5 personagens (arte, o que fazem na sua vez e o que
 * bloqueiam) e "como funciona". Texto todo de `rules.ts` (gerado das tabelas do jogo). Abre com o foco no "fechar".
 */
export const RulesSheet = memo(function RulesSheet({ phone, onClose }: Props) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
  }, []);
  return (
    <aside
      className={`cp-rulesheet${phone ? ' sheet' : ''}`}
      role="dialog"
      aria-modal={phone ? true : undefined}
      aria-label="regras"
    >
      <div className="cp-rules-head">
        <h2>regras</h2>
        <button ref={close} type="button" className="cp-close" onClick={onClose}>
          fechar<span aria-hidden="true"> ✕</span>
        </button>
      </div>
      <div className="cp-rules-body">
        <p className="cp-goal">{HOW_IT_WORKS.goal}</p>
        <h3>ações</h3>
        <table className="cp-acttable">
          <thead>
            <tr>
              <th scope="col">ação</th>
              <th scope="col">diz ser</th>
              <th scope="col">efeito</th>
              <th scope="col">quem bloqueia</th>
            </tr>
          </thead>
          <tbody>
            {ACTION_ROWS.map((r) => (
              <tr key={r.kind}>
                <th scope="row">{r.name}</th>
                <td className={r.claim === '—' ? 'none' : 'char'}>{r.claim}</td>
                <td>{r.effect}</td>
                <td className={r.blockedBy === 'ninguém' ? 'none' : 'char'}>{r.blockedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>personagens</h3>
        <ul className="cp-chars">
          {CHARACTER_INFO.map((i) => (
            <li key={i.character}>
              <span className="cp-card face cp-charart">
                <img className="cp-art" src={characterArtUrl(i.character)} alt={i.name} draggable={false} decoding="async" />
              </span>
              <div>
                <strong>{i.name}</strong>
                <p>
                  <span>na sua vez</span> {i.onTurn}
                </p>
                <p>
                  <span>bloqueia</span> {i.blocks}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <h3>como funciona</h3>
        <ul className="cp-how">
          {HOW_IT_WORKS.items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </aside>
  );
});
