/**
 * Procedural rock geometry variants, rock placement, rock shaders and the instanced rock mesh.
 */
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { BOX, WATER_LEVELS } from "../core/config.js";
import { createSimplexNoise, mulberry32 } from "../util/noise.js";
import { clamp, lerp2 } from "../util/math.js";
import {
  CABIN2,
  LAKE2,
  RIVER_PATH2,
  RIVER_POINTS2,
  lakeEllipse2,
  riverHalfWidth2,
  riverQuery2,
  suitability2,
  terrainHeight2,
  terrainNormal2,
  waterDistance2,
} from "./terrainShape.js";
import { FOOTPATHS, RIVER_CROSSING } from "./terrainPaths.js";
const ROCK_VARIANT_COUNT = 4;
function rockSmoothMin(r, t, e) {
  const i = clamp(0.5 + (0.5 * (t - r)) / e, 0, 1);
  return lerp2(t, r, i) - e * i * (1 - i);
}
function carveRockVariant(r, t, e) {
  const i = createSimplexNoise(t),
    s = mulberry32(t * 7 + 3),
    n = [],
    o = e.cuts + Math.floor(s() * 4);
  for (let d = 0; d < o; d++) {
    const p = s() * Math.PI * 2,
      v = lerp2(-0.2, 0.85, s()),
      g = Math.sqrt(1 - v * v);
    n.push({
      x: Math.cos(p) * g,
      y: v,
      z: Math.sin(p) * g,
      d: lerp2(0.58, 0.86, s()),
    });
  }
  const a = r.attributes.position,
    l = new THREE.BufferGeometry(),
    c = new Float32Array(a.count * 3);
  let h = 1 / 0,
    f = -1 / 0,
    u = 0;
  for (let d = 0; d < a.count; d++) {
    const p = a.getX(d),
      v = a.getY(d),
      g = a.getZ(d);
    let x =
      1 +
      0.2 * i.noise3(p * 1.2, v * 1.2, g * 1.2) +
      0.08 * i.noise3(p * 2.9 + 5, v * 2.9, g * 2.9) +
      0.03 * i.noise3(p * 7, v * 7, g * 7);
    for (const _ of n) {
      const M = p * _.x + v * _.y + g * _.z;
      M > 0.05 && (x = rockSmoothMin(x, _.d / M, 0.035));
    }
    v < -0.05 && (x = rockSmoothMin(x, 0.62 / -v, 0.12));
    const m = p * x * e.sx,
      w = v * x * e.sy,
      y = g * x * e.sz;
    ((c[d * 3] = m),
      (c[d * 3 + 1] = w),
      (c[d * 3 + 2] = y),
      (h = Math.min(h, w)),
      (f = Math.max(f, w)),
      (u = Math.max(u, Math.hypot(m, y))));
  }
  return (
    l.setAttribute("position", new THREE.BufferAttribute(c, 3)),
    l.setIndex(r.index),
    l.computeVertexNormals(),
    {
      pos: c,
      nrm: l.attributes.normal.array,
      ymin: h,
      ymax: f,
      rh: u * 0.9,
    }
  );
}
function createRockGeometry(r) {
  const t = new THREE.IcosahedronGeometry(1, r);
  (t.deleteAttribute("uv"), t.deleteAttribute("normal"));
  const e = mergeVertices(t, 1e-4),
    s = [
      {
        sx: 1.15,
        sy: 0.78,
        sz: 0.95,
        cuts: 4,
      },
      {
        sx: 1.3,
        sy: 0.62,
        sz: 1,
        cuts: 5,
      },
      {
        sx: 0.95,
        sy: 0.95,
        sz: 0.9,
        cuts: 6,
      },
      {
        sx: 1.2,
        sy: 0.7,
        sz: 0.82,
        cuts: 3,
      },
    ].map((o, a) => carveRockVariant(e, 911 + a * 131, o)),
    n = new THREE.BufferGeometry();
  (n.setIndex(e.index),
    n.setAttribute("position", new THREE.BufferAttribute(s[0].pos, 3)),
    n.setAttribute("normal", new THREE.BufferAttribute(s[0].nrm, 3)));
  for (let o = 1; o < ROCK_VARIANT_COUNT; o++)
    (n.setAttribute(`aPos${o}`, new THREE.BufferAttribute(s[o].pos, 3)),
      n.setAttribute(`aNrm${o}`, new THREE.BufferAttribute(s[o].nrm, 3)));
  return (
    n.computeBoundingSphere(),
    (n.boundingSphere.radius *= 1.1),
    t.dispose(),
    {
      geo: n,
      variants: s,
    }
  );
}
const rockRiverScratch = {};
const rockUpScratch = {
  x: 0,
  y: 1,
  z: 0,
};
class RockPlacer {
  constructor(t) {
    ((this.rand = mulberry32(t)), (this.list = []));
  }
  r(t, e) {
    return t + (e - t) * this.rand();
  }
  free(t, e, i, s = 0.9) {
    for (const n of this.list)
      if (Math.hypot(n.x - t, n.z - e) < (n.r + i) * s) return !1;
    return !0;
  }
  inBox(t, e, i) {
    return (
      Math.abs(t) < BOX.halfW - i * 1.35 - 0.04 &&
      Math.abs(e) < BOX.halfD - i * 1.35 - 0.04
    );
  }
  add(t) {
    return this.inBox(t.x, t.z, t.r) ? (this.list.push(t), !0) : !1;
  }
}
function isNearFootpath(r, t, e) {
  for (const i of FOOTPATHS)
    for (const s of i.pts)
      if (Math.hypot(s.x - r, s.z - t) < i.width * 0.5 + e) return !0;
  return !1;
}
function isClearOfRiver(r, t, e) {
  const i = riverQuery2(r, t, rockRiverScratch);
  return i ? i.dist > riverHalfWidth2(i.t) + e * 0.6 : !0;
}
function placeRocks(r) {
  const t = new RockPlacer(4242),
    e = (x, m) => t.r(x, m),
    i = (x, m, w, y = {}) => ({
      x,
      z: m,
      r: w,
      kind: "rock",
      squash: 1,
      align: 0.55,
      waterY: -10,
      moss: 0,
      ...y,
    }),
    s = RIVER_CROSSING,
    n = s.halfWidth * 1.9 + 0.05,
    o = (x) => {
      for (let m = 0.02; m < n; m += 0.01)
        if (
          terrainHeight2(s.x + s.px * m * x, s.z + s.pz * m * x) >=
          s.y + 0.004
        )
          return m;
      return n;
    },
    a = o(1) + 0.02,
    l = o(-1) + 0.02,
    c = Math.max(4, Math.round((a + l) / 0.15) + 1);
  for (let x = 0; x < c; x++) {
    const m = lerp2(-l, a, x / (c - 1)) + e(-0.012, 0.012),
      w = e(-0.035, 0.035);
    t.add(
      i(
        s.x + s.px * m + s.dirX * w,
        s.z + s.pz * m + s.dirZ * w,
        e(0.088, 0.1),
        {
          kind: "stepping",
          squash: 0.55,
          align: 0,
          top: s.y + e(0.032, 0.045),
          waterY: s.y,
          moss: 0.6,
          variant: 1,
        },
      ),
    );
  }
  const h = RIVER_POINTS2[2],
    f = RIVER_POINTS2[1],
    u = Math.atan2(f.z - h.z, f.x - h.x),
    d = RIVER_POINTS2[3],
    p = Math.atan2(d.z - h.z, d.x - h.x);
  for (let x = 0; x < 16 && t.list.length < 18; x++) {
    const m = (x / 16) * Math.PI * 2 + e(-0.15, 0.15);
    if (
      Math.min(
        Math.abs(Math.atan2(Math.sin(m - u), Math.cos(m - u))),
        Math.abs(Math.atan2(Math.sin(m - p), Math.cos(m - p))),
      ) < 0.55
    )
      continue;
    const y = e(0.1, 0.24),
      _ = 0.2 + y * 0.9 + e(0, 0.12),
      M = h.x + Math.cos(m) * _,
      A = h.z + Math.sin(m) * _;
    t.free(M, A, y, 0.8) &&
      t.add(
        i(M, A, y, {
          waterY: h.y,
          moss: 0.8,
        }),
      );
  }
  for (const x of [-1, 1]) {
    const m = riverQuery2(f.x, f.z, {}),
      w = -m.dirZ,
      y = m.dirX,
      _ = e(0.1, 0.16),
      M = f.x + w * x * (riverHalfWidth2(m.t) + _ * 0.7),
      A = f.z + y * x * (riverHalfWidth2(m.t) + _ * 0.7);
    t.free(M, A, _, 0.8) &&
      t.add(
        i(M, A, _, {
          waterY: f.y,
          moss: 0.7,
        }),
      );
  }
  for (let x = 0; x < 40 && t.list.length < 40; x++) {
    const m = e(-2.9, -0.2),
      w = e(-1.35, -0.85),
      y = e(0.05, 0.19);
    if (
      terrainHeight2(m, w) > 1.4 ||
      !isClearOfRiver(m, w, y) ||
      !t.free(m, w, y)
    )
      continue;
    const M = riverQuery2(m, w, rockRiverScratch);
    t.add(
      i(m, w, y, {
        moss: 0.5,
        waterY: M && M.dist < 0.5 ? M.y : -10,
      }),
    );
  }
  const v = RIVER_POINTS2[0];
  for (let x = 0; x < 12; x++) {
    const m = e(0, Math.PI * 2),
      w = e(0.16, 0.42),
      y = v.x + Math.cos(m) * w,
      _ = v.z + Math.sin(m) * w,
      M = e(0.07, 0.16);
    isClearOfRiver(y, _, M) &&
      t.free(y, _, M) &&
      t.add(
        i(y, _, M, {
          waterY: v.y,
          moss: 0.7,
        }),
      );
  }
  const g = [
    [-4.7, 2.75, 0.42],
    [-1.35, 3.05, 0.3],
    [4.95, 0.35, 0.38],
    [0.95, -0.6, 0.26],
    [-4.3, -0.15, 0.34],
    [3.6, -0.1, 0.22],
  ];
  for (const [x, m, w] of g) {
    let y = null;
    for (let _ = 0; _ < 24 && !y; _++) {
      const M = x + (_ ? e(-0.5, 0.5) : 0),
        A = m + (_ ? e(-0.5, 0.5) : 0);
      waterDistance2(M, A) < w + 0.25 ||
        Math.hypot(M - CABIN2.x, A - CABIN2.z) < 1.2 + w ||
        isNearFootpath(M, A, w + 0.1) ||
        !t.free(M, A, w, 1.1) ||
        !t.inBox(M, A, w) ||
        (y = i(M, A, w, {
          align: 0.35,
          moss: 0.35,
        }));
    }
    if (y) {
      t.add(y);
      for (let _ = 0; _ < 3; _++) {
        const M = e(0, Math.PI * 2),
          A = e(0.05, 0.12),
          b = w + A + e(0.02, 0.18),
          S = y.x + Math.cos(M) * b,
          E = y.z + Math.sin(M) * b;
        t.free(S, E, A) &&
          waterDistance2(S, E) > 0.1 &&
          !isNearFootpath(S, E, A) &&
          t.add(
            i(S, E, A, {
              moss: 0.3,
            }),
          );
      }
    }
  }
  for (let x = 0; x < 60 && t.list.length < r * 0.55; x++) {
    const m = e(0, Math.PI * 2),
      w = e(0.92, 1.25),
      y = LAKE2.cx + Math.cos(m) * LAKE2.rx * w,
      _ = LAKE2.cz + Math.sin(m) * LAKE2.rz * w;
    if (_ > BOX.halfD - 0.3 || lakeEllipse2(y, _) < 0.9) continue;
    const M = e(0.05, 0.15);
    !isClearOfRiver(y, _, M) ||
      !t.free(y, _, M) ||
      isNearFootpath(y, _, M) ||
      (t.rand() < 0.45 &&
        t.add(
          i(y, _, M, {
            waterY: WATER_LEVELS.lakeLevel,
            moss: 0.5,
          }),
        ));
  }
  for (let x = 0; x < RIVER_PATH2.length && t.list.length < r * 0.72; x += 3) {
    const m = RIVER_PATH2[x];
    if (m.t < 0.22 || m.t > 0.94 || t.rand() < 0.35) continue;
    const w = Math.min(RIVER_PATH2.length - 1, x + 1),
      y = RIVER_PATH2[w].x - m.x,
      _ = RIVER_PATH2[w].z - m.z,
      M = Math.hypot(y, _) || 1,
      A = t.rand() < 0.5 ? -1 : 1,
      b = e(0.035, 0.1),
      E = riverHalfWidth2(m.t) + b * e(0.2, 1.4),
      T = m.x - (_ / M) * E * A,
      R = m.z + (y / M) * E * A;
    Math.hypot(T - s.x, R - s.z) < 0.35 ||
      !t.free(T, R, b) ||
      isNearFootpath(T, R, b) ||
      t.add(
        i(T, R, b, {
          waterY: m.y,
          moss: 0.65,
        }),
      );
  }
  for (let x = 0; x < 4e3 && t.list.length < r; x++) {
    const m = e(-BOX.halfW + 0.2, BOX.halfW - 0.2),
      w = e(-BOX.halfD + 0.2, 1.2),
      y = suitability2(m, w, "rock");
    if (t.rand() > y * 0.6 || terrainNormal2(m, w, rockUpScratch).y < 0.62)
      continue;
    const _ = terrainHeight2(m, w),
      M =
        e(0.05, 0.12) + e(0, 0.12) * clamp(y, 0, 1) + (_ > 2 ? e(0, 0.06) : 0);
    waterDistance2(m, w) < 0.12 + M ||
      Math.hypot(m - CABIN2.x, w - CABIN2.z) < 1.2 ||
      isNearFootpath(m, w, M) ||
      (t.free(m, w, M) &&
        t.add(
          i(m, w, M, {
            moss: _ < 1.5 ? 0.4 : 0.15,
            align: 0.7,
          }),
        ));
  }
  return t.list;
}
const ROCK_VERTEX_PARS_GLSL = `
attribute vec3 aPos1; attribute vec3 aPos2; attribute vec3 aPos3;
attribute vec4 aRock;   // variant weights 1..3, seed
`;
const ROCK_BEGIN_VERTEX_GLSL = `
float rw0 = max(0.0, 1.0 - aRock.x - aRock.y - aRock.z);
vec3 transformed = position * rw0 + aPos1 * aRock.x + aPos2 * aRock.y + aPos3 * aRock.z;
`;
const ROCK_BUMP_GLSL = `
// Mikkelsen derivative bump (world space)
vec3 rBump(vec3 pos, vec3 n, float H) {
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dFdx(H) * r1 + dFdy(H) * r2);
  return normalize(abs(det) * n - grad);
}

struct TRock { vec3 albedo; float rough; vec3 n; float ao; float sparkle; };

TRock rockSurface(vec3 p, vec3 nG, vec3 loc, vec4 rk, vec4 rk2) {
  TRock s;
  float seed = rk.w;
  float fw = length(fwidth(p));
  float fine = 1.0 - smoothstep(0.006, 0.03, fw);
  vec3 sp = p + seed * 13.7;
  vec3 base = mix(vec3(0.17, 0.165, 0.155), vec3(0.32, 0.3, 0.27), fract(seed * 7.13));
  base = mix(base, vec3(0.3, 0.23, 0.17), step(0.72, fract(seed * 3.71)) * 0.65);   // warm granite
  base = mix(base, vec3(0.14, 0.15, 0.16), step(0.82, fract(seed * 5.37)) * 0.7);    // cool basalt
  float n1 = wgNoise3(sp * 7.0);
  float n2 = wgNoise3(sp * 26.0);
  float n3 = wgNoise3(sp * 70.0);
  vec3 col = base * (0.76 + 0.34 * n1 + 0.14 * (n2 - 0.5));
  col *= 0.92 + 0.16 * step(0.72, n3) * fine;                               // mineral grains
  float cr = abs(wgNoise3(loc * 2.6 + seed * 17.0) - 0.5);
  float crack = (1.0 - smoothstep(0.0, 0.03, cr)) * step(0.35, fract(seed * 11.3));
  col *= 1.0 - crack * 0.55;

  // grounding: grime and darker contact band at the soil line
  float hag = p.y - groundHeightAt(p.xz);
  float contact = 1.0 - smoothstep(0.0, 0.06, hag);
  col = mix(col, col * vec3(0.55, 0.5, 0.45), contact);

  // lichen crusts on top, moss on the shaded / damp flanks
  float lich = smoothstep(0.66, 0.7, wgNoise3(sp * 16.0)) * smoothstep(0.1, 0.6, nG.y) * step(0.3, fract(seed * 9.1));
  vec3 lichCol = mix(vec3(0.42, 0.45, 0.3), vec3(0.55, 0.36, 0.12), step(0.6, wgNoise3(sp * 3.0 + 4.0)));
  col = mix(col, lichCol * (0.85 + 0.3 * n2), lich * 0.7);
  float mossN = wgNoise3(sp * 4.0 + 3.0) * 0.6 + n2 * 0.4;
  float moss = smoothstep(0.66, 0.82, mossN + rk2.z * 0.22 - nG.z * 0.12 + contact * 0.25 - max(nG.y, 0.0) * 0.12) * (0.3 + 0.5 * rk2.z);
  moss *= 1.0 - smoothstep(0.7, 1.0, uSeason - 2.2) * 0.4;
  vec3 mossCol = mix(vec3(0.07, 0.11, 0.03), vec3(0.14, 0.18, 0.05), n3) * mix(vec3(1.0), vec3(1.35, 1.0, 0.6), smoothstep(1.6, 2.4, uSeason) * (1.0 - smoothstep(3.0, 3.6, uSeason)));
  col = mix(col, mossCol, moss);

  // wetness: rain, damp ground and the splash zone above the water line
  vec4 G = groundAt(p.xz);
  float wet = max(G.y * 0.9, smoothstep(rk2.x + 0.028, rk2.x + 0.004, p.y) * 0.85);
  wet = max(wet, smoothstep(rk2.x + 0.005, rk2.x - 0.01, p.y));
  col *= 1.0 - wet * 0.45;
  float rough = mix(0.84, 0.22, wet) + (n2 - 0.5) * 0.08;
  rough = mix(rough, 0.95, moss);

  // snow caps on the tops
  float sc = snowCover(p.xz, nG);
  float snow = smoothstep(0.35, 0.55, sc * smoothstep(0.3, 0.75, nG.y) + (n1 - 0.5) * 0.25) * step(rk2.x + 0.01, p.y);
  col = mix(col, vec3(0.55, 0.58, 0.63) * (0.95 + 0.05 * n2), snow);
  rough = mix(rough, 0.6, snow);
  float frost = G.w * (1.0 - snow);
  col = mix(col, vec3(0.72, 0.78, 0.84), frost * 0.25 * smoothstep(0.4, 0.8, n3));

  float H = (n1 * 0.012 + (n2 - 0.5) * 0.004 + (n3 - 0.5) * 0.0015 * fine - crack * 0.008) * (1.0 - snow * 0.7);
  vec3 n = rBump(p, nG, H);
  // "flat-shaded-soft": a whisper of the true facet normal for a chiselled read
  vec3 fn = normalize(cross(dFdx(p), dFdy(p)));
  n = normalize(mix(n, fn, 0.22 * (1.0 - snow)));

  vec3 V = normalize(cameraPosition - p);
  vec3 gc = floor(p * 90.0);
  vec3 gn = normalize(vec3(wgHash3(gc + 1.7), wgHash3(gc + 3.1), wgHash3(gc + 5.3)) * 2.0 - 1.0 + vec3(0.0, 0.7, 0.0));
  s.sparkle = snow * step(0.9, wgHash3(gc + 0.5)) * pow(max(dot(gn, normalize(uLightDir + V)), 0.0), 80.0);
  s.albedo = col;
  s.rough = clamp(rough, 0.05, 1.0);
  s.n = n;
  s.ao = mix(1.0, 0.45, contact) * (1.0 - crack * 0.4);
  return s;
}
`;
const ROCK_VARYINGS_GLSL = `varying vec3 vRPos;
varying vec3 vRNrm;
varying vec3 vRLoc;
varying vec4 vRock;
varying vec4 vRock2;
`;
function createRockMaterial(r) {
  const t = new THREE.MeshStandardMaterial({
    color: 16777215,
    roughness: 0.85,
    metalness: 0,
  });
  return (
    (t.onBeforeCompile = (e) => {
      (Object.assign(e.uniforms, r.uniforms),
        (e.vertexShader =
          r.GLSL_COMMON +
          e.vertexShader
            .replace(
              "#include <common>",
              `#include <common>
` +
                ROCK_VERTEX_PARS_GLSL +
                `attribute vec3 aNrm1; attribute vec3 aNrm2; attribute vec3 aNrm3;
attribute vec4 aRock2;
` +
                ROCK_VARYINGS_GLSL,
            )
            .replace(
              "#include <beginnormal_vertex>",
              `
        float nw0 = max(0.0, 1.0 - aRock.x - aRock.y - aRock.z);
        vec3 objectNormal = normalize(normal * nw0 + aNrm1 * aRock.x + aNrm2 * aRock.y + aNrm3 * aRock.z);`,
            )
            .replace("#include <begin_vertex>", ROCK_BEGIN_VERTEX_GLSL)
            .replace(
              "#include <worldpos_vertex>",
              `#include <worldpos_vertex>
        mat3 rIm = mat3(instanceMatrix);
        vec3 rN = objectNormal / vec3(dot(rIm[0], rIm[0]), dot(rIm[1], rIm[1]), dot(rIm[2], rIm[2]));
        vRNrm = normalize(mat3(modelMatrix) * (rIm * rN));
        vRPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        vRLoc = transformed;
        vRock = aRock;
        vRock2 = aRock2;`,
            )),
        (e.fragmentShader =
          r.GLSL_COMMON +
          ROCK_BUMP_GLSL +
          e.fragmentShader
            .replace(
              "#include <common>",
              `#include <common>
` + ROCK_VARYINGS_GLSL,
            )
            .replace(
              "#include <map_fragment>",
              `#include <map_fragment>
        TRock tR = rockSurface(vRPos, normalize(vRNrm), vRLoc, vRock, vRock2);
        diffuseColor.rgb = tR.albedo;`,
            )
            .replace(
              "#include <roughnessmap_fragment>",
              "float roughnessFactor = tR.rough;",
            )
            .replace(
              "#include <normal_fragment_maps>",
              `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(tR.n, 0.0)).xyz);`,
            )
            .replace(
              "#include <lights_fragment_end>",
              `#include <lights_fragment_end>
        reflectedLight.directSpecular += reflectedLight.directDiffuse / max(diffuseColor.rgb, vec3(0.02)) * tR.sparkle * 1.6;
        reflectedLight.indirectDiffuse *= tR.ao;
        reflectedLight.indirectSpecular *= tR.ao;`,
            )));
    }),
    (t.customProgramCacheKey = () => "wg-terrain-rock"),
    t
  );
}
function createRockDepthMaterial() {
  const r = new THREE.MeshDepthMaterial();
  return (
    (r.onBeforeCompile = (t) => {
      t.vertexShader = t.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
` + ROCK_VERTEX_PARS_GLSL,
        )
        .replace("#include <begin_vertex>", ROCK_BEGIN_VERTEX_GLSL);
    }),
    (r.customProgramCacheKey = () => "wg-terrain-rock-depth"),
    r
  );
}
export function createRockInstances(r) {
  const { quality: t } = r,
    e = t.pick(110, 170, 210),
    { geo: i, variants: s } = createRockGeometry(t.pick(1, 2, 3)),
    n = placeRocks(e),
    o = new THREE.InstancedMesh(i, createRockMaterial(r), n.length);
  ((o.customDepthMaterial = createRockDepthMaterial()),
    (o.castShadow = !0),
    (o.receiveShadow = !0),
    (o.name = "terrain-rocks"));
  const a = new Float32Array(n.length * 4),
    l = new Float32Array(n.length * 4),
    c = mulberry32(77),
    h = new THREE.Matrix4(),
    f = new THREE.Quaternion(),
    u = new THREE.Quaternion(),
    d = new THREE.Euler(),
    p = new THREE.Vector3(0, 1, 0),
    v = new THREE.Vector3(),
    g = new THREE.Vector3(),
    x = new THREE.Vector3(),
    m = [];
  return (
    n.forEach((w, y) => {
      const _ = w.variant ?? Math.floor(c() * ROCK_VARIANT_COUNT),
        M = [0, 0, 0, 0];
      for (let G = 0; G < ROCK_VARIANT_COUNT; G++)
        M[G] = G === _ ? 1 : c() * (w.variant === void 0 ? 0.35 : 0.12);
      const A = M[0] + M[1] + M[2] + M[3];
      for (let G = 0; G < ROCK_VARIANT_COUNT; G++) M[G] /= A;
      ((a[y * 4] = M[1]),
        (a[y * 4 + 1] = M[2]),
        (a[y * 4 + 2] = M[3]),
        (a[y * 4 + 3] = c()));
      let b = 0,
        S = 0,
        E = 0;
      for (let G = 0; G < ROCK_VARIANT_COUNT; G++)
        ((b += s[G].ymin * M[G]),
          (S += s[G].ymax * M[G]),
          (E += s[G].rh * M[G]));
      const T = w.r / E;
      let R = T * (w.squash ?? 1) * lerp2(0.8, 1.15, c());
      (w.kind === "stepping" &&
        (R = (w.top - (terrainHeight2(w.x, w.z) - 0.03)) / (S - b)),
        g.set(T * lerp2(0.9, 1.1, c()), R, T * lerp2(0.9, 1.1, c())),
        terrainNormal2(w.x, w.z, v),
        v.lerp(p, 1 - w.align).normalize(),
        u.setFromUnitVectors(p, v),
        d.set((c() - 0.5) * 0.25, c() * Math.PI * 2, (c() - 0.5) * 0.25),
        f.setFromEuler(d).premultiply(u));
      const z = terrainHeight2(w.x, w.z);
      let L = z;
      for (let G = 0; G < 6; G++) {
        const B = (G / 6) * Math.PI * 2;
        L = Math.min(
          L,
          terrainHeight2(
            w.x + Math.cos(B) * w.r * 0.75,
            w.z + Math.sin(B) * w.r * 0.75,
          ),
        );
      }
      const k = lerp2(z, L, 0.6),
        U = (S - b) * R;
      let F = k - 0.3 * U - b * R;
      (w.kind === "stepping" && (F = w.top - S * R),
        x.set(w.x, F, w.z),
        h.compose(x, f, g),
        o.setMatrixAt(y, h),
        (l[y * 4] = w.waterY),
        (l[y * 4 + 1] = 0),
        (l[y * 4 + 2] = w.moss),
        (l[y * 4 + 3] = 0),
        m.push({
          x: w.x,
          y: F,
          z: w.z,
          r: w.r,
          top: F + S * R,
          h: U,
          kind: w.kind,
        }));
    }),
    i.setAttribute("aRock", new THREE.InstancedBufferAttribute(a, 4)),
    i.setAttribute("aRock2", new THREE.InstancedBufferAttribute(l, 4)),
    (o.instanceMatrix.needsUpdate = !0),
    o.computeBoundingSphere(),
    {
      mesh: o,
      rocks: m,
    }
  );
}
