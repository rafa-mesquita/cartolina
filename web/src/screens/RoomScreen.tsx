import { useCallback, useEffect, useState } from 'react';
import { goHome } from '../lib/router';
import { getRoomInfo, type RoomInfo } from '../net/api';
import { wsUrl } from '../net/config';
import { RoomConnection } from '../net/connection';
import { getToken, loadProfile, markJoined, saveProfile, wasJoined, type Profile } from '../net/identity';
import { useConnSnapshot } from '../net/useConnSnapshot';
import { Game } from './Game';
import { JoinForm } from './JoinForm';

function connect(code: string, profile: Profile): RoomConnection {
  return new RoomConnection({ url: wsUrl(code), token: getToken(), name: profile.name, color: profile.color });
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <main className="screen">
      <h1 className="logo">
        cartolina<span>~</span>
      </h1>
      <section className="panel">
        <h2>{title}</h2>
        <p>{text}</p>
        <button className="btn" type="button" onClick={goHome}>
          voltar pro início
        </button>
      </section>
    </main>
  );
}

export function RoomScreen({ code }: { code: string }) {
  const [info, setInfo] = useState<RoomInfo | null | undefined>(undefined);
  const [conn, setConn] = useState<RoomConnection | null>(null);
  const snap = useConnSnapshot(conn);

  const refresh = useCallback(() => {
    getRoomInfo(code)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [code]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!conn) return;
    conn.start();
    return () => conn.stop();
  }, [conn]);

  // Recarregou a página numa sala em que esta aba já tinha entrado: entra de novo sozinho.
  useEffect(() => {
    if (!info || conn || !wasJoined(code)) return;
    const profile = loadProfile();
    if (profile) setConn(connect(code, profile));
  }, [info, conn, code]);

  const status = snap?.status;
  useEffect(() => {
    if (status === 'joined') markJoined(code);
    if (status === 'join_failed') refresh();
  }, [status, code, refresh]);

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
    if (conn) conn.retryJoin(profile.name, profile.color);
    else setConn(connect(code, profile));
  };
  const initial = loadProfile();
  const takenColors = info.seats.map((s) => s.color).filter((c) => c !== initial?.color || !wasJoined(code));
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
