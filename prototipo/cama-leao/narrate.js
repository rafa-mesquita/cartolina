'use strict';
/* Frase do letreiro pra uma jogada (spec §5.4). `nameOf(id)` dá o nome; o humano é "você". */
(function () {
  function narrate(last, nameOf) {
    if (!last) return '';
    const card = CamaLeao.camelioCard(last.card);
    const by = nameOf(last.by);
    const what = `${last.from === 'deck' ? 'o' : 'um'} ${card.spheres} ${card.color}${last.from === 'deck' ? ' do monte' : ''}`;
    const head = last.to === last.by ? `${by} ficou com ${what}` : `${by} deu ${what} pra ${nameOf(last.to)}`;
    const who = last.to === last.by ? '' : `${nameOf(last.to)} `;
    switch (last.outcome) {
      case 'scored':
        return `${head}: ${who}fechou o ${card.color}!`;
      case 'bust':
        return `${head}: ${who}estourou!`;
      case 'lost':
        return `${head}: ${who}perdeu o ponto do ${card.color}!`;
      default:
        return `${head}.`;
    }
  }
  window.narrate = narrate;
})();
