import { goHome } from '../lib/router';

export const PHONE_TEXT = 'o cartolina por enquanto é pra jogar no computador 💻';

/** Sala aberta no celular: o jogo ainda não funciona com toque/tela pequena. */
export function PhoneNotice() {
  return (
    <main className="screen">
      <h1 className="logo">
        cartolina<span>~</span>
      </h1>
      <section className="panel">
        <h2>abre no computador</h2>
        <p>{PHONE_TEXT}</p>
        <p>Manda o link pra você mesmo e abre no PC. O histórico do grupo funciona no celular.</p>
        <button className="btn" type="button" onClick={goHome}>
          voltar pro início
        </button>
      </section>
    </main>
  );
}
