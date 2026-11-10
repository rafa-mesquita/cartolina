'use strict';
/* Bots do protótipo do Mandacaru: decidem só pela visão de quem joga (nunca espiam o estado).
   Bot.decide(view, me, rnd) devolve uma ação (MandacaruAction) ou null (nada a fazer agora).
   Usa Manda.geometry() e Manda.pips() (rules.js) pra olhar o tabuleiro. */
(function () {
  const RES = ['wood', 'brick', 'leather', 'beans', 'stone'];
  const COSTS = {
    road: { wood: 1, brick: 1, leather: 0, beans: 0, stone: 0 },
    house: { wood: 1, brick: 1, leather: 1, beans: 1, stone: 0 },
    city: { wood: 0, brick: 0, leather: 0, beans: 2, stone: 3 },
    cordel: { wood: 0, brick: 0, leather: 1, beans: 1, stone: 1 },
  };
  const TERRAIN_RES = { forest: 'wood', hills: 'brick', pasture: 'leather', fields: 'beans', mountains: 'stone', desert: null };
  const none = () => ({ wood: 0, brick: 0, leather: 0, beans: 0, stone: 0 });

  const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
  /** Os que empatam na maior nota, e um deles sorteado. */
  function best(list, score, rnd) {
    if (list.length === 0) return undefined;
    const scores = list.map(score);
    const top = Math.max(...scores);
    return pick(list.filter((_, i) => scores[i] === top), rnd);
  }
  const seatOf = (view, id) => view.seats.find((s) => s.id === id);
  const numberOf = (view, h) => view.layout.hexes[h].number;

  /** Soma das chances dos terrenos em volta de um canto (+1 por recurso diferente). */
  function cornerValue(view, v) {
    const g = Manda.geometry();
    const kinds = new Set();
    let n = 0;
    for (const h of g.vertices[v].hexes) {
      const tile = view.layout.hexes[h];
      n += Manda.pips(tile.number);
      const r = TERRAIN_RES[tile.terrain];
      if (r) kinds.add(r);
    }
    return n + kinds.size;
  }

  /** Cantos livres pela regra da distância (sem olhar estrada). */
  function freeCorners(view) {
    const g = Manda.geometry();
    const out = [];
    g.vertices.forEach((v, i) => {
      if (view.buildings[i]) return;
      if (v.neighbors.some((n) => view.buildings[n])) return;
      out.push(i);
    });
    return out;
  }
  /** Onde `me` poria casa agora (canto livre encostado numa estrada sua). */
  function houseSpots(view, me) {
    const g = Manda.geometry();
    return freeCorners(view).filter((i) => g.vertices[i].edges.some((e) => view.roads[e] === me));
  }
  /** Estradas possíveis (mesma regra de roadSpots das regras, sem o custo). */
  function roadSpots(view, me) {
    const g = Manda.geometry();
    const out = [];
    g.edges.forEach((e, i) => {
      if (view.roads[i] !== null) return;
      const linked = [e.a, e.b].some((v) => {
        const b = view.buildings[v];
        if (b && b.owner === me) return true;
        if (b) return false;
        return g.vertices[v].edges.some((x) => x !== i && view.roads[x] === me);
      });
      if (linked) out.push(i);
    });
    return out;
  }
  const myHouses = (view, me) => view.buildings.map((b, i) => (b && b.owner === me && b.kind === 'house' ? i : -1)).filter((i) => i >= 0);

  /** A meta: a primeira construção possível na ordem vila › casa › cordel › estrada. */
  function goalOf(view, me) {
    const left = seatOf(view, me).piecesLeft;
    if (left.city > 0 && myHouses(view, me).length > 0) return 'city';
    if (left.house > 0 && houseSpots(view, me).length > 0) return 'house';
    if (view.deckSize > 0) return 'cordel';
    if (left.road > 0 && roadSpots(view, me).length > 0) return 'road';
    return null;
  }
  /** O que falta da mão pra pagar `piece`. */
  function missing(have, piece) {
    const out = none();
    if (!piece) return out;
    for (const r of RES) out[r] = Math.max(0, COSTS[piece][r] - have[r]);
    return out;
  }
  const total = (res) => RES.reduce((n, r) => n + res[r], 0);
  /** O que guardar: o maior custo entre vila e casa (as que ainda dá pra fazer). */
  function keepFor(view, me) {
    const keep = none();
    const left = seatOf(view, me).piecesLeft;
    const pieces = [];
    if (left.city > 0 && myHouses(view, me).length > 0) pieces.push('city');
    if (left.house > 0 && houseSpots(view, me).length > 0) pieces.push('house');
    if (pieces.length === 0) pieces.push('cordel');
    for (const p of pieces) for (const r of RES) keep[r] = Math.max(keep[r], COSTS[p][r]);
    return keep;
  }

  /** Estrada que chega mais perto de um canto livre (busca em largura pelos cantos). */
  function roadTowardFree(view, edges, rnd) {
    const g = Manda.geometry();
    const dist = new Array(g.vertices.length).fill(Infinity);
    const queue = [];
    for (const v of freeCorners(view)) { dist[v] = 0; queue.push(v); }
    for (let i = 0; i < queue.length; i++) {
      const v = queue[i];
      for (const n of g.vertices[v].neighbors) {
        if (dist[n] !== Infinity) continue;
        if (view.buildings[n]) continue;
        dist[n] = dist[v] + 1;
        queue.push(n);
      }
    }
    return best(edges, (e) => -Math.min(dist[g.edges[e].a], dist[g.edges[e].b]), rnd);
  }

  /** Terreno pro Carcará: mais chance × prédios dos outros (o líder pesa o dobro), nenhum meu. */
  function carcaraHex(view, me, rnd) {
    const g = Manda.geometry();
    const leader = Math.max(...view.seats.filter((s) => s.id !== me).map((s) => s.points));
    const score = (h) => {
      let n = 0;
      for (const v of g.hexes[h].corners) {
        const b = view.buildings[v];
        if (!b) continue;
        if (b.owner === me) return -1;
        const w = b.kind === 'city' ? 2 : 1;
        n += w * (seatOf(view, b.owner).points === leader ? 2 : 1);
      }
      return n * (Manda.pips(numberOf(view, h)) + 0.5);
    };
    return best(view.can.carcara, score, rnd);
  }

  /** O Carcará está num terreno encostado num prédio meu? */
  function carcaraOnMe(view, me) {
    const g = Manda.geometry();
    return g.hexes[view.carcara].corners.some((v) => view.buildings[v] && view.buildings[v].owner === me);
  }

  /** Descarta primeiro dos recursos de que tem mais. */
  function chooseDiscard(have, count) {
    const left = { ...have };
    const out = none();
    for (let i = 0; i < count; i++) {
      const r = RES.reduce((a, b) => (left[b] > left[a] ? b : a));
      left[r]--;
      out[r]++;
    }
    return out;
  }

  /** Memória curta por bot: oferta já tentada neste turno, trocas na feira, quanto esperou a oferta. */
  const memo = new Map();
  /** Uma chave que muda a cada turno: partida + quantas vezes já rolaram os dados. */
  const turnKey = (view, me) => `${me}:${view.match}:${view.diceCounts.reduce((a, b) => a + b, 0)}`;
  function turnMemo(view, me) {
    const k = turnKey(view, me);
    let m = memo.get(me);
    if (!m || m.key !== k) { m = { key: k, offered: false, feiras: 0, offerWaits: 0 }; memo.set(me, m); }
    return m;
  }

  /** Fora da vez: responde a oferta aberta uma vez. */
  function respondTo(view, me) {
    const o = view.offer;
    if (!o || o.accepted.includes(me) || o.rejected.includes(me)) return null;
    const have = view.myRes;
    const need = missing(have, goalOf(view, me));
    const has = RES.every((r) => have[r] >= o.want[r]);
    const helps = RES.some((r) => o.give[r] > 0 && need[r] > 0);
    const hurts = RES.some((r) => o.want[r] > 0 && have[r] - o.want[r] < COSTS[goalOf(view, me) || 'road'][r]);
    return { type: 'respond', offerId: o.id, accept: has && helps && !hurts };
  }

  /** Recursos pra Chuva: os 2 que mais faltam pra meta (que o banco tem). */
  function chuvaPick(view, need) {
    const out = [];
    const want = { ...need };
    const bank = { ...view.bank };
    for (let i = 0; i < 2; i++) {
      let r = RES.filter((x) => bank[x] > 0).reduce((a, b) => (a === null || want[b] > want[a] ? b : a), null);
      if (r === null) return null;
      if (want[r] <= 0) {
        // nada falta: o que tem menos na mão
        r = RES.filter((x) => bank[x] > 0).reduce((a, b) => (view.myRes[b] + out.filter((y) => y === b).length < view.myRes[a] + out.filter((y) => y === a).length ? b : a));
      }
      out.push(r);
      want[r]--;
      bank[r]--;
    }
    return out;
  }

  function mainPhase(view, me, rnd) {
    const can = view.can;
    const have = view.myRes;
    const m = turnMemo(view, me);

    // Oferta minha aberta: fecha com quem aceitou; sem resposta boa, desiste depois de um tempo.
    if (view.offer) {
      const o = view.offer;
      if (o.accepted.length) return { type: 'close_deal', with: o.accepted[0], source: 'offer', id: o.id };
      m.offerWaits++;
      const others = view.players.length - 1;
      if (o.rejected.length >= others || m.offerWaits > 3) return { type: 'cancel_offer' };
      return null;
    }

    if (can.buildCity.length) return { type: 'build_city', vertex: best(can.buildCity, (v) => cornerValue(view, v), rnd) };
    if (can.buildHouse.length) return { type: 'build_house', vertex: best(can.buildHouse, (v) => cornerValue(view, v), rnd) };
    const goal = goalOf(view, me);
    if (can.buyCordel && (goal !== 'city' || rnd() < 0.3)) return { type: 'buy_cordel' };
    if (can.buildRoad.length && houseSpots(view, me).length === 0) return { type: 'build_road', edge: roadTowardFree(view, can.buildRoad, rnd) };

    const need = missing(have, goal);
    if (can.play.length) {
      if (can.play.includes('chuva') && total(need) > 0) {
        const rs = chuvaPick(view, need);
        if (rs) return { type: 'play_chuva', resources: rs };
      }
      if (can.play.includes('atravessador') && total(need) > 0) {
        const r = RES.reduce((a, b) => (need[b] > need[a] ? b : a));
        return { type: 'play_atravessador', resource: r };
      }
      if (can.play.includes('mutirao') && seatOf(view, me).piecesLeft.road > 0 && roadSpots(view, me).length > 0) return { type: 'play_mutirao' };
      if (can.play.includes('vaqueiro') && (carcaraOnMe(view, me) || rnd() < 0.5)) return { type: 'play_vaqueiro' };
    }

    // Feira: dá o que sobra na taxa pelo que falta.
    if (m.feiras < 3 && total(need) > 0) {
      const keep = keepFor(view, me);
      const give = RES.find((r) => can.feira[r] && have[r] - keep[r] >= can.feira[r]);
      const want = RES.filter((r) => need[r] > 0 && view.bank[r] > 0).sort((a, b) => need[b] - need[a])[0];
      if (give && want && give !== want) {
        m.feiras++;
        return { type: 'feira', give, want, count: 1 };
      }
    }

    // Às vezes, uma oferta pra mesa: 1 do que mais tem por 1 do que falta.
    if (!m.offered && can.offer) {
      m.offered = true;
      if (rnd() < 0.2 && total(need) > 0) {
        const keep = keepFor(view, me);
        const give = RES.filter((r) => have[r] - keep[r] > 0 && need[r] === 0).sort((a, b) => have[b] - have[a])[0];
        const want = RES.filter((r) => need[r] > 0).sort((a, b) => need[b] - need[a])[0];
        if (give && want) {
          const g = none();
          const w = none();
          g[give] = 1;
          w[want] = 1;
          m.offerWaits = 0;
          return { type: 'offer', give: g, want: w };
        }
      }
    }

    return can.endTurn ? { type: 'end_turn' } : null;
  }

  function decide(view, me, rnd) {
    if (view.phase === 'lobby' || view.phase === 'over' || !view.myRes) return null;
    const can = view.can;
    if (can.discard > 0) return { type: 'discard', cards: chooseDiscard(view.myRes, can.discard) };
    if (view.turn !== me) return can.respond ? respondTo(view, me) : null;

    if (can.placeHouse.length) return { type: 'place_house', vertex: best(can.placeHouse, (v) => cornerValue(view, v), rnd) };
    if (can.placeRoad.length) return { type: 'place_road', edge: pick(can.placeRoad, rnd) };
    if (can.roll) {
      if (can.play.includes('vaqueiro') && carcaraOnMe(view, me)) return { type: 'play_vaqueiro' };
      return { type: 'roll' };
    }
    if (can.carcara.length) return { type: 'move_carcara', hex: carcaraHex(view, me, rnd) };
    if (can.steal.length) return { type: 'steal', from: best(can.steal, (p) => seatOf(view, p).resCount, rnd) };
    if (view.phase === 'mutirao') {
      return can.buildRoad.length ? { type: 'build_road', edge: roadTowardFree(view, can.buildRoad, rnd) } : null;
    }
    if (view.phase === 'main') return mainPhase(view, me, rnd);
    return null;
  }

  window.Bot = { decide, chooseDiscard, goalOf, missing };
})();
