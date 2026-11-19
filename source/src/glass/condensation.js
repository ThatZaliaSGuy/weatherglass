/**
 * CondensationField: per-pane CPU simulation of mist film, beads, rain wetting and running drips, packed into a texture atlas, with wiping.
 */
import * as THREE from "three";
import { WATER_LEVELS } from "../core/config.js";
import { createSimplexNoise } from "../util/noise.js";
import { clamp, smoothstep2 } from "../util/math.js";
import { GLASS_DRIP_LIMITS } from "./caseLayout.js";
const condensationNoise = createSimplexNoise(4242);
export class CondensationField {
  constructor(t, e) {
    this.ctx = t;
    const i = t.quality,
      s = (this.GX = i.pick(64, 96, 96)),
      n = (this.GY = i.pick(48, 72, 72));
    ((this.cells = s * n),
      (this.panes = e.map((l, c) => this._initPane(l, c))));
    const o = this.panes.length;
    this.data = new Uint8Array(s * n * o * 4);
    const a = new THREE.DataTexture(
      this.data,
      s,
      n * o,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    ((a.minFilter = THREE.LinearFilter),
      (a.magFilter = THREE.LinearFilter),
      (a.wrapS = a.wrapT = THREE.ClampToEdgeWrapping),
      (a.generateMipmaps = !1),
      (a.needsUpdate = !0),
      (a.name = "glassCondensation"),
      (this.texture = a),
      (this.boost = 0),
      (this.drive = 0),
      (this.avg = 0),
      (this._rr = 0),
      (this._time = 0),
      (this._uploadT = 0),
      (this.dirty = !0),
      (this.urgent = !1),
      (this._srcs = []));
    for (let l = 0; l < 8; l++)
      this._srcs.push({
        u: 0,
        w: 1,
        vTop: 0,
        s: 0,
      });
    this._pack();
  }
  _initPane(t, e) {
    const { GX: i, GY: s, cells: n } = this,
      o = {
        def: t,
        k: e,
        hu: t.hu,
        hv: t.hv,
        lid: !!t.lid,
        film: new Float32Array(n),
        beads: new Float32Array(n),
        clear: new Float32Array(n),
        rain: new Float32Array(n),
        base: new Float32Array(n),
        soilV: new Float32Array(i),
        last: 0,
        sun: 0,
        drips: [],
        dripU: [],
        sum: 0,
      };
    for (let m = 0; m < GLASS_DRIP_LIMITS.maxDrips; m++)
      o.dripU.push(new THREE.Vector4(0, 0, 0, 0));
    const a = this.ctx.terrain,
      [l, c, h] = t.c,
      [f, , u] = t.t,
      [d, , p] = t.n;
    for (let m = 0; m < i; m++) {
      if (o.lid) {
        o.soilV[m] = -1e3;
        continue;
      }
      const w = -o.hu + (m / (i - 1)) * 2 * o.hu,
        y = clamp(l + f * w - d * 0.1, -5.98, 5.98),
        _ = clamp(h + u * w - p * 0.1, -3.98, 3.98);
      let M = a.height(y, _);
      (a.lakeMask(y, _) > 0.4 &&
        (M = Math.max(M, WATER_LEVELS.lakeLevel + 0.04)),
        (o.soilV[m] = M - c));
    }
    const [v, g] = [t.vis[2], t.vis[3]],
      x = e * 17.3;
    for (let m = 0; m < s; m++) {
      const w = -o.hv + (m / (s - 1)) * 2 * o.hv;
      for (let y = 0; y < i; y++) {
        const _ = -o.hu + (y / (i - 1)) * 2 * o.hu,
          M = Math.max(0, Math.min(_ - t.vis[0], t.vis[1] - _, w - v, g - w)),
          A = condensationNoise.fbm2(_ * 0.33 + x, w * 0.33 - x, 4);
        let b;
        if (o.lid) b = (0.26 + 0.74 * Math.exp(-M / 1.6)) * (0.8 + 0.42 * A);
        else {
          const S = clamp((w - v) / (g - v), 0, 1);
          b =
            (0.58 + 0.42 * Math.exp(-M / 1.4)) *
            (0.78 + 0.32 * S) *
            (0.82 + 0.36 * A);
          const E = o.soilV[y];
          w < E + 0.05
            ? (b *= 0.28)
            : (b *= 0.75 + 0.25 * smoothstep2(E, E + 0.8, w));
        }
        o.base[m * i + y] = clamp(b, 0.04, 1.15);
      }
    }
    return o;
  }
  set(t) {
    const e = clamp(t, 0, 1);
    this.boost = e;
    for (const i of this.panes) {
      for (let n = 0; n < this.cells; n++) {
        const o = Math.min(1, e * i.base[n]);
        ((i.film[n] = o),
          (i.beads[n] = smoothstep2(0.3, 0.9, o) * 0.9),
          (i.clear[n] = 0));
      }
      i.drips.length = 0;
      let s = 0;
      for (let n = 0; n < this.cells; n++) s += i.film[n];
      i.sum = s / this.cells;
    }
    ((this.dirty = this.urgent = !0), this._average());
  }
  get average() {
    return this.avg;
  }
  _drive() {
    const t = this.ctx.world,
      e = t.seaLevelTemp,
      i = clamp((12 - e) / 16, 0, 1),
      s = t.day * clamp(t.lightIntensity / 3.4, 0, 1);
    let n =
      (t.humidity - 0.64) * 1.45 +
      t.fogAmount * 1.05 +
      Math.min(t.rainfall, 1.5) * 0.18 +
      Math.min(t.snowfall, 1.5) * 0.1 +
      t.storminess * 0.15 +
      i * 0.38 * t.humidity -
      s * 0.3;
    return ((n = clamp(n, 0, 1)), Math.max(n, this.boost));
  }
  update(t) {
    if (t <= 0) {
      this._upload(0);
      return;
    }
    ((this._time += t),
      (this.boost = Math.max(0, this.boost - t * 0.006)),
      (this.drive = this._drive()));
    const e = this.panes[this._rr];
    this._rr = (this._rr + 1) % this.panes.length;
    const i = Math.min(0.5, this._time - e.last);
    ((e.last = this._time), i > 0 && this._stepPane(e, i));
    for (const s of this.panes) s.lid || this._stepDrips(s, t);
    this._upload(t);
  }
  _stepPane(t, e) {
    const { GX: i, GY: s } = this,
      n = this.ctx.world,
      o =
        n.day * clamp(n.lightIntensity / 3.4, 0, 1) * (1 - n.cloudCover * 0.5),
      [a, l, c] = t.def.n,
      h = Math.max(0, a * n.sunDir.x + l * n.sunDir.y + c * n.sunDir.z);
    t.sun = h * o;
    const f = this.drive * (1 - 0.55 * t.sun),
      u = 0.065 * e,
      d = (0.04 + 0.16 * o + 0.12 * t.sun) * e,
      p = 0.022 * e,
      v = 0.035 * e,
      g = 0.14 * e,
      x = t.lid ? 0 : this._gatherRain(t),
      m = n.storminess,
      w = this._srcs;
    let y = 0;
    for (let _ = 0; _ < s; _++) {
      const M = -t.hv + (_ / (s - 1)) * 2 * t.hv;
      for (let A = 0; A < i; A++) {
        const b = _ * i + A,
          S = f * t.base[b];
        let E = t.film[b],
          T = t.clear[b];
        (S > E
          ? (E += (S - E) * Math.min(1, u * (1 - 0.95 * T)))
          : (E += (S - E) * Math.min(1, d)),
          (T = T > p ? T - p : 0));
        let R = t.rain[b],
          z = 0;
        if ((x || m > 0.05) && M > t.soilV[A] + 0.04) {
          const F = -t.hu + (A / (i - 1)) * 2 * t.hu;
          for (let G = 0; G < x; G++) {
            const B = w[G],
              q = (F - B.u) / B.w,
              X = M < B.vTop ? 1 : Math.max(0, 1 - (M - B.vTop) / 0.6),
              vt = B.s * Math.exp(-q * q) * X;
            vt > z && (z = vt);
          }
          z = Math.max(z, m * 0.38 * (0.7 + 0.3 * t.base[b]));
        }
        R += (z - R) * Math.min(1, z > R ? 2.2 * e : 0.05 * e);
        const L = Math.min(1, smoothstep2(0.3, 0.9, E) * 0.95 + R * 0.45);
        let k = t.beads[b];
        ((k += (L - k) * Math.min(1, L > k ? v * (1 - 0.8 * T) : g)),
          (t.film[b] = E),
          (t.clear[b] = T),
          (t.rain[b] = R),
          (t.beads[b] = k),
          (y += E));
      }
    }
    if (
      ((t.sum = y / this.cells),
      !t.lid && t.drips.length < GLASS_DRIP_LIMITS.maxDrips)
    )
      for (let _ = 0; _ < 4; _++) {
        const M = (Math.random() * i) | 0,
          A = (Math.random() * s) | 0,
          b = A * i + M,
          S =
            Math.max(0, (t.beads[b] - 0.55) / 0.45) *
              smoothstep2(0.35, 0.6, t.film[b]) +
            t.rain[b] * 0.6;
        if (S <= 0 || Math.random() > S * 0.0045 * (e * 12)) continue;
        const E = -t.hu + (M / (i - 1)) * 2 * t.hu,
          T = -t.hv + (A / (s - 1)) * 2 * t.hv;
        if (
          !(
            T < t.soilV[M] + 0.6 ||
            E < t.def.vis[0] + 0.1 ||
            E > t.def.vis[1] - 0.1 ||
            T > t.def.vis[3]
          ) &&
          (t.drips.push({
            u: E,
            v: T,
            r: 0.028 + Math.random() * 0.026,
            vel: 0,
            hold: Math.random() * 0.5,
            seed: Math.random() * 6.28,
          }),
          t.drips.length >= GLASS_DRIP_LIMITS.maxDrips)
        )
          break;
      }
    ((this.dirty = !0), this._average());
  }
  _gatherRain(t) {
    const e = this.ctx.precip?.sources;
    if (!e || !e.length) return 0;
    const i = this.ctx.world,
      [s, n, o] = t.def.c,
      [a, , l] = t.def.t,
      [c, , h] = t.def.n,
      f = s * c + o * h - 0.04;
    let u = 0;
    for (const d of e) {
      if (u >= this._srcs.length) break;
      if (!(d.rate > 0.02)) continue;
      const p = f - (d.x * c + d.z * h),
        v = d.radius + 1.7;
      if (p > v || p < -0.5) continue;
      const g = 1 - i.snowFractionAt(Math.max(0, d.y * 0.5)),
        x = smoothstep2(v, d.radius * 0.2, p) * Math.min(1.2, d.rate) * g * 1.6;
      if (x < 0.02) continue;
      const m = this._srcs[u++];
      ((m.u = (d.x - s) * a + (d.z - o) * l),
        (m.w = d.radius + 0.9),
        (m.vTop = d.y - n),
        (m.s = Math.min(1, x)));
    }
    return u;
  }
  _stepDrips(t, e) {
    const { GX: i, GY: s } = this,
      n = t.drips;
    for (let o = n.length - 1; o >= 0; o--) {
      const a = n[o];
      if (a.hold > 0) a.hold -= e;
      else {
        const c = 0.22 + a.r * 10;
        ((a.vel = Math.min(c, a.vel + 1.4 * e)),
          (a.v -= a.vel * e),
          (a.u += Math.sin(a.v * 6 + a.seed) * 0.025 * e),
          (a.r = Math.max(0, a.r - a.vel * e * 0.0045)),
          Math.random() < e * Math.max(0.15, 1.1 - a.r * 14) &&
            ((a.hold = 0.12 + Math.random() * 0.7), (a.vel = 0)));
        const h = ((a.u + t.hu) / (2 * t.hu)) * (i - 1),
          f = ((a.v + t.hv) / (2 * t.hv)) * (s - 1),
          u = Math.round(h),
          d = Math.round(f);
        for (let p = d; p <= d + 1; p++) {
          if (p < 0 || p >= s || u < 0 || u >= i) continue;
          const v = p * i + u;
          ((a.r = Math.min(0.065, a.r + t.beads[v] * 6e-4)),
            (t.film[v] *= 0.25),
            (t.beads[v] *= 0.15),
            (t.clear[v] = Math.max(t.clear[v], 0.92)));
        }
        this.dirty = !0;
      }
      const l = Math.max(
        0,
        Math.min(i - 1, Math.round(((a.u + t.hu) / (2 * t.hu)) * (i - 1))),
      );
      (a.v < t.soilV[l] + a.r || a.v < t.def.vis[2] + a.r || a.r < 0.012) &&
        n.splice(o, 1);
    }
    for (let o = 0; o < GLASS_DRIP_LIMITS.maxDrips; o++) {
      const a = n[o],
        l = t.dripU[o];
      a
        ? l.set(a.u, a.v, a.r, Math.min(1, a.vel / (0.22 + a.r * 10)))
        : (l.z = 0);
    }
  }
  wipe(t, e, i, s, n, o) {
    const a = this.panes[t],
      { GX: l, GY: c } = this,
      h = (2 * a.hu) / (l - 1),
      f = (2 * a.hv) / (c - 1),
      u = Math.hypot(s - e, n - i),
      d = Math.max(1, Math.ceil(u / (o * 0.3)));
    let p = 0;
    for (let v = 0; v <= d; v++) {
      const g = v / d,
        x = e + (s - e) * g,
        m = i + (n - i) * g,
        w = Math.max(0, Math.floor((x - o + a.hu) / h)),
        y = Math.min(l - 1, Math.ceil((x + o + a.hu) / h)),
        _ = Math.max(0, Math.floor((m - o + a.hv) / f)),
        M = Math.min(c - 1, Math.ceil((m + o + a.hv) / f));
      for (let A = _; A <= M; A++) {
        const b = -a.hv + A * f - m;
        for (let S = w; S <= y; S++) {
          const E = -a.hu + S * h - x,
            T = Math.sqrt(E * E + b * b),
            R = A * l + S;
          if (T >= o) {
            T < o * 1.35 &&
              a.film[R] > 0.15 &&
              (a.beads[R] = Math.min(1, a.beads[R] + 0.06 * a.film[R]));
            continue;
          }
          const z = smoothstep2(o, o * 0.45, T) * 0.85,
            L = a.film[R];
          ((a.film[R] *= 1 - z),
            (a.beads[R] *= 1 - z * 0.9),
            (a.rain[R] *= 1 - z * 0.7),
            (a.clear[R] = Math.max(a.clear[R], z * 1.15)),
            (p += (L - a.film[R]) * h * f));
        }
      }
    }
    for (let v = a.drips.length - 1; v >= 0; v--) {
      const g = a.drips[v],
        x = clamp(
          ((g.u - e) * (s - e) + (g.v - i) * (n - i)) / (u * u || 1),
          0,
          1,
        );
      Math.hypot(e + (s - e) * x - g.u, i + (n - i) * x - g.v) < o &&
        a.drips.splice(v, 1);
    }
    return ((this.dirty = this.urgent = !0), p);
  }
  _average() {
    if (!this._baseAvg) {
      let e = 0;
      for (const i of this.panes)
        for (let s = 0; s < this.cells; s++) e += Math.min(1, i.base[s]);
      this._baseAvg = e / (this.cells * this.panes.length);
    }
    let t = 0;
    for (const e of this.panes) t += e.sum;
    this.avg = Math.min(1, t / this.panes.length / this._baseAvg);
  }
  _pack() {
    const { GX: t, GY: e, cells: i, data: s } = this;
    for (const n of this.panes) {
      const o = n.k * i * 4;
      for (let a = 0; a < i; a++) {
        const l = o + a * 4;
        ((s[l] = Math.min(255, n.film[a] * 255 + 0.5)),
          (s[l + 1] = Math.min(255, n.beads[a] * 255 + 0.5)),
          (s[l + 2] = Math.min(255, n.clear[a] * 220 + 0.5)),
          (s[l + 3] = Math.min(255, n.rain[a] * 255 + 0.5)));
      }
    }
    this.texture.needsUpdate = !0;
  }
  _upload(t) {
    ((this._uploadT += t),
      this.dirty &&
        ((!this.urgent && this._uploadT < 1 / 15) ||
          ((this._uploadT = 0),
          (this.dirty = this.urgent = !1),
          this._pack())));
  }
  mapFor(t) {
    const { GX: e, GY: i } = this,
      s = this.panes.length,
      n = this.panes[t];
    return {
      map: new THREE.Vector4(
        n.hu,
        n.hv,
        (t * i + 0.5) / (s * i),
        (i - 1) / (s * i),
      ),
      x: new THREE.Vector2(0.5 / e, (e - 1) / e),
    };
  }
}
