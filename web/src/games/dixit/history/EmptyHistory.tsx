import { useState } from 'react';
import { useIsPhone } from '../../../lib/device';
import { goToRoom } from '../../../lib/router';
import { createRoom } from '../../../net/api';
import { TOO_MANY_MESSAGE, isTooMany } from '../../../net/errors';
import { PHONE_TEXT } from '../../../screens/PhoneNotice';

/**
 * Histórico ainda vazio: convida a jogar a primeira partida. Mesmo comportamento do "criar sala" da aba jogar
 * (a `PlayTab` não é extraída para não mexer na aba jogar, que a versão de celular está mudando).
 * No celular o jogo não funciona, então o aviso toma o lugar do botão.
 */
export function EmptyHistory() {
  const phone = useIsPhone();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      goToRoom(await createRoom('dixit'));
    } catch (err) {
      setError(isTooMany(err) ? TOO_MANY_MESSAGE : 'Não deu pra criar a sala. Tenta de novo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dxh-empty">
      <h2>Ainda não tem partida de Diquisti. Bora jogar a primeira!</h2>
      {phone ? (
        <p className="muted">{PHONE_TEXT}</p>
      ) : (
        <button className="dx-btn" type="button" onClick={() => void create()} disabled={busy}>
          {busy ? 'criando…' : 'criar sala'}
        </button>
      )}
      {error && (
        <p className="dxh-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
