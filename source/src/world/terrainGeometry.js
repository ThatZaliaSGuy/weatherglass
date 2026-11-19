/**
 * Terrain grid sampling and construction of the surface and soil-skirt geometries.
 */
import * as THREE from "three";
import { BOX } from "../core/config.js";
import { terrainHeight2 } from "./terrainShape.js";
const TERRAIN_GRID_INSET = 0.004;
export function buildTerrainGrid(r, t) {
  const e = -BOX.halfW + TERRAIN_GRID_INSET,
    i = BOX.halfW - TERRAIN_GRID_INSET,
    s = -BOX.halfD + TERRAIN_GRID_INSET,
    n = BOX.halfD - TERRAIN_GRID_INSET,
    o = r + 1,
    a = t + 1,
    l = (i - e) / r,
    c = (n - s) / t,
    h = o + 2,
    f = a + 2,
    u = new Float32Array(h * f);
  for (let g = 0; g < f; g++) {
    const x = s + (g - 1) * c;
    for (let m = 0; m < h; m++)
      u[g * h + m] = terrainHeight2(e + (m - 1) * l, x);
  }
  const d = o * a,
    p = new Float32Array(d * 3),
    v = new Float32Array(d * 3);
  for (let g = 0; g < a; g++) {
    const x = s + g * c;
    for (let m = 0; m < o; m++) {
      const w = (g + 1) * h + (m + 1),
        y = (u[w + 1] - u[w - 1]) / (2 * l),
        _ = (u[w + h] - u[w - h]) / (2 * c),
        M = 1 / Math.hypot(y, 1, _),
        A = (g * o + m) * 3;
      ((p[A] = e + m * l),
        (p[A + 1] = u[w]),
        (p[A + 2] = x),
        (v[A] = -y * M),
        (v[A + 1] = M),
        (v[A + 2] = -_ * M));
    }
  }
  return {
    segX: r,
    segZ: t,
    nx: o,
    nz: a,
    x0: e,
    x1: i,
    z0: s,
    z1: n,
    dx: l,
    dz: c,
    pos: p,
    nrm: v,
  };
}
export function createTerrainSurfaceGeometry(r) {
  const { nx: t, nz: e, pos: i, nrm: s } = r,
    n = new Uint32Array((t - 1) * (e - 1) * 6);
  let o = 0;
  for (let l = 0; l < e - 1; l++)
    for (let c = 0; c < t - 1; c++) {
      const h = l * t + c,
        f = h + t,
        u = f + 1,
        d = h + 1;
      Math.abs(i[h * 3 + 1] - i[u * 3 + 1]) <
      Math.abs(i[f * 3 + 1] - i[d * 3 + 1])
        ? ((n[o++] = h),
          (n[o++] = f),
          (n[o++] = u),
          (n[o++] = h),
          (n[o++] = u),
          (n[o++] = d))
        : ((n[o++] = h),
          (n[o++] = f),
          (n[o++] = d),
          (n[o++] = f),
          (n[o++] = u),
          (n[o++] = d));
    }
  const a = new THREE.BufferGeometry();
  return (
    a.setAttribute("position", new THREE.BufferAttribute(i, 3)),
    a.setAttribute("normal", new THREE.BufferAttribute(s, 3)),
    a.setIndex(new THREE.BufferAttribute(n, 1)),
    a.computeBoundingSphere(),
    a.computeBoundingBox(),
    a
  );
}
export function createTerrainSkirtGeometry(r) {
  const { nx: t, nz: e, pos: i, nrm: s, x0: n, x1: o, z0: a, z1: l } = r,
    c = [],
    h = [],
    f = [],
    u = [],
    d = [],
    p = [],
    v = [],
    g = BOX.bottomY,
    x = [
      {
        ids: [],
        n: [-1, 0, 0],
        u: (_, M) => M - a,
      },
      {
        ids: [],
        n: [0, 0, 1],
        u: (_, M) => l - a + (_ - n),
      },
      {
        ids: [],
        n: [1, 0, 0],
        u: (_, M) => l - a + (o - n) + (l - M),
      },
      {
        ids: [],
        n: [0, 0, -1],
        u: (_, M) => 2 * (l - a) + (o - n) + (o - _),
      },
    ];
  for (let _ = 0; _ < e; _++) x[0].ids.push(_ * t);
  for (let _ = 0; _ < t; _++) x[1].ids.push((e - 1) * t + _);
  for (let _ = e - 1; _ >= 0; _--) x[2].ids.push(_ * t + t - 1);
  for (let _ = t - 1; _ >= 0; _--) x[3].ids.push(_);
  for (const _ of x) {
    const M = c.length / 3;
    for (const b of _.ids) {
      const S = i[b * 3],
        E = i[b * 3 + 1],
        T = i[b * 3 + 2],
        R = s[b * 3 + 1],
        z = _.u(S, T);
      for (let L = 0; L < 3; L++)
        (c.push(S, L === 2 ? g : E, T),
          h.push(_.n[0], _.n[1], _.n[2]),
          f.push(z),
          u.push(E),
          d.push(L === 0 ? 1 : 0),
          p.push(R));
    }
    const A = _.ids.length;
    for (let b = 0; b < A - 1; b++) {
      const S = M + b * 3,
        E = M + (b + 1) * 3;
      for (let T = 0; T < 2; T++) {
        const R = S + T,
          z = E + T,
          L = S + T + 1,
          k = E + T + 1;
        v.push(L, k, z, L, z, R);
      }
    }
  }
  const m = c.length / 3,
    w = [
      [n, a],
      [o, a],
      [o, l],
      [n, l],
    ];
  for (const [_, M] of w)
    (c.push(_, g, M),
      h.push(0, -1, 0),
      f.push(0),
      u.push(g),
      d.push(0),
      p.push(1));
  v.push(m, m + 1, m + 2, m, m + 2, m + 3);
  const y = new THREE.BufferGeometry();
  return (
    y.setAttribute("position", new THREE.Float32BufferAttribute(c, 3)),
    y.setAttribute("normal", new THREE.Float32BufferAttribute(h, 3)),
    y.setAttribute("aU", new THREE.Float32BufferAttribute(f, 1)),
    y.setAttribute("aSurf", new THREE.Float32BufferAttribute(u, 1)),
    y.setAttribute("aTop", new THREE.Float32BufferAttribute(d, 1)),
    y.setAttribute("aNy", new THREE.Float32BufferAttribute(p, 1)),
    y.setIndex(v),
    y.computeBoundingSphere(),
    y
  );
}
