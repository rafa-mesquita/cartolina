'use strict';
/**
 * window.Anim.play(prev, next, opts) → Promise que resolve quando a jogada `next.last` terminou de aparecer.
 * `prev` = view desenhada (o DOM ainda é o dela), `next` = view de depois. Não muda estado de jogo.
 *
 * opts (opcionais):
 *   nameOf(p)    → nome pro letreiro.
 *   say(html)    → troca o letreiro (o setBanner do index); sem ele, escreve no #banner .txt.
 *   dropFrom     → { x, y, from } em coordenadas do palco: canto de cima do clone do arrasto na soltura
 *                  (a carta nasce ali, inclinada, se `from` bate com a jogada; senão nasce na origem).
 *   layout(p, n) → { w, gap, pad }: carta, espaço entre pilhas e padding lateral (somado) da mesa de `p` com `n` cores.
 *
 * Globais: CamaLeao (camelioCard, CAMELIO_COLORS, CAMELIO_EXACT), CardArt (front, back, HEX), narrate, play (sons).
 * Lê: #app (palco), #deck/#open .lift > .card (origem), .seat[data-pid] (dentro de #mine = a sua mesa), .stacks,
 *   .stack[data-color] > .pile, .sum, .head .flags .flag[data-color], .fans .fan[data-color].
 * Cria uma camada `.fly` no #app; esconde e anima elementos reais da mesa e desfaz tudo antes de resolver.
 * Teto de 4 s: se a animação não terminar (aba em segundo plano não faz quadros), encerra e resolve assim mesmo.
 * window.Anim.stop(): encerra a animação em curso (partida nova); a Promise dela resolve.
 *
 * Tempos: voo 450ms (vira nos últimos 200 se veio do monte), pausa 200, e o resultado:
 * none +220 (≈0,9 s), scored +300 brilho +450 subida (≈1,45 s), bust/lost +240 tremida +450 queda (≈1,4 s).
 */
(function () {
  const FLY_MS = 450, FLIP_MS = 200, PAUSE_MS = 200;
  const BOUNCE_MS = 220, GLOW_MS = 300, RISE_MS = 450, SHAKE_MS = 240, FALL_MS = 450, POP_MS = 200;
  /** Teto: a mais longa leva ~1,45 s; sem quadros (aba escondida) o `finished` pode nunca chegar. */
  const WATCHDOG_MS = 4000;
  const EASE = 'cubic-bezier(.2,.8,.2,1)';
  const SHADOW = '0 1px 3px rgba(31,42,74,.35)'; // a de .card (cards.css)
  const LIFTED = '0 0 0 3px #e8b23a,0 22px 38px rgba(31,42,74,.42),0 6px 12px rgba(31,42,74,.25)'; // a do .drag-clone
  const AIR = '0 12px 20px rgba(31,42,74,.3),0 3px 6px rgba(31,42,74,.22)';
  const GLOW = '0 0 0 2px #e8b23a,0 0 14px 4px rgba(232,178,58,.85)';

  const css = document.createElement('style');
  css.textContent = `
.fly{position:absolute;inset:0;z-index:55;pointer-events:none}
.fly>*{position:absolute;left:0;top:0;margin:0}
.fly-card{transform-origin:0 0;will-change:transform}
.fly-flip{position:relative;transform-style:preserve-3d}
.fly-face{position:absolute;left:0;top:0;backface-visibility:hidden;-webkit-backface-visibility:hidden}
.fly-face.front{transform:rotateY(180deg)}`;
  document.head.appendChild(css);

  /** A animação em curso (uma de cada vez). */
  let current = null;

  const sound = (n) => { try { if (window.play) window.play(n); } catch (_) { /* som nunca derruba a jogada */ } };
  const stage = () => document.getElementById('app') || document.body;
  /** Retângulo de `el` em coordenadas do palco (antes da escala que faz o palco caber na janela). */
  function box(el) {
    const s = stage(), a = s.getBoundingClientRect(), r = el.getBoundingClientRect();
    const k = a.width / (s.offsetWidth || a.width || 1);
    return { x: (r.left - a.left) / k, y: (r.top - a.top) / k, w: r.width / k, h: r.height / k };
  }
  /** Largura de uma carta desenhada (o --w que o CardArt pôs nela). */
  const widthOf = (card) => parseFloat(card.style.getPropertyValue('--w')) || box(card).w;
  const colorsOf = (cards) => CamaLeao.CAMELIO_COLORS.filter((c) => cards.some((x) => x.color === c));
  const scoredColor = (v, p, color) => (v.scored[p] || []).some((c) => c.color === color);

  function stop() { if (current) current.end(); }

  function play(prev, next, opts = {}) {
    stop();
    return new Promise((resolve, reject) => {
      const root = document.createElement('div');
      root.className = 'fly';
      const run = {
        alive: true, root, timers: [], undo: [],
        wait: (ms) => new Promise((res) => run.timers.push(setTimeout(res, ms))),
        /** WAAPI com fill 'forwards'; a Promise nunca rejeita (cancelar é normal aqui). */
        go(el, frames, o) { const a = el.animate(frames, { fill: 'forwards', ...o }); return a.finished.catch(() => {}); },
        /** Anima um elemento de verdade da mesa: a animação sai antes do resolve (o redesenho vem logo depois). */
        goReal(el, frames, o) { const a = el.animate(frames, { fill: 'forwards', ...o }); run.undo.push(() => a.cancel()); return a.finished.catch(() => {}); },
        hide(el) { const v = el.style.visibility; el.style.visibility = 'hidden'; run.undo.push(() => { el.style.visibility = v; }); },
        end(err) {
          if (!run.alive) return;
          run.alive = false;
          run.timers.forEach(clearTimeout);
          root.remove();
          run.undo.reverse().forEach((f) => { try { f(); } catch (_) { /* o elemento já foi redesenhado */ } });
          if (current === run) current = null;
          if (err) reject(err); else resolve();
        },
      };
      current = run;
      // o jogo não pode ficar preso em `animating`: passou do teto, encerra do jeito que estiver
      run.timers.push(setTimeout(() => { if (run.alive) console.warn('virada passou do teto de tempo; encerrada'); run.end(); }, WATCHDOG_MS));
      try {
        sequence(prev, next, opts, run).then(() => run.end(), (err) => run.end(err));
      } catch (err) { run.end(err); }
    });
  }

  /** Monta tudo de forma síncrona (o clone existe já no primeiro quadro) e devolve a Promise da sequência. */
  function sequence(prev, next, opts, run) {
    const last = next.last;
    const card = CamaLeao.camelioCard(last.card);
    const nameOf = opts.nameOf || ((p) => p);
    const app = stage();
    const root = run.root;

    // 1. letreiro
    const text = window.narrate ? window.narrate(last, nameOf) : '';
    if (opts.say) opts.say(text);
    else { const t = document.querySelector('#banner .txt'); if (t) t.innerHTML = text; }

    app.appendChild(root);

    // origem: a carta de lá some enquanto o clone viaja (não pode aparecer duas vezes)
    const src = document.getElementById(last.from === 'deck' ? 'deck' : 'open');
    const lift = src && src.querySelector('.lift');
    const srcCard = lift && lift.querySelector('.card');
    const W0 = srcCard ? widthOf(srcCard) : 92;
    const drop = opts.dropFrom && opts.dropFrom.from === last.from ? opts.dropFrom : null;
    let from;
    if (drop) from = { x: drop.x, y: drop.y };
    else if (srcCard) { const b = box(srcCard); from = { x: b.x, y: b.y }; }
    else from = { x: app.offsetWidth / 2 - W0 / 2, y: 400 };
    if (lift) run.hide(lift);

    // destino: a mesa de quem recebe
    const seat = app.querySelector(`.seat[data-pid="${last.to}"]`);
    const stacks = seat && seat.querySelector('.stacks');
    const mine = !!(seat && seat.closest('#mine'));
    const stack = stacks && stacks.querySelector(`.stack[data-color="${card.color}"]`);
    const before = colorsOf(prev.table[last.to] || []);
    const after = colorsOf(next.table[last.to] || []);

    /** Onde fica cada pilha (canto de cima) com estas cores, do jeito que o index vai desenhar. */
    function slots(colors) {
      const R = box(stacks);
      let lay = opts.layout ? opts.layout(last.to, colors.length) : null;
      if (!lay) { // sem o index: mede o que está desenhado
        const any = stacks.querySelector('.stack'), c = any && any.querySelector('.card');
        lay = { w: c ? widthOf(c) : (mine ? 64 : 46), gap: parseFloat(getComputedStyle(stacks).columnGap) || 6, pad: any ? parseFloat(getComputedStyle(any).paddingLeft) * 2 : 8 };
      }
      const sw = lay.w + lay.pad;
      const total = colors.length * sw + Math.max(0, colors.length - 1) * lay.gap;
      const x0 = mine ? R.x : R.x + (R.w - total) / 2; // a sua mesa alinha à esquerda; os assentos, no meio
      const at = {};
      colors.forEach((c, i) => { at[c] = { x: x0 + i * (sw + lay.gap), y: R.y }; });
      return { lay, at };
    }
    /** As outras pilhas de verdade deslizam (e mudam de tamanho) até onde vão ficar com `colors`. */
    function relayout(colors, ms, easing) {
      if (!stacks) return;
      const S = slots(colors);
      stacks.querySelectorAll('.stack[data-color]').forEach((el) => {
        const c = el.dataset.color, to = S.at[c];
        if (c === card.color || !to) return;
        const b = box(el), first = el.querySelector('.card');
        const k = first ? S.lay.w / widthOf(first) : 1;
        if (Math.abs(to.x - b.x) < 0.5 && Math.abs(k - 1) < 0.01) return;
        const origin = el.style.transformOrigin;
        el.style.transformOrigin = '0 0';
        run.undo.push(() => { el.style.transformOrigin = origin; });
        run.goReal(el, [{ transform: 'none' }, { transform: `translate(${to.x - b.x}px,${to.y - b.y}px) scale(${k})` }], { duration: ms, easing });
      });
    }

    // a pilha "de mentira" que recebe a carta: cópia da de verdade (ou uma nova, se a cor é nova) com a carta já dentro.
    // Fica escondida até o pouso; medir a carta nova nela dá o ponto exato do pouso.
    let ghost = null, landing = null;
    if (stacks) {
      if (stack) {
        ghost = pin(stack);
        ghost.querySelector('.pile').insertAdjacentHTML('beforeend', CardArt.front(card, widthOf(stack.querySelector('.pile .card:last-child'))));
      } else {
        const S = slots(after.includes(card.color) ? after : [...before, card.color]);
        const at = S.at[card.color] || { x: box(stacks).x, y: box(stacks).y };
        ghost = document.createElement('div');
        ghost.className = 'stack';
        ghost.innerHTML = `<div class="pile">${CardArt.front(card, S.lay.w)}</div><span class="sum"></span>`;
        Object.assign(ghost.style, { left: `${at.x}px`, top: `${at.y}px` });
        if (!mine) Object.assign(ghost.style, { width: `${S.lay.w + S.lay.pad}px`, paddingLeft: `${S.lay.pad / 2}px`, paddingRight: `${S.lay.pad / 2}px` });
        // a soma com a mesma letra das outras dessa mesa (o CSS dela depende de onde ela está)
        const probe = document.createElement('span');
        probe.className = 'sum'; probe.style.cssText = 'position:absolute;visibility:hidden';
        stacks.appendChild(probe);
        copySum(probe, ghost.querySelector('.sum'));
        probe.remove();
      }
      const sc = scoredColor(prev, last.to, card.color);
      const sumEl = ghost.querySelector('.sum');
      sumEl.textContent = `${last.sum}/${CamaLeao.CAMELIO_EXACT}${sc ? ' ⚑' : ''}`;
      sumEl.classList.toggle('hot', last.outcome === 'none' && last.sum === CamaLeao.CAMELIO_EXACT - 1);
      if (last.outcome === 'scored') Object.assign(sumEl.style, { color: '#9a6d10', fontWeight: '700' });
      if (last.outcome === 'bust' || last.outcome === 'lost') Object.assign(sumEl.style, { color: '#c8372d', fontWeight: '700', background: 'rgba(200,55,45,.13)' });
      ghost.style.visibility = 'hidden';
      root.appendChild(ghost);
      landing = box(ghost.querySelector('.pile .card:last-child'));
    }
    const ghostBox = ghost && box(ghost);

    // 2. o clone que voa (com duas faces se veio do monte)
    const flip = last.from === 'deck' && prev.top;
    const fc = document.createElement('div');
    fc.className = 'fly-card';
    fc.innerHTML = flip
      ? `<div class="fly-tilt"><div class="fly-flip" style="width:${W0}px;height:${W0 * 1.44}px">`
        + `<div class="fly-face back">${CardArt.back(prev.top, W0)}</div><div class="fly-face front">${CardArt.front(card, W0)}</div></div></div>`
      : `<div class="fly-tilt">${CardArt.front(card, W0)}</div>`;
    const tilt = fc.firstElementChild;
    const startT = `translate(${from.x}px,${from.y}px)`;
    fc.style.transform = startT;
    if (drop) tilt.style.transform = 'rotate(-4deg) scale(1.06)';
    root.appendChild(fc);

    return (async () => {
      sound('flip');
      const to = landing || { x: from.x, y: from.y - 40, w: W0 };
      const k = to.w / W0;
      const flight = run.go(fc, [{ transform: startT }, { transform: `translate(${to.x}px,${to.y}px) scale(${k})` }], { duration: FLY_MS, easing: EASE });
      if (drop) run.go(tilt, [{ transform: 'rotate(-4deg) scale(1.06)' }, { transform: 'none' }], { duration: FLY_MS * 0.75, easing: 'ease-out' });
      else run.go(tilt, [{ transform: 'none' }, { transform: 'rotate(-3deg)', offset: 0.45 }, { transform: 'none' }], { duration: FLY_MS, easing: 'ease-in-out' });
      fc.querySelectorAll('.card').forEach((c) => run.go(c,
        drop ? [{ boxShadow: LIFTED }, { boxShadow: SHADOW }] : [{ boxShadow: SHADOW }, { boxShadow: AIR, offset: 0.4 }, { boxShadow: SHADOW }],
        { duration: FLY_MS, easing: 'ease-out' }));
      // 3. vira nos últimos 200ms do voo (perspectiva leve: a carta não afunda)
      if (flip) {
        run.go(fc.querySelector('.fly-flip'), [{ transform: 'perspective(900px) rotateY(0deg)' }, { transform: 'perspective(900px) rotateY(180deg)' }],
          { duration: FLIP_MS, delay: FLY_MS - FLIP_MS, easing: 'ease-in-out', fill: 'both' });
      }
      // cor nova: as outras pilhas abrem espaço enquanto a carta voa
      if (!stack && stacks) relayout(after.includes(card.color) ? after : [...before, card.color], FLY_MS, EASE);
      await flight;
      if (!run.alive || !ghost) { if (run.alive && !ghost) await run.go(fc, [{ opacity: 1 }, { opacity: 0 }], { duration: 250 }); return; }

      // pousou: a pilha de mentira entra no lugar da de verdade (a soma já com a carta nova)
      ghost.style.visibility = 'visible';
      fc.remove();
      if (stack) run.hide(stack);
      if (stacks.classList.contains('empty')) run.goReal(stacks, [{ opacity: getComputedStyle(stacks).opacity }, { opacity: 0 }], { duration: 160 });

      // 4. o resultado
      await run.wait(PAUSE_MS);
      if (!run.alive) return;
      const newCard = ghost.querySelector('.pile .card:last-child');

      if (last.outcome === 'none') {
        sound('drop');
        await run.go(newCard, [{ transform: 'none' }, { transform: 'translateY(-6px)', offset: 0.35, easing: 'ease-in' }, { transform: 'none' }], { duration: BOUNCE_MS, easing: 'ease-out' });
        return;
      }

      if (last.outcome === 'scored') {
        sound('scored');
        ghost.querySelectorAll('.card').forEach((c) => run.go(c, [{ boxShadow: SHADOW }, { boxShadow: GLOW }], { duration: GLOW_MS, easing: 'ease-out' }));
        await run.go(ghost, [{ transform: 'none' }, { transform: 'scale(1.05)' }], { duration: GLOW_MS, easing: 'ease-out' });
        if (!run.alive) return;
        const t = scoreTarget(seat, mine, ghostBox, landing.w, card.color, run);
        relayout(after, RISE_MS, 'ease-in-out');
        await run.go(ghost, [
          { transform: 'scale(1.05)', opacity: 1 },
          { opacity: 1, offset: 0.55 },
          { transform: `translate(${t.x - (ghostBox.x + ghostBox.w / 2)}px,${t.y - (ghostBox.y + ghostBox.h / 2)}px) scale(${t.k})`, opacity: 0 },
        ], { duration: RISE_MS, easing: 'cubic-bezier(.45,0,.55,1)' });
        return;
      }

      // bust / lost: treme e cai (no lost a bandeirinha daquela cor cai junto, e na sua mesa o leque dos pontos também)
      sound(last.outcome);
      const falling = [ghost];
      if (last.outcome === 'lost') {
        const fl = seat.querySelector(`.flag[data-color="${card.color}"]`);
        if (fl) falling.push(pinFlat(fl, run));
        const fan = mine && seat.querySelector(`.fan[data-color="${card.color}"]`);
        if (fan) falling.push(pinFlat(fan, run));
      }
      const shake = [0, -4, 4, -4, 4, -4, 4, 0].map((x) => ({ transform: `translateX(${x}px)` }));
      await Promise.all(falling.map((el) => run.go(el, shake, { duration: SHAKE_MS, easing: 'linear' })));
      if (!run.alive) return;
      relayout(after, FALL_MS, 'ease-in-out');
      await Promise.all(falling.map((el, i) => run.go(el, [
        { transform: 'none', opacity: 1 },
        { opacity: 1, offset: 0.3 },
        { transform: `translateY(60px) rotate(${i === 0 ? 12 : -14}deg)`, opacity: 0 },
      ], { duration: FALL_MS, easing: 'cubic-bezier(.55,0,.85,.45)' })));
    })();
  }

  /** Cópia de uma pilha de verdade, presa no mesmo lugar do palco (com o que o CSS dela tirava de quem a contém). */
  function pin(src) {
    const g = src.cloneNode(true), b = box(src), cs = getComputedStyle(src);
    g.removeAttribute('title');
    Object.assign(g.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, padding: cs.padding });
    const ss = src.querySelector('.sum'), gs = g.querySelector('.sum');
    if (ss && gs) copySum(ss, gs);
    return g;
  }
  function copySum(from, to) {
    const c = getComputedStyle(from);
    Object.assign(to.style, { fontSize: c.fontSize, padding: c.padding, letterSpacing: c.letterSpacing });
  }
  /** Copia uma bandeirinha (ou o leque) pra camada da animação e esconde a de verdade. */
  function pinFlat(el, run) {
    const g = el.cloneNode(true), b = box(el);
    Object.assign(g.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
    run.root.appendChild(g);
    run.hide(el);
    return g;
  }

  /**
   * Pra onde sobem as cartas que fecharam: nos assentos, o fim das bandeirinhas do cabeçalho (onde a nova nasce,
   * e ela nasce ali de fato no fim da subida); na sua mesa, o próximo lugar da área de pontos (onde fica o leque).
   * `cw` é a largura das cartas da pilha. Devolve o centro do destino e a escala final.
   */
  function scoreTarget(seat, mine, gb, cw, color, run) {
    if (mine) {
      const fans = seat.querySelector('.fans');
      if (!fans) return { x: gb.x + gb.w / 2, y: gb.y - 60, k: 0.4 };
      const none = fans.querySelector('.none');
      if (none) run.goReal(none, [{ opacity: getComputedStyle(none).opacity }, { opacity: 0 }], { duration: RISE_MS * 0.6 });
      const all = fans.querySelectorAll('.fan'), lastFan = all[all.length - 1];
      const k = 40 / cw; // as cartas do leque têm 40 de largura
      const fb = box(fans);
      if (lastFan) {
        const lb = box(lastFan), gap = parseFloat(getComputedStyle(fans).columnGap) || 18;
        return { x: lb.x + lb.w + gap + (gb.w * k) / 2, y: lb.y + lb.h / 2, k };
      }
      return { x: fb.x + (gb.w * k) / 2, y: fb.y + 42, k };
    }
    const head = seat.querySelector('.head'), flags = seat.querySelector('.head .flags');
    if (!head || !flags) return { x: gb.x + gb.w / 2, y: gb.y - 40, k: 0.2 };
    const hb = box(head), fb = box(flags);
    const one = flags.querySelector('.flag');
    const fw = one ? box(one).w : 14, gap = parseFloat(getComputedStyle(flags).columnGap) || 3;
    const t = { x: fb.x + fb.w - fw / 2, y: hb.y + hb.h / 2, k: 0.2 };
    // as que já estavam abrem lugar pra esquerda e a nova nasce no fim da subida
    flags.querySelectorAll('.flag').forEach((f) => run.goReal(f, [{ transform: 'none' }, { transform: `translateX(${-(fw + gap)}px)` }],
      { duration: POP_MS, delay: RISE_MS - POP_MS, easing: 'ease-out', fill: 'both' }));
    const nf = document.createElement('span');
    nf.className = 'flag';
    nf.style.setProperty('--c', CardArt.HEX[color]);
    const fh = one ? box(one).h : 16;
    Object.assign(nf.style, { left: `${t.x - fw / 2}px`, top: `${t.y - fh / 2}px`, transformOrigin: '0 50%' });
    run.root.appendChild(nf);
    run.go(nf, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.25)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: POP_MS, delay: RISE_MS - POP_MS, easing: 'ease-out', fill: 'both' });
    return t;
  }

  window.Anim = { play, stop };
})();
