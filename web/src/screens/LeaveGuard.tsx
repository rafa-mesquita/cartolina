import { useEffect, useState } from 'react';

const GUARD = 'cartolinaGuard';

const isGuard = (state: unknown) => typeof state === 'object' && state !== null && GUARD in state;

/**
 * Botão voltar (do celular ou do navegador) com o jogo aberto: em vez de sair da sala sem querer, pergunta.
 * Põe no histórico uma entrada extra com a MESMA URL; o "voltar" consome ela (a tela não muda, nem dispara
 * `hashchange`), a gente devolve a entrada e mostra a pergunta.
 */
export function LeaveGuard({ exitTo }: { exitTo: string }) {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const here = window.location.href;
    // No StrictMode o efeito roda duas vezes: a entrada extra já está lá na segunda.
    if (!isGuard(window.history.state)) window.history.pushState({ [GUARD]: true }, '', here);
    const onPop = (e: PopStateEvent) => {
      // Avançou de volta pra entrada extra, ou foi pra outra URL (o roteador cuida): nada a perguntar.
      if (isGuard(e.state) || window.location.href !== here) return;
      window.history.pushState({ [GUARD]: true }, '', here);
      setAsking(true);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (!asking) return null;
  const stay = () => setAsking(false);
  // `replace`: troca a sala pela página do jogo, sem deixar a sala de novo no "voltar".
  const leave = () => window.location.replace(exitTo);
  return (
    <div className="leave-veil" onClick={stay}>
      <div
        className="leave-box"
        role="alertdialog"
        aria-modal="true"
        aria-label="sair da sala?"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && stay()}
      >
        <h2>sair da sala?</h2>
        <p>Dá pra voltar depois pelo código ou pelo link da sala.</p>
        <div className="leave-actions">
          <button className="btn" type="button" autoFocus onClick={stay}>
            ficar
          </button>
          <button className="sbtn" type="button" onClick={leave}>
            sair
          </button>
        </div>
      </div>
    </div>
  );
}
