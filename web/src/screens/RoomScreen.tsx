import { useCallback, useEffect, useRef, useState } from 'react';
import { goHome } from '../lib/router';
import { getRoomInfo, type RoomInfo } from '../net/api';
import { wsUrl } from '../net/config';
import { RoomConnection, type ConnOptions } from '../net/connection';
import { getToken, joinedProfile, loadProfile, markJoined, saveProfile, type Profile } from '../net/identity';
import { useConnSnapshot } from '../net/useConnSnapshot';
import { Game } from './Game';
import { JoinForm } from './JoinForm';

function connect(code: string, profile: Profile, createSocket?: ConnOptions['createSocket']): RoomConnection {
  return new RoomConnection({ url: wsUrl(code), token: getToken(), name: profile.name, color: profile.color, createSocket });
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

export function RoomScreen({ code, createSocket }: { code: string; createSocket?: ConnOptions['createSocket'] }) {
  const [info, setInfo] = useState<RoomInfo | null | undefined>(undefined);
  const [netError, setNetError] = useState(false);
  const [conn, setConn] = useState<RoomConnection | null>(null);
  const usedProfile = useRef<Profile | null>(null);
  const hasInfo = useRef(false);
  const snap = useConnSnapshot(conn);

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
    if (!info || conn) return;
    const profile = joinedProfile(code);
    if (!profile) return;
    usedProfile.current = profile;
    setConn(connect(code, profile, createSocket));
  }, [info, conn, code, createSocket]);

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
  if (info === null || status === 'gone') {
    return <Message title="sala não encontrada" text="Essa sala não existe ou expirou. Crie uma nova no início." />;
  }
  if (status === 'replaced') {
    return <Message title="você abriu a sala em outra aba" text="Continue jogando na outra aba, ou recarregue esta pra voltar." />;
  }
  if (conn && snap && snap.status !== 'join_failed' && snap.view) {
    return <Game conn={conn} snap={snap} view={snap.view} />;
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
    </main>
  );
}
