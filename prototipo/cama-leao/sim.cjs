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
