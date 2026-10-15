// Fumaça: cria sala, dois jogadores entram, jogam uma rodada livre até a revelação.
// Uso: com `npm run dev:server` rodando, `npm run smoke`.
const BASE = process.env.SERVER_URL ?? 'http://127.0.0.1:8787';
const WS = BASE.replace(/^http/, 'ws');

function client(code, name, color) {
  const ws = new WebSocket(`${WS}/rooms/${code}/ws`);
  const inbox = [];
  const waiters = [];
  ws.addEventListener('message', (e) => {
    if (e.data === 'pong') return;
    inbox.push(JSON.parse(e.data));
    waiters.splice(0).forEach((w) => w());
  });
  const until = async (pred, label) => {
    const deadline = Date.now() + 5000;
    for (;;) {
      const i = inbox.findIndex(pred);
      if (i >= 0) return inbox.splice(i, 1)[0];
      if (Date.now() > deadline) throw new Error(`timeout: ${label}`);
      await new Promise((r) => {
        waiters.push(r);
        setTimeout(r, 100);
      });
    }
  };
  const ready = new Promise((r) => ws.addEventListener('open', r));
  return {
    ws,
    until,
    async join() {
      await ready;
      ws.send(JSON.stringify({ t: 'join', token: crypto.randomUUID(), name, color }));
      return (await until((m) => m.t === 'welcome', 'welcome')).playerId;
    },
    send: (action) => ws.send(JSON.stringify({ t: 'action', action })),
    state: (pred, label) => until((m) => m.t === 'state' && pred(m.room), label).then((m) => m.room),
  };
}

const res = await fetch(`${BASE}/rooms`, { method: 'POST' });
const { code } = await res.json();
console.log('sala', code);
const a = client(code, 'Ana', '#8EC5FF');
const b = client(code, 'Bia', '#FF8FAB');
const ida = await a.join();
const idb = await b.join();
a.send({ type: 'start' });
await a.state((r) => r.game.phase === 'theme', 'theme');
a.send({ type: 'beginRound' });
const ra = await a.state((r) => r.game.phase === 'sorting', 'sorting a');
const rb = await b.state((r) => r.game.phase === 'sorting', 'sorting b');
const ca = Object.values(ra.game.cards).find((c) => c.owner === ida);
const cb = Object.values(rb.game.cards).find((c) => c.owner === idb);
a.send({ type: 'place', cardId: ca.id, index: 0 });
await b.state((r) => r.game.row.length === 1, 'row 1');
b.send({ type: 'place', cardId: cb.id, index: 1 });
await a.state((r) => r.game.row.length === 2, 'row 2');
a.send({ type: 'ready', ready: true });
b.send({ type: 'ready', ready: true });
const done = await a.state((r) => r.game.phase === 'reveal', 'reveal');
console.log('revelação', done.game.reveal.map((e) => e.value).join(' → '), done.game.outcome);
a.ws.close();
b.ws.close();
console.log('ok');
