'use strict';
/* Textos do protótipo do Mandacaru: nomes do tema e uma frase curta por linha do diário (MandacaruLogEntry). */
(function () {
  const RES = { wood: 'madeira', brick: 'barro', leather: 'couro', beans: 'feijão', stone: 'pedra' };
  /** Artigo de cada recurso ("a madeira", "o barro"). */
  const RES_ART = { wood: 'a', brick: 'o', leather: 'o', beans: 'o', stone: 'a' };
  const TERRAIN = { forest: 'caatinga', hills: 'barreiro', pasture: 'malhada', fields: 'roçado', mountains: 'lajedo', desert: 'rio seco' };
  const CORDEL = { vaqueiro: 'Vaqueiro', point: 'Ponto', mutirao: 'Mutirão', chuva: 'Chuva no sertão', atravessador: 'Atravessador' };
  const CORDEL_DESC = {
    vaqueiro: 'leva o Carcará pra outro terreno e rouba 1 carta',
    point: '+1 ponto, escondido até o fim',
    mutirao: '2 estradas de graça',
    chuva: '2 recursos quaisquer do banco',
    atravessador: 'escolhe um recurso: todo mundo te entrega o que tem dele',
  };
  const POINT_NAMES = ['Igrejinha', 'Açude', 'Cisterna', 'Escola', 'Casa de Farinha'];
  const PIECE = { road: 'estrada', house: 'casa', city: 'vila', cordel: 'cordel' };
  const ORDER = ['wood', 'brick', 'leather', 'beans', 'stone'];

  /** Artigo de cada nome (pra "da Bia", "do Léo"); "você" não leva. */
  const ART = { Bia: 'a', Duda: 'a', 'Léo': 'o' };
  const de = (name) => (name === 'você' ? 'de você' : ART[name] ? `d${ART[name]} ${name}` : `de ${name}`);
  const com = (name) => (name === 'você' ? 'com você' : ART[name] ? `com ${ART[name]} ${name}` : `com ${name}`);

  /** "a", "a e b", "a, b e c" */
  const joinE = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
  /** "2 feijão, 1 pedra" (sem os zerados); vazio = "nada". */
  function resList(res) {
    const parts = ORDER.filter((r) => res[r] > 0).map((r) => `${res[r]} ${RES[r]}`);
    return parts.length ? joinE(parts) : 'nada';
  }
  /** Nome do terreno com o número (ex.: "roçado 9"). */
  function hexName(view, h) {
    const tile = view && view.layout && view.layout.hexes[h];
    if (!tile) return 'outro terreno';
    return tile.number === null ? TERRAIN[tile.terrain] : `${TERRAIN[tile.terrain]} ${tile.number}`;
  }

  /** Uma frase pra cada linha do diário. `nameOf(id)` dá o nome; `view` (opcional) dá o tabuleiro. */
  function line(e, nameOf, view) {
    const n = (id) => nameOf(id);
    switch (e.t) {
      case 'start':
        return `começou a partida! ordem: ${joinE(e.order.map(n))}.`;
      case 'place':
        return `${n(e.player)} pôs ${e.piece === 'house' ? 'uma casa' : 'uma estrada'}.`;
      case 'setup_gain':
        return `${n(e.player)} ganhou ${resList(e.gain)} da segunda casa.`;
      case 'roll': {
        const sum = e.dice[0] + e.dice[1];
        if (sum === 7) return `${n(e.player)} tirou 7: lá vem o Carcará!`;
        // "Bia tirou 8: você ganhou 2 feijão, Duda 1 pedra."
        const gains = Object.entries(e.gains).map(([p, g], i) => `${n(p)}${i === 0 ? ' ganhou' : ''} ${resList(g)}`);
        let s = gains.length ? `${n(e.player)} tirou ${sum}: ${gains.join('; ')}.` : `${n(e.player)} tirou ${sum}: ninguém ganhou nada.`;
        if (e.short.length) s += ` Faltou ${joinE(e.short.map((r) => RES[r]))} no banco: ninguém recebeu.`;
        return s;
      }
      case 'discard':
        return `${n(e.player)} descartou ${e.count} ${e.count === 1 ? 'carta' : 'cartas'}.`;
      case 'carcara':
        return `${n(e.player)} levou o Carcará pro ${hexName(view, e.hex)}.`;
      case 'steal':
        return `o Carcará ${de(n(e.player))} levou uma carta ${de(n(e.from))}.`;
      case 'build':
        return e.piece === 'road' ? `${n(e.player)} fez uma estrada.` : e.piece === 'house' ? `${n(e.player)} levantou uma casa.` : `${n(e.player)} subiu uma vila.`;
      case 'buy_cordel':
        return `${n(e.player)} comprou um cordel.`;
      case 'play':
        if (e.kind === 'chuva') return `${n(e.player)} jogou Chuva no sertão: ${joinE((e.resources || []).map((r) => RES[r]))}.`;
        if (e.kind === 'atravessador') return `${n(e.player)} jogou Atravessador e juntou ${e.total || 0} ${RES[(e.resources || [])[0]] || ''} de todo mundo.`;
        return `${n(e.player)} jogou ${CORDEL[e.kind]}.`;
      case 'trade':
        return `${n(e.a)} trocou ${resList(e.aGives)} por ${resList(e.bGives)} ${com(n(e.b))}.`;
      case 'feira':
        return `${n(e.player)} trocou ${e.gave} ${RES[e.give]} por ${e.got} ${RES[e.want]} na feira.`;
      case 'award': {
        const what = e.award === 'longest' ? 'a maior estrada' : 'a maior comitiva';
        return e.player === null ? `${what} ficou sem dono.` : `${n(e.player)} agora tem ${what} (+2).`;
      }
      case 'timeout':
        return `acabou o tempo ${de(n(e.player))}.`;
      case 'end_turn':
        return `${n(e.player)} passou a vez.`;
      case 'win':
        return `${n(e.player)} venceu com ${e.points} pontos!`;
      default:
        return '';
    }
  }

  /** Mensagens dos erros das regras (pro aviso curto). */
  const ERR = {
    not_host: 'só o anfitrião pode fazer isso.',
    bad_phase: 'agora não dá pra fazer isso.',
    not_player: 'você está assistindo esta partida.',
    not_your_turn: 'não é a sua vez.',
    bad_spot: 'aí não dá.',
    no_pieces: 'acabaram as peças.',
    cannot_afford: 'faltam cartas pra isso.',
    deck_empty: 'acabaram os cordéis.',
    need_3_players: 'precisa de 3 ou 4 jogadores.',
    room_full: 'a mesa está cheia.',
    bad_discard: 'descarte o número certo de cartas.',
    bad_target: 'não dá pra roubar dessa pessoa.',
    cordel_used: 'já jogou um cordel neste turno.',
    cordel_fresh: 'cordel comprado agora só pode ser jogado no próximo turno.',
    no_cordel: 'você não tem esse cordel.',
    bank_empty: 'o banco não tem isso.',
    bad_trade: 'troca inválida.',
    stale_offer: 'essa oferta já mudou.',
  };

  window.Txt = { RES, RES_ART, TERRAIN, CORDEL, CORDEL_DESC, POINT_NAMES, PIECE, ORDER, ERR, line, resList, joinE, de, com, hexName };
})();
