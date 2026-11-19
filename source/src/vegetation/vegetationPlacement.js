/**
 * Procedural placement of trees and bushes plus ground-cover maps and scatter of grass, flowers and reeds.
 */
import { BOX, WATER_LEVELS } from "../core/config.js";
import { createSimplexNoise, mulberry32 } from "../util/noise.js";
import { clamp, lerp2, smoothstep2 } from "../util/math.js";
import {
  CABIN2,
  LAKE2,
  RIVER_POINTS2,
  lakeEllipse2,
  riverHalfWidth2,
  riverQuery2,
  suitability2,
  terrainHeight2,
  terrainNormal2,
  waterDistance2,
} from "../world/terrainShape.js";
import { FOOTPATHS } from "../world/terrainPaths.js";
const vegetationNoise = createSimplexNoise(5151);
export const PLANT_KIND = {
  pine: 0,
  oak: 1,
  birch: 2,
  cherry: 3,
  bush: 4,
  evergreen: 5,
};
const PLANT_KIND_NAMES = ["pine", "broad", "broad", "blossom", "bush", "bush"];
class PlantDensityGrid {
  constructor(t, e = 0.1) {
    ((this.nx = Math.ceil((BOX.halfW * 2) / e) + 1),
      (this.nz = Math.ceil((BOX.halfD * 2) / e) + 1),
      (this.res = e),
      (this.v = new Float32Array(this.nx * this.nz)));
    for (let i = 0; i < this.nz; i++)
      for (let s = 0; s < this.nx; s++)
        this.v[i * this.nx + s] = suitability2(
          -BOX.halfW + s * e,
          -BOX.halfD + i * e,
          t,
        );
  }
  at(t, e) {
    const i = clamp((t + BOX.halfW) / this.res, 0, this.nx - 1.001),
      s = clamp((e + BOX.halfD) / this.res, 0, this.nz - 1.001),
      n = Math.floor(i),
      o = Math.floor(s),
      a = i - n,
      l = s - o,
      c = this.v,
      h = this.nx;
    return (
      (c[o * h + n] * (1 - a) + c[o * h + n + 1] * a) * (1 - l) +
      (c[(o + 1) * h + n] * (1 - a) + c[(o + 1) * h + n + 1] * a) * l
    );
  }
}
function distanceToPath(r, t) {
  let e = 1 / 0;
  for (const i of FOOTPATHS) {
    const s = i.pts;
    for (let n = 0; n < s.length - 1; n++) {
      const o = s[n],
        a = s[n + 1],
        l = a.x - o.x,
        c = a.z - o.z;
      let h = ((r - o.x) * l + (t - o.z) * c) / (l * l + c * c || 1e-9);
      h = h < 0 ? 0 : h > 1 ? 1 : h;
      const f = Math.hypot(o.x + l * h - r, o.z + c * h - t) - i.width * 0.5;
      f < e && (e = f);
    }
  }
  return e;
}
function isVegetationExcluded(r, t, e) {
  if (lakeEllipse2(r, t) < 1.55 || (t > 2.2 && r > 0.6) || (e && t > 3.05))
    return !0;
  const i = r + 1.45,
    s = t + 1.45;
  return s > -0.2 && Math.abs(i * 0.93 - s * 0.37) < 0.55;
}
function distanceToWaypointSegment(r, t) {
  const e = RIVER_POINTS2[1],
    i = RIVER_POINTS2[2],
    s = i.x - e.x,
    n = i.z - e.z;
  let o = ((r - e.x) * s + (t - e.z) * n) / (s * s + n * n);
  return ((o = clamp(o, 0, 1)), Math.hypot(e.x + s * o - r, e.z + n * o - t));
}
const BIRCH_GROVES = [
  {
    x: -4.9,
    z: 1.9,
    r: 0.95,
    birch: 0.8,
  },
  {
    x: -3.7,
    z: -0.45,
    r: 0.9,
    birch: 0.25,
  },
  {
    x: 4.75,
    z: 0.1,
    r: 1,
    birch: 0.45,
  },
  {
    x: -1.9,
    z: 2.95,
    r: 0.55,
    birch: 0.7,
  },
  {
    x: 1.7,
    z: -0.55,
    r: 0.5,
    birch: 0.3,
  },
];
export function placeTrees(r, t) {
  const e = mulberry32(90210),
    i = (w, y) => w + (y - w) * e(),
    s = Array.isArray(t?.rocks) ? t.rocks : [],
    n = [],
    o = {
      x: 0,
      y: 1,
      z: 0,
    },
    a = (w, y, _) =>
      Math.abs(w) < BOX.halfW - _ * 0.8 - 0.12 &&
      Math.abs(y) < BOX.halfD - _ * 0.8 - 0.12,
    l = (w, y, _) => {
      for (const M of s) if (Math.hypot(M.x - w, M.z - y) < M.r + _) return !1;
      return !0;
    },
    c = (w, y, _, M) => {
      for (const A of n)
        if (Math.hypot(A.x - w, A.z - y) < (A.radius + _) * M) return !1;
      return !0;
    },
    h = (w, y, _, M, A) =>
      !(
        !a(w, y, M) ||
        Math.hypot(w - CABIN2.x, y - CABIN2.z) <
          CABIN2.padRadius + M * 0.6 + 0.2 ||
        distanceToPath(w, y) < _ + (A >= PLANT_KIND.bush ? 0.06 : 0.14) ||
        waterDistance2(w, y) < (A >= PLANT_KIND.bush ? 0.1 : 0.22) ||
        distanceToWaypointSegment(w, y) < 0.7 ||
        !l(w, y, _ + 0.06)
      ),
    f = (w, y, _, M, A) => {
      terrainNormal2(w, y, o);
      const b = 1 - o.y,
        S = terrainHeight2(w, y) - 0.02 - b * A * 0.25,
        E = {
          x: w,
          y: S,
          z: y,
          height: M,
          radius: A,
          kind: PLANT_KIND_NAMES[_],
          code: _,
          seed: Math.floor(e() * 1e9),
          lean: i(0, Math.PI * 2),
          canopyY: S + M * (_ === PLANT_KIND.pine ? 0.5 : 0.65),
        };
      return (n.push(E), E);
    },
    u = (w, y, _, M, A, b = 0.45) => {
      let S = null,
        E = -1;
      for (let T = 0; T < 48; T++) {
        const R = T * 2.399,
          z = b * Math.sqrt(T / 48),
          L = w + Math.cos(R) * z,
          k = y + Math.sin(R) * z;
        if (!h(L, k, A * 0.12, A, _) || !c(L, k, A, 0.8)) continue;
        const U = suitability2(L, k, "tree") + 0.2 - z * 0.4;
        U > E && ((E = U), (S = [L, k]));
      }
      return S ? f(S[0], S[1], _, M, A) : null;
    };
  (u(-3.95, 0.25, PLANT_KIND.oak, 1.3, 0.64, 0.5),
    u(-3.75, 2.4, PLANT_KIND.cherry, 0.8, 0.47, 0.35),
    u(3.3, 0.35, PLANT_KIND.cherry, 0.74, 0.44, 0.45),
    u(-4.95, 1.5, PLANT_KIND.birch, 1.2, 0.3, 0.4));
  const d = new PlantDensityGrid("pine", 0.15);
  let p = 0;
  const v = n.length + r.pine;
  for (; n.length < v && p++ < 12e3;) {
    const w = i(-BOX.halfW + 0.3, BOX.halfW - 0.3),
      y = i(-BOX.halfD + 0.3, 0.4),
      _ = d.at(w, y);
    if (_ < 0.05) continue;
    const M = terrainHeight2(w, y),
      A = smoothstep2(
        0.02,
        0.32,
        vegetationNoise.noise2(w * 0.5 + 3.1, y * 0.7 - 1.4),
      ),
      b = smoothstep2(2.7, 1.3, M);
    if (e() > _ * A * (0.25 + 0.75 * b) * 1.4 || isVegetationExcluded(w, y, !0))
      continue;
    const S = i(0.72, 1.28) * lerp2(1.1, 0.7, smoothstep2(0.9, 2.6, M)),
      E = S * i(0.26, 0.33);
    !h(w, y, 0.04, E, PLANT_KIND.pine) ||
      !c(w, y, E, 0.9) ||
      f(w, y, PLANT_KIND.pine, S, E);
  }
  const g = new PlantDensityGrid("tree", 0.15);
  p = 0;
  const x = n.length + r.broad;
  for (; n.length < x && p++ < 12e3;) {
    const w = i(-BOX.halfW + 0.3, BOX.halfW - 0.3),
      y = i(-BOX.halfD + 0.3, BOX.halfD - 0.3);
    if (isVegetationExcluded(w, y, !0)) continue;
    const _ = g.at(w, y);
    if (_ < 0.05) continue;
    let M = 0,
      A = 0.5;
    for (const T of BIRCH_GROVES) {
      const R = Math.exp(-((w - T.x) ** 2 + (y - T.z) ** 2) / (T.r * T.r));
      R > M && ((M = R), (A = T.birch));
    }
    if (e() > _ * (0.04 + M)) continue;
    const b = e() < A ? PLANT_KIND.birch : PLANT_KIND.oak,
      S = b === PLANT_KIND.birch ? i(0.85, 1.2) : i(0.78, 1.12),
      E = b === PLANT_KIND.birch ? S * i(0.23, 0.29) : S * i(0.42, 0.52);
    !h(w, y, 0.05, E, b) || !c(w, y, E, 0.85) || f(w, y, b, S, E);
  }
  p = 0;
  const m = n.length + r.bush;
  for (; n.length < m && p++ < 12e3;) {
    const w = i(-BOX.halfW + 0.2, BOX.halfW - 0.2),
      y = i(-BOX.halfD + 0.2, BOX.halfD - 0.2),
      _ = waterDistance2(w, y),
      M = terrainHeight2(w, y);
    let A = suitability2(w, y, "grass") * 0.12,
      b = 0;
    for (const L of n) {
      if (L.code >= PLANT_KIND.bush) continue;
      const k = Math.hypot(L.x - w, L.z - y) - L.radius;
      k > -0.05 && k < 0.45 && (b = Math.max(b, 1 - Math.abs(k - 0.1) / 0.45));
    }
    for (const L of s) {
      if (L.r < 0.15) continue;
      const k = Math.hypot(L.x - w, L.z - y) - L.r;
      k > 0 && k < 0.3 && (b = Math.max(b, 1 - k / 0.3));
    }
    const S = smoothstep2(0.1, 0.2, _) * smoothstep2(0.55, 0.3, _);
    if (((A += b * 0.7 + S * 0.45), M > 2.4 && (A *= 0.15), e() > A)) continue;
    const T = e() < 0.35 || M > 1.3 ? PLANT_KIND.evergreen : PLANT_KIND.bush,
      R = i(0.14, 0.3),
      z = R * i(0.8, 1.15);
    (isVegetationExcluded(w, y, !1) &&
      (R > 0.22 || lakeEllipse2(w, y) < 1.25)) ||
      !h(w, y, 0.03, z, T) ||
      !c(w, y, z, 0.9) ||
      f(w, y, T, R, z);
  }
  return n;
}
export class GroundCoverMaps {
  constructor(t, e) {
    const i = (this.res = 0.05),
      s = (this.nx = Math.ceil((BOX.halfW * 2) / i) + 1),
      n = (this.nz = Math.ceil((BOX.halfD * 2) / i) + 1);
    ((this.path = new Float32Array(s * n).fill(9)),
      (this.shade = new Float32Array(s * n)),
      (this.bare = new Float32Array(s * n)));
    const o = (h) => -BOX.halfW + h * i,
      a = (h) => -BOX.halfD + h * i,
      l = (h, f, u, d, p) => {
        const v = Math.max(0, Math.floor((h + BOX.halfW) / i)),
          g = Math.min(s - 1, Math.ceil((f + BOX.halfW) / i)),
          x = Math.max(0, Math.floor((u + BOX.halfD) / i)),
          m = Math.min(n - 1, Math.ceil((d + BOX.halfD) / i));
        for (let w = x; w <= m; w++)
          for (let y = v; y <= g; y++) p(w * s + y, o(y), a(w));
      },
      c = 0.4;
    for (const h of FOOTPATHS)
      for (let f = 0; f < h.pts.length - 1; f++) {
        const u = h.pts[f],
          d = h.pts[f + 1],
          p = d.x - u.x,
          v = d.z - u.z,
          g = p * p + v * v || 1e-9;
        l(
          Math.min(u.x, d.x) - c,
          Math.max(u.x, d.x) + c,
          Math.min(u.z, d.z) - c,
          Math.max(u.z, d.z) + c,
          (x, m, w) => {
            let y = ((m - u.x) * p + (w - u.z) * v) / g;
            y = y < 0 ? 0 : y > 1 ? 1 : y;
            const _ =
              Math.hypot(u.x + p * y - m, u.z + v * y - w) - h.width * 0.5;
            _ < this.path[x] && (this.path[x] = _);
          },
        );
      }
    for (const h of t) {
      const f =
          h.radius *
          (h.code === PLANT_KIND.pine
            ? 0.95
            : h.code >= PLANT_KIND.bush
              ? 0.85
              : 0.75),
        u =
          h.code === PLANT_KIND.pine
            ? 1
            : h.code >= PLANT_KIND.bush
              ? 0.95
              : 0.7;
      l(h.x - f, h.x + f, h.z - f, h.z + f, (d, p, v) => {
        const g = ((p - h.x) ** 2 + (v - h.z) ** 2) / (f * f);
        g < 1 && (this.shade[d] = Math.max(this.shade[d], (1 - g * g) * u));
      });
    }
    if (typeof e?.bareAt == "function")
      for (let h = 0; h < n; h++)
        for (let f = 0; f < s; f++) this.bare[h * s + f] = e.bareAt(o(f), a(h));
    else
      l(
        CABIN2.x - 1.2,
        CABIN2.x + 1.2,
        CABIN2.z - 1.2,
        CABIN2.z + 1.2,
        (h, f, u) => {
          this.bare[h] =
            1 - smoothstep2(0.3, 0.95, Math.hypot(f - CABIN2.x, u - CABIN2.z));
        },
      );
  }
  _s(t, e, i) {
    const s = clamp((e + BOX.halfW) / this.res, 0, this.nx - 1.001),
      n = clamp((i + BOX.halfD) / this.res, 0, this.nz - 1.001),
      o = Math.floor(s),
      a = Math.floor(n),
      l = s - o,
      c = n - a,
      h = this.nx;
    return (
      (t[a * h + o] * (1 - l) + t[a * h + o + 1] * l) * (1 - c) +
      (t[(a + 1) * h + o] * (1 - l) + t[(a + 1) * h + o + 1] * l) * c
    );
  }
  pathAt(t, e) {
    return this._s(this.path, t, e);
  }
  shadeAt(t, e) {
    return this._s(this.shade, t, e);
  }
  bareAt(t, e) {
    return this._s(this.bare, t, e);
  }
}
export function scatterGrass(r, t, e) {
  const i = mulberry32(777),
    s = new PlantDensityGrid("grass", 0.1),
    n = new Float32Array(r * 4),
    o = new Float32Array(r * 4),
    a = new Float32Array(r * 4);
  let l = 0;
  const c = (u, d) => {
      let p = s.at(u, d);
      if (p <= 0.02) return 0;
      const v =
        0.5 +
        0.5 *
          smoothstep2(
            -0.35,
            0.3,
            vegetationNoise.noise2(u * 0.7 + 1.3, d * 0.7 - 4.1),
          );
      return (
        (p *=
          v *
          (1 - 0.9 * t.bareAt(u, d)) *
          smoothstep2(-0.02, 0.1, t.pathAt(u, d)) *
          (1 - t.shadeAt(u, d) * 0.85)),
        p
      );
    },
    h = (u, d, p, v = 0) => {
      if (
        l >= r ||
        Math.abs(u) > BOX.halfW - 0.03 ||
        Math.abs(d) > BOX.halfD - 0.03
      )
        return;
      const g = waterDistance2(u, d);
      if (g < 0.03) return;
      const x = e(u, d),
        m = smoothstep2(0.6, 0.05, g),
        w = clamp(
          smoothstep2(0.9, 2.2, x) +
            (vegetationNoise.noise2(u * 1.7, d * 1.7) * 0.5 + 0.5) * 0.35 -
            m * 0.3,
          0,
          1,
        ),
        y = smoothstep2(
          -0.2,
          0.45,
          vegetationNoise.noise2(u * 0.42 - 3.3, d * 0.42 + 8.1),
        ),
        _ =
          smoothstep2(0.02, 0.45, t.pathAt(u, d)) * (1 - 0.7 * t.bareAt(u, d)),
        M =
          (0.042 + 0.07 * i() * i() + m * 0.045 + p * 0.05 + y * 0.05) *
          lerp2(1, 0.6, smoothstep2(1.2, 2.4, x)) *
          lerp2(0.5, 1, _),
        A = l * 4;
      ((n[A] = u),
        (n[A + 1] = x - 0.004),
        (n[A + 2] = d),
        (n[A + 3] = i()),
        (o[A] = M),
        (o[A + 1] = lerp2(0.009, 0.017, i()) * (0.85 + p * 0.3)),
        (o[A + 2] = i() * Math.PI * 2),
        (o[A + 3] = lerp2(0.12, 0.55, i() * i()) + p * 0.1),
        (a[A] = w),
        (a[A + 1] = lakeEllipse2(u, d) < 1.7 ? 1 : 0),
        (a[A + 2] = m),
        (a[A + 3] = clamp(c(u, d) * 1.1 + v * 0.35 + y * 0.2, 0, 1)),
        l++);
    };
  let f = 0;
  for (; l < r * 0.45 && f++ < r * 4;) {
    const u = lerp2(-BOX.halfW, BOX.halfW, i()),
      d = lerp2(-BOX.halfD, BOX.halfD, i());
    if (i() > c(u, d)) continue;
    const p = 6 + Math.floor(i() * 14),
      v = lerp2(0.025, 0.06, i()),
      g = i() * 0.8;
    for (let x = 0; x < p; x++) {
      const m = i() * Math.PI * 2,
        w = v * Math.sqrt(i());
      h(
        u + Math.cos(m) * w,
        d + Math.sin(m) * w,
        g * (1 - (w / v) * 0.5),
        1 - w / v,
      );
    }
  }
  for (f = 0; l < r && f++ < r * 12;) {
    const u = lerp2(-BOX.halfW, BOX.halfW, i()),
      d = lerp2(-BOX.halfD, BOX.halfD, i());
    i() > c(u, d) || h(u, d, 0);
  }
  return {
    root: n,
    shape: o,
    tint: a,
    count: l,
  };
}
export function scatterFlowers(r, t, e) {
  const i = mulberry32(4411),
    s = new PlantDensityGrid("flower", 0.1),
    n = new Float32Array(r * 4),
    o = new Float32Array(r * 4);
  let a = 0,
    l = 0;
  const c = [0.024, 0.02, 0.022, 0.016, 0.026, 0.022],
    h = [0.07, 0.085, 0.1, 0.05, 0.11, 0.1];
  for (; a < r && l++ < r * 40;) {
    const f = lerp2(-BOX.halfW, BOX.halfW, i()),
      u = lerp2(-BOX.halfD, BOX.halfD, i());
    let d = s.at(f, u);
    if (d < 0.05) continue;
    const p = smoothstep2(
      0.05,
      0.45,
      vegetationNoise.noise2(f * 0.8 - 2.2, u * 0.8 + 6.1),
    );
    if (
      ((d *=
        p *
        (1 - t.bareAt(f, u)) *
        (1 - t.shadeAt(f, u)) *
        smoothstep2(0.02, 0.1, t.pathAt(f, u))),
      i() > d)
    )
      continue;
    let v = Math.floor(
      (vegetationNoise.noise2(f * 0.55 + 9.1, u * 0.55 - 3.3) * 0.5 + 0.5) * 6,
    );
    (i() < 0.22 && (v = Math.floor(i() * 6)), (v = clamp(v, 0, 5)));
    const g = a * 4;
    ((n[g] = f),
      (n[g + 1] = e(f, u) - 0.003),
      (n[g + 2] = u),
      (n[g + 3] = i()),
      (o[g] = h[v] * lerp2(0.7, 1.25, i())),
      (o[g + 1] = c[v] * lerp2(0.8, 1.2, i())),
      (o[g + 2] = v),
      (o[g + 3] = i() * Math.PI * 2),
      a++);
  }
  return {
    root: n,
    shape: o,
    count: a,
  };
}
export function scatterReeds(r, t, e) {
  const i = mulberry32(3131),
    s = new Float32Array(r * 4),
    n = new Float32Array(r * 4),
    o = new Float32Array(r * 4),
    a = {};
  let l = 0;
  const c = WATER_LEVELS.lakeLevel,
    h = (u, d) => {
      if (
        Math.abs(u) > BOX.halfW - 0.05 ||
        Math.abs(d) > BOX.halfD - 0.12 ||
        t.pathAt(u, d) < 0.12
      )
        return !1;
      const p = e(u, d);
      if (lakeEllipse2(u, d) < 1.35) return p > c - 0.07 && p < c + 0.07;
      const g = riverQuery2(u, d, a);
      if (g && g.t > 0.28) {
        const x = riverHalfWidth2(g.t);
        return g.dist > x * 0.72 && g.dist < x + 0.12 && p < g.y + 0.06;
      }
      return !1;
    };
  let f = 0;
  for (; l < r && f++ < 2e4;) {
    let u, d;
    if (i() < 0.62) {
      const g = i() * Math.PI * 2,
        x = lerp2(0.98, 1.2, i());
      ((u = LAKE2.cx + Math.cos(g) * LAKE2.rx * x),
        (d = LAKE2.cz + Math.sin(g) * LAKE2.rz * x));
    } else ((u = lerp2(-1.6, 2.2, i())), (d = lerp2(-1.2, 2.2, i())));
    if (!h(u, d) || vegetationNoise.noise2(u * 1.4 + 4.4, d * 1.4) < -0.15)
      continue;
    const p = 8 + Math.floor(i() * 18),
      v = lerp2(0.05, 0.13, i());
    for (let g = 0; g < p && l < r; g++) {
      const x = i() * Math.PI * 2,
        m = v * Math.sqrt(i()),
        w = u + Math.cos(x) * m,
        y = d + Math.sin(x) * m;
      if (!h(w, y)) continue;
      const _ = e(w, y),
        M = l * 4,
        A = i() < 0.09 ? 1 : 0;
      ((s[M] = w),
        (s[M + 1] = _ - 0.005),
        (s[M + 2] = y),
        (s[M + 3] = i()),
        (n[M] = lerp2(0.14, 0.32, i()) * (1 - (m / v) * 0.35) * (A ? 1.12 : 1)),
        (n[M + 1] = A ? 0.0075 : lerp2(0.011, 0.019, i())),
        (n[M + 2] = i() * Math.PI * 2),
        (n[M + 3] = A ? lerp2(0.02, 0.12, i()) : lerp2(0.08, 0.5, i() * i())),
        (o[M] = A),
        (o[M + 1] = _ < c ? 1 : 0),
        l++);
    }
  }
  return {
    root: s,
    shape: n,
    tint: o,
    count: l,
  };
}
