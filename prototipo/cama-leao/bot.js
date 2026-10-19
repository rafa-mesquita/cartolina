'use strict';
/* Bot do protótipo (spec §5.5): fecha 5 se puder, dá carta que estoura o líder, senão fica com carta que não estoura.
   Escolhe { from, to } olhando só a view, como um jogador. Referência pros bots de dev do C3. */
(function () {
  const { CAMELIO_DECK, CAMELIO_EXACT, camelioBack } = CamaLeao;
  const sameBack = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /** Soma da cor na mesa de `to` com a carta, e o que aconteceria. */
  function outcomeOf(view, to, card) {
    const sum = (view.table[to] || []).filter((c) => c.color === card.color).reduce((n, c) => n + c.spheres, 0) + card.spheres;
    const already = (view.scored[to] || []).some((c) => c.color === card.color);
    if (already) return { o: sum >= CAMELIO_EXACT ? 'lost' : 'none', sum };
    return { o: sum === CAMELIO_EXACT ? 'scored' : sum > CAMELIO_EXACT ? 'bust' : 'none', sum };
  }

  /** Quanto vale pro bot `me` a carta `card` cair na mesa de `to`. */
  function value(view, me, to, card) {
    const { o, sum } = outcomeOf(view, to, card);
    const pts = (p) => view.points[p] || 0;
    const top = Math.max(...view.players.map(pts));
    const leader = pts(to) === top && top > 0;
    if (to === me) {
      if (o === 'scored') return pts(me) + 1 >= view.target ? 100 : 10;
      if (o === 'bust') return -6;
      if (o === 'lost') return -12;
      return 1 + sum / CAMELIO_EXACT; // perto de 5 sem passar é bom
    }
    if (o === 'scored') return pts(to) + 1 >= view.target ? -100 : -8;
    if (o === 'bust') return leader ? 7 : 4;
    if (o === 'lost') return leader ? 10 : 7;
    return 0;
  }

  /** Cartas que podem estar atrás do verso do topo (as que estão à vista ficam de fora). */
  function behind(view) {
    const seen = new Set([view.open, ...Object.values(view.table).flat(), ...Object.values(view.scored).flat()].filter(Boolean).map((c) => c.id));
    const options = CAMELIO_DECK.filter((c) => !seen.has(c.id) && sameBack(camelioBack(c), view.top));
    return options.length ? options : CAMELIO_DECK.filter((c) => sameBack(camelioBack(c), view.top));
  }

  /** `active`: quem pode receber carta agora (jogadores da partida que estão online). */
  function choose(view, me, active, rng) {
    const targets = view.players.filter((p) => active.includes(p));
    const deckCards = view.top ? behind(view) : [];
    let best = null;
    for (const to of targets) {
      const plays = [];
      if (view.open) plays.push({ from: 'open', v: value(view, me, to, view.open) });
      if (deckCards.length) plays.push({ from: 'deck', v: deckCards.reduce((n, c) => n + value(view, me, to, c), 0) / deckCards.length });
      for (const p of plays) {
        const score = p.v + rng() * 0.5; // um pouco de sorte pra não jogar sempre igual
        if (!best || score > best.score) best = { from: p.from, to, score };
      }
    }
    return { from: best.from, to: best.to };
  }

  window.CamaLeaoBot = { choose, outcomeOf };
})();
