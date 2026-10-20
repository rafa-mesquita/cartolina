'use strict';
/* Bots do protótipo do Cúpi: decidem só pela visão de quem joga (nunca espiam o estado).
   Bot.decide(view, me, rnd) devolve uma ação (CoupAction) ou null. BLUFF e DOUBT são ajustáveis pelo painel de dev. */
(function () {
  const PREF = ['duke', 'captain', 'assassin', 'contessa', 'ambassador'];

  const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
  const count = (arr, x) => arr.filter((y) => y === x).length;
  const seatOf = (view, id) => view.seats.find((s) => s.id === id);
  /** Os candidatos que empatam na maior nota (o sorteio desempata em quem chama). */
  function best(list, score) {
    const top = Math.max(...list.map(score));
    return list.filter((x) => score(x) === top);
  }

  /** Perde a carta da qual tem mais cópias; empate, ao acaso. */
  function chooseLoss(view, rnd) {
    const mine = view.myCards;
    const most = best([...new Set(mine)], (c) => count(mine, c));
    return { type: 'lose', card: pick(most, rnd) };
  }

  /** Fica com as melhores, na ordem de preferência. */
  function chooseExchange(view) {
    const pool = [...view.myCards, ...view.myDrawn];
    pool.sort((a, b) => PREF.indexOf(a) - PREF.indexOf(b));
    return { type: 'exchange', keep: pool.slice(0, view.can.keep) };
  }

  /** Extorquir: quem tem mais moedas. Golpe e assassinato: mais cartas viradas pra baixo, depois mais moedas. */
  function chooseTarget(view, kind, rnd) {
    const seats = view.can.targets.map((id) => seatOf(view, id)).filter(Boolean);
    if (seats.length === 0) return null;
    const score = kind === 'steal' ? (s) => s.coins : (s) => s.hidden * 100 + s.coins;
    return pick(best(seats, score), rnd).id;
  }

  function chooseAct(view, rnd) {
    const can = view.can;
    const hasTargets = can.targets.length > 0;
    const usable = can.act.filter((k) => !Cupi.COUP_TARGETED[k] || hasTargets);
    if (usable.length === 0) return null;
    const targeted = (kind) => ({ type: 'act', kind, target: chooseTarget(view, kind, rnd) });
    if (usable.length === 1 && usable[0] === 'coup') return targeted('coup');
    if (usable.includes('coup') && rnd() < 0.7) return targeted('coup');
    // honestas (sem personagem, ou com personagem que tem na mão) pesam 3; blefes pesam BLUFF
    const weighted = usable.map((kind) => {
      const claim = Cupi.COUP_CLAIM[kind];
      const honest = claim === null || view.myCards.includes(claim);
      return { kind, w: honest ? 3 : api.BLUFF };
    });
    let roll = rnd() * weighted.reduce((s, x) => s + x.w, 0);
    let chosen = weighted[weighted.length - 1].kind;
    for (const x of weighted) { roll -= x.w; if (roll < 0) { chosen = x.kind; break; } }
    return Cupi.COUP_TARGETED[chosen] ? targeted(chosen) : { type: 'act', kind: chosen };
  }

  function chooseReaction(view, me, rnd) {
    const can = view.can, w = view.window, d = view.declared;
    const windowId = w.id;
    if (can.block.length) {
      const owned = can.block.find((c) => view.myCards.includes(c));
      if (owned) return { type: 'block', as: owned, windowId };
      const chance = d && d.target === me ? 0.25 : (d && d.kind === 'foreignAid' ? 0.1 : 0);
      if (rnd() < chance) return { type: 'block', as: pick(can.block, rnd), windowId };
    }
    if (can.challenge) {
      const claim = w.kind === 'block' ? view.block.as : Cupi.COUP_CLAIM[d.kind];
      let p = api.DOUBT;
      if (count(view.myCards, claim) >= 2) p *= 3;
      if (w.kind === 'action' && d.target === me && d.kind === 'assassinate' && view.myCards.length === 1) p *= 2;
      if (rnd() < Math.min(p, 0.95)) return { type: 'challenge', windowId };
    }
    return { type: 'pass', windowId };
  }

  function decide(view, me, rnd) {
    const can = view.can;
    if (can.lose) return chooseLoss(view, rnd);
    if (can.keep > 0) return chooseExchange(view);
    if (can.act.length) return chooseAct(view, rnd);
    if (can.pass) return chooseReaction(view, me, rnd);
    return null;
  }

  const api = { decide, BLUFF: 0.6, DOUBT: 0.15 };
  window.Bot = api;
})();
