'use strict';
/*
 * Bots do protótipo: decidem pela visão deles (sem trapaça) e devolvem { action, delay } ou null.
 * Não são espertos de propósito: jogam umas cartas, às vezes dão Nem vem! e sempre terminam comprando.
 */
(function () {
  const kind = (id) => Tatubum.kittensKindOf(id);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const between = (a, b) => a + Math.random() * (b - a);
  const BICHOS = ['capivara', 'mico', 'quati', 'tamandua', 'preguica'];

  /** Quem recebe a vez depois de `from` (pra saber se um Ataque no ar é contra mim). */
  function nextAlive(v, from) {
    const i = v.players.indexOf(from);
    for (let k = 1; k <= v.players.length; k++) {
      const p = v.players[(i + k) % v.players.length];
      if (p !== from && v.alive.includes(p)) return p;
    }
    return null;
  }

  function targets(v, me) {
    return v.alive.filter((p) => p !== me && (v.handCounts[p] ?? 0) > 0);
  }

  /** Uma jogada possível com a mão (ou null). */
  function choosePlay(v, me, hand, mem) {
    const byKind = {};
    for (const c of hand) (byKind[kind(c)] ??= []).push(c);
    const has = (k) => byKind[k]?.[0];
    const tgs = targets(v, me);
    const top = v.peek?.[0] ? kind(v.peek[0]) : null;
    // Espiou e o de cima é tatu: foge.
    if (top === 'tatubum') {
      for (const k of ['ataque', 'pular', 'embaralhar']) if (has(k)) return { cards: [has(k)] };
      if ((byKind.quati?.length ?? 0) >= 2) return { cards: byKind.quati.slice(0, 2) };
    }
    if (v.owed >= 2 && has('ataque') && Math.random() < 0.8) return { cards: [has('ataque')] };
    if (mem.playedThisTurn >= 2 || Math.random() > 0.5) return null;
    const options = [];
    if (has('espiar') && !v.peek) options.push({ cards: [has('espiar')] });
    if (has('embaralhar') && Math.random() < 0.4) options.push({ cards: [has('embaralhar')] });
    if (has('ataque') && Math.random() < 0.5) options.push({ cards: [has('ataque')] });
    if (has('pular') && Math.random() < 0.25) options.push({ cards: [has('pular')] });
    if (has('favor') && tgs.length) options.push({ cards: [has('favor')], target: pick(tgs) });
    for (const b of BICHOS) {
      const list = byKind[b] ?? [];
      if (list.length < 2) continue;
      const pair = list.slice(0, 2);
      if (b === 'mico') { if (tgs.length) options.push({ cards: pair, target: pick(tgs) }); }
      else if (b === 'preguica') options.push({ cards: pair, ask: pick(BICHOS) });
      else options.push({ cards: pair });
    }
    // Trio de qualquer carta: rouba um Desarme.
    for (const list of Object.values(byKind)) if (list.length >= 3 && Math.random() < 0.5) options.push({ cards: list.slice(0, 3) });
    const distinct = BICHOS.filter((b) => byKind[b]?.length);
    if (distinct.length === 5 && v.discard.length && Math.random() < 0.5) options.push({ cards: distinct.map((b) => byKind[b][0]) });
    return options.length ? pick(options) : null;
  }

  window.Bots = {
    /**
     * O que o bot `me` faz agora, olhando a visão `v`. `mem` é a memória do bot (ele mesmo guarda o que já decidiu).
     */
    decide(v, me, mem) {
      if (v.phase !== 'playing' || !v.alive.includes(me)) return null;
      const hand = v.hand;

      if (v.choice && v.choice.who === me) {
        const c = v.choice;
        if (c.kind === 'cafune') {
          // Às vezes deixa o tatu bem em cima pro próximo.
          const position = Math.random() < 0.35 ? 0 : Math.floor(Math.random() * (v.drawCount + 1));
          return { action: { type: 'choose', position }, delay: between(1100, 2200) };
        }
        if (c.kind === 'favor') {
          const cheap = hand.filter((x) => BICHOS.includes(kind(x)));
          return { action: { type: 'choose', card: pick(cheap.length ? cheap : hand) }, delay: between(1000, 2000) };
        }
        if (c.kind === 'quati') {
          // Fica, a não ser que a de cima seja Tatubum: aí vai pro fundo.
          const keep = !c.card || kind(c.card) !== 'tatubum';
          return { action: { type: 'choose', keep }, delay: between(900, 1600) };
        }
        const pref = ['cafune', 'nemvem', 'ataque', 'pular', 'espiar'];
        const best = pref.map((k) => c.options.find((x) => kind(x) === k)).find(Boolean) ?? pick(c.options);
        return { action: { type: 'choose', card: best }, delay: between(900, 1600) };
      }
      if (v.choice) return null;

      if (v.pending) {
        const p = v.pending;
        const key = `${p.by}:${p.play.cards.join(',')}:${p.nopes.length}`;
        if (mem.noped === key) return null;
        mem.noped = key;
        const nope = hand.find((x) => kind(x) === 'nemvem');
        if (!nope) return null;
        const valendo = p.nopes.length % 2 === 0;
        const contraMim = p.play.target === me || (p.play.kind === 'ataque' && nextAlive(v, p.by) === me);
        // Sem motivo, a mesa inteira junta dá Nem vem! em ~30% das jogadas (com 7 bots, não em quase todas).
        let chance = 0.3 / Math.max(1, v.alive.length - 2);
        if (valendo && contraMim) chance = 0.7;
        if (!valendo && p.by === me) chance = 0.55;
        if (Math.random() > chance) return null;
        return { action: { type: 'nope' }, delay: between(800, 3400) };
      }

      if (v.current !== me) return null;
      const turnKey = `${v.drawCount}:${v.owed}`;
      if (mem.turnKey !== turnKey) {
        mem.turnKey = turnKey;
        mem.playedThisTurn = 0;
      }
      const play = choosePlay(v, me, hand, mem);
      if (play) {
        mem.playedThisTurn += 1;
        return { action: { type: 'play', ...play }, delay: between(1000, 1900) };
      }
      return { action: { type: 'draw' }, delay: between(900, 1700) };
    },
  };
})();
