// Só para o protótipo: o que a página usa das regras reais do Mandacaru.
export { applyMandacaruAction, initialMandacaruState } from '../../shared/src/games/mandacaru/rules';
export { settleMandacaru } from '../../shared/src/games/mandacaru/auto';
export { mandacaruViewFor, mandacaruNextDeadline } from '../../shared/src/games/mandacaru/view';
export { mandacaruActionSchema } from '../../shared/src/games/mandacaru/schema';
export { geometry, pips } from '../../shared/src/games/mandacaru/board';
export { portRates, points } from '../../shared/src/games/mandacaru/build';
export * from '../../shared/src/games/mandacaru/types';
