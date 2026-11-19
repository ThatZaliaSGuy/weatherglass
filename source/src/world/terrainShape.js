/**
 * Procedural terrain definition: peaks, lake, river spline, cabin pad, height/normal/mask queries, placement suitability and terrain baking.
 */
import { BOX, TERRAIN_BOUNDS, WATER_LEVELS } from "../core/config.js";
import { createSimplexNoise } from "../util/noise.js";
import { clamp, lerp2, smoothstep2 } from "../util/math.js";
const terrainNoise = createSimplexNoise(20240917);
const PEAKS2 = [
  {
    x: -3.4,
    z: -2.8,
    h: 3.95,
    r: 2.25,
    squash: 1.25,
  },
  {
    x: -0.55,
    z: -3.25,
    h: 3.05,
    r: 1.8,
    squash: 1.1,
  },
  {
    x: 1.95,
    z: -2.95,
    h: 3.3,
    r: 2,
    squash: 1.2,
  },
  {
    x: 4.5,
    z: -3.05,
    h: 2.45,
    r: 1.9,
    squash: 1,
  },
  {
    x: -5.4,
    z: -1.6,
    h: 1.55,
    r: 1.5,
    squash: 1,
  },
];
export const LAKE2 = {
  cx: 2.75,
  cz: 2.65,
  rx: 2.35,
  rz: 1.75,
  bottomY: -0.85,
};
export const RIVER_POINTS2 = [
  {
    x: -1.8,
    z: -2.35,
    y: 2.2,
  },
  {
    x: -1.55,
    z: -1.72,
    y: 2.02,
  },
  {
    x: -1.35,
    z: -1.22,
    y: 0.98,
  },
  {
    x: -0.7,
    z: -0.55,
    y: 0.66,
  },
  {
    x: -0.05,
    z: 0.25,
    y: 0.46,
  },
  {
    x: 0.75,
    z: 0.8,
    y: 0.3,
  },
  {
    x: 1.5,
    z: 1.5,
    y: 0.16,
  },
  {
    x: 2.15,
    z: 2.1,
    y: 0.06,
  },
];
const WATERFALL2 = {
  topIndex: 1,
  bottomIndex: 2,
};
export const CABIN2 = {
  x: -2.95,
  z: 1.35,
  rot: 0.55,
  padRadius: 0.75,
};
const riverSamples = [];
(function () {
  const t = RIVER_POINTS2,
    e = 28;
  for (let n = 0; n < t.length - 1; n++) {
    const o = t[Math.max(0, n - 1)],
      a = t[n],
      l = t[n + 1],
      c = t[Math.min(t.length - 1, n + 2)];
    for (let h = 0; h < e; h++) {
      const f = h / e,
        u = f * f,
        d = u * f,
        p = (g, x, m, w) =>
          0.5 *
          (2 * x +
            (-g + m) * f +
            (2 * g - 5 * x + 4 * m - w) * u +
            (-g + 3 * x - 3 * m + w) * d),
        v = f * f * (3 - 2 * f);
      riverSamples.push({
        x: p(o.x, a.x, l.x, c.x),
        z: p(o.z, a.z, l.z, c.z),
        y: lerp2(a.y, l.y, v),
        seg: n + f,
      });
    }
  }
  const i = t[t.length - 1];
  riverSamples.push({
    x: i.x,
    z: i.z,
    y: i.y,
    seg: t.length - 1,
  });
  let s = 0;
  riverSamples[0].s = 0;
  for (let n = 1; n < riverSamples.length; n++) {
    const o = riverSamples[n - 1],
      a = riverSamples[n];
    ((s += Math.hypot(a.x - o.x, a.z - o.z)), (a.s = s));
  }
  for (const n of riverSamples) n.t = n.s / s;
})();
const RIVER_LENGTH2 = riverSamples[riverSamples.length - 1].s;
export const RIVER_PATH2 = riverSamples;
let riverMinX = 1 / 0;
let riverMaxX = -1 / 0;
let riverMinZ = 1 / 0;
let riverMaxZ = -1 / 0;
for (const r of riverSamples)
  ((riverMinX = Math.min(riverMinX, r.x)),
    (riverMaxX = Math.max(riverMaxX, r.x)),
    (riverMinZ = Math.min(riverMinZ, r.z)),
    (riverMaxZ = Math.max(riverMaxZ, r.z)));
const RIVER_QUERY_MARGIN = 1.35;
export function riverHalfWidth2(r) {
  return lerp2(0.1, 0.24, smoothstep2(0, 1, r));
}
export function riverQuery2(r, t, e = {}) {
  if (
    r < riverMinX - RIVER_QUERY_MARGIN ||
    r > riverMaxX + RIVER_QUERY_MARGIN ||
    t < riverMinZ - RIVER_QUERY_MARGIN ||
    t > riverMaxZ + RIVER_QUERY_MARGIN
  )
    return null;
  let i = 1 / 0,
    s = 0,
    n = 0;
  for (let c = 0; c < riverSamples.length - 1; c++) {
    const h = riverSamples[c],
      f = riverSamples[c + 1],
      u = f.x - h.x,
      d = f.z - h.z,
      p = u * u + d * d || 1e-9;
    let v = ((r - h.x) * u + (t - h.z) * d) / p;
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    const g = h.x + u * v - r,
      x = h.z + d * v - t,
      m = g * g + x * x;
    m < i && ((i = m), (s = c), (n = v));
  }
  const o = riverSamples[s],
    a = riverSamples[s + 1],
    l = Math.hypot(a.x - o.x, a.z - o.z) || 1e-9;
  return (
    (e.dist = Math.sqrt(i)),
    (e.t = lerp2(o.t, a.t, n)),
    (e.y = lerp2(o.y, a.y, n)),
    (e.dirX = (a.x - o.x) / l),
    (e.dirZ = (a.z - o.z) / l),
    (e.side = Math.sign((r - o.x) * e.dirZ - (t - o.z) * e.dirX) || 1),
    e
  );
}
function smoothMax(r, t, e) {
  const i = clamp(0.5 + (0.5 * (t - r)) / e, 0, 1);
  return lerp2(r, t, i) + e * i * (1 - i);
}
function smoothMin(r, t, e) {
  return -smoothMax(-r, -t, e);
}
export function lakeEllipse2(r, t) {
  const e = (r - LAKE2.cx) / LAKE2.rx,
    i = (t - LAKE2.cz) / LAKE2.rz,
    s = Math.atan2(i, e),
    n =
      0.07 * Math.sin(s * 3 + 1.3) +
      0.05 * Math.sin(s * 5 - 0.4) +
      0.06 * terrainNoise.noise2(r * 0.9 + 7, t * 0.9 - 3);
  return Math.sqrt(e * e + i * i) * (1 + n);
}
function baseHeight2(r, t) {
  let e =
    0.42 +
    terrainNoise.fbm2(r * 0.17 + 3.1, t * 0.17 - 1.7, 4) * 0.3 +
    terrainNoise.noise2(r * 0.9, t * 0.9) * 0.025;
  ((e += 0.32 * Math.exp(-((r - CABIN2.x) ** 2 + (t - CABIN2.z) ** 2) / 1.3)),
    (e += 0.18 * smoothstep2(-2.5, -6, r) * smoothstep2(-1, 3.5, t)));
  const i = smoothstep2(0.2, -3.9, t);
  e += i * i * 1.25;
  let s = 0;
  for (const f of PEAKS2) {
    const u = (r - f.x) / f.squash,
      d = t - f.z,
      p = (u * u + d * d) / (f.r * f.r);
    s = smoothMax(s, f.h * Math.exp(-p * 1.7), 0.55);
  }
  const n = terrainNoise.ridged2(r * 0.5 + 10.3, t * 0.5 + 4.1, 5),
    o = smoothstep2(0.6, 3.5, s);
  ((s *= 0.78 + 0.34 * n * (0.35 + 0.65 * o)),
    (s += terrainNoise.fbm2(r * 1.3 - 5, t * 1.3 + 2, 3) * 0.12 * o),
    (e = smoothMax(e, s + 0.15, 0.55)));
  const a = r + 1.62 + 0.18 * Math.sin(t * 2.1),
    l = 1 - smoothstep2(0.75, 1.55, Math.abs(a)),
    c = -1.5 + 0.08 * terrainNoise.noise2(r * 2.2, 3.3),
    h =
      2.18 * smoothstep2(c + 0.28, c - 0.2, t) * l +
      terrainNoise.noise2(r * 2.6, t * 2.6) * 0.06 * l;
  return ((e = smoothMax(e, h, 0.12)), e);
}
const riverQueryScratch = {};
export function terrainHeight2(r, t) {
  let e = baseHeight2(r, t);
  const i = Math.hypot(r - CABIN2.x, t - CABIN2.z);
  if (i < CABIN2.padRadius * 1.8) {
    const o = baseHeightCache.cabin;
    e = lerp2(
      e,
      o,
      1 - smoothstep2(CABIN2.padRadius * 0.7, CABIN2.padRadius * 1.8, i),
    );
  }
  const s = riverQuery2(r, t, riverQueryScratch);
  if (s) {
    const o = riverHalfWidth2(s.t),
      a = lerp2(0.07, 0.16, smoothstep2(0.1, 0.9, s.t)),
      l = s.y - a,
      c = smoothstep2(o * 0.45, o + 0.55, s.dist),
      h = l + (e - l) * (c * c * (0.35 + 0.65 * c)),
      f = 1 - smoothstep2(o + 0.45, o + 0.9, s.dist);
    e = lerp2(e, h, f);
  }
  const n = lakeEllipse2(r, t);
  if (n < 2.4) {
    const o =
      LAKE2.bottomY +
      (WATER_LEVELS.lakeLevel + 0.38 - LAKE2.bottomY) *
        Math.pow(clamp(n / 1.25, 0, 1), 2.1) +
      Math.max(0, n - 1.25) * 2.2;
    e = smoothMin(e, o, 0.18);
  }
  return e;
}
const baseHeightCache = {
  cabin: baseHeight2(CABIN2.x, CABIN2.z),
};
CABIN2.y = terrainHeight2(CABIN2.x, CABIN2.z);
export function terrainNormal2(
  r,
  t,
  e = {
    x: 0,
    y: 1,
    z: 0,
  },
) {
  const s = terrainHeight2(r - 0.04, t),
    n = terrainHeight2(r + 0.04, t),
    o = terrainHeight2(r, t - 0.04),
    a = terrainHeight2(r, t + 0.04);
  let l = s - n,
    c = 2 * 0.04,
    h = o - a;
  const f = Math.hypot(l, c, h);
  return ((e.x = l / f), (e.y = c / f), (e.z = h / f), e);
}
function lakeMask2(r, t, e = WATER_LEVELS.lakeLevel) {
  if (lakeEllipse2(r, t) > 1.5) return 0;
  const s = terrainHeight2(r, t);
  return smoothstep2(e + 0.02, e - 0.04, s);
}
function riverMask2(r, t) {
  const e = riverQuery2(r, t, riverQueryScratch);
  if (!e) return 0;
  const i = riverHalfWidth2(e.t);
  return 1 - smoothstep2(i * 0.8, i * 1.05, e.dist);
}
function isWater2(r, t, e = WATER_LEVELS.lakeLevel) {
  return lakeMask2(r, t, e) > 0.5 || riverMask2(r, t) > 0.5;
}
function insideBox2(r, t, e = 0) {
  return Math.abs(r) <= BOX.halfW - e && Math.abs(t) <= BOX.halfD - e;
}
export function suitability2(r, t, e = "grass") {
  if (!insideBox2(r, t, 0.05)) return 0;
  const i = terrainHeight2(r, t),
    n = 1 - terrainNormal2(r, t).y,
    o = waterDistance2(r, t),
    a = Math.hypot(r - CABIN2.x, t - CABIN2.z);
  if (o < 0.05) return 0;
  switch (e) {
    case "grass":
      return (
        smoothstep2(0.35, 0.12, n) *
        smoothstep2(2.6, 1.6, i) *
        smoothstep2(0.02, 0.14, o)
      );
    case "flower":
      return (
        smoothstep2(0.2, 0.06, n) *
        smoothstep2(1.2, 0.6, i) *
        smoothstep2(0.2, 0.5, o) *
        smoothstep2(0.6, 1, a)
      );
    case "tree":
      return (
        smoothstep2(0.3, 0.1, n) *
        smoothstep2(1.5, 0.8, i) *
        smoothstep2(0.35, 0.7, o) *
        smoothstep2(0.9, 1.4, a)
      );
    case "pine":
      return (
        smoothstep2(0.55, 0.2, n) *
        smoothstep2(0.5, 1, i) *
        smoothstep2(3.1, 2.3, i) *
        smoothstep2(0.3, 0.6, o) *
        smoothstep2(0.9, 1.4, a)
      );
    case "rock":
      return smoothstep2(0.15, 0.5, n) + smoothstep2(2.2, 3.2, i) * 0.6;
    default:
      return 1;
  }
}
export function waterDistance2(r, t) {
  let e = 1 / 0;
  const i = riverQuery2(r, t, riverQueryScratch);
  i && (e = Math.max(0, i.dist - riverHalfWidth2(i.t)));
  const s = lakeEllipse2(r, t),
    n = Math.max(0, s - 1.08) * Math.min(LAKE2.rx, LAKE2.rz);
  return ((e = Math.min(e, s < 1.08 ? 0 : n)), e);
}
function highestNear2(r, t, e = 1, i = 24) {
  let s = {
    x: r,
    z: t,
    y: terrainHeight2(r, t),
  };
  for (let n = 0; n < i; n++) {
    const o = (n / i) * Math.PI * 2 * 2.618,
      a = e * Math.sqrt((n + 0.5) / i),
      l = clamp(r + Math.cos(o) * a, -BOX.halfW + 0.1, BOX.halfW - 0.1),
      c = clamp(t + Math.sin(o) * a, -BOX.halfD + 0.1, BOX.halfD - 0.1),
      h = terrainHeight2(l, c);
    h > s.y &&
      (s = {
        x: l,
        z: c,
        y: h,
      });
  }
  return s;
}
export function bakeTerrainData2(r = 384, t = 256) {
  const e = new Float32Array(r * t * 4),
    i = {
      x: 0,
      y: 1,
      z: 0,
    };
  for (let s = 0; s < t; s++) {
    const n = TERRAIN_BOUNDS.minZ + ((s + 0.5) / t) * TERRAIN_BOUNDS.sizeZ;
    for (let o = 0; o < r; o++) {
      const a = TERRAIN_BOUNDS.minX + ((o + 0.5) / r) * TERRAIN_BOUNDS.sizeX,
        l = (s * r + o) * 4,
        c = terrainHeight2(a, n);
      ((e[l] = c),
        (e[l + 1] = riverMask2(a, n)),
        (e[l + 2] =
          smoothstep2(
            WATER_LEVELS.lakeLevel + 0.02,
            WATER_LEVELS.lakeLevel - 0.04,
            c,
          ) * (lakeEllipse2(a, n) < 1.5 ? 1 : 0)),
        terrainNormal2(a, n, i),
        (e[l + 3] = 1 - i.y));
    }
  }
  return {
    data: e,
    resX: r,
    resZ: t,
  };
}
export const terrainShapeModule = Object.freeze(
  Object.defineProperty(
    {
      __proto__: null,
      CABIN: CABIN2,
      LAKE: LAKE2,
      PEAKS: PEAKS2,
      RIVER_LENGTH: RIVER_LENGTH2,
      RIVER_PATH: RIVER_PATH2,
      RIVER_POINTS: RIVER_POINTS2,
      WATERFALL: WATERFALL2,
      bakeTerrainData: bakeTerrainData2,
      baseHeight: baseHeight2,
      highestNear: highestNear2,
      insideBox: insideBox2,
      isWater: isWater2,
      lakeEllipse: lakeEllipse2,
      lakeMask: lakeMask2,
      riverHalfWidth: riverHalfWidth2,
      riverMask: riverMask2,
      riverQuery: riverQuery2,
      suitability: suitability2,
      terrainHeight: terrainHeight2,
      terrainNormal: terrainNormal2,
      waterDistance: waterDistance2,
    },
    Symbol.toStringTag,
    {
      value: "Module",
    },
  ),
);
