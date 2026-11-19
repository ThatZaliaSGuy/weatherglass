/**
 * Profile-lathe geometry helpers, the tarnished brass material and the merged brass frame (posts, rails, studs, finial, gauge bezel).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  BASE_RAIL,
  CORNER_POST,
  GAUGE,
  GLASS_OUTER_HALF_D,
  GLASS_OUTER_HALF_W,
  LID_SLAB,
  PLAQUE,
  PLINTH,
  TOP_RAIL,
} from "./caseLayout.js";
import { patchStudioMaterial } from "./studioEnvironment.js";
export function latheRoundedRect(
  r,
  {
    halfW: t = 0,
    halfD: e = 0,
    radius: i = 0,
    seg: s = 6,
    crease: n = 0.82,
    tags: o = null,
    edgeAttr: a = !1,
  } = {},
) {
  const l = [],
    c = [
      [t - i, e - i, 0],
      [-(t - i), e - i, Math.PI * 0.5],
      [-(t - i), -(e - i), Math.PI],
      [t - i, -(e - i), Math.PI * 1.5],
    ];
  for (const [T, R, z] of c)
    for (let L = 0; L <= s; L++) {
      const k = z + (L / s) * Math.PI * 0.5,
        U = Math.cos(k),
        F = Math.sin(k),
        G = l[l.length - 1],
        B = T + U * i,
        q = R + F * i;
      (G && L === 0 && Math.abs(G.x - B) < 1e-6 && Math.abs(G.z - q) < 1e-6) ||
        l.push({
          x: B,
          z: q,
          ox: U,
          oz: F,
        });
    }
  l.push({
    ...l[0],
  });
  let h = 0;
  l[0].s = 0;
  for (let T = 1; T < l.length; T++)
    ((h += Math.hypot(l[T].x - l[T - 1].x, l[T].z - l[T - 1].z) || 0),
      (l[T].s = h));
  const f = r,
    u = f.length - 1,
    d = [],
    p = [];
  let v = 0;
  for (let T = 0; T < u; T++) {
    const R = f[T + 1][0] - f[T][0],
      z = f[T + 1][1] - f[T][1],
      L = Math.hypot(R, z) || 1e-9;
    (d.push([-z / L, R / L]), p.push(v), (v += L));
  }
  const g = (T, R) => {
      const z = d[T],
        L = R === 0 ? T - 1 : T + 1;
      if (L < 0 || L >= u) return z;
      const k = d[L];
      if (z[0] * k[0] + z[1] * k[1] < n) return z;
      const F = z[0] + k[0],
        G = z[1] + k[1],
        B = Math.hypot(F, G) || 1;
      return [F / B, G / B];
    },
    x = l.length,
    w = x * 2 * u,
    y = new Float32Array(w * 3),
    _ = new Float32Array(w * 3),
    M = new Float32Array(w * 2),
    A = a ? new Float32Array(w * 3) : null,
    b = [];
  let S = 0;
  for (let T = 0; T < u; T++) {
    const R = S;
    for (let z = 0; z < 2; z++) {
      const [L, k] = f[T + z],
        U = g(T, z),
        F =
          (p[T] +
            (z
              ? Math.hypot(f[T + 1][0] - f[T][0], f[T + 1][1] - f[T][1])
              : 0)) /
          (v || 1);
      for (let G = 0; G < x; G++) {
        const B = l[G];
        ((y[S * 3] = B.x + B.ox * L),
          (y[S * 3 + 1] = k),
          (y[S * 3 + 2] = B.z + B.oz * L),
          (_[S * 3] = U[0] * B.ox),
          (_[S * 3 + 1] = U[1]),
          (_[S * 3 + 2] = U[0] * B.oz),
          (M[S * 2] = B.s),
          (M[S * 2 + 1] = F * v),
          A &&
            ((A[S * 3] = B.s),
            (A[S * 3 + 1] = F),
            (A[S * 3 + 2] = o ? o[T] : 0)),
          S++);
      }
    }
    for (let z = 0; z < x - 1; z++) {
      const L = R + z,
        k = R + z + 1,
        U = R + x + z,
        F = R + x + z + 1;
      b.push(L, k, U, k, F, U);
    }
  }
  const E = new THREE.BufferGeometry();
  return (
    E.setAttribute("position", new THREE.BufferAttribute(y, 3)),
    E.setAttribute("normal", new THREE.BufferAttribute(_, 3)),
    E.setAttribute("uv", new THREE.BufferAttribute(M, 2)),
    A && E.setAttribute("aEdge", new THREE.BufferAttribute(A, 3)),
    E.setIndex(b),
    E
  );
}
function latheProfile(r, t = 6, e = 0.82) {
  return latheRoundedRect(r, {
    seg: t,
    crease: e,
  });
}
export function createRoundedRectCap(r, t, e, i, s = 6) {
  const n = new THREE.Shape(),
    o = r - e,
    a = t - e;
  (n.moveTo(o + e, -a),
    n.lineTo(o + e, a),
    n.absarc(o, a, e, 0, Math.PI * 0.5, !1),
    n.lineTo(-o, a + e),
    n.absarc(-o, a, e, Math.PI * 0.5, Math.PI, !1),
    n.lineTo(-o - e, -a),
    n.absarc(-o, -a, e, Math.PI, Math.PI * 1.5, !1),
    n.lineTo(o, -a - e),
    n.absarc(o, -a, e, Math.PI * 1.5, Math.PI * 2, !1));
  const l = new THREE.ShapeGeometry(n, s);
  return (l.rotateX(-Math.PI / 2), l.translate(0, i, 0), l);
}
const GLSL_BRASS_WEAR = `
  float bWear(vec3 p) { return wgNoise3(p * 3.1) * 0.6 + wgNoise3(p * 11.0 + 7.0) * 0.4; }
`;
export function createBrassMaterial(r, t, e) {
  const i = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.72, 0.5, 0.24),
    metalness: 1,
    roughness: 0.32,
    envMap: e,
    envMapIntensity: 1,
    clearcoat: r.quality.tier > 0 ? 0.35 : 0,
    clearcoatRoughness: 0.22,
  });
  return (
    patchStudioMaterial(i, r, t, {
      key: "wg-glass-brass",
      vars: GLSL_BRASS_WEAR,
      color: `
      float wear = bWear(vXWorld);
      // tarnish collects low down and in blotches; polished where hands touch (knob, finials, tops)
      float low = smoothstep(-1.0, -2.2, vXWorld.y) * 0.35;
      float tarnish = clamp(wear * 0.7 + low - 0.28 + (1.0 - abs(vXNormal.y)) * 0.06, 0.0, 1.0);
      float handled = smoothstep(7.5, 7.7, vXWorld.y) + smoothstep(0.55, 0.95, vXNormal.y) * 0.35;
      tarnish *= 1.0 - clamp(handled, 0.0, 1.0) * 0.8;
      diffuseColor.rgb *= mix(vec3(1.0), vec3(0.5, 0.4, 0.26), tarnish);
      // a rare freckle of dark patina deep in the tarnish
      float vg = smoothstep(0.86, 0.93, wgNoise3(vXWorld * 16.0 + 3.0) * 0.75 + tarnish * 0.3) * smoothstep(0.45, 0.75, tarnish);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.16, 0.12), vg * 0.6);
      float bPatina = vg;
      float bTarnish = tarnish;`,
      rough:
        "roughnessFactor = clamp(0.2 + bTarnish * 0.38 + bPatina * 0.4 + (wgNoise3(vXWorld * 40.0) - 0.5) * 0.06, 0.08, 0.95);",
      metal: "metalnessFactor = 1.0 - bPatina * 0.6;",
    }),
    i
  );
}
function translationMatrix(r, t, e) {
  return new THREE.Matrix4().makeTranslation(r, t, e);
}
export function createCaseFrame(r, t) {
  const e = r.quality.pick(4, 6, 8),
    i = [],
    s = TOP_RAIL.y1,
    n = LID_SLAB.y1,
    o = [
      [0, n + 0.235],
      [0.026, n + 0.232],
      [0.046, n + 0.22],
      [0.056, n + 0.2],
      [0.058, n + 0.18],
      [0.052, n + 0.158],
      [0.038, n + 0.142],
      [0.03, n + 0.13],
      [0.034, n + 0.112],
      [0.06, n + 0.1],
      [0.1, n + 0.088],
      [CORNER_POST.cap, n + 0.07],
      [CORNER_POST.cap + 0.006, n + 0.05],
      [CORNER_POST.cap + 0.006, s - 0.03],
      [CORNER_POST.cap, s - 0.045],
      [CORNER_POST.collar, s - 0.05],
      [CORNER_POST.collar, s - 0.2],
      [0.112, s - 0.215],
      [0.1, s - 0.235],
      [0.092, s - 0.27],
      [CORNER_POST.r, s - 0.32],
      [CORNER_POST.r, BASE_RAIL.y1 + 0.16],
      [0.092, BASE_RAIL.y1 + 0.11],
      [0.1, BASE_RAIL.y1 + 0.07],
      [0.115, BASE_RAIL.y1 + 0.035],
      [0.135, BASE_RAIL.y1 + 0.02],
      [0.138, BASE_RAIL.y1],
      [0.13, BASE_RAIL.y1 - 0.015],
      [0.13, BASE_RAIL.y0 + 0.06],
      [0.14, BASE_RAIL.y0 + 0.04],
      [0.14, BASE_RAIL.y0],
      [0, BASE_RAIL.y0],
    ],
    a = latheProfile(o, e);
  for (const m of [-1, 1])
    for (const w of [-1, 1])
      i.push(
        a
          .clone()
          .applyMatrix4(
            translationMatrix(m * CORNER_POST.x, 0, w * CORNER_POST.z),
          ),
      );
  a.dispose();
  const l = BASE_RAIL,
    c = [
      [0, l.y1],
      [0.032, l.y1],
      [0.046, l.y1 - 0.012],
      [0.052, l.y1 - 0.03],
      [0.056, l.y1 - 0.06],
      [0.068, l.y1 - 0.085],
      [0.08, l.y1 - 0.11],
      [0.086, l.y1 - 0.14],
      [l.t, l.y1 - 0.15],
      [l.t, l.y0 + 0.05],
      [l.t + 0.008, l.y0 + 0.035],
      [l.t + 0.012, l.y0 + 0.012],
      [l.t + 0.012, l.y0],
      [0, l.y0],
    ];
  i.push(
    latheRoundedRect(c, {
      halfW: GLASS_OUTER_HALF_W,
      halfD: GLASS_OUTER_HALF_D,
      radius: 0,
      seg: 1,
    }),
  );
  const h = TOP_RAIL,
    f = [
      [0, h.y1],
      [h.t - 0.016, h.y1],
      [h.t - 0.004, h.y1 - 0.012],
      [h.t, h.y1 - 0.03],
      [h.t, h.y0 + 0.07],
      [h.t + 0.008, h.y0 + 0.055],
      [h.t + 0.008, h.y0 + 0.03],
      [h.t, h.y0 + 0.015],
      [h.t - 0.012, h.y0],
      [0, h.y0],
    ];
  i.push(
    latheRoundedRect(f, {
      halfW: GLASS_OUTER_HALF_W,
      halfD: GLASS_OUTER_HALF_D,
      radius: 0,
      seg: 1,
    }),
  );
  const u = new THREE.SphereGeometry(
    0.024,
    8,
    4,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.5,
  );
  u.scale(1, 0.45, 1);
  const d = (m, w, y) => {
    const _ = u.clone().scale(y, y, y),
      M = new THREE.Quaternion(),
      A = (b, S, E, T) => {
        (M.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(E, 0, T),
        ),
          i.push(_.clone().applyQuaternion(M).translate(b, m, S)));
      };
    for (let b = 0; b < 9; b++) {
      const S = -5 + b * 1.25;
      (A(S, GLASS_OUTER_HALF_D + w, 0, 1),
        A(-S, -GLASS_OUTER_HALF_D - w, 0, -1));
    }
    for (let b = 0; b < 5; b++) {
      const S = -3.2 + b * 1.6;
      (A(GLASS_OUTER_HALF_W + w, S, 1, 0),
        A(-GLASS_OUTER_HALF_W - w, S, -1, 0));
    }
    _.dispose();
  };
  (d(BASE_RAIL.y0 + 0.11, BASE_RAIL.t, 1),
    d(TOP_RAIL.y0 + 0.13, TOP_RAIL.t, 0.8));
  {
    const m = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    );
    for (const w of [-1, 1])
      i.push(
        u
          .clone()
          .scale(0.75, 0.75, 0.75)
          .applyQuaternion(m)
          .translate(
            PLAQUE.x + w * (PLAQUE.w * 0.5 - 0.07),
            PLINTH.friezeY,
            PLINTH.friezeZ + PLAQUE.t + 0.002,
          ),
      );
    const mb = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, -1),
    );
    for (const w of [-1, 1])
      i.push(
        u
          .clone()
          .scale(0.75, 0.75, 0.75)
          .applyQuaternion(mb)
          .translate(
            PLAQUE.x + w * (PLAQUE.w * 0.5 - 0.07),
            PLINTH.friezeY,
            -(PLINTH.friezeZ + PLAQUE.t + 0.002),
          ),
      );
  }
  u.dispose();
  const p = latheProfile(
    [
      [0, 0.3],
      [0.03, 0.296],
      [0.055, 0.283],
      [0.07, 0.262],
      [0.076, 0.232],
      [0.071, 0.2],
      [0.056, 0.176],
      [0.036, 0.162],
      [0.027, 0.148],
      [0.03, 0.112],
      [0.056, 0.098],
      [0.064, 0.086],
      [0.054, 0.07],
      [0.04, 0.062],
      [0.1, 0.036],
      [0.135, 0.02],
      [0.142, 0.008],
      [0.142, 0],
      [0, 0],
    ],
    e + 2,
  );
  (p.translate(0, LID_SLAB.y1, 0), i.push(p));
  const v = latheRoundedRect(
    [
      [GAUGE.r - 0.016, 0.03],
      [GAUGE.r - 0.004, 0.05],
      [GAUGE.r + 0.012, 0.058],
      [GAUGE.bezel - 0.012, 0.052],
      [GAUGE.bezel - 0.002, 0.036],
      [GAUGE.bezel, 0.014],
      [GAUGE.bezel, 0],
      [GAUGE.r - 0.016, 0],
      [GAUGE.r - 0.016, 0.03],
    ],
    {
      seg: e + 2,
    },
  );
  (v.rotateX(Math.PI / 2),
    v.translate(GAUGE.x, PLINTH.friezeY, PLINTH.friezeZ),
    i.push(v));
  for (const m of i) {
    for (const w of Object.keys(m.attributes))
      ["position", "normal", "uv"].includes(w) || m.deleteAttribute(w);
    m.index || m.setIndex([...Array(m.attributes.position.count).keys()]);
  }
  const g = mergeGeometries(i, !1);
  for (const m of i) m.dispose();
  g.computeBoundingSphere();
  const x = new THREE.Mesh(g, t);
  return (
    (x.name = "glassFrame"),
    (x.castShadow = !0),
    (x.receiveShadow = !0),
    x
  );
}
