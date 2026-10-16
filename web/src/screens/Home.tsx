import { GROUP_NAME_MAX, cleanGroupName } from '@cartolina/shared';
import { useState, type FormEvent } from 'react';
import { goToGroup, goToRoom } from '../lib/router';
import { createGroup, createRoom } from '../net/api';
import { TOO_MANY_MESSAGE, isTooMany } from '../net/errors';
import { loadGroups, rememberGroup } from '../net/identity';

export function Home() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [groups] = useState(loadGroups);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      goToRoom(await createRoom());
    } catch (err) {
      setError(isTooMany(err) ? TOO_MANY_MESSAGE : 'Não deu pra criar a sala. O servidor tá ligado?');
    } finally {
      setBusy(false);
    }
  }

  function enter(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(c)) goToRoom(c);
    else setError('O código da sala tem 4 letras.');
  }

  async function newGroup(e: FormEvent) {
    e.preventDefault();
    const name = cleanGroupName(groupName);
    if (!name) {
      setGroupError(`Dá um nome pro grupo (até ${GROUP_NAME_MAX} letras).`);
      return;
    }
    setGroupBusy(true);
    setGroupError(null);
    try {
      const group = await createGroup(name);
      rememberGroup(group);
      goToGroup(group.slug);
    } catch (err) {
      // 400: o servidor recusou o nome (ex.: só símbolos); 429: pedidos demais; o resto é falha de rede/servidor
      const rejected = err instanceof Error && err.message.endsWith('_400');
      setGroupError(rejected ? 'Nome inválido.' : isTooMany(err) ? TOO_MANY_MESSAGE : 'Não deu pra criar o grupo. O servidor tá ligado?');
    } finally {
      setGroupBusy(false);
    }
  }

  return (
    <main className="screen">
      <h1 className="logo big">
        cartolina<span>~</span>
      </h1>
      <p className="tagline">jogos de tabuleiro pra jogar com a galera na call</p>
      <section className="panel">
        <h2>ITO</h2>
        <p>Cada um recebe um número secreto de 1 a 100. Sem dizer o número, use o tema pra dar dicas e coloquem as cartas em ordem juntos.</p>
        <button className="btn" onClick={create} disabled={busy}>
          {busy ? 'criando…' : 'criar sala'}
        </button>
        <form className="row-inline" onSubmit={enter}>
          <input
            className="text-in"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="KXQ7"
            maxLength={4}
            aria-label="código da sala"
          />
          <button className="sbtn solid" type="submit">
            entrar na sala
          </button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      <section className="panel">
        <h2>grupos</h2>
        <p>Um grupo guarda o histórico das partidas da galera: quem jogou, as dicas de cada um e os resultados.</p>
        {groups.length > 0 && (
          <ul className="group-list">
            {groups.map((g) => (
              <li key={g.slug}>
                <a href={`#/g/${g.slug}`}>{g.name}</a>
              </li>
            ))}
          </ul>
        )}
        <form className="row-inline" onSubmit={newGroup}>
          <input
            className="text-in"
            aria-label="nome do grupo"
            placeholder="Galera da call"
            value={groupName}
            maxLength={GROUP_NAME_MAX * 2}
            onChange={(e) => setGroupName(e.target.value)}
          />
          <button className="sbtn solid" type="submit" disabled={groupBusy}>
            {groupBusy ? 'criando…' : 'criar grupo'}
          </button>
        </form>
        {groupError && (
          <p className="error" role="alert">
            {groupError}
          </p>
        )}
      </section>
    </main>
  );
}
