/** Mola amortecida (Euler semi-implícito com substeps fixos a 240 Hz). */
export class Spring {
  v: number;
  t: number;
  vel = 0;
  k = 0;
  c = 0;

  constructor(v = 0, k = 300, zeta = 0.8) {
    this.v = v;
    this.t = v;
    this.set(k, zeta);
  }

  set(k: number, zeta: number): this {
    this.k = k;
    this.c = 2 * zeta * Math.sqrt(k);
    return this;
  }

  snap(v: number): this {
    this.v = v;
    this.t = v;
    this.vel = 0;
    return this;
  }

  get resting(): boolean {
    return this.vel === 0 && this.v === this.t;
  }

  step(dt: number): number {
    if (this.resting) return this.v;
    const n = Math.max(1, Math.ceil(dt * 240));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = -this.k * (this.v - this.t) - this.c * this.vel;
      this.vel += a * h;
      this.v += this.vel * h;
    }
    if (Math.abs(this.v - this.t) < 1e-4 && Math.abs(this.vel) < 1e-3) {
      this.v = this.t;
      this.vel = 0;
    }
    return this.v;
  }
}
