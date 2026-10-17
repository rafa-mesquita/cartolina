import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameId } from '@cartolina/shared';
import { catalogEntry } from '../games/catalog';
import { useIsPhone } from '../lib/device';
import { gameHash, goHome, goToRoom } from '../lib/router';
import { createRoom, getRoomInfo, type RoomInfo } from '../net/api';
import { TOO_MANY_MESSAGE, isTooMany } from '../net/errors';
import { wsUrl } from '../net/config';
import { RoomConnection, type ConnOptions } from '../net/connection';
import { getToken, joinedProfile, loadProfile, markJoined, saveProfile, type Profile } from '../net/identity';
import { useConnSnapshot } from '../net/useConnSnapshot';
import { Game } from './Game';
import { JoinForm } from './JoinForm';
import { LeaveGuard } from './LeaveGuard';
import { PhoneNotice } from './PhoneNotice';
import { RotateNotice } from './RotateNotice';

function connect(code: string, profile: Profile, createSocket?: ConnOptions['createSocket']): RoomConnection {
  return new RoomConnection({
    url: wsUrl(code),
    token: getToken(),
    name: profile.name,
    color: profile.color,
    createSocket,
    roomExists: () => getRoomInfo(code).then((info) => info !== null),
  });
}

function Message({ title, text, action }: { title: string; text: string; action?: { label: string; onClick(): void } }) {
  return (
    <main className="screen">
      <h1 className="logo">
        cartolina<span>~</span>
      </h1>
      <section className="panel">
        <h2>{title}</h2>
        <p>{text}</p>
        {action && (
          <button className="btn" type="button" onClick={action.onClick}>
            {action.label}
          </button>
        )}
        <button className={action ? 'sbtn' : 'btn'} type="button" onClick={goHome}>
          voltar pro início
        </button>
      </section>
    </main>
  );
}

/** A sala expirou ou fechou: oferece outra do mesmo jogo (ITO quando não deu pra saber o jogo). */
function RoomGone({ game }: { game: GameId }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasHistory = catalogEntry(game)?.hasHistory ?? false;
  async function again() {
    setBusy(true);
    setError(null);
    try {
      goToRoom(await createRoom(game));
    } catch (err) {
      setError(isTooMany(err) ? TOO_MANY_MESSAGE : 'Não deu pra criar a sala. Tenta de novo.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="screen">
      <h1 className="logo">
        cartolina<span>~</span>
      </h1>
      <section className="panel">
        <h2>essa sala acabou</h2>
        <p>Ela expirou ou foi fechada. Bora abrir outra?</p>
        <button className="btn" type="button" disabled={busy} onClick={() => void again()}>
          {busy ? 'criando…' : 'criar sala nova'}
        </button>
        {hasHistory && (
          <a className="sbtn" href={gameHash(game, 'historico')}>
            ver o histórico
          </a>
        )}
        <button className="sbtn" type="button" onClick={goHome}>
          voltar pro início
        </button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

export function RoomScreen({ code, createSocket }: { code: string; createSocket?: ConnOptions['createSocket'] }) {
  const [info, setInfo] = useState<RoomInfo | null | undefined>(undefined);
  const [netError, setNetError] = useState(false);
  const [conn, setConn] = useState<RoomConnection | null>(null);
  const usedProfile = useRef<Profile | null>(null);
  const hasInfo = useRef(false);
  const snap = useConnSnapshot(conn);
  const phone = useIsPhone();
  // Aparelho de toque só entra em jogo com versão de celular (o resto abre no computador).
  const blocked = phone && !!info && !catalogEntry(info.game)?.mobile;

  const refresh = useCallback(() => {
    getRoomInfo(code)
      .then((i) => {
        hasInfo.current = true;
        setNetError(false);
        setInfo(i);
      })
      .catch(() => {
        // falha de rede só vira tela de erro se ainda não sabemos nada da sala
        if (!hasInfo.current) setNetError(true);
      });
  }, [code]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!conn) return;
    conn.start();
    return () => conn.stop();
  }, [conn]);

  // Recarregou a página numa sala em que esta aba já tinha entrado: entra de novo com o perfil DESTA aba.
  useEffect(() => {
    if (!info || conn || blocked) return;
    const profile = joinedProfile(code);
    if (!profile) return;
    usedProfile.current = profile;
    setConn(connect(code, profile, createSocket));
  }, [info, conn, blocked, code, createSocket]);

  const status = snap?.status;
  useEffect(() => {
    if (status === 'joined' && usedProfile.current) markJoined(code, usedProfile.current);
    if (status === 'join_failed') refresh();
  }, [status, code, refresh]);

  if (netError) {
    return (
      <Message
        title="não deu pra falar com o servidor"
        text="Confira se o servidor está ligado e sua conexão com a internet."
        action={{
          label: 'tentar de novo',
          onClick: () => {
            setNetError(false);
            refresh();
          },
        }}
      />
    );
  }
  if (info === undefined) return <Message title="carregando…" text="procurando a sala" />;
  if (status === 'gone') return <RoomGone game={snap?.view?.gameId ?? info?.game ?? 'ito'} />;
  if (info === null) {
    return <Message title="sala não encontrada" text="Essa sala não existe ou expirou. Crie uma nova no início." />;
  }
  if (blocked) return <PhoneNotice />;
  if (status === 'replaced') {
    return <Message title="você abriu a sala em outra aba" text="Continue jogando na outra aba, ou recarregue esta pra voltar." />;
  }
  if (conn && snap && snap.status !== 'join_failed' && snap.view) {
    return (
      <>
        <Game conn={conn} snap={snap} view={snap.view} />
        <RotateNotice />
        <LeaveGuard exitTo={gameHash(snap.view.gameId)} />
      </>
    );
  }

  const busy = !!snap && (snap.status === 'connecting' || snap.status === 'joining');
  const submit = (profile: Profile) => {
    saveProfile(profile);
    usedProfile.current = profile;
    if (conn) conn.retryJoin(profile.name, profile.color);
    else setConn(connect(code, profile, createSocket));
  };
  const mine = joinedProfile(code);
  const initial = mine ?? loadProfile();
  // Só libera a cor desta aba se o assento com ela for o nosso (mesma cor E mesmo nome).
  const takenColors = info.seats.filter((s) => !(mine && s.color === mine.color && s.name === mine.name)).map((s) => s.color);
  return (
    <main className="screen">
      <h1 className="logo">
        cartolina<span>~</span>
      </h1>
      <p className="tagline">sala {code}</p>
      <JoinForm takenColors={takenColors} initial={initial} busy={busy} error={snap?.joinError ?? null} onSubmit={submit} />
      <RotateNotice />
    </main>
  );
}
