import { randomInt, type Rng } from '../../rng';
import { kittensKindOf } from './cards';
import { clearPeeks, counted, cure, eliminate, logged, spendTurn, unpeek } from './turn';
import { KITTENS_CHOICE_MS, type KittensChoice, type KittensState } from './types';

type Choice<K extends KittensChoice['kind']> = Extract<KittensChoice, { kind: K }>;

const isKind = (k: string) => (c: string) => kittensKindOf(c) === k;

/**
 * `p` pega `card`, que acabou de sair do monte (`draw` = o monte sem ela): é "comprar" (cura o Mau-olhado). Tatubum: com
 * Desarme, abre a escolha de jogá-lo (prazo `deadline`; a carta fica na mão até lá); sem, explode. Outra carta: vai pra
 * mão (só `p` vê qual) e gasta 1 turno. Usado pela compra normal e pelo Feitiço. A carta sai das espiadas (o resto do
 * monte não mudou de ordem: o que sobra de cada espiada continua sendo o topo).
 */
export function takeCard(s: KittensState, p: string, card: string, draw: string[], deadline: number): KittensState {
  const base = cure(unpeek({ ...s, draw }, [card]), p);
  const hand = base.hands[p]!;
  if (kittensKindOf(card) !== 'tatubum') {
    return spendTurn(logged({ ...base, hands: { ...base.hands, [p]: [...hand, card] } }, { t: 'draw', by: p, card }, [p]));
  }
  if (!hand.some(isKind('cafune'))) return eliminate(logged(base, { t: 'boom', by: p }), p, 'boom', [card]);
  return logged({ ...base, choice: { kind: 'tatu', who: p, tatu: card, deadline } }, { t: 'tatu', by: p });
}

/**
 * Cafuné: o tatu volta pro monte `position` cartas abaixo do topo (0 = topo, tamanho do monte = fundo). Gasta 1 turno.
 * Apaga as espiadas dos outros, em qualquer posição (apagar só quando o tatu cai perto do topo contaria onde ele foi).
 * Quem escondeu sabe onde pôs (pedido do Rafa, 2026-10-21): se tinha espiada, continua com ela, com o tatu no meio se ele
 * caiu dentro dela (`pos` ≤ tamanho). Sem espiada, não ganha uma nem com o tatu no topo: o olhinho de quem tem espiada é
 * público, e ele aparecer só nesse caso contaria pra mesa que o tatu está em cima. No "ao acaso" (inclusive quando o
 * prazo vence ou ele cai) ele também não sabe onde o tatu foi: perde a espiada como os outros.
 */
export function hideTatu(s: KittensState, c: Choice<'cafune'>, position: number | 'random', rng: Rng): KittensState {
  const pos = position === 'random' ? randomInt(rng, s.draw.length + 1) : position;
  const at = s.draw.length - pos;
  const draw = [...s.draw.slice(0, at), c.tatu, ...s.draw.slice(at)];
  const mine = position !== 'random' && Object.hasOwn(s.peeks, c.who) ? s.peeks[c.who]! : [];
  // Topo primeiro: o tatu fica no índice `pos` (com `pos` cartas acima dele).
  const known = pos <= mine.length ? [...mine.slice(0, pos), c.tatu, ...mine.slice(pos)] : mine;
  const next = mine.length > 0 ? { ...s, peeks: { [c.who]: known } } : clearPeeks(s);
  return spendTurn(logged({ ...next, draw, choice: null }, { t: 'hid', by: c.who }));
}

/**
 * Tatu comprado: `who` joga o Desarme `card` (vai pro descarte, todos veem). Abre a escolha de onde esconder o tatu,
 * com prazo `deadline`.
 */
export function useCafune(s: KittensState, c: Choice<'tatu'>, card: string, deadline: number): KittensState {
  const hands = { ...s.hands, [c.who]: s.hands[c.who]!.filter((x) => x !== card) };
  const choice: Choice<'cafune'> = { kind: 'cafune', who: c.who, tatu: c.tatu, deadline };
  return logged(counted({ ...s, hands, discard: [...s.discard, card], choice }, c.who, 'defuses'), { t: 'cafune', by: c.who });
}

/**
 * Favor: `who` dá `card` pra `to`. Só os dois veem qual carta foi. No trio de Favor a escolha continua aberta (mesmo
 * prazo, `left` menor) até dar todas ou a mão de `who` acabar.
 */
export function giveFavor(s: KittensState, c: Choice<'favor'>, card: string): KittensState {
  const mine = s.hands[c.who]!.filter((x) => x !== card);
  const hands = { ...s.hands, [c.who]: mine, [c.to]: [...s.hands[c.to]!, card] };
  const left = c.left - 1;
  const choice = left > 0 && mine.length > 0 ? { ...c, left } : null;
  return logged({ ...s, hands, choice }, { t: 'gave', from: c.who, to: c.to, card }, [c.who, c.to]);
}

/**
 * 5 diferentes: `who` pega `card` do descarte (todos veem). São duas cartas, uma por vez: a escolha continua aberta
 * (mesmo prazo, `left` menor) até pegar todas ou não sobrar opção no descarte.
 */
export function pickFromDiscard(s: KittensState, c: Choice<'cinco'>, card: string): KittensState {
  const hands = { ...s.hands, [c.who]: [...s.hands[c.who]!, card] };
  const discard = s.discard.filter((x) => x !== card);
  const options = c.options.filter((x) => x !== card && discard.includes(x));
  const left = c.left - 1;
  const choice = left > 0 && options.length > 0 ? { ...c, options, left } : null;
  return logged({ ...s, discard, hands, choice }, { t: 'picked', by: c.who, card });
}

/**
 * Par de Mico: `p` sai da espera, tendo descartado `card` (null = saiu do jogo sem descartar). A espera vazia fecha o
 * descarte: se alguma carta foi descartada nele e quem jogou o par continua vivo, ele pega uma delas (pedido do Rafa,
 * 2026-10-20) na escolha dos 5 diferentes (`from: 'mico'`, 1 carta, prazo `deadline`); senão, a escolha fecha.
 */
export function leaveMicoWait(s: KittensState, c: Choice<'mico'>, p: string, card: string | null, deadline: number): KittensState {
  const waiting = c.waiting.filter((x) => x !== p);
  const discarded = card === null ? c.discarded : [...c.discarded, card];
  if (waiting.length > 0) return { ...s, choice: { ...c, waiting, discarded } };
  const options = discarded.filter((x) => s.discard.includes(x));
  if (options.length === 0 || !s.alive.includes(c.by)) return { ...s, choice: null };
  return { ...s, choice: { kind: 'cinco', who: c.by, options, left: 1, deadline, from: 'mico' } };
}

/**
 * Par de Mico: `p` (que está na espera) descarta `card` da própria mão, à vista de todos; o efeito da carta não vale.
 * `deadline` = prazo da pegada de quem jogou, se este for o último descarte.
 */
export function discardForMico(s: KittensState, c: Choice<'mico'>, p: string, card: string, deadline: number): KittensState {
  const hands = { ...s.hands, [p]: s.hands[p]!.filter((x) => x !== card) };
  const next = logged({ ...s, hands, discard: [...s.discard, card] }, { t: 'discarded', by: p, card });
  return leaveMicoWait(next, c, p, card, deadline);
}

/**
 * Par de Quati: a carta de cima fica (`keep`) ou vai pro fundo. Todos sabem se foi, ninguém sabe qual. Indo pro fundo,
 * ela sai das espiadas como se fosse comprada (o resto vira o topo, na mesma ordem). Ficando, quem escolheu viu a de
 * cima (pedido do Rafa, 2026-10-21): sem espiada, ela fica à mostra pra ele; com espiada, ela já é a primeira. Vale
 * também sem resposta (ele viu a carta na escolha).
 */
export function delayTop(s: KittensState, c: Choice<'quati'>, keep: boolean): KittensState {
  const top = s.draw.at(-1)!;
  const knew = Object.hasOwn(s.peeks, c.who) || !s.alive.includes(c.who);
  const seen = knew ? s : { ...s, peeks: { ...s.peeks, [c.who]: [top] } };
  const next = keep ? seen : unpeek({ ...s, draw: [top, ...s.draw.slice(0, -1)] }, [top]);
  return logged({ ...next, choice: null }, { t: 'delayed', by: c.who, moved: !keep });
}

/** Os Tatus Latidores que `p` tem: os da frente primeiro, depois os da mão. */
export function latidosOf(s: KittensState, p: string): string[] {
  return [...(s.front[p] ?? []).filter(isKind('latido')), ...(s.hands[p] ?? []).filter(isKind('latido'))];
}

/**
 * Quem é o próximo a se defender do Tatu Latidor jogado por `by`: o primeiro vivo depois de `by`, na ordem dos assentos,
 * que tenha Latidor (na mão ou na frente). `by` nunca é alvo do próprio Latidor. Ninguém: null.
 */
export function nextBarked(s: KittensState, by: string): string | null {
  const order = s.players;
  const start = order.indexOf(by);
  for (let k = 1; k < order.length; k++) {
    const p = order[(start + k) % order.length]!;
    if (p !== by && s.alive.includes(p) && latidosOf(s, p).length > 0) return p;
  }
  return null;
}

/**
 * Tatu Latidor jogado por `by` (pedido do Rafa, 2026-10-21): todo outro vivo que tenha Latidor se defende, um de cada
 * vez, na ordem dos assentos a partir de `by`. O próximo da fila (`nextBarked`) com Desarme ganha a escolha `latido`
 * (prazo `deadline`); sem Desarme, explode na hora (a mão e os Latidores dele pra fora do jogo) e a fila segue. A fila
 * acaba quando ninguém mais tem Latidor (a escolha fecha e a vez continua com `by`) ou a partida acaba.
 */
export function barkNext(s: KittensState, by: string, deadline: number): KittensState {
  let next: KittensState = { ...s, choice: null };
  for (;;) {
    if (next.phase !== 'playing') return next;
    const target = nextBarked(next, by);
    if (target === null) return next;
    next = logged(next, { t: 'barked', by, target });
    if (next.hands[target]!.some(isKind('cafune'))) return { ...next, choice: { kind: 'latido', who: target, by, deadline } };
    next = eliminate(logged(next, { t: 'boom', by: target }), target, 'boom');
  }
}

/**
 * Tatu Latidor: `who` joga o Desarme `card` pra não explodir. O Desarme e TODOS os Latidores dele (da frente e da mão)
 * vão pro descarte: um Desarme basta, mesmo com mais de um Latidor (pedido do Rafa, 2026-10-21). O jogado já está lá.
 * Depois a fila segue (`barkNext`, prazo `deadline` pro próximo); no fim, a vez continua com quem jogou o Latidor.
 */
export function defendLatido(s: KittensState, c: Choice<'latido'>, card: string, deadline: number): KittensState {
  const latidos = latidosOf(s, c.who);
  const mine = s.front[c.who] ?? [];
  const front = mine.some(isKind('latido')) ? { ...s.front, [c.who]: mine.filter((x) => !latidos.includes(x)) } : s.front;
  const hand = s.hands[c.who]!.filter((x) => x !== card && !latidos.includes(x));
  const discard = [...s.discard, card, ...latidos];
  const next = counted({ ...s, front, hands: { ...s.hands, [c.who]: hand }, discard, choice: null }, c.who, 'defuses');
  return barkNext(logged(next, { t: 'cafune', by: c.who }), c.by, deadline);
}

/**
 * Feitiço: `who` fica com a carta de baixo do monte (`keep`: é comprar; Tatubum segue o fluxo do Desarme) ou ela vai pro
 * topo. Ficando com ela, ela sai das espiadas. Indo pro topo, as espiadas dos outros se apagam (o topo mudou), e `who`,
 * que viu a carta (pedido do Rafa, 2026-10-21), passa a ver ela em cima da espiada que já tinha (ou só ela). Vale também
 * sem resposta: ele viu a carta na escolha. Nos dois casos gasta 1 turno (o Tatubum guardado gasta quando o tatu volta
 * pro monte, ou some com a explosão). `deadline` = prazo da escolha do Desarme, se o guardado for Tatubum.
 */
export function conjure(s: KittensState, c: Choice<'feitico'>, keep: boolean, deadline: number): KittensState {
  const bottom = s.draw[0]!;
  const done = logged({ ...s, choice: null }, { t: 'conjured', by: c.who, kept: keep });
  if (keep) return takeCard(done, c.who, bottom, s.draw.slice(1), deadline);
  const draw = [...s.draw.slice(1), bottom];
  if (!s.alive.includes(c.who)) return spendTurn(clearPeeks({ ...done, draw }));
  // Monte todo na espiada: a de baixo já estava nela (no fim) e só sobe pro começo.
  const mine = (Object.hasOwn(s.peeks, c.who) ? s.peeks[c.who]! : []).filter((x) => x !== bottom);
  return spendTurn({ ...done, draw, peeks: { [c.who]: [bottom, ...mine] } });
}

/**
 * Prazo vencido (ou quem escolhe caiu de vez): o servidor escolhe ao acaso (no Quati, a carta fica; no Mico, cada um
 * que falta descarta uma, e a pegada de quem jogou abre com prazo novo; no Favor, dá o que faltar; nos 5 diferentes e
 * na pegada do Mico, pega o que faltar; no Latidor, o Desarme vai sozinho; no Feitiço, a carta de baixo vai pro topo,
 * seja qual for). `now` = agora (pro prazo da pegada do Mico).
 */
export function chooseAtRandom(s: KittensState, rng: Rng, now: number): KittensState {
  const c = s.choice!;
  switch (c.kind) {
    case 'tatu': {
      // Usa o Desarme e esconde o tatu de uma vez só. (A mão não muda durante a escolha, então sempre há um Desarme.)
      const card = s.hands[c.who]!.find(isKind('cafune'));
      if (card === undefined) return eliminate(logged({ ...s, choice: null }, { t: 'boom', by: c.who }), c.who, 'boom', [c.tatu]);
      const used = useCafune(s, c, card, c.deadline);
      return hideTatu(used, used.choice as Choice<'cafune'>, 'random', rng);
    }
    case 'cafune':
      return hideTatu(s, c, 'random', rng);
    case 'favor': {
      // Dá as que faltam, ao acaso (cada uma atualiza `left` ou fecha a escolha).
      let next = s;
      while (next.choice?.kind === 'favor') {
        const cur: Choice<'favor'> = next.choice;
        const hand = next.hands[cur.who]!;
        next = hand.length === 0 ? { ...next, choice: null } : giveFavor(next, cur, hand[randomInt(rng, hand.length)]!);
      }
      return next;
    }
    case 'cinco': {
      // Pega as que faltam, ao acaso (cada pegada atualiza `options`/`left` ou fecha a escolha).
      let next = s;
      while (next.choice?.kind === 'cinco') {
        const cur: Choice<'cinco'> = next.choice;
        const options = cur.options.filter((x) => next.discard.includes(x));
        next =
          options.length === 0 ? { ...next, choice: null } : pickFromDiscard(next, cur, options[randomInt(rng, options.length)]!);
      }
      return next;
    }
    case 'mico': {
      // Cada um que falta descarta uma carta ao acaso, na ordem da espera; o último abre a pegada de quem jogou (com
      // prazo novo, a partir de agora).
      const deadline = now + KITTENS_CHOICE_MS;
      let next = s;
      for (const p of c.waiting) {
        const cur = next.choice as Choice<'mico'>;
        const hand = next.hands[p]!;
        next = hand.length > 0 ? discardForMico(next, cur, p, hand[randomInt(rng, hand.length)]!, deadline) : leaveMicoWait(next, cur, p, null, deadline);
      }
      return next;
    }
    case 'quati':
      // Sem resposta, a carta fica onde está (quem escolhia viu a de cima, como se tivesse deixado).
      return delayTop(s, c, true);
    case 'latido': {
      // A mão não muda durante a escolha (ela só abre pra quem tem Desarme); sem Desarme, explode. Nos dois casos a
      // fila do Latidor segue, com prazo novo pro próximo.
      const deadline = now + KITTENS_CHOICE_MS;
      const card = s.hands[c.who]!.find(isKind('cafune'));
      if (card !== undefined) return defendLatido(s, c, card, deadline);
      return barkNext(eliminate(logged({ ...s, choice: null }, { t: 'boom', by: c.who }), c.who, 'boom'), c.by, deadline);
    }
    case 'feitico':
      // A carta SEMPRE vai pro topo: decidir pelo tipo dela (ex.: "fica, a não ser que seja Tatubum") contaria pra quem
      // assiste o que estava embaixo. Também nunca abre a escolha do Desarme pra quem já saiu.
      return conjure(s, c, false, c.deadline);
  }
}
