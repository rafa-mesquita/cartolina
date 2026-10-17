import type { KitId, WorkOf } from '@cartolina/shared';

/** Um kit do Retratim: imperativo (DOM/SVG/canvas/WebGL), embrulhado pelo React em KitBench/KitShow. */
export interface KitModule<K extends KitId> {
  /**
   * Monta a bancada dentro de `el` (folha 4:3, já com tamanho). `work` = rascunho atual ou null (bancada nova).
   * Chama `onChange(obra)` a cada mexida (nunca na montagem inicial). Quem chama decide quando enviar.
   */
  build(el: HTMLElement, work: WorkOf<K> | null, onChange: (work: WorkOf<K>) => void): { destroy(): void };
  /** Desenha a obra (só leitura) dentro de `el`, em qualquer tamanho 4:3. */
  show(el: HTMLElement, work: WorkOf<K>): void;
}
