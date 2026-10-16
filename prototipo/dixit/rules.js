// Gerado com esbuild a partir de shared/src/games/dixit (regras reais, só para o protótipo).
var Dixit = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // prototipo/dixit/_entry.ts
  var entry_exports = {};
  __export(entry_exports, {
    DIXIT_DECK_SIZE: () => DIXIT_DECK_SIZE,
    applyDixitAction: () => applyDixitAction,
    dixitOnPresenceChange: () => dixitOnPresenceChange,
    dixitPicksPerPlayer: () => dixitPicksPerPlayer,
    dixitViewFor: () => dixitViewFor,
    initialDixitState: () => initialDixitState
  });

  // shared/src/rng.ts
  function randomInt(rng, maxExclusive) {
    return Math.floor(rng() * maxExclusive);
  }
  function shuffle(rng, items) {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = randomInt(rng, i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // shared/src/games/dixit/deck.ts
  var DIXIT_DECK_SIZE = 95;
  function dixitCardIds(size = DIXIT_DECK_SIZE) {
    return Array.from({ length: size }, (_, i) => `d${String(i + 1).padStart(3, "0")}`);
  }

  // shared/src/games/dixit/scoring.ts
  function scoreRound(input) {
    const gained = Object.fromEntries(input.inRound.map((p) => [p, 0]));
    const add = (player, points) => {
      gained[player] = (gained[player] ?? 0) + points;
    };
    const voters = Object.keys(input.votes);
    const found = voters.filter((v) => input.votes[v] === input.storyCard);
    if (found.length === 0 || found.length === voters.length) {
      for (const v of voters) add(v, 2);
    } else {
      add(input.storyteller, 3);
      for (const v of found) add(v, 3);
    }
    for (const card of Object.values(input.votes)) {
      const owner = input.owners[card];
      if (owner !== void 0 && owner !== input.storyteller) add(owner, 1);
    }
    return { gained, found };
  }

  // shared/src/games/dixit/types.ts
  var DIXIT_MIN_PLAYERS = 3;
  var DIXIT_DEFAULT_TARGET = 30;
  var DIXIT_CLUE_MAX = 80;

  // shared/src/games/dixit/rules.ts
  var fail = (error) => ({ ok: false, error });
  var ok = (state) => ({ ok: true, state });
  var dixitHandSize = (players) => players === 3 ? 7 : 6;
  var dixitPicksPerPlayer = (players) => players === 3 ? 2 : 1;
  var dixitDeckTooSmall = (players, deckSize = DIXIT_DECK_SIZE) => deckSize < players * 7;
  function cleanDixitClue(raw) {
    return Array.from(raw.replace(/\s+/g, " ").trim()).slice(0, DIXIT_CLUE_MAX).join("");
  }
  function initialDixitState(target = DIXIT_DEFAULT_TARGET) {
    return {
      phase: "lobby",
      target,
      players: [],
      inRound: [],
      scores: {},
      storyteller: null,
      deck: [],
      discard: [],
      hands: {},
      clue: "",
      storyCard: null,
      picks: {},
      votes: {},
      confirmed: [],
      table: [],
      result: null,
      winners: [],
      paused: false
    };
  }
  function refill(state, playerIds, size, rng) {
    let deck = [...state.deck];
    let discard = [...state.discard];
    const hands = { ...state.hands };
    let reclaimed = false;
    for (const id of playerIds) {
      const hand = [...hands[id] ?? []];
      while (hand.length < size) {
        if (deck.length === 0) {
          if (discard.length === 0 && !reclaimed) {
            reclaimed = true;
            for (const other of Object.keys(hands)) {
              if (playerIds.includes(other)) continue;
              discard = [...discard, ...hands[other] ?? []];
              hands[other] = [];
            }
          }
          if (discard.length === 0) break;
          deck = shuffle(rng, discard);
          discard = [];
        }
        hand.push(deck.shift());
      }
      hands[id] = hand;
    }
    return { ...state, deck, discard, hands };
  }
  function nextStoryteller(state, active, after) {
    const order = state.players;
    const start = after === null ? 0 : order.indexOf(after) + 1;
    const rotated = [...order.slice(start), ...order.slice(0, start)];
    return rotated.find((p) => state.inRound.includes(p) && active.includes(p)) ?? null;
  }
  function beginRound(state, ctx, storyteller) {
    const joiners = ctx.active.filter((p) => !state.players.includes(p));
    const players = [...state.players, ...joiners];
    const inRound = players.filter((p) => ctx.active.includes(p));
    const scores = { ...state.scores };
    for (const p of joiners) scores[p] = 0;
    const reset = {
      ...state,
      phase: "storytelling",
      players,
      inRound,
      scores,
      clue: "",
      storyCard: null,
      picks: {},
      votes: {},
      confirmed: [],
      table: [],
      result: null,
      paused: inRound.length < DIXIT_MIN_PLAYERS
    };
    const dealt = refill(reset, inRound, dixitHandSize(inRound.length), ctx.rng);
    const chosen = "keep" in storyteller ? storyteller.keep : nextStoryteller(dealt, ctx.active, storyteller.after);
    return { ...dealt, storyteller: chosen };
  }
  function hostOnly(isHost, state, phase) {
    if (!isHost) return "not_host";
    if (state.phase !== phase) return "bad_phase";
    return null;
  }
  function startMatch(state, ctx) {
    if (ctx.active.length < DIXIT_MIN_PLAYERS) return fail("need_3_players");
    if (dixitDeckTooSmall(ctx.active.length)) return fail("deck_too_small");
    const players = [...ctx.active];
    const fresh = {
      ...initialDixitState(state.target),
      players,
      scores: Object.fromEntries(players.map((p) => [p, 0])),
      deck: shuffle(ctx.rng, dixitCardIds())
    };
    const first = players[randomInt(ctx.rng, players.length)];
    return ok(beginRound(fresh, ctx, { keep: first }));
  }
  function mustAct(state, ctx) {
    return state.inRound.filter((p) => p !== state.storyteller && ctx.active.includes(p));
  }
  function actorError(state, playerId, phase) {
    if (state.phase !== phase) return "bad_phase";
    if (state.paused) return "paused";
    if (!state.inRound.includes(playerId)) return "not_player";
    if (playerId === state.storyteller) return "is_storyteller";
    if (state.confirmed.includes(playerId)) return "already_confirmed";
    return null;
  }
  function toVoting(state, ctx) {
    const picks = Object.fromEntries(state.confirmed.map((p) => [p, state.picks[p] ?? []]));
    const played = Object.values(picks).flat();
    const hands = { ...state.hands };
    for (const [p, cards] of Object.entries(picks)) hands[p] = (hands[p] ?? []).filter((c) => !cards.includes(c));
    const table = shuffle(ctx.rng, [state.storyCard, ...played]);
    return { ...state, phase: "voting", picks, hands, table, votes: {}, confirmed: [] };
  }
  function toReveal(state) {
    const storyteller = state.storyteller;
    const storyCard = state.storyCard;
    const votes = {};
    for (const p of state.confirmed) {
      const v = state.votes[p];
      if (v !== void 0) votes[p] = v;
    }
    const owners = { [storyCard]: storyteller };
    for (const [p, cards] of Object.entries(state.picks)) for (const c of cards) owners[c] = p;
    const { gained, found } = scoreRound({ storyteller, storyCard, inRound: state.inRound, owners, votes });
    const scores = { ...state.scores };
    for (const [p, n] of Object.entries(gained)) scores[p] = (scores[p] ?? 0) + n;
    return {
      ...state,
      phase: "reveal",
      scores,
      votes,
      discard: [...state.discard, ...state.table],
      result: { storyteller, storyCard, clue: state.clue, table: state.table, owners, votes, gained, found }
    };
  }
  function maybeAdvance(state, ctx) {
    if (state.paused) return state;
    const need = mustAct(state, ctx);
    if (need.length === 0 || !need.every((p) => state.confirmed.includes(p))) return state;
    if (state.phase === "submitting") return toVoting(state, ctx);
    if (state.phase === "voting") return toReveal(state);
    return state;
  }
  function afterReveal(state, ctx) {
    const top = Math.max(...state.players.map((p) => state.scores[p] ?? 0));
    if (top >= state.target) {
      return { ...state, phase: "gameover", winners: state.players.filter((p) => (state.scores[p] ?? 0) === top) };
    }
    return beginRound(state, ctx, { after: state.storyteller });
  }
  function restartRound(state, ctx) {
    const hands = { ...state.hands };
    const giveBack = (player, cards) => {
      const hand = hands[player] ?? [];
      hands[player] = [...hand, ...cards.filter((c) => !hand.includes(c))];
    };
    if (state.storyteller !== null && state.storyCard !== null) giveBack(state.storyteller, [state.storyCard]);
    if (state.phase === "voting") for (const [p, cards] of Object.entries(state.picks)) giveBack(p, cards);
    return beginRound({ ...state, hands }, ctx, { after: state.storyteller });
  }
  function applyDixitAction(state, playerId, action, ctx) {
    const isHost = ctx.hostId === playerId;
    switch (action.type) {
      case "setTarget": {
        const e = hostOnly(isHost, state, "lobby");
        if (e) return fail(e);
        return ok({ ...state, target: action.target });
      }
      case "start": {
        const e = hostOnly(isHost, state, "lobby");
        if (e) return fail(e);
        return startMatch(state, ctx);
      }
      case "lobby":
        if (!isHost) return fail("not_host");
        if (state.phase === "lobby") return fail("bad_phase");
        return ok(initialDixitState(state.target));
      case "tell": {
        if (state.phase !== "storytelling") return fail("bad_phase");
        if (state.paused) return fail("paused");
        if (playerId !== state.storyteller) return fail("not_storyteller");
        const hand = state.hands[playerId] ?? [];
        if (!hand.includes(action.cardId)) return fail("unknown_card");
        return ok({
          ...state,
          phase: "submitting",
          storyCard: action.cardId,
          clue: cleanDixitClue(action.clue),
          hands: { ...state.hands, [playerId]: hand.filter((c) => c !== action.cardId) },
          picks: {},
          confirmed: []
        });
      }
      case "submit": {
        const e = actorError(state, playerId, "submitting");
        if (e) return fail(e);
        const hand = state.hands[playerId] ?? [];
        const cards = action.cardIds;
        if (cards.length !== dixitPicksPerPlayer(state.inRound.length)) return fail("wrong_count");
        if (new Set(cards).size !== cards.length || !cards.every((c) => hand.includes(c))) return fail("unknown_card");
        return ok({ ...state, picks: { ...state.picks, [playerId]: [...cards] } });
      }
      case "vote": {
        const e = actorError(state, playerId, "voting");
        if (e) return fail(e);
        if (!state.table.includes(action.cardId)) return fail("unknown_card");
        if ((state.picks[playerId] ?? []).includes(action.cardId)) return fail("own_card");
        return ok({ ...state, votes: { ...state.votes, [playerId]: action.cardId } });
      }
      case "confirm": {
        if (state.phase !== "submitting" && state.phase !== "voting") return fail("bad_phase");
        const e = actorError(state, playerId, state.phase);
        if (e) return fail(e);
        const chosen = state.phase === "submitting" ? (state.picks[playerId]?.length ?? 0) > 0 : Object.hasOwn(state.votes, playerId);
        if (!chosen) return fail("nothing_chosen");
        return ok(maybeAdvance({ ...state, confirmed: [...state.confirmed, playerId] }, ctx));
      }
      case "forceNext": {
        if (!isHost) return fail("not_host");
        if (state.paused) {
          if (ctx.active.length < DIXIT_MIN_PLAYERS) return fail("paused");
          return ok(restartRound(state, ctx));
        }
        if (state.phase === "storytelling") return ok(beginRound(state, ctx, { after: state.storyteller }));
        if (state.phase === "submitting") {
          if (state.confirmed.length === 0) return ok(restartRound(state, ctx));
          return ok(toVoting(state, ctx));
        }
        if (state.phase === "voting") return ok(toReveal(state));
        return fail("bad_phase");
      }
      case "next": {
        const e = hostOnly(isHost, state, "reveal");
        if (e) return fail(e);
        return ok(afterReveal(state, ctx));
      }
      case "again": {
        const e = hostOnly(isHost, state, "gameover");
        if (e) return fail(e);
        return startMatch(state, ctx);
      }
      default:
        return fail("bad_action");
    }
  }
  function sameList(a, b) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  function dixitOnPresenceChange(state, ctx) {
    if (state.phase === "storytelling") {
      const st = state.storyteller;
      const keep = st !== null && ctx.active.includes(st);
      const players = [...state.players, ...ctx.active.filter((p) => !state.players.includes(p))];
      const inRound = players.filter((p) => ctx.active.includes(p));
      const storyteller = keep ? st : nextStoryteller({ ...state, players, inRound }, ctx.active, st);
      const paused2 = inRound.length < DIXIT_MIN_PLAYERS;
      if (storyteller === st && paused2 === state.paused && sameList(players, state.players) && sameList(inRound, state.inRound)) {
        return state;
      }
      return beginRound(state, ctx, keep ? { keep: st } : { after: st });
    }
    if (state.phase !== "submitting" && state.phase !== "voting") return state;
    const paused = state.inRound.filter((p) => ctx.active.includes(p)).length < DIXIT_MIN_PLAYERS;
    const next = paused === state.paused ? state : { ...state, paused };
    return paused ? next : maybeAdvance(next, ctx);
  }

  // shared/src/games/dixit/view.ts
  function own(record, key) {
    return key !== null && Object.hasOwn(record, key) ? record[key] : void 0;
  }
  function dixitViewFor(state, viewerId) {
    const revealed = state.phase === "reveal" || state.phase === "gameover";
    const myPicks = own(state.picks, viewerId) ?? [];
    const isStoryteller = viewerId !== null && viewerId === state.storyteller;
    const tableCount = state.phase === "submitting" ? 1 + state.confirmed.reduce((n, p) => n + (own(state.picks, p)?.length ?? 0), 0) : state.table.length;
    return {
      phase: state.phase,
      target: state.target,
      players: state.players,
      inRound: state.inRound,
      scores: state.scores,
      storyteller: state.storyteller,
      clue: state.clue,
      paused: state.paused,
      winners: state.winners,
      result: revealed ? state.result : null,
      hand: own(state.hands, viewerId) ?? [],
      handCounts: Object.fromEntries(Object.entries(state.hands).map(([p, hand]) => [p, hand.length])),
      deckCount: state.deck.length,
      storyCard: revealed || isStoryteller ? state.storyCard : null,
      myPicks,
      myVote: own(state.votes, viewerId) ?? null,
      confirmed: state.confirmed,
      tableCount,
      table: state.table.map((cardId) => ({
        cardId,
        mine: myPicks.includes(cardId) || isStoryteller && cardId === state.storyCard
      }))
    };
  }
  return __toCommonJS(entry_exports);
})();
