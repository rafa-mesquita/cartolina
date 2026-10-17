import type { WorkOf } from '@cartolina/shared';
import type * as ThreeNS from 'three';
import type { KitModule } from './types';

/* Kit "blocos 3D": 6 blocos de madeira numa mesa de feltro com um papel 8×8; empilha, gira, deita e escolhe o ângulo.
   Obra = {kit:'blocks', pieces:{x,y,z,rot,lay}[6], camera:{theta,phi}}: uma peça por forma, na ordem de BLOCK_SHAPES
   (cubo, tijolo, prancha, pilar, telhado, arco); x/z em ±6, y = altura que o empilhamento calculou (quem mostra não
   reempilha), rot em graus, lay = deitada. Câmera em radianos: θ gira em volta da mesa, φ inclina (0 = de cima).
   Cena = a da referência aprovada (prototipo/retratim/ref/blocos-3d.html, v3): sem comandos fora da cena. O three.js
   vem com `import()` só quando o kit aparece (chunk separado); o `show` usa um único renderizador fora da tela e
   devolve uma imagem (com cache por obra). */

type Three = typeof ThreeNS;
type Work = WorkOf<'blocks'>;
type Piece = Work['pieces'][number];
type Camera = Work['camera'];

const COLORS = [0xd9a066, 0xc98b4f, 0xe3b67a, 0xd29a5c, 0xdba870, 0xcf9358];
// posição inicial: espalhadas na borda do papel (que vai de −4 a 4)
const START: readonly (readonly [number, number])[] = [[-3, -3], [-0.9, -3.1], [2.1, -3], [-3.1, 0.3], [3, 0.2], [0.3, 3]];
const CAM0: Camera = { theta: 0.5, phi: 0.95 }, DI = 12.5, FOV = 38, LOOK_Y = 0.6;
const PHI_MIN = 0.02, PHI_MAX = 1.4, LIM = 5.5, TURN = Math.PI / 12;
const SHOW_W = 800, SHOW_H = 600, CACHE_MAX = 60;

const CSS = `
.pc-kb{position:absolute;inset:0;container-type:size;font-family:var(--ui);overflow:hidden;border-radius:3px;touch-action:none}
.pc-kb canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.pc-kb-tb{position:absolute;display:none;gap:.7cqw;padding:.7cqw;background:var(--paper);border:1px solid var(--edge);border-radius:1.4cqw;
  box-shadow:0 2px 6px rgba(59,47,47,.28);z-index:2}
.pc-kb-tb button{height:5.2cqw;min-width:5.2cqw;padding:0 1.4cqw;border-radius:1cqw;border:1px solid var(--edge);background:var(--photo-border);
  font:700 2.2cqw/1 var(--ui);color:var(--ink);display:inline-flex;align-items:center;justify-content:center}
.pc-kb-tb button i{font-size:2.9cqw;line-height:1}
.pc-kb-tb button:hover{color:var(--blue);border-color:var(--blue)}
.pc-kb-lg{position:absolute;left:1.8cqw;bottom:1.8cqw;display:flex;flex-direction:column;gap:.55cqw;pointer-events:none;
  font:600 1.85cqw/1.3 var(--ui);color:var(--paper)}
.pc-kb-lg span{width:max-content;padding:.5cqw 1.4cqw;border-radius:1cqw;background:rgba(59,47,47,.5)}
.pc-kb-rs{position:absolute;right:1.8cqw;top:1.8cqw;width:6cqw;height:6cqw;padding:0;border-radius:50%;border:1px solid var(--edge);
  background:var(--paper);color:var(--ink-soft);display:grid;place-items:center;box-shadow:0 1px 2px rgba(59,47,47,.25);z-index:2}
.pc-kb-rs i{font-size:3.2cqw;line-height:1}
.pc-kb-rs:hover{color:var(--blue);border-color:var(--blue)}
.pc-kb-wait{position:absolute;inset:0;container-type:size;display:flex;flex-direction:column;align-items:center;justify-content:center;
  color:var(--ink-soft);text-align:center;background:rgba(234,219,192,.35)}
.pc-kb-wait span{font:600 max(11px,3.4cqw)/1.2 var(--ui);margin-bottom:2.6cqw}
.pc-kb-wait.fail span{color:var(--ink)}
.pc-kb-wait button{font:700 max(11px,2.6cqw)/1 var(--ui);padding:1.4cqw 3.4cqw;border-radius:999px;border:1px solid var(--blue);background:none;color:var(--blue)}
.pc-kb-wait button:hover{background:rgba(47,90,168,.08)}
.pc-kb-show{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:cover}`;

function injectCSS(): void {
  if (document.getElementById('pc-kit-blocks-css')) return;
  const s = document.createElement('style');
  s.id = 'pc-kit-blocks-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const round2 = (v: number) => Math.round(v * 100) / 100;
const okNum = (v: unknown, a: number, b: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;
const normDeg = (deg: number) => ((Math.round(deg) % 360) + 360) % 360;
/** θ em (−π, π], mesmo ângulo (a câmera volta igual ao ler a obra). */
const normTheta = (t: number) => {
  const T = 2 * Math.PI;
  return ((((t + Math.PI) % T) + T) % T) - Math.PI;
};

/* ---------- three.js sob demanda (uma vez só; se falhar, a próxima tentativa recomeça) ---------- */
let three: Three | null = null;
let loading: Promise<Three> | null = null;
function loadThree(): Promise<Three> {
  if (three) return Promise.resolve(three);
  if (!loading) {
    loading = import('three')
      .then((T) => (three = T))
      .catch((err: unknown) => {
        loading = null;
        throw err;
      });
  }
  return loading;
}
/** Aviso no lugar da cena: carregando, ou falhou com "tentar de novo". */
function wait(el: HTMLElement, retry?: () => void): void {
  el.innerHTML = retry
    ? '<div class="pc-kb-wait fail"><span>não deu pra carregar os blocos</span><button>tentar de novo</button></div>'
    : '<div class="pc-kb-wait"><span>carregando os blocos…</span></div>';
  if (retry) el.querySelector('button')!.addEventListener('click', retry, { once: true });
}

/*
 * Aparência igual à do protótipo (three.js r128): lá as cores não passavam por gestão de cor e a saída era linear,
 * e a luz "legada" multiplicava a intensidade por π. Aqui: cores lidas como lineares, saída linear e intensidade × π.
 */
const lin = (T: Three, hex: number): ThreeNS.Color => new T.Color().setHex(hex, T.LinearSRGBColorSpace);

/* ---------- cena (mesa, papel, luz, as 6 formas) ---------- */
interface Scene {
  S: ThreeNS.Scene;
  B: ThreeNS.Mesh<ThreeNS.BufferGeometry, ThreeNS.MeshStandardMaterial>[];
}
interface BlockData {
  ry: number;
  lay: boolean;
}
const data = (b: ThreeNS.Object3D): BlockData => b.userData as BlockData;

function makeScene(T: Three): Scene {
  const S = new T.Scene();
  S.add(new T.HemisphereLight(lin(T, 0xffffff), lin(T, 0x8a8070), 0.75 * Math.PI));
  const sun = new T.DirectionalLight(lin(T, 0xfff4e0), 0.85 * Math.PI);
  sun.position.set(5, 9, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  S.add(sun);
  const felt = new T.Mesh(new T.PlaneGeometry(16, 16), new T.MeshStandardMaterial({ color: lin(T, 0x3f6e55), roughness: 1 }));
  felt.rotation.x = -Math.PI / 2;
  felt.receiveShadow = true;
  S.add(felt);
  const paper = new T.Mesh(new T.PlaneGeometry(8, 8), new T.MeshStandardMaterial({ color: lin(T, 0xece3d0), roughness: 0.95 }));
  paper.rotation.x = -Math.PI / 2;
  paper.position.y = 0.005;
  paper.receiveShadow = true;
  S.add(paper);

  const ext = (shape: ThreeNS.Shape, depth: number) => {
    const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.center();
    return g;
  };
  const tri = new T.Shape();
  tri.moveTo(-1, 0);
  tri.lineTo(1, 0);
  tri.lineTo(0, 1);
  tri.lineTo(-1, 0);
  const arc = new T.Shape();
  arc.moveTo(-1, 0);
  arc.lineTo(-1, 1.1);
  arc.lineTo(1, 1.1);
  arc.lineTo(1, 0);
  arc.lineTo(0.6, 0);
  arc.absarc(0, 0, 0.6, 0, Math.PI, false);
  arc.lineTo(-1, 0);
  // ordem de BLOCK_SHAPES: cubo, tijolo, prancha, pilar, telhado, arco
  const GEOS: (() => ThreeNS.BufferGeometry)[] = [
    () => new T.BoxGeometry(1, 1, 1),
    () => new T.BoxGeometry(2, 0.6, 1),
    () => new T.BoxGeometry(3.2, 0.25, 0.8),
    () => new T.CylinderGeometry(0.35, 0.35, 2.2, 28),
    () => ext(tri, 1),
    () => ext(arc, 0.8),
  ];
  const B = GEOS.map((gf, i) => {
    const geo = gf();
    const m = new T.Mesh(geo, new T.MeshStandardMaterial({ color: lin(T, COLORS[i]!), roughness: 0.7 }));
    m.castShadow = m.receiveShadow = true;
    m.rotation.order = 'YXZ';
    m.userData = { ry: 0, lay: false } satisfies BlockData;
    m.add(
      new T.LineSegments(
        new T.EdgesGeometry(geo, 30),
        new T.LineBasicMaterial({ color: lin(T, 0x6b4423), transparent: true, opacity: 0.35 }),
      ),
    );
    S.add(m);
    return m;
  });
  return { S, B };
}
function disposeScene(S: ThreeNS.Scene): void {
  S.traverse((o) => {
    const m = o as Partial<ThreeNS.Mesh>;
    m.geometry?.dispose();
    const mat = m.material;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}
function makeRenderer(T: Three, opts: ThreeNS.WebGLRendererParameters = {}): ThreeNS.WebGLRenderer {
  const R = new T.WebGLRenderer({ antialias: true, alpha: true, ...opts });
  R.outputColorSpace = T.LinearSRGBColorSpace;
  R.shadowMap.enabled = true;
  R.shadowMap.type = T.PCFShadowMap;
  return R;
}
const orient = (b: ThreeNS.Object3D) => b.rotation.set(data(b).lay ? Math.PI / 2 : 0, data(b).ry, 0);
/** Põe a peça onde a obra diz (sem reempilhar). */
function place(b: ThreeNS.Object3D, q: Piece): void {
  data(b).ry = (q.rot * Math.PI) / 180;
  data(b).lay = q.lay;
  orient(b);
  b.position.set(q.x, q.y, q.z);
  b.updateMatrixWorld(true);
}
function aim(cam: ThreeNS.PerspectiveCamera, theta: number, phi: number): void {
  const p = Math.max(PHI_MIN, phi);
  cam.position.set(DI * Math.sin(p) * Math.sin(theta), DI * Math.cos(p), DI * Math.sin(p) * Math.cos(theta));
  cam.lookAt(0, LOOK_Y, 0);
}
/** Lê a obra; peça inválida fica de fora (null) e volta pro lugar inicial na montagem. */
function readWork(work: Work | null): { pieces: (Piece | null)[]; camera: Camera | null } {
  const ok = work?.kit === 'blocks';
  const pieces = START.map((_, i) => {
    const q = ok && Array.isArray(work.pieces) ? work.pieces[i] : null;
    return q && okNum(q.x, -6, 6) && okNum(q.y, 0, 20) && okNum(q.z, -6, 6) && okNum(q.rot, -3600, 3600)
      ? { x: q.x, y: q.y, z: q.z, rot: normDeg(q.rot), lay: !!q.lay }
      : null;
  });
  const c = ok ? work.camera : null;
  const camera = c && okNum(c.theta, -100, 100) && okNum(c.phi, 0, 1.6) ? { theta: c.theta, phi: c.phi } : null;
  return { pieces, camera };
}

/* ---------- montagem ---------- */
function build(el: HTMLElement, work: Work | null, onChange: (work: Work) => void) {
  injectCSS();
  let alive = true;
  let scene: { destroy(): void } | null = null;
  function start(): void {
    wait(el);
    loadThree().then(
      (T) => {
        if (!alive) return;
        try {
          scene = mount(T, el, work, onChange);
        } catch (err) {
          console.error('blocos: não deu pra abrir a cena', err);
          wait(el, start);
        }
      },
      (err: unknown) => {
        if (!alive) return;
        console.warn(err instanceof Error ? err.message : err);
        wait(el, start);
      },
    );
  }
  start();
  return {
    destroy() {
      alive = false;
      scene?.destroy();
      el.innerHTML = '';
    },
  };
}

function mount(T: Three, el: HTMLElement, work: Work | null, onChange: (work: Work) => void): { destroy(): void } {
  el.innerHTML =
    `<div class="pc-kb">
      <div class="pc-kb-tb"><button data-b="l" title="girar pra esquerda" aria-label="girar pra esquerda"><i class="ti ti-rotate"></i></button>` +
    `<button data-b="r" title="girar pra direita" aria-label="girar pra direita"><i class="ti ti-rotate-clockwise"></i></button>` +
    `<button data-b="lay"><span>deitar</span></button></div>
      <button class="pc-kb-rs" title="espalhar as peças de novo" aria-label="espalhar as peças de novo"><i class="ti ti-arrows-shuffle"></i></button>
      <div class="pc-kb-lg"><span>segure e arraste uma peça pra mover</span><span>solte pra ver as opções de girar</span>` +
    `<span>rodinha do mouse gira a mesa</span><span>arraste o fundo pra inclinar a vista</span></div></div>`;
  const root = el.querySelector<HTMLElement>('.pc-kb')!;
  const tb = root.querySelector<HTMLElement>('.pc-kb-tb')!;
  const layT = tb.querySelector<HTMLElement>('[data-b="lay"] span')!;
  const rs = root.querySelector<HTMLElement>('.pc-kb-rs')!;
  const W = root.clientWidth || 600, H = root.clientHeight || 450;

  const R = makeRenderer(T);
  // resolução pelo tamanho na tela (no arraste do divisor o canvas só escala; ao soltar a bancada é recriada)
  const onScreen = root.getBoundingClientRect().width || W;
  R.setPixelRatio(clamp((onScreen / W) * (window.devicePixelRatio || 1), 1, 2));
  R.setSize(W, H, false);
  const cv = R.domElement;
  root.insertBefore(cv, root.firstChild);
  const { S, B } = makeScene(T);
  const cam = new T.PerspectiveCamera(FOV, W / H, 0.1, 100);

  const got = readWork(work);
  let th = got.camera ? got.camera.theta : CAM0.theta, ph = got.camera ? got.camera.phi : CAM0.phi;

  const box = (b: ThreeNS.Object3D) => new T.Box3().setFromObject(b);
  function ov(a: ThreeNS.Box3, b: ThreeNS.Box3): boolean {
    const e = 0.04;
    return a.min.x < b.max.x - e && a.max.x > b.min.x + e && a.min.z < b.max.z - e && a.max.z > b.min.z + e;
  }
  /** Empilha: de baixo pra cima, cada peça desce até o topo mais alto de quem ela cobre (`top` por último). */
  function settle(top: ThreeNS.Object3D | null): void {
    const bx = new Map<ThreeNS.Object3D, ThreeNS.Box3>(), done: ThreeNS.Object3D[] = [];
    const order: ThreeNS.Object3D[] = B.filter((b) => b !== top).sort((a, b) => box(a).min.y - box(b).min.y);
    if (top) order.push(top);
    for (const b of order) {
      b.position.y = 0;
      b.updateMatrixWorld(true);
      const x = box(b);
      let base = 0;
      for (const o of done) if (ov(x, bx.get(o)!)) base = Math.max(base, bx.get(o)!.max.y);
      b.position.y = base - x.min.y;
      b.updateMatrixWorld(true);
      bx.set(b, box(b));
      done.push(b);
    }
    draw();
  }
  function scatter(): void {
    B.forEach((b, i) => {
      data(b).ry = 0;
      data(b).lay = false;
      orient(b);
      b.position.set(START[i]![0], 0, START[i]![1]);
    });
    settle(null);
  }
  const toWork = (): Work => ({
    kit: 'blocks',
    pieces: B.map((b) => ({
      x: round2(clamp(b.position.x, -6, 6)),
      y: round2(clamp(b.position.y, 0, 20)),
      z: round2(clamp(b.position.z, -6, 6)),
      rot: normDeg((data(b).ry * 180) / Math.PI),
      lay: !!data(b).lay,
    })),
    camera: { theta: round2(normTheta(th)), phi: round2(clamp(ph, 0, 1.6)) },
  });
  const emit = () => onChange(toWork());

  let sel: (typeof B)[number] | null = null, showTb = false;
  function pick(b: (typeof B)[number] | null): void {
    if (sel) sel.material.emissive.setHex(0);
    sel = b;
    if (sel) sel.material.emissive.copy(lin(T, 0x3a2408));
    if (!b) showTb = false;
    draw();
  }
  /** Menu flutuante logo acima da peça escolhida (em % da cena, pra acompanhar a escala do divisor). */
  function placeTb(): void {
    if (!sel || !showTb) {
      tb.style.display = 'none';
      return;
    }
    const x = box(sel), c = new T.Vector3((x.min.x + x.max.x) / 2, x.max.y + 0.35, (x.min.z + x.max.z) / 2).project(cam);
    tb.style.display = 'flex';
    layT.textContent = data(sel).lay ? 'levantar' : 'deitar';
    const w = tb.offsetWidth, h = tb.offsetHeight;
    const px = clamp(((c.x + 1) / 2) * W - w / 2, 6, W - w - 6), py = clamp(((1 - c.y) / 2) * H - h - 6, 6, H - h - 6);
    tb.style.left = (px / W) * 100 + '%';
    tb.style.top = (py / H) * 100 + '%';
  }
  function draw(): void {
    R.render(S, cam);
    placeTb();
  }
  function updCam(): void {
    aim(cam, th, ph);
    draw();
  }

  const ray = new T.Raycaster(), mv = new T.Vector2(), floor = new T.Plane(new T.Vector3(0, 1, 0), 0), hit = new T.Vector3();
  function setM(e: PointerEvent): void {
    const r = cv.getBoundingClientRect();
    mv.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mv.y = (-(e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mv, cam);
  }
  let mode: 'drag' | 'orbit' | null = null, moved = false, pid: number | null = null;
  const off = { x: 0, z: 0 }, last = { x: 0, y: 0 };
  function onDown(e: PointerEvent): void {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    setM(e);
    const hs = ray.intersectObjects(B, false);
    cv.setPointerCapture(e.pointerId);
    pid = e.pointerId;
    moved = false;
    showTb = false;
    const first = hs[0];
    if (first) {
      pick(first.object as (typeof B)[number]);
      mode = 'drag';
      if (ray.ray.intersectPlane(floor, hit)) {
        off.x = sel!.position.x - hit.x;
        off.z = sel!.position.z - hit.z;
      } else {
        off.x = off.z = 0;
      }
      cv.style.cursor = 'grabbing';
    } else {
      pick(null);
      mode = 'orbit';
      last.x = e.clientX;
      last.y = e.clientY;
    }
  }
  function onMove(e: PointerEvent): void {
    if (mode === 'drag' && e.pointerId === pid) {
      setM(e);
      if (sel && ray.ray.intersectPlane(floor, hit)) {
        sel.position.x = clamp(hit.x + off.x, -LIM, LIM);
        sel.position.z = clamp(hit.z + off.z, -LIM, LIM);
        moved = true;
        settle(sel);
      }
    } else if (mode === 'orbit' && e.pointerId === pid) {
      th -= (e.clientX - last.x) * 0.008;
      ph = clamp(ph - (e.clientY - last.y) * 0.006, PHI_MIN, PHI_MAX);
      last.x = e.clientX;
      last.y = e.clientY;
      moved = true;
      updCam();
    } else if (!mode) {
      setM(e);
      cv.style.cursor = ray.intersectObjects(B, false).length ? 'grab' : 'default';
    }
  }
  function onUp(e: PointerEvent): void {
    if (!mode || e.pointerId !== pid) return;
    if (mode === 'drag' && sel) showTb = true;
    const changed = moved;
    mode = null;
    pid = null;
    moved = false;
    cv.style.cursor = 'default';
    draw();
    if (changed) emit();
  }
  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    th += e.deltaY * 0.004;
    updCam();
    emit();
  }
  function turn(d: number): void {
    if (!sel) return;
    data(sel).ry += d;
    orient(sel);
    settle(sel);
    emit();
  }
  function onTb(e: MouseEvent): void {
    const b = (e.target as Element).closest<HTMLElement>('button[data-b]');
    if (!b || !sel) return;
    if (b.dataset.b === 'l') turn(TURN);
    else if (b.dataset.b === 'r') turn(-TURN);
    else {
      data(sel).lay = !data(sel).lay;
      orient(sel);
      settle(sel);
      emit();
    }
  }
  function onScatter(): void {
    pick(null);
    scatter();
    emit();
  }
  const stop = (e: Event) => e.stopPropagation();

  // peças e câmera: da obra recebida (sem reempilhar) ou espalhadas na borda do papel
  B.forEach((b, i) => {
    const q = got.pieces[i];
    if (q) place(b, q);
    else {
      b.position.set(START[i]![0], 0, START[i]![1]);
      orient(b);
    }
  });
  if (got.pieces.some((q) => !q)) settle(null);
  aim(cam, th, ph);
  draw();

  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('wheel', onWheel, { passive: false });
  tb.addEventListener('click', onTb);
  tb.addEventListener('pointerdown', stop);
  rs.addEventListener('click', onScatter);
  rs.addEventListener('pointerdown', stop);
  return {
    destroy() {
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointercancel', onUp);
      cv.removeEventListener('wheel', onWheel);
      tb.removeEventListener('click', onTb);
      tb.removeEventListener('pointerdown', stop);
      rs.removeEventListener('click', onScatter);
      rs.removeEventListener('pointerdown', stop);
      disposeScene(S);
      R.dispose();
      R.forceContextLoss();
      el.innerHTML = '';
    },
  };
}

/* ---------- mostra: um renderizador só, fora da tela, que vira imagem ---------- */
let shared: (Scene & { R: ThreeNS.WebGLRenderer; cam: ThreeNS.PerspectiveCamera }) | null = null;
const cache = new Map<string, string>(); // JSON da obra → dataURL
/** Último pedido de cada `el`: se outro `show` chegou antes do three.js carregar, o antigo não desenha. */
const pending = new WeakMap<HTMLElement, object>();
function sharedRenderer(T: Three) {
  if (!shared) {
    const R = makeRenderer(T, { preserveDrawingBuffer: true });
    R.setPixelRatio(1);
    R.setSize(SHOW_W, SHOW_H, false);
    shared = { R, ...makeScene(T), cam: new T.PerspectiveCamera(FOV, SHOW_W / SHOW_H, 0.1, 100) };
  }
  return shared;
}
function picture(T: Three, work: Work, key: string): string {
  const { R, S, B, cam } = sharedRenderer(T), got = readWork(work);
  B.forEach((b, i) => {
    const q = got.pieces[i];
    b.visible = !!q;
    if (q) place(b, q);
  });
  const c = got.camera ?? CAM0;
  aim(cam, c.theta, c.phi);
  R.render(S, cam);
  const url = R.domElement.toDataURL('image/png');
  cache.set(key, url);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return url;
}
function show(el: HTMLElement, work: Work): void {
  injectCSS();
  const key = JSON.stringify(work), tok = {};
  pending.set(el, tok);
  const put = (url: string) => {
    el.innerHTML = `<img class="pc-kb-show" alt="obra de blocos" src="${url}">`;
  };
  const known = cache.get(key);
  if (known) {
    put(known);
    return;
  }
  const draw = (T: Three) => {
    try {
      put(cache.get(key) ?? picture(T, work, key));
    } catch (err) {
      console.error('blocos: não deu pra desenhar a obra', err);
      wait(el, () => show(el, work));
    }
  };
  if (three) {
    draw(three);
    return;
  }
  wait(el);
  loadThree().then(
    (T) => {
      if (pending.get(el) === tok) draw(T);
    },
    () => {
      if (pending.get(el) === tok) wait(el, () => show(el, work));
    },
  );
}

export const blocks: KitModule<'blocks'> = { build, show };
