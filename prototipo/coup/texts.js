'use strict';
/* Textos do protótipo do Cúpi: personagens, ações, frases do palco, do diário e do painel de perder carta.
   Os números vêm das regras reais (Cupi.COUP_GAIN / COUP_COST); aqui só ficam os rótulos. */
(function () {
  const G = Cupi.COUP_GAIN, C = Cupi.COUP_COST;

  const CHAR = {
    duke:       { nome: 'Duque',      icon: 'ti-crown',   art: 'o', um: 'um' },
    assassin:   { nome: 'Assassino',  icon: 'ti-sword',   art: 'o', um: 'um' },
    captain:    { nome: 'Capitão',    icon: 'ti-anchor',  art: 'o', um: 'um' },
    ambassador: { nome: 'Embaixador', icon: 'ti-world',   art: 'o', um: 'um' },
    contessa:   { nome: 'Condessa',   icon: 'ti-diamond', art: 'a', um: 'uma' },
  };
  const ACTION = {
    income:      { nome: 'renda',         dica: `+${G.income}` },
    foreignAid:  { nome: 'ajuda externa', dica: `+${G.foreignAid} · o Duque bloqueia` },
    coup:        { nome: 'golpe',         dica: `−${C.coup} · alvo perde carta` },
    tax:         { nome: 'taxar',         dica: `Duque · +${G.tax}` },
    assassinate: { nome: 'assassinar',    dica: `Assassino · −${C.assassinate} · alvo perde carta` },
    steal:       { nome: 'extorquir',     dica: `Capitão · tira ${G.steal}` },
    exchange:    { nome: 'trocar',        dica: 'Embaixador · troca cartas' },
  };

  const NAMES = ['você', 'Bia', 'Léo', 'Nina', 'Caio', 'Duda'];
  const name = (id) => NAMES[Number(id.slice(1))];

  const b = (c) => `<b>${CHAR[c].nome}</b>`;
  /** "o Duque" / "a Condessa" */
  const the = (c) => `${CHAR[c].art} ${CHAR[c].nome}`;

  /** O que a ação faz, no presente ("pega 3", "assassina Léo"). */
  function doing(d) {
    switch (d.kind) {
      case 'income': return 'pega renda';
      case 'foreignAid': return `pede ajuda externa (+${G.foreignAid})`;
      case 'coup': return `dá o golpe em ${name(d.target)}`;
      case 'tax': return `pega ${G.tax}`;
      case 'assassinate': return `assassina ${name(d.target)}`;
      case 'steal': return `extorque ${name(d.target)}`;
      case 'exchange': return 'troca cartas';
    }
    return '';
  }

  /** Palco, durante a janela de reação. Devolve HTML (a tela pinta o <b> de vermelho; <small> é a linha menor). */
  function declaration(view) {
    const w = view.window, d = view.declared;
    if (!w || !d) return '';
    if (w.kind === 'action') {
      const claim = Cupi.COUP_CLAIM[d.kind];
      if (claim) return `${name(d.actor)} diz: sou ${b(claim)} e ${doing(d)}`;
      return `${name(d.actor)} ${doing(d)}`;
    }
    if (w.kind === 'block' && view.block) {
      return `${name(view.block.by)} bloqueia como ${b(view.block.as)}<small>contra a ação: ${name(d.actor)} ${doing(d)}</small>`;
    }
    if (w.kind === 'blockOnly') {
      const who = w.eligible.map(name).join(' e ');
      const claim = Cupi.COUP_CLAIM[d.kind];
      const withs = Cupi.COUP_BLOCKERS[d.kind].map((c) => `${CHAR[c].art} ${b(c)}`).join(' ou ');
      return `${who} pode bloquear ${claim ? the(claim) : 'a ação'} com ${withs}`;
    }
    return '';
  }

  /** Uma linha do diário (HTML). Devolve null quando a linha já foi contada por outra. */
  function logLine(e) {
    switch (e.t) {
      case 'start': return `Partida nova. Começa ${name(e.first)}.`;
      case 'act': {
        const a = name(e.actor), claim = Cupi.COUP_CLAIM[e.kind];
        if (claim) return `${a} disse ${b(claim)}${e.target ? ` contra ${name(e.target)}` : ''}`;
        if (e.kind === 'income') return `${a} pegou renda`;
        if (e.kind === 'foreignAid') return `${a} pediu ajuda externa`;
        if (e.kind === 'coup') return `${a} deu o golpe em ${name(e.target)}`;
        return `${a} fez ${ACTION[e.kind].nome}`;
      }
      case 'challenge':
        return `${name(e.by)} duvidou de ${name(e.of)}: <b>${e.had ? 'tinha' : 'não tinha'}</b> ${the(e.claim)}`;
      case 'block': return `${name(e.by)} bloqueou como ${b(e.as)}`;
      case 'blocked': return e.actor === 'p0' ? 'sua ação foi bloqueada' : `a ação de ${name(e.actor)} foi bloqueada`;
      case 'resolved': {
        const a = name(e.actor);
        switch (e.kind) {
          case 'foreignAid':
          case 'tax': return e.amount > 0 ? `${a} pegou ${e.amount}` : `${a} não pegou nada (tesouro vazio)`;
          case 'steal': return e.amount > 0 ? `${a} tirou ${e.amount} de ${name(e.target)}` : `${a} não tirou nada de ${name(e.target)}`;
          default: return null; // renda já foi contada no "act"; golpe, assassinato e troca: a linha "perdeu" / a troca contam
        }
      }
      case 'lose': return `${name(e.player)} perdeu ${CHAR[e.card].um} ${b(e.card)}`;
      case 'out': return `${name(e.player)} está fora`;
      case 'win': return `${name(e.player)} tomou o poder`;
    }
    return null;
  }

  const LOSS = {
    coup: 'Você levou um golpe',
    assassinated: 'Você foi assassinado',
    challengeWrong: 'Você errou a dúvida',
    caught: 'Pegaram seu blefe',
  };
  const lossTitle = (reason) => LOSS[reason] || 'Você perde uma carta';

  window.Txt = { CHAR, ACTION, NAMES, name, the, doing, declaration, logLine, lossTitle, LOSS_SUB: 'Escolha a carta que vai revelar' };
})();
