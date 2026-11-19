/**
 * Procedural branch/card geometry builders for broadleaf, pine and bush plants and the bark/foliage materials and meshes.
 */
import * as THREE from "three";
import { mulberry32 } from "../util/noise.js";
import { clamp, lerp2 } from "../util/math.js";
import { PLANT_KIND } from "./vegetationPlacement.js";
import { CARD_WIDTH_BY_CELL } from "./leafAtlas.js";
import {
  VEG_TREE_GLSL,
  patchVegetationMaterial,
} from "./vegetationShaderPatch.js";
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const tmpVertexPos = new THREE.Vector3();
const tmpRandomDir = new THREE.Vector3();
const tmpRingNormal = new THREE.Vector3();
const zeroCardOffset = new THREE.Vector3();
class PlantGeometryBuilder {
  constructor(t) {
    ((this.foliage = t),
      (this.pos = []),
      (this.nrm = []),
      (this.uv = []),
      (this.tree = []),
      (this.info = []),
      (this.idx = []),
      t && ((this.card = []), (this.off = []), (this.ao = [])),
      (this.curAO = 1));
  }
  get count() {
    return this.pos.length / 3;
  }
  vert(t, e, i, s, n, o, a, l) {
    (this.pos.push(t.x, t.y, t.z),
      this.nrm.push(e.x, e.y, e.z),
      this.uv.push(i, s),
      this.tree.push(n[0], n[1], n[2], n[3]),
      this.info.push(o[0], o[1], o[2], o[3]),
      this.foliage &&
        (this.card.push(a[0], a[1], a[2], a[3]),
        this.off.push(l.x, l.y, l.z),
        this.ao.push(this.curAO)));
  }
  build() {
    const t = new THREE.BufferGeometry();
    return (
      t.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3)),
      t.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3)),
      t.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2)),
      t.setAttribute("aTree", new THREE.Float32BufferAttribute(this.tree, 4)),
      t.setAttribute("aInfo", new THREE.Float32BufferAttribute(this.info, 4)),
      this.foliage &&
        (t.setAttribute(
          "aCard",
          new THREE.Float32BufferAttribute(this.card, 4),
        ),
        t.setAttribute("aOff", new THREE.Float32BufferAttribute(this.off, 3)),
        t.setAttribute("aAO", new THREE.Float32BufferAttribute(this.ao, 1))),
      t.setIndex(
        this.count > 65535
          ? new THREE.Uint32BufferAttribute(this.idx, 1)
          : new THREE.Uint16BufferAttribute(this.idx, 1),
      ),
      t.computeBoundingSphere(),
      (t.boundingSphere.radius += 0.5),
      t
    );
  }
}
function addBranchTube(r, t, e, i, s, n, o, a, l, c) {
  const h = t.length,
    f = r.count,
    u = new THREE.Vector3(),
    d = new THREE.Vector3(),
    p = new THREE.Vector3();
  let v = 0;
  for (let x = 0; x < h; x++) {
    (x < h - 1
      ? p.subVectors(t[x + 1], t[Math.max(0, x - 1)]).normalize()
      : p.subVectors(t[x], t[x - 1]).normalize(),
      x === 0
        ? (u.set(1, 0, 0),
          Math.abs(p.x) > 0.9 && u.set(0, 0, 1),
          u.addScaledVector(p, -u.dot(p)).normalize())
        : (u.addScaledVector(p, -u.dot(p)).normalize(),
          (v += t[x].distanceTo(t[x - 1]))),
      d.crossVectors(p, u));
    const m = lerp2(o, a, x / (h - 1));
    for (let w = 0; w <= i; w++) {
      const y = (w / i) * Math.PI * 2;
      (tmpRingNormal
        .copy(u)
        .multiplyScalar(Math.cos(y))
        .addScaledVector(d, Math.sin(y)),
        tmpVertexPos.copy(t[x]).addScaledVector(tmpRingNormal, e[x]),
        r.vert(tmpVertexPos, tmpRingNormal, w / i, v, s, [n, m, l, c]));
    }
  }
  const g = i + 1;
  for (let x = 0; x < h - 1; x++)
    for (let m = 0; m < i; m++) {
      const w = f + x * g + m,
        y = w + g;
      r.idx.push(w, y, w + 1, y, y + 1, w + 1);
    }
}
function addLeafCard(r, t, e, i, s, n, o, a, l, c, h = null, f = 1, u = 1) {
  const d = r.count,
    p = s * n * 0.5,
    v = h ? 3 : 2,
    g = new THREE.Vector3(),
    x = new THREE.Vector3();
  for (let m = 0; m < v; m++) {
    const w = m / (v - 1);
    (h
      ? m === 1
        ? x.copy(e).multiplyScalar(s * 0.5)
        : m === 2
          ? x
              .copy(e)
              .multiplyScalar(s * 0.5)
              .addScaledVector(h, s * 0.5)
          : x.set(0, 0, 0)
      : x.copy(e).multiplyScalar(s * w),
      (r.curAO = lerp2(f, u, w)));
    for (const y of [-1, 1])
      (g.copy(x).addScaledVector(i, y * p),
        tmpVertexPos.copy(t).add(g),
        r.vert(
          tmpVertexPos,
          o,
          y < 0 ? 0 : 1,
          w,
          a,
          l,
          [c[0], c[1], w, c[3]],
          g,
        ));
  }
  for (let m = 0; m < v - 1; m++) {
    const w = d + m * 2;
    r.idx.push(w, w + 1, w + 2, w + 1, w + 3, w + 2);
  }
}
function randomPerpendicular(r, t, e) {
  return (
    tmpRandomDir.set(t() - 0.5, t() - 0.5, t() - 0.5),
    e.crossVectors(r, tmpRandomDir),
    e.lengthSq() < 1e-6 && e.set(1, 0, 0).cross(r),
    e.normalize()
  );
}
function rotateAroundAxis(r, t, e) {
  return r.applyAxisAngle(t, e);
}
function growBranch(r, t, e, i, s, n, o, a, l, c = null) {
  const h = t.segs[o],
    f = [e.clone()],
    u = [n],
    d = i.clone(),
    p = e.clone(),
    v = t.tip[o];
  for (let y = 1; y <= h; y++)
    (tmpRandomDir
      .set(r() - 0.5, (r() - 0.5) * 0.5, r() - 0.5)
      .multiplyScalar(t.wander[o]),
      d.add(tmpRandomDir).addScaledVector(WORLD_UP, t.tropism[o]).normalize(),
      p.addScaledVector(d, s / h),
      f.push(p.clone()),
      u.push(n * lerp2(1, v, y / h)));
  const g = Math.min(1, a + t.flexStep[o]);
  if (
    (l.branches.push({
      pts: f,
      radii: u,
      level: o,
      flex0: a,
      flex1: g,
    }),
    !c &&
      o >= (t.clumpLevel ?? 2) &&
      ((c = {
        c: new THREE.Vector3(),
        n: 0,
        r: 0,
      }),
      l.clumps.push(c)),
    o >= t.levels)
  ) {
    (l.spots.push({
      p: p.clone(),
      d: d.clone(),
      level: o,
      flex: g,
      clump: c,
    }),
      r() < 0.6 &&
        l.spots.push({
          p: f[Math.max(1, h - 1)].clone(),
          d: d.clone(),
          level: o,
          flex: g * 0.9,
          clump: c,
        }));
    return;
  }
  const x = t.kids[o] + (r() < 0.5 ? 1 : 0),
    m = new THREE.Vector3();
  let w = r() * Math.PI * 2;
  for (let y = 0; y < x; y++) {
    const _ = lerp2(t.kidFrom[o], 1, (y + 0.5 + (r() - 0.5) * 0.4) / x),
      M = Math.min(h, Math.max(1, Math.round(_ * h))),
      A = d.clone();
    (randomPerpendicular(A, r, m), rotateAroundAxis(m, A, w), (w += 2.39996));
    const b = lerp2(t.angle[o][0], t.angle[o][1], r());
    A.applyAxisAngle(m, b).normalize();
    const S = s * t.lenRatio[o] * lerp2(0.75, 1.15, r()) * (1.15 - _ * 0.4),
      E = u[M] * lerp2(0.55, 0.72, r());
    growBranch(r, t, f[M], A, S, E, o + 1, lerp2(a, g, _), l, c);
  }
  o === t.levels - 1 &&
    l.spots.push({
      p: p.clone(),
      d: d.clone(),
      level: o,
      flex: g,
      clump: c,
    });
}
const BROADLEAF_SPECIES = {
  [PLANT_KIND.oak]: {
    levels: 3,
    segs: [7, 5, 3, 2],
    tip: [0.55, 0.45, 0.35, 0.3],
    wander: [0.12, 0.28, 0.4, 0.5],
    tropism: [0, 0.05, 0.04, 0.02],
    kids: [4, 3, 2],
    kidFrom: [0, 0.35, 0.3],
    angle: [
      [0.7, 1.1],
      [0.55, 0.95],
      [0.5, 0.9],
    ],
    lenRatio: [0, 0.55, 0.55],
    flexStep: [0.25, 0.25, 0.25, 0.25],
    trunk: [0.34, 0.42],
    trunkR: 0.042,
    card: 0.18,
    cardsPerSpot: 4,
    twigShare: 0.34,
    leader: 0.3,
  },
  [PLANT_KIND.birch]: {
    levels: 3,
    segs: [9, 4, 3, 2],
    tip: [0.3, 0.4, 0.35, 0.3],
    wander: [0.05, 0.2, 0.35, 0.4],
    tropism: [0, 0.1, -0.12, -0.18],
    kids: [8, 2, 2],
    kidFrom: [0.3, 0.3, 0.3],
    angle: [
      [0.55, 0.95],
      [0.4, 0.8],
      [0.4, 0.8],
    ],
    lenRatio: [0, 0.6, 0.6],
    flexStep: [0.3, 0.25, 0.25, 0.2],
    trunk: [0.97, 1],
    trunkR: 0.026,
    card: 0.13,
    cardsPerSpot: 3,
    twigShare: 0.42,
    leader: 0,
  },
  [PLANT_KIND.cherry]: {
    levels: 3,
    segs: [6, 5, 3, 2],
    tip: [0.55, 0.45, 0.35, 0.3],
    wander: [0.15, 0.3, 0.4, 0.5],
    tropism: [0, 0.08, 0.06, 0.03],
    kids: [4, 3, 2],
    kidFrom: [0, 0.3, 0.3],
    angle: [
      [0.85, 1.25],
      [0.5, 0.9],
      [0.5, 0.9],
    ],
    lenRatio: [0, 0.55, 0.55],
    flexStep: [0.25, 0.25, 0.25, 0.25],
    trunk: [0.26, 0.32],
    trunkR: 0.045,
    card: 0.19,
    cardsPerSpot: 4,
    twigShare: 0.34,
    leader: 0.2,
  },
};
function buildBroadleafTree(r, t, e, i, s) {
  const n = BROADLEAF_SPECIES[e.code],
    o = e.height,
    a = e.radius,
    l = [e.x, e.y, e.z, o],
    c = s(),
    h = {
      branches: [],
      spots: [],
      clumps: [],
    },
    f = new THREE.Vector3(e.x, e.y, e.z),
    u = new THREE.Vector3(Math.cos(e.lean), 0, Math.sin(e.lean)).multiplyScalar(
      0.06,
    ),
    d = WORLD_UP.clone().add(u).normalize(),
    p = o * lerp2(n.trunk[0], n.trunk[1], s()),
    v = o * n.trunkR * lerp2(0.85, 1.15, s());
  if (e.code === PLANT_KIND.birch) {
    const g = n.segs[0],
      x = [f.clone()],
      m = [v * 1.25],
      w = d.clone(),
      y = f.clone();
    for (let b = 1; b <= g; b++)
      ((w.x += (s() - 0.5) * 0.08),
        (w.z += (s() - 0.5) * 0.08),
        w.normalize(),
        y.addScaledVector(w, (o * 0.97) / g),
        x.push(y.clone()),
        m.push(v * lerp2(1, 0.12, b / g)));
    h.branches.push({
      pts: x,
      radii: m,
      level: 0,
      flex0: 0,
      flex1: 0.4,
    });
    const _ = n.kids[0] + Math.floor(s() * 4),
      M = new THREE.Vector3();
    let A = s() * Math.PI * 2;
    for (let b = 0; b < _; b++) {
      const S = lerp2(0.32, 0.93, (b + s() * 0.6) / _),
        E = x[0].clone().lerp(x[g], S),
        T = WORLD_UP.clone();
      (M.set(Math.cos(A), 0, Math.sin(A)),
        (A += 2.39996 + (s() - 0.5) * 0.5),
        T.addScaledVector(M, lerp2(0.9, 1.5, s())).normalize());
      const R = a * lerp2(0.75, 1.15, s()) * (1.1 - Math.abs(S - 0.55) * 0.9);
      growBranch(s, n, E, T, R, v * lerp2(1, 0.2, S) * 0.55, 1, S * 0.4, h);
    }
  } else {
    const g = n.segs[0],
      x = [f.clone()],
      m = [v * 1.35],
      w = d.clone(),
      y = f.clone();
    for (let b = 1; b <= g; b++)
      ((w.x += (s() - 0.5) * 0.12),
        (w.z += (s() - 0.5) * 0.12),
        w.normalize(),
        y.addScaledVector(w, p / g),
        x.push(y.clone()),
        m.push(v * lerp2(1.1, 0.8, b / g)));
    h.branches.push({
      pts: x,
      radii: m,
      level: 0,
      flex0: 0,
      flex1: 0.22,
    });
    const _ = y.clone(),
      M = n.kids[0] + Math.floor(s() * 3);
    let A = s() * Math.PI * 2;
    for (let b = 0; b < M; b++) {
      const S = new THREE.Vector3(Math.cos(A), 0, Math.sin(A));
      A += (Math.PI * 2) / M + (s() - 0.5) * 0.7;
      const E = lerp2(n.angle[0][0], n.angle[0][1], s());
      S.multiplyScalar(Math.sin(E))
        .addScaledVector(WORLD_UP, Math.cos(E))
        .normalize();
      const T =
          ((a * lerp2(0.85, 1.1, s())) / Math.max(0.6, Math.sin(E))) * 0.72,
        R = x[g - (s() < 0.4 ? 1 : 0)];
      growBranch(s, n, R, S, T, v * lerp2(0.55, 0.72, s()), 1, 0.22, h);
    }
    if (n.leader > 0) {
      const b = WORLD_UP.clone().addScaledVector(u, 2).normalize();
      growBranch(
        s,
        n,
        _,
        b,
        (o - p) * lerp2(0.6, 0.8, s()),
        v * 0.6,
        1,
        0.22,
        h,
      );
    }
  }
  for (const g of h.branches) {
    const x = [7, 5, 4, 3][g.level];
    addBranchTube(r, g.pts, g.radii, x, l, i, g.flex0, g.flex1, c, e.code);
  }
  addBroadleafCanopy(t, h, n, e, l, i, c, s);
}
function addBroadleafCanopy(r, t, e, i, s, n, o, a) {
  const l = i.height,
    c = t.spots;
  if (!c.length) return;
  const h = new THREE.Vector3();
  for (const S of c) h.add(S.p);
  h.divideScalar(c.length);
  let f = 0.001,
    u = 1 / 0,
    d = -1 / 0;
  for (const S of c)
    ((f = Math.max(f, Math.hypot(S.p.x - h.x, S.p.z - h.z))),
      (u = Math.min(u, S.p.y)),
      (d = Math.max(d, S.p.y)));
  h.y = lerp2(u, d, 0.45);
  const p = Math.max(0.12 * l, (d - u) * 0.6);
  f *= 0.92;
  for (const S of t.clumps) (S.c.set(0, 0, 0), (S.n = 0), (S.r = 0));
  for (const S of c) S.clump && (S.clump.c.add(S.p), S.clump.n++);
  for (const S of t.clumps) S.n && S.c.divideScalar(S.n);
  for (const S of c)
    S.clump && (S.clump.r = Math.max(S.clump.r, S.p.distanceTo(S.clump.c)));
  const v = l * e.card,
    g = new THREE.Vector3(),
    x = new THREE.Vector3(),
    m = new THREE.Vector3(),
    w = new THREE.Vector3(),
    y = new THREE.Vector3(),
    _ = new THREE.Vector3(),
    M = new THREE.Vector3(),
    A = new THREE.Vector3(),
    b = i.code === PLANT_KIND.birch;
  for (const S of c) {
    const E = e.cardsPerSpot - (a() < 0.25 ? 1 : 0),
      T = S.clump;
    for (let R = 0; R < E; R++) {
      const z = v * lerp2(0.78, 1.2, a()) * (S.level < e.levels ? 1.08 : 1);
      (M.copy(S.p),
        (M.x += (a() - 0.5) * z * 0.5),
        (M.y += (a() - 0.5) * z * 0.4),
        (M.z += (a() - 0.5) * z * 0.5),
        A.subVectors(M, h),
        w.set(A.x / (f * f), A.y / (p * p), A.z / (f * f)).normalize(),
        T && T.n > 1
          ? y
              .subVectors(M, T.c)
              .addScaledVector(w, T.r * 0.6 + 0.001)
              .normalize()
          : y.copy(w),
        x
          .copy(S.d)
          .multiplyScalar(0.4)
          .addScaledVector(y, 0.55)
          .addScaledVector(w, 0.35),
        (x.x += (a() - 0.5) * 1),
        (x.y += (a() - 0.5) * 0.7 + 0.12),
        (x.z += (a() - 0.5) * 1),
        b && (x.y -= 0.55),
        x.normalize(),
        randomPerpendicular(x, a, g),
        M.addScaledVector(x, -z * 0.22),
        _.crossVectors(g, x).normalize(),
        _.dot(y) < 0 && _.negate(),
        m
          .copy(w)
          .multiplyScalar(0.5)
          .addScaledVector(y, 0.38)
          .addScaledVector(_, 0.12)
          .normalize(),
        A.subVectors(M, h));
      const L = Math.sqrt(
          (A.x * A.x + A.z * A.z) / (f * f) + (A.y * A.y) / (p * p),
        ),
        k =
          T && T.r > 0.001
            ? clamp(M.distanceTo(T.c) / (T.r + z * 0.3), 0, 1)
            : 1,
        U = clamp((M.y - (h.y - p)) / (2 * p), 0, 1),
        F =
          lerp2(0.22, 1, Math.pow(clamp(L, 0, 1), 1.6)) *
          lerp2(0.62, 1, k) *
          lerp2(0.6, 1, Math.sqrt(U)),
        G = a() < e.twigShare ? 1 : 0;
      addLeafCard(
        r,
        M,
        x,
        g,
        z,
        CARD_WIDTH_BY_CELL[0],
        m,
        s,
        [n, lerp2(0.75, 1, S.flex), o, i.code],
        [G, a(), 0, 0],
        null,
        F * 0.72,
        F,
      );
    }
  }
}
function buildPineTree(r, t, e, i, s) {
  const n = e.height,
    o = e.radius,
    a = [e.x, e.y, e.z, n],
    l = s(),
    c = PLANT_KIND.pine,
    h = new THREE.Vector3(e.x, e.y, e.z),
    f = s() < 0.55,
    u = 6,
    d = n * 0.03 * lerp2(0.85, 1.15, s()),
    p = new THREE.Vector3(Math.cos(e.lean), 0, Math.sin(e.lean)).multiplyScalar(
      0.03,
    ),
    v = [],
    g = [];
  for (let z = 0; z <= u; z++) {
    const L = z / u;
    (v.push(
      h
        .clone()
        .addScaledVector(WORLD_UP, n * 1 * L)
        .addScaledVector(p, L * L * n),
    ),
      g.push(d * lerp2(1.3, 0.12, Math.pow(L, 0.8))));
  }
  addBranchTube(r, v, g, 6, a, i, 0, 0.35, l, c);
  const x = (z) => {
      const L = clamp((z - e.y) / n, 0, 1);
      return h
        .clone()
        .addScaledVector(WORLD_UP, n * L)
        .addScaledVector(p, L * L * n);
    },
    m = Math.round(f ? lerp2(12, 16, s()) : lerp2(9, 12, s())),
    w = n * (f ? lerp2(0.06, 0.12, s()) : lerp2(0.12, 0.2, s()));
  let y = s() * Math.PI * 2;
  const _ = new THREE.Vector3(),
    M = new THREE.Vector3(),
    A = new THREE.Vector3(),
    b = new THREE.Vector3(),
    S = new THREE.Vector3(),
    E = new THREE.Vector3(),
    T = (z, L, k, U, F, G, B, q, X, vt) => {
      (S.set(Math.cos(L), 0, Math.sin(L)),
        M.copy(S)
          .multiplyScalar(Math.cos(U))
          .addScaledVector(WORLD_UP, -Math.sin(U)),
        A.copy(S)
          .multiplyScalar(Math.cos(F))
          .addScaledVector(WORLD_UP, -Math.sin(F)),
        _.crossVectors(WORLD_UP, S).normalize(),
        _.applyAxisAngle(S, (s() - 0.5) * 0.6),
        E.copy(z)
          .addScaledVector(WORLD_UP, G)
          .addScaledVector(S, k * 0.04),
        b.crossVectors(_, M).normalize(),
        b.y < 0 && b.negate(),
        b
          .multiplyScalar(0.45)
          .addScaledVector(S, 0.55)
          .addScaledVector(WORLD_UP, 0.35 - vt * 0.1)
          .normalize(),
        addLeafCard(
          t,
          E,
          M,
          _,
          k,
          CARD_WIDTH_BY_CELL[3],
          b,
          a,
          [i, B, l, c],
          [0, s(), 0, 3],
          A,
          q,
          X,
        ));
    };
  for (let z = 0; z < m; z++) {
    const L = z / (m - 1),
      k = e.y + lerp2(w, n * 0.9, Math.pow(L, 0.92)) + (s() - 0.5) * n * 0.012,
      U = f
        ? Math.pow(1 - L * 0.96, 1.05)
        : Math.pow(1 - L * 0.95, 0.9) * (1 - 0.12 * L),
      F = Math.max(n * 0.045, o * U * lerp2(0.84, 1.1, s())),
      G = x(k),
      B = lerp2(0.35, 0.85, L),
      q = lerp2(0.42, 1, Math.pow(L, 0.8)),
      X = 10,
      vt = t.count,
      gt = F * 0.08,
      Qt = F * 0.62,
      te = F * 0.3,
      Zt = -F * 0.3;
    for (let mt = 0; mt <= X; mt++) {
      const Y = y + (mt / X) * Math.PI * 2,
        xt = Math.cos(Y),
        yt = Math.sin(Y),
        fe = mt === X ? 1 : lerp2(0.75, 1.05, s());
      for (let et = 0; et < 2; et++) {
        const ut = et ? Qt * fe : gt,
          dt = et ? Zt * lerp2(0.8, 1.25, s()) : te;
        (E.set(G.x + xt * ut, G.y + dt, G.z + yt * ut),
          b.set(xt * (te - Zt), Qt - gt, yt * (te - Zt)).normalize(),
          (b.y += 0.25),
          b.normalize(),
          zeroCardOffset.set(0, 0, 0),
          (t.curAO = q * (et ? 0.45 : 0.25)),
          t.vert(
            E,
            b,
            mt / X,
            et,
            a,
            [i, B * (et ? 1 : 0.6), l, c],
            [0, s(), et * 0.3, -1],
            zeroCardOffset,
          ));
      }
    }
    for (let mt = 0; mt < X; mt++) {
      const Y = vt + mt * 2;
      t.idx.push(Y, Y + 1, Y + 2, Y + 1, Y + 3, Y + 2);
    }
    const J = Math.round(clamp(6 + (F / n) * 30, 6, 14)),
      nt = f ? 0.18 : 0;
    for (let mt = 0; mt < J; mt++) {
      const Y = y + (mt / J) * Math.PI * 2 + (s() - 0.5) * 0.45,
        xt = F * lerp2(0.88, 1.22, s()),
        yt = lerp2(0.08, 0.32, s()) + L * 0.06 + nt * 0.5,
        fe = yt + lerp2(0.3, 0.62, s()) + nt;
      T(G, Y, xt, yt, fe, F * lerp2(0.1, 0.22, s()), B, q * 0.3, q, L);
    }
    if (F > n * 0.09) {
      const mt = Math.round(J * 0.6);
      for (let Y = 0; Y < mt; Y++) {
        const xt = y + ((Y + 0.5) / mt) * Math.PI * 2 + (s() - 0.5) * 0.5,
          yt = F * lerp2(0.55, 0.75, s()),
          fe = lerp2(0.25, 0.5, s()) + nt;
        T(
          G,
          xt,
          yt,
          fe,
          fe + lerp2(0.3, 0.5, s()),
          F * lerp2(0.2, 0.32, s()),
          B * 0.85,
          q * 0.22,
          q * 0.7,
          L,
        );
      }
    }
    y += 2.39996 * 0.5 + s() * 0.6;
  }
  const R = x(e.y + n * 0.86);
  for (let z = 0; z < 3; z++) {
    const L = s() * Math.PI + (z * Math.PI) / 3;
    (_.set(Math.cos(L), 0, Math.sin(L)),
      b.set(-_.z, 0.7, _.x).normalize(),
      M.copy(WORLD_UP),
      (M.x += (s() - 0.5) * 0.08),
      (M.z += (s() - 0.5) * 0.08),
      M.normalize(),
      addLeafCard(
        t,
        R,
        M,
        _,
        n * 0.17,
        0.42,
        b,
        a,
        [i, 1, l, c],
        [0, s(), 0, 3],
        null,
        0.7,
        1,
      ));
  }
}
function buildBush(r, t, e, i, s) {
  const n = e.height,
    o = e.radius,
    a = [e.x, e.y, e.z, n],
    l = s(),
    c = e.code,
    h = c === PLANT_KIND.evergreen,
    f = new THREE.Vector3(e.x, e.y + 0.01, e.z),
    u = {
      levels: 1,
      segs: [3, 2],
      tip: [0.4, 0.3],
      wander: [0.3, 0.5],
      tropism: [0.05, 0.03],
      kids: [2],
      kidFrom: [0.4],
      angle: [[0.5, 0.9]],
      lenRatio: [0.6],
      flexStep: [0.5, 0.5],
    },
    d = {
      branches: [],
      spots: [],
      clumps: [],
    },
    p = 3 + Math.floor(s() * 3);
  for (let M = 0; M < p; M++) {
    const A = (M / p) * Math.PI * 2 + s(),
      b = new THREE.Vector3(
        Math.cos(A) * 0.55,
        1,
        Math.sin(A) * 0.55,
      ).normalize();
    growBranch(s, u, f, b, n * lerp2(0.55, 0.8, s()), n * 0.035, 0, 0.1, d);
  }
  for (const M of d.branches)
    addBranchTube(
      r,
      M.pts,
      M.radii,
      M.level ? 3 : 4,
      a,
      i,
      M.flex0,
      M.flex1,
      l,
      c,
    );
  const v = Math.round(lerp2(24, 46, clamp(o / 0.3, 0, 1)) * (h ? 1.5 : 1)),
    g = new THREE.Vector3(e.x, e.y + n * 0.52, e.z),
    x = new THREE.Vector3(),
    m = new THREE.Vector3(),
    w = new THREE.Vector3(),
    y = new THREE.Vector3(),
    _ = new THREE.Vector3();
  for (let M = 0; M < v; M++) {
    const A = s() * 2 - 1,
      b = s() * Math.PI * 2,
      S = Math.sqrt(1 - A * A);
    x.set(
      S * Math.cos(b),
      Math.abs(A) * 0.8 + 0.2 * A,
      S * Math.sin(b),
    ).normalize();
    const E = lerp2(0.35, 0.8, Math.sqrt(s()));
    (_.set(g.x + x.x * o * E, g.y + x.y * n * 0.45 * E, g.z + x.z * o * E),
      m.copy(x).addScaledVector(WORLD_UP, 0.35),
      (m.x += (s() - 0.5) * 0.7),
      (m.z += (s() - 0.5) * 0.7),
      m.normalize(),
      randomPerpendicular(m, s, w));
    const T = h && s() < 0.65 ? 3 : 0,
      R = (T === 3 ? o * 0.6 : o * 0.55) * lerp2(0.8, 1.2, s());
    (_.addScaledVector(m, -R * 0.25),
      y.crossVectors(w, m).normalize(),
      y.dot(x) < 0 && y.negate(),
      y.multiplyScalar(0.3).addScaledVector(x, 0.7).normalize());
    const z = lerp2(0.3, 1, E) * lerp2(0.55, 1, clamp(x.y * 0.5 + 0.5, 0, 1));
    addLeafCard(
      t,
      _,
      m,
      w,
      R,
      CARD_WIDTH_BY_CELL[T],
      y,
      a,
      [i, lerp2(0.6, 1, E), l, c],
      [h ? 0 : s() < 0.5 ? 1 : 0, s(), 0, T],
      null,
      z * 0.7,
      z,
    );
  }
}
const BARK_BEGIN_VERTEX = `
  vec4 vegSh = vegShake();
  vec3 transformed = position + vegTreeDisplace(position, vegSh, vec3(0.0), 0.0, 0.0);
`;
const FOLIAGE_VERTEX_HEAD = `
attribute vec4 aCard;
attribute vec3 aOff;
attribute float aAO;
varying float vAO;
varying vec2 vLeafUv;
varying vec4 vLeafInfo;   // cell, kind, tree rand, keep
varying vec3 vVegWorld;
varying vec3 vVegN;
varying float vLeafFrac;  // share of the card's leaves / flowers still on

/**
 * Which atlas cell a card shows now (leaf / bare twigs / blossom), how grown it is (return)
 * and what share of its leaves / flowers are still on (frac). Leaves come and go one by one
 * inside each card (the atlas G channel is a per-leaf random), so canopies thin smoothly
 * instead of losing whole clumps.
 */
float vegCard(vec4 sh, out float cell, out float frac) {
  cell = aCard.w;
  frac = 1.0;
  float kind = aInfo.w;
  if (cell < -0.5 || kind < 0.5 || kind > 4.5) return 1.0;   // conifer skirts & evergreens
  float trnd = fract(aInfo.z * 7.31);
  float autumn = vegAutumn();
  float keep = sh.w;
  // per-tree timing: some trees leaf out, turn and drop earlier than others
  float leaf = clamp(uLeafAmount + (trnd - 0.5) * 0.3 * (autumn + vegSpring() * 0.6), 0.0, 1.0);
  leaf *= mix(1.0, keep, autumn);                               // a shaken autumn tree sheds
  // a few oaks hold on to a scatter of dead leaves all winter
  leaf = max(leaf, 0.07 * step(kind, 1.5) * step(0.55, fract(trnd * 9.1)) * vegWinter());
  float r1 = aCard.y;
  float r2 = fract(aCard.y * 13.37);
  float blossom = (kind > 2.5 && kind < 3.5) ? uBlossom * mix(1.0, keep, 0.5) : 0.0;
  float fB = clamp(blossom * 1.3 - (r2 - 0.5) * 0.6, 0.0, 1.0);
  if (fB > 0.35 && r2 < 0.85) { cell = 2.0; frac = fB; return 1.0; }
  float fL = clamp(leaf * 1.2 - (r1 - 0.5) * 0.4, 0.0, 1.0);
  if (aCard.x > 0.5 && fL < 0.22) {
    cell = 1.0;                                  // bare twig spray grows in as the leaves go
    return smoothstep(0.22, 0.04, fL);
  }
  cell = 0.0;
  frac = fL;
  return step(0.02, fL);
}
`;
const FOLIAGE_BEGIN_VERTEX = `
  vec4 vegSh = vegShake();
  float vegCell, vegFrac;
  float vegScale = vegCard(vegSh, vegCell, vegFrac);
  vLeafFrac = vegFrac;
  vec3 vegA = position - aOff;
  vec3 vegP = vegA + aOff * vegScale * (vegCell > 0.5 && vegCell < 1.5 ? 1.15 : 1.0);
  if (vegScale < 0.01) vegP = vec3(aTree.x, -60.0, aTree.z);        // hidden: degenerate card
  vec3 transformed = vegP + vegTreeDisplace(vegP, vegSh, normal, aCard.z, aCard.y);
  vec2 vegCellUv = vec2(mod(max(vegCell, 0.0), 2.0), floor(max(vegCell, 0.0) * 0.5)) * 0.5;
  vLeafUv = vegCellUv + (uv * 0.49 + 0.005);
  vLeafInfo = vec4(vegCell, aInfo.w, fract(aInfo.z * 7.31), vegSh.w);
  vVegWorld = transformed;
  vVegN = normal;
  vAO = aAO;
`;
const FOLIAGE_FRAGMENT_HEAD = `
uniform sampler2D uLeafAtlas;
varying float vAO;
varying vec2 vLeafUv;
varying vec4 vLeafInfo;
varying vec3 vVegWorld;
varying vec3 vVegN;
varying float vLeafFrac;

/** Leaves / petals beyond the card's current share drop out one by one (G = per-leaf random). */
float vegLeafMask(vec4 tx) {
  if (tx.b > 0.8) return step(0.04, vLeafFrac);       // twigs stay while any leaf does
  return step(tx.g, vLeafFrac * 1.02);
}

vec3 vegBarkTint(float kind) {
  if (kind < 0.5) return vec3(0.2, 0.12, 0.08);
  if (kind < 1.5) return vec3(0.2, 0.16, 0.12);
  if (kind < 2.5) return vec3(0.3, 0.17, 0.11);     // birch twigs are reddish-brown
  if (kind < 3.5) return vec3(0.22, 0.11, 0.09);
  return vec3(0.2, 0.16, 0.12);
}

/** Atlas sample with alpha compensated for mip coverage loss (canopies stay full at distance). */
vec4 vegAtlas() {
  if (vLeafInfo.x < -0.5) {
    float n = wgNoise(vVegWorld.xz * 70.0 + vVegWorld.y * 50.0);
    return vec4(0.45 + 0.4 * n, 0.5, 0.0, 1.0);
  }
  vec4 tx = texture2D(uLeafAtlas, vLeafUv);
  vec2 ts = vLeafUv * vec2(textureSize(uLeafAtlas, 0));
  float lod = max(0.0, 0.5 * log2(max(dot(dFdx(ts), dFdx(ts)), dot(dFdy(ts), dFdy(ts)))));
  tx.a = clamp(tx.a * (1.0 + lod * 0.32), 0.0, 1.0);
  if (vLeafFrac < 0.999) tx.a *= vegLeafMask(tx);
  return tx;
}
`;
const FOLIAGE_COLOR_FRAGMENT = `
  vec4 vegTx = vegAtlas();
  diffuseColor.a = vegTx.a;
  float kind = vLeafInfo.y;
  float cell = vLeafInfo.x;
  float trnd = vLeafInfo.z;
  float L = vegTx.r, lr = vegTx.g, mat = vegTx.b;
  vec3 col;
  if (kind < 0.5 || kind > 4.5) {
    // needles (conifers, evergreen shrubs)
    vec3 base = kind > 4.5 ? mix(uPineColor * vec3(1.3, 1.35, 1.0), uFoliageColor * 0.6, 0.25) : uPineColor;
    base *= mix(vec3(1.0), vec3(0.84, 0.95, 1.12), step(0.5, fract(trnd * 3.1)) * step(kind, 0.5));   // blue spruces
    col = base * (0.24 + 0.62 * L) * (0.85 + 0.3 * trnd);
    col *= cell < -0.5 ? 0.55 : 1.0;                                   // tier skirts sit in shade
    col = mix(col, vec3(0.28, 0.5, 0.1), vegSpring() * smoothstep(0.8, 0.97, L) * 0.75);   // new shoots
  } else if (cell > 1.5) {
    // blossom: white-pink petals, deep pink eyes, bronze young leaves
    vec3 petal = mix(vec3(0.82, 0.36, 0.44), vec3(0.98, 0.76, 0.8), smoothstep(0.5, 0.95, L)) * (0.82 + 0.22 * trnd);
    col = mix(vec3(0.42, 0.05, 0.1), petal, smoothstep(0.28, 0.5, L));
    col = mix(col, vec3(0.34, 0.3, 0.1) * (0.6 + 0.6 * L), step(0.3, mat) * step(mat, 0.75));
  } else {
    // broadleaf: each tree leans to one side of the seasonal palette, leaves vary within it
    float pick = clamp(fract(trnd * 3.7) * 0.85 + (lr - 0.5) * 0.45, 0.0, 1.0);
    vec3 base = mix(uFoliageColor, uFoliageColor2, pick);
    float autumn = vegAutumn();
    // some trees (and some leaves) hold on to their summer green longer
    float lag = smoothstep(0.5, 0.9, fract(trnd * 5.3)) * (1.0 - smoothstep(2.05, 2.55, uSeason));
    base = mix(base, vec3(0.2, 0.4, 0.11) * (0.8 + 0.4 * lr), autumn * clamp(lag + (lr - 0.75) * 1.6, 0.0, 0.9));
    base = mix(base, base * vec3(0.72, 0.5, 0.35), autumn * smoothstep(0.85, 1.0, lr) * 0.8);   // a few brown leaves
    // species character in autumn: birches clear gold, cherries crimson, oaks russet-bronze
    vec3 autumnTint = kind > 1.5 && kind < 2.5 ? vec3(1.12, 1.12, 0.5)
                    : kind > 2.5 && kind < 3.5 ? vec3(1.15, 0.42, 0.36)
                    : vec3(0.92, 0.72, 0.62);
    base *= mix(vec3(1.0), autumnTint, autumn * 0.8);
    if (kind > 1.5 && kind < 2.5) base *= mix(vec3(1.0), vec3(1.08, 1.1, 0.7), 0.35);        // birch: yellower
    col = base * (0.13 + 0.52 * L);
  }
  if (mat > 0.8) col = vegBarkTint(kind) * (0.65 + 0.6 * L);          // stems & bare twigs

  vec4 vegG = groundAt(vVegWorld.xz);
  vec3 vegN = normalize(vVegN);
  float vegSnowBase = snowCover(vVegWorld.xz, vegN) * vLeafInfo.w;
  float vegSnow;
  if (kind < 0.5 || kind > 4.5) {
    // conifers: snow loads the upper faces of the tiers in clumps; the shaded needles, the
    // drooping frond tips and the skirt hems stay dark green underneath
    float hem = cell < -0.5 ? clamp((vLeafUv.y - 0.005) / 0.49, 0.0, 1.0) : 0.0;
    float tipV = cell > 2.5 ? clamp((vLeafUv.y - 0.505) / 0.49, 0.0, 1.0) : 0.0;
    float clump = wgNoise(vVegWorld.xz * 23.0 + vVegWorld.y * 17.0);
    vegSnow = vegSnowBase * smoothstep(0.58, 0.9, vegN.y * 0.75 + (L - 0.5) * 1.1 + (clump - 0.5) * 0.35 - tipV * 0.25 - hem * 0.3);
  } else if (mat > 0.8) {
    vegSnow = vegSnowBase * 0.55 * smoothstep(0.3, 0.8, vegN.y + (L - 0.5) * 0.6);   // a dusting on fine twigs
  } else {
    vegSnow = vegSnowBase * smoothstep(0.0, 0.5, vegN.y + (L - 0.5) * 0.8);
  }
  col = mix(col, vec3(0.9, 0.93, 0.98), vegSnow);
  col = mix(col, vec3(0.72, 0.8, 0.86), vegG.w * 0.45 * smoothstep(0.55, 1.0, L));   // hoar frost
  col *= 1.0 - vegG.y * 0.18;                                                      // rain-darkened
  diffuseColor.rgb = col;
  vegTransAmt = (1.0 - vegSnow) * (mat > 0.8 ? 0.1 : (cell > 1.5 ? 0.35 : 0.6));
`;
const FOLIAGE_AO_FRAGMENT = `
  reflectedLight.indirectDiffuse *= vAO;
  reflectedLight.indirectSpecular *= vAO * vAO;
  reflectedLight.directDiffuse *= mix(1.0, vAO, 0.35);
  reflectedLight.directSpecular *= vAO;
  {
    vec3 vegLV = normalize((viewMatrix * vec4(uLightDir, 0.0)).xyz);
    float vegBack = saturate(dot(normalize(vViewPosition), -vegLV));
    float vegScat = pow(vegBack, 4.0) * (0.35 + 0.65 * uGolden) + 0.04;
    reflectedLight.directDiffuse += uLightColor * diffuseColor.rgb * vegScat * vegTransAmt * mix(0.25, 1.0, vAO) * 0.32 * cloudShadowAt(vVegWorld);
  }
`;
const FOLIAGE_ROUGHNESS_FRAGMENT = `
  float roughnessFactor = mix(roughness, 0.38, groundAt(vVegWorld.xz).y * 0.7);
`;
const BARK_VARYINGS = `
varying vec2 vBarkUv;
varying vec4 vBarkInfo;   // kind, flex, tree rand, keep
varying vec3 vVegWorld;
varying vec3 vVegN;
`;
const BARK_VARYINGS_VERTEX = `
  vBarkUv = uv;
  vBarkInfo = vec4(aInfo.w, aInfo.y, fract(aInfo.z * 7.31), vegSh.w);
  vVegWorld = transformed;
  vVegN = normal;
`;
const BARK_COLOR_FRAGMENT = `
  float kind = vBarkInfo.x, flex = vBarkInfo.y;
  vec2 buv = vec2(vBarkUv.x, vBarkUv.y * 14.0);
  vec3 col;
  float fine = wgNoise(vec2(buv.x * 12.0, buv.y * 3.0));
  if (kind < 0.5) {
    // conifer: scaly red-brown plates
    float pl = wgNoise(vec2(buv.x * 7.0, buv.y * 2.2));
    col = mix(vec3(0.13, 0.07, 0.045), vec3(0.3, 0.16, 0.09), smoothstep(0.3, 0.7, pl)) * (0.85 + 0.3 * fine);
  } else if (kind < 1.5 || kind > 3.5) {
    // oak / shrubs: grey-brown, deep vertical furrows, lichen
    float f = wgNoise(vec2(buv.x * 9.0, buv.y * 0.9));
    float ridge = 1.0 - abs(2.0 * f - 1.0);
    col = vec3(0.19, 0.16, 0.13) * (0.45 + 0.75 * ridge) * (0.9 + 0.2 * fine);
    col = mix(col, vec3(0.34, 0.37, 0.28), smoothstep(0.62, 0.8, wgNoise(buv * vec2(4.0, 1.3) + 7.0)) * 0.5);
  } else if (kind < 2.5) {
    // birch: chalk-white with dark lenticels, black fissured base, reddish twigs
    col = vec3(0.78, 0.76, 0.72) * (0.9 + 0.12 * fine);
    float len = smoothstep(0.7, 0.8, wgNoise(vec2(buv.x * 5.0, buv.y * 9.0)));
    col = mix(col, vec3(0.05, 0.045, 0.04), len * 0.9);
    float base = smoothstep(0.12, 0.0, flex) * smoothstep(0.35, 0.6, wgNoise(vec2(buv.x * 6.0, buv.y * 2.0)) + (0.12 - flex) * 3.0);
    col = mix(col, vec3(0.06, 0.055, 0.05), clamp(base, 0.0, 1.0));
    col = mix(col, vec3(0.3, 0.17, 0.11), smoothstep(0.55, 0.8, flex));
  } else {
    // cherry: dark mahogany with pale horizontal lenticel bands
    col = vec3(0.19, 0.09, 0.075) * (0.85 + 0.3 * fine);
    col = mix(col, vec3(0.42, 0.3, 0.26), smoothstep(0.72, 0.85, wgNoise(vec2(buv.x * 3.0, buv.y * 12.0))) * 0.6);
  }
  vec3 vegN = normalize(vVegN);
  vec4 vegG = groundAt(vVegWorld.xz);
  // moss on the shaded, damp side of trunks
  col = mix(col, vec3(0.1, 0.17, 0.04), smoothstep(0.35, 0.0, flex) * smoothstep(0.0, 0.8, -vegN.z * 0.7 + 0.3) * (0.3 + 0.5 * uHumidity) * step(kind, 1.5) * 0.7);
  col *= 1.0 - vegG.y * 0.45;                                          // rain-soaked bark
  float vegSnow = snowCover(vVegWorld.xz, vegN) * vBarkInfo.w * smoothstep(0.4, 0.85, vegN.y);
  col = mix(col, vec3(0.9, 0.93, 0.98), vegSnow);
  diffuseColor.rgb = col;
`;
const BARK_ROUGHNESS_FRAGMENT = `
  float roughnessFactor = mix(roughness, 0.32, groundAt(vVegWorld.xz).y * 0.8);
`;
const FOLIAGE_DEPTH_ALPHATEST = `
  if (vLeafInfo.x > -0.5) {
    vec4 tx = texture2D(uLeafAtlas, vLeafUv);
    diffuseColor.a = vLeafFrac < 0.999 ? tx.a * vegLeafMask(tx) : tx.a;
  }
  #include <alphatest_fragment>
`;
export function buildVegetationMeshes(r, t, e) {
  const i = new PlantGeometryBuilder(!1),
    s = new PlantGeometryBuilder(!0);
  t.forEach((v, g) => {
    const x = mulberry32(v.seed);
    v.code === PLANT_KIND.pine
      ? buildPineTree(i, s, v, g, x)
      : v.code >= PLANT_KIND.bush
        ? buildBush(i, s, v, g, x)
        : buildBroadleafTree(i, s, v, g, x);
  });
  const n = i.build(),
    o = s.build(),
    a = e,
    l = patchVegetationMaterial(
      new THREE.MeshStandardMaterial({
        roughness: 0.92,
        metalness: 0,
      }),
      r,
      {
        key: "veg-bark",
        uniforms: a,
        vertexHead: VEG_TREE_GLSL + BARK_VARYINGS,
        fragmentHead: BARK_VARYINGS,
        vertex: {
          begin_vertex: BARK_BEGIN_VERTEX + BARK_VARYINGS_VERTEX,
        },
        fragment: {
          color_fragment: BARK_COLOR_FRAGMENT,
          roughnessmap_fragment: BARK_ROUGHNESS_FRAGMENT,
        },
      },
    ),
    c = patchVegetationMaterial(new THREE.MeshDepthMaterial(), r, {
      key: "veg-bark-depth",
      uniforms: a,
      vertexHead: VEG_TREE_GLSL,
      vertex: {
        begin_vertex: BARK_BEGIN_VERTEX,
      },
    }),
    h = r.quality.tier > 0,
    f = patchVegetationMaterial(
      new THREE.MeshStandardMaterial({
        roughness: 0.68,
        metalness: 0,
        side: THREE.DoubleSide,
        alphaTest: 0.5,
        alphaToCoverage: h,
        envMapIntensity: 0.6,
      }),
      r,
      {
        key: "veg-foliage",
        uniforms: a,
        vertexHead: VEG_TREE_GLSL + FOLIAGE_VERTEX_HEAD,
        fragmentHead: FOLIAGE_FRAGMENT_HEAD,
        vertex: {
          begin_vertex: FOLIAGE_BEGIN_VERTEX,
        },
        fragment: {
          color_fragment: FOLIAGE_COLOR_FRAGMENT,
          roughnessmap_fragment: FOLIAGE_ROUGHNESS_FRAGMENT,
          aomap_fragment: FOLIAGE_AO_FRAGMENT,
        },
        light: !0,
        noFlip: !0,
      },
    ),
    u = patchVegetationMaterial(
      new THREE.MeshDepthMaterial({
        side: THREE.DoubleSide,
        alphaTest: 0.5,
      }),
      r,
      {
        key: "veg-foliage-depth",
        uniforms: a,
        vertexHead: VEG_TREE_GLSL + FOLIAGE_VERTEX_HEAD,
        fragmentHead: FOLIAGE_FRAGMENT_HEAD,
        vertex: {
          begin_vertex: FOLIAGE_BEGIN_VERTEX,
        },
        fragment: {
          alphatest_fragment: FOLIAGE_DEPTH_ALPHATEST,
        },
      },
    ),
    d = new THREE.Mesh(n, l);
  ((d.name = "vegetation-bark"),
    (d.castShadow = !0),
    (d.receiveShadow = !0),
    (d.customDepthMaterial = c));
  const p = new THREE.Mesh(o, f);
  return (
    (p.name = "vegetation-foliage"),
    (p.castShadow = !0),
    (p.receiveShadow = !0),
    (p.customDepthMaterial = u),
    {
      bark: d,
      foliage: p,
      stats: {
        barkVerts: i.count,
        foliageVerts: s.count,
      },
      dispose() {
        (n.dispose(),
          o.dispose(),
          l.dispose(),
          c.dispose(),
          f.dispose(),
          u.dispose());
      },
    }
  );
}
