// Confere bots e narração com as regras reais, sem navegador, e mede o baralho:
//   node prototipo/cama-leao/sim.cjs
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
for (const f of ['rules.js', 'narrate.js', 'bot.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), { filename: f });
}
const { initialCamelioState, applyCamelioAction, camelioViewFor, camelioActionSchema } = CamaLeao;

function must(res, what) {
  if (!res.ok) throw new Error(`${what} recusado: ${res.error}`);
  return res.state;
}

// Frases exatas da narração (ids do baralho: 22 = vermelho 3, 20 = vermelho 2, 0 = verde 1, 47 = bicolor vermelho 3).
{
  const nomes = { p0: 'você', p1: 'Léo', p2: 'Bia', p3: 'Nina' };
  const nameOf = (p) => nomes[p];
  const casos = [
    [{ by: 'p1', from: 'open', to: 'p2', card: 22, outcome: 'bust' }, 'Léo deu um 3 vermelho pra Bia: Bia estourou!'],
    [{ by: 'p1', from: 'open', to: 'p1', card: 22, outcome: 'bust' }, 'Léo ficou com um 3 vermelho: estourou!'],
    [{ by: 'p0', from: 'deck', to: 'p0', card: 20, outcome: 'scored' }, 'você ficou com o 2 vermelho do monte: fechou o vermelho!'],
    [{ by: 'p0', from: 'open', to: 'p3', card: 0, outcome: 'none' }, 'você deu um 1 verde pra Nina.'],
    [{ by: 'p2', from: 'deck', to: 'p0', card: 47, outcome: 'lost' }, 'Bia deu o 3 vermelho do monte pra você: você perdeu o ponto do vermelho!'],
  ];
  for (const [last, esperado] of casos) {
    const got = narrate(last, nameOf);
    if (got !== esperado) throw new Error(`narração diferente:
  esperado: ${esperado}
  veio:     ${got}`);
  }
  if (narrate(null, nameOf) !== '') throw new Error('narrate(null) devia devolver ""');
  const lobby = camelioViewFor(initialCamelioState(), 'p0');
  if (CamaLeaoBot.choose(lobby, 'p0', ['p0', 'p1'], Math.random) !== null) throw new Error('bot devia devolver null no lobby');
}

const GAMES_PER_N = 40;
const report = [];
for (let n = 2; n <= 6; n++) {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const ctx = { hostId: 'p0', active: ids, rng: Math.random, now: 0 };
  const stats = { target: 0, deck: 0, plays: 0, maxPlays: 0, busts: 0, lost: 0, scored: 0 };
  for (let g = 0; g < GAMES_PER_N; g++) {
    let s = must(applyCamelioAction(initialCamelioState(), 'p0', { type: 'start' }, ctx), 'start');
    let steps = 0;
    while (s.phase === 'playing') {
      const me = s.turn;
      const action = { type: 'play', ...CamaLeaoBot.choose(camelioViewFor(s, me), me, ids, Math.random) };
      const parsed = camelioActionSchema.safeParse(action);
      if (!parsed.success) throw new Error(`bot mandou ação inválida: ${JSON.stringify(action)}`);
      s = must(applyCamelioAction(s, me, parsed.data, ctx), 'play');
      const last = s.log[s.log.length - 1];
      const text = narrate(last, (p) => (p === 'p0' ? 'você' : p));
      if (typeof text !== 'string' || text.length < 10) throw new Error(`narração vazia: ${JSON.stringify(last)}`);
      if (last.outcome === 'bust') stats.busts++;
      if (last.outcome === 'lost') stats.lost++;
      if (last.outcome === 'scored') stats.scored++;
      if (++steps > 200) throw new Error('partida não acaba');
    }
    stats[s.endReason]++;
    stats.plays += steps;
    stats.maxPlays = Math.max(stats.maxPlays, steps);
  }
  report.push(
    `${n} jogadores: ${stats.target} por meta, ${stats.deck} por monte; ` +
      `${(stats.plays / GAMES_PER_N).toFixed(0)} jogadas em média (máx. ${stats.maxPlays}); ` +
      `por partida: ${(stats.scored / GAMES_PER_N).toFixed(1)} fechadas, ${(stats.busts / GAMES_PER_N).toFixed(1)} estouros, ${(stats.lost / GAMES_PER_N).toFixed(1)} pontos perdidos`,
  );
}
console.log(report.join('\n'));
console.log('ok: 200 partidas de bots terminaram sem erro');
