import { workSchema, type PicturesAction, type Work } from '@cartolina/shared';
import { useEffect, useMemo, useRef, useState } from 'react';

/** Rascunho vai pro servidor no máximo a cada tanto (os kits avisam a cada `pointermove`). */
export const DRAFT_INTERVAL_MS = 2000;
/** Com a contagem correndo, a mexida sai no máximo nesse tempo (e nunca depois disso antes do fim). */
export const DRAFT_RUSH_MS = 300;
/** "Pronto" sem resposta depois disso (visão sem eu pronto): o pedido se perdeu, a bancada volta a mandar. */
export const READY_TIMEOUT_MS = 1500;

/** O que a visão do servidor diz sobre mim (a cada render). */
export interface DraftServer {
  /** Eu estou pronto na visão. */
  ready: boolean;
  /** A minha obra na visão (o último rascunho que chegou lá), ou null. */
  work: Work | null;
  /** Fim da contagem (hora do servidor), ou null. */
  countdownEndsAt: number | null;
  /** Hora do servidor menos a do PC. */
  serverOffset: number;
}

export interface Draft {
  /** A obra da bancada (só local). `null` = ainda não mexeu nesta rodada/kit. */
  readonly local: Work | null;
  /** Já mexeu nesta rodada/kit. */
  readonly touched: boolean;
  /** Mandou "pronto" e a visão ainda não confirmou (botão desabilitado, bancada já esmaecida). */
  readonly pending: boolean;
  /** Mandou "pronto" e ainda não soltou: a bancada fica como pronta (otimista). */
  readonly held: boolean;
  /** A bancada mudou: guarda e envia o rascunho (espaçado; a última mexida sempre sai). */
  onChange(work: Work): void;
  /** "estou pronto": cancela o rascunho pendente e manda uma só ação `ready` com a obra local. */
  markReady(): void;
  /** "desmarcar pronto": manda `ready` desligado e volta a enviar rascunhos. */
  unready(): void;
  /** O servidor recusou o "pronto": volta a enviar rascunhos sem mandar nada agora. */
  release(): void;
}

interface Slot {
  key: string;
  local: Work | null;
  /** Mexeu depois do último envio. */
  dirty: boolean;
  lastAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** Quando o envio pendente sai (hora do PC). */
  dueAt: number;
  /** Mandou "pronto" (pedido em voo ou confirmado): mexidas não viram rascunho. */
  held: boolean;
  heldAt: number;
  holdTimer: ReturnType<typeof setTimeout> | null;
}

const fresh = (key: string): Slot => ({
  key, local: null, dirty: false, lastAt: Number.NEGATIVE_INFINITY, timer: null, dueAt: 0, held: false, heldAt: 0, holdTimer: null,
});
const clear = (s: Slot) => {
  if (s.timer) clearTimeout(s.timer);
  if (s.holdTimer) clearTimeout(s.holdTimer);
  s.timer = s.holdTimer = null;
};

/** Forma canônica da obra (ordem das chaves do schema, como o servidor guarda) pra comparar com a da visão. */
function canon(work: Work | null): string {
  if (!work) return '';
  const parsed = workSchema.safeParse(work);
  return JSON.stringify(parsed.success ? parsed.data : work);
}

/**
 * Rascunho da bancada: o local manda; o servidor só serve pra reconectar (o eco nunca recria a bancada).
 * Envio que se perdeu (socket caído) é refeito quando a visão chega sem a obra local; "pronto" sem resposta
 * se solta sozinho. Trocar `key` (rodada:kit) zera tudo, inclusive o envio pendente.
 */
export function useDraft(key: string, send: (a: PicturesAction) => void, server: DraftServer): Draft {
  const slot = useRef<Slot>(fresh(key));
  // Zera já no render da chave nova: a bancada (filha) monta no efeito dela, antes dos efeitos de quem chama.
  if (slot.current.key !== key) {
    clear(slot.current);
    slot.current = fresh(key);
  }
  const sendRef = useRef(send);
  sendRef.current = send;
  const serverRef = useRef(server);
  serverRef.current = server;
  const [touchedKey, setTouchedKey] = useState<string | null>(null);
  const [, bump] = useState(0);

  useEffect(() => () => clear(slot.current), []);

  const api = useMemo(() => {
    const differs = (s: Slot) => canon(s.local) !== canon(serverRef.current.work);
    const flush = (s: Slot) => {
      s.timer = null;
      if (!s.local || s.held || slot.current !== s) return;
      if (!s.dirty && !differs(s)) return;
      s.dirty = false;
      s.lastAt = Date.now();
      sendRef.current({ type: 'draft', work: s.local });
    };
    /** Agenda o envio: espaçado de DRAFT_INTERVAL_MS; com a contagem correndo, logo (e antes do fim). */
    const schedule = (s: Slot) => {
      if (s.held || !s.local) return;
      const now = Date.now(), { countdownEndsAt: end, serverOffset } = serverRef.current;
      let wait = s.lastAt + DRAFT_INTERVAL_MS - now;
      if (end !== null) wait = Math.min(wait, DRAFT_RUSH_MS, end - serverOffset - DRAFT_RUSH_MS - now);
      wait = Math.max(0, wait);
      if (s.timer) {
        if (now + wait >= s.dueAt) return;
        clearTimeout(s.timer);
      }
      if (wait === 0) return flush(s);
      s.dueAt = now + wait;
      s.timer = setTimeout(() => flush(s), wait);
    };
    const release = () => {
      const s = slot.current;
      if (!s.held) return;
      s.held = false;
      if (s.holdTimer) clearTimeout(s.holdTimer);
      s.holdTimer = null;
      bump((n) => n + 1);
    };
    return {
      schedule,
      differs,
      release,
      onChange(work: Work) {
        const s = slot.current;
        s.local = work;
        s.dirty = true;
        setTouchedKey(s.key);
        // "pronto" que se perdeu: passou o tempo e a visão não me marcou pronto
        if (s.held && !serverRef.current.ready && Date.now() - s.heldAt >= READY_TIMEOUT_MS) release();
        schedule(s);
      },
      markReady() {
        const s = slot.current;
        if (s.held) return;
        if (s.timer) clearTimeout(s.timer);
        s.timer = null;
        s.held = true;
        s.heldAt = Date.now();
        s.holdTimer = setTimeout(() => {
          s.holdTimer = null;
          if (slot.current === s && !serverRef.current.ready) release();
        }, READY_TIMEOUT_MS);
        if (s.local) s.dirty = false;
        bump((n) => n + 1);
        sendRef.current(s.local ? { type: 'ready', on: true, work: s.local } : { type: 'ready', on: true });
      },
      unready() {
        release();
        sendRef.current({ type: 'ready', on: false });
      },
    };
  }, []);

  // A cada visão: "pronto" perdido se solta; obra local que não chegou (queda, recarga do servidor) vai de novo;
  // contagem que começou adianta o envio pendente.
  useEffect(() => {
    const s = slot.current;
    if (s.held && !server.ready && Date.now() - s.heldAt >= READY_TIMEOUT_MS) api.release();
    if (!s.held && !server.ready && s.local && (s.dirty || api.differs(s))) api.schedule(s);
  });

  const s = slot.current;
  return {
    get local() {
      return slot.current.local;
    },
    touched: touchedKey === key,
    held: s.held,
    pending: s.held && !server.ready,
    onChange: api.onChange,
    markReady: api.markReady,
    unready: api.unready,
    release: api.release,
  };
}
