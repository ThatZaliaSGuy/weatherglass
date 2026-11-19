/**
 * Footpath Bezier layout, river crossing point and baked terrain detail masks (banks, shore, hollows, bare ground).
 */
import * as THREE from "three";
import { TERRAIN_BOUNDS } from "../core/config.js";
import { clamp, smoothstep2 } from "../util/math.js";
import {
  CABIN2,
  RIVER_PATH2,
  lakeEllipse2,
  riverHalfWidth2,
} from "./terrainShape.js";
function sampleCubicBezier(r, t, e, i, s) {
  const n = [];
  for (let o = 0; o <= s; o++) {
    const a = o / s,
      l = 1 - a,
      c = l * l * l,
      h = 3 * l * l * a,
      f = 3 * l * a * a,
      u = a * a * a;
    n.push({
      x: c * r[0] + h * t[0] + f * e[0] + u * i[0],
      z: c * r[1] + h * t[1] + f * e[1] + u * i[1],
      t: a,
    });
  }
  return n;
}
function findRiverCrossing() {
  let t = RIVER_PATH2[0];
  for (const h of RIVER_PATH2)
    Math.abs(h.t - 0.42) < Math.abs(t.t - 0.42) && (t = h);
  const e = RIVER_PATH2.indexOf(t),
    i = RIVER_PATH2[Math.max(0, e - 2)],
    s = RIVER_PATH2[Math.min(RIVER_PATH2.length - 1, e + 2)],
    n = Math.hypot(s.x - i.x, s.z - i.z) || 1,
    o = (s.x - i.x) / n,
    a = (s.z - i.z) / n;
  let l = -a,
    c = o;
  return (
    (CABIN2.x - t.x) * l + (CABIN2.z - t.z) * c < 0 && ((l = -l), (c = -c)),
    {
      x: t.x,
      z: t.z,
      y: t.y,
      t: t.t,
      halfWidth: riverHalfWidth2(t.t),
      dirX: o,
      dirZ: a,
      px: l,
      pz: c,
    }
  );
}
export const RIVER_CROSSING = findRiverCrossing();
const PATH_CABIN_START = [CABIN2.x + 0.5, CABIN2.z + 0.22];
const PATH_CROSSING_NEAR = [
  RIVER_CROSSING.x + RIVER_CROSSING.px * (RIVER_CROSSING.halfWidth + 0.14),
  RIVER_CROSSING.z + RIVER_CROSSING.pz * (RIVER_CROSSING.halfWidth + 0.14),
];
const PATH_CROSSING_FAR = [
  RIVER_CROSSING.x - RIVER_CROSSING.px * (RIVER_CROSSING.halfWidth + 0.12),
  RIVER_CROSSING.z - RIVER_CROSSING.pz * (RIVER_CROSSING.halfWidth + 0.12),
];
export const FOOTPATHS = [
  {
    pts: sampleCubicBezier(
      PATH_CABIN_START,
      [-1.75, 2.3],
      [-0.95, 1.9],
      [0.02, 2.42],
      48,
    ),
    width: 0.2,
    taper: 0.6,
    strength: 1,
  },
  {
    pts: sampleCubicBezier(
      [CABIN2.x + 0.45, CABIN2.z - 0.35],
      [-2.1, 0.35],
      [PATH_CROSSING_NEAR[0] - 0.55, PATH_CROSSING_NEAR[1] + 0.35],
      PATH_CROSSING_NEAR,
      40,
    ),
    width: 0.13,
    taper: 0.8,
    strength: 0.7,
  },
  {
    pts: sampleCubicBezier(
      PATH_CROSSING_FAR,
      [
        PATH_CROSSING_FAR[0] - RIVER_CROSSING.px * 0.2,
        PATH_CROSSING_FAR[1] - RIVER_CROSSING.pz * 0.2,
      ],
      [
        PATH_CROSSING_FAR[0] - RIVER_CROSSING.px * 0.35 - 0.1,
        PATH_CROSSING_FAR[1] - RIVER_CROSSING.pz * 0.35,
      ],
      [
        PATH_CROSSING_FAR[0] - RIVER_CROSSING.px * 0.55 - 0.2,
        PATH_CROSSING_FAR[1] - RIVER_CROSSING.pz * 0.5,
      ],
      10,
    ),
    width: 0.11,
    taper: 0.3,
    strength: 0.5,
  },
];
const BANK_WIDTH = 0.55;
export class TerrainDetailMasks {
  constructor(t) {
    const e = (this.resX = t.resX),
      i = (this.resZ = t.resZ),
      s = e * i;
    ((this.cellX = TERRAIN_BOUNDS.sizeX / e),
      (this.cellZ = TERRAIN_BOUNDS.sizeZ / i),
      (this.bank = new Float32Array(s).fill(1e3)),
      (this.shore = new Float32Array(s)),
      (this.staticBare = new Float32Array(s)),
      (this.bare = new Float32Array(s)),
      (this.hollow = new Float32Array(s)),
      (this.data = new Uint8Array(s * 4)),
      this._bakeBanks(),
      this._bakeShore(),
      this._bakeHollows(t.data),
      this._bakeStaticBare(),
      this.bare.set(this.staticBare),
      (this.texture = new THREE.DataTexture(
        this.data,
        e,
        i,
        THREE.RGBAFormat,
        THREE.UnsignedByteType,
      )),
      (this.texture.magFilter = THREE.LinearFilter),
      (this.texture.minFilter = THREE.LinearFilter),
      (this.texture.generateMipmaps = !1),
      this._pack());
  }
  _x(t) {
    return TERRAIN_BOUNDS.minX + (t + 0.5) * this.cellX;
  }
  _z(t) {
    return TERRAIN_BOUNDS.minZ + (t + 0.5) * this.cellZ;
  }
  _rect(t, e, i, s, n) {
    const o = Math.max(0, Math.floor((t - TERRAIN_BOUNDS.minX) / this.cellX)),
      a = Math.min(
        this.resX - 1,
        Math.ceil((e - TERRAIN_BOUNDS.minX) / this.cellX),
      ),
      l = Math.max(0, Math.floor((i - TERRAIN_BOUNDS.minZ) / this.cellZ)),
      c = Math.min(
        this.resZ - 1,
        Math.ceil((s - TERRAIN_BOUNDS.minZ) / this.cellZ),
      );
    for (let h = l; h <= c; h++) {
      const f = this._z(h);
      for (let u = o; u <= a; u++) n(h * this.resX + u, this._x(u), f);
    }
  }
  _bakeBanks() {
    const t = RIVER_PATH2,
      e = BANK_WIDTH + 0.3;
    for (let i = 0; i < t.length - 1; i++) {
      const s = t[i],
        n = t[i + 1],
        o = n.x - s.x,
        a = n.z - s.z,
        l = o * o + a * a || 1e-9;
      this._rect(
        Math.min(s.x, n.x) - e,
        Math.max(s.x, n.x) + e,
        Math.min(s.z, n.z) - e,
        Math.max(s.z, n.z) + e,
        (c, h, f) => {
          let u = ((h - s.x) * o + (f - s.z) * a) / l;
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const d =
            Math.hypot(s.x + o * u - h, s.z + a * u - f) -
            riverHalfWidth2(s.t + (n.t - s.t) * u);
          d < this.bank[c] && (this.bank[c] = d);
        },
      );
    }
  }
  _bakeShore() {
    for (let t = 0; t < this.resZ; t++)
      for (let e = 0; e < this.resX; e++) {
        const i = lakeEllipse2(this._x(e), this._z(t));
        this.shore[t * this.resX + e] = 1 - smoothstep2(1, 1.45, i);
      }
  }
  _bakeHollows(t) {
    const e = this.resX,
      i = this.resZ,
      s = e * i,
      n = new Float32Array(s),
      o = new Float32Array(s),
      a = new Float32Array(s);
    for (let h = 0; h < s; h++) n[h] = t[h * 4];
    const l = 6,
      c = (h, f, u) => {
        for (let d = 0; d < i; d++)
          for (let p = 0; p < e; p++) {
            let v = 0,
              g = 0;
            for (let x = -l; x <= l; x++) {
              const m = u ? clamp(p + x, 0, e - 1) : p,
                w = u ? d : clamp(d + x, 0, i - 1);
              ((v += h[w * e + m]), g++);
            }
            f[d * e + p] = v / g;
          }
      };
    (c(n, o, !0), c(o, a, !1), c(a, o, !0), c(o, a, !1));
    for (let h = 0; h < s; h++) {
      const f = t[h * 4 + 1] > 0.3 || t[h * 4 + 2] > 0.3;
      this.hollow[h] = f ? 0 : smoothstep2(0, 0.045, a[h] - n[h]);
    }
  }
  _bakeStaticBare() {
    const t = this.staticBare,
      e = 1.15;
    this._rect(
      CABIN2.x - e,
      CABIN2.x + e,
      CABIN2.z - e,
      CABIN2.z + e,
      (i, s, n) => {
        const o = Math.hypot(s - CABIN2.x, n - CABIN2.z);
        t[i] = Math.max(t[i], 1 - smoothstep2(0.3, 0.95, o));
      },
    );
    for (const i of FOOTPATHS) {
      const s = i.pts;
      for (let n = 0; n < s.length - 1; n++) {
        const o = s[n],
          a = s[n + 1],
          l = i.width;
        this._rect(
          Math.min(o.x, a.x) - l,
          Math.max(o.x, a.x) + l,
          Math.min(o.z, a.z) - l,
          Math.max(o.z, a.z) + l,
          (c, h, f) => {
            const u = a.x - o.x,
              d = a.z - o.z;
            let p = ((h - o.x) * u + (f - o.z) * d) / (u * u + d * d || 1e-9);
            p = p < 0 ? 0 : p > 1 ? 1 : p;
            const v = o.t + (a.t - o.t) * p,
              g = l * (1 - (1 - i.taper) * v) * 0.5,
              x = Math.hypot(o.x + u * p - h, o.z + d * p - f),
              m =
                (1 - smoothstep2(g * 0.35, g * 1.6, x)) *
                i.strength *
                smoothstep2(0, 0.06, v) *
                (1 - smoothstep2(0.9, 1, v) * 0.7);
            m > t[c] && (t[c] = m);
          },
        );
      }
    }
  }
  stampRocks(t) {
    const e = this.staticBare;
    for (const i of t) {
      if (i.r < 0.06 || i.kind === "stepping") continue;
      const s = i.r * 1.35;
      this._rect(i.x - s, i.x + s, i.z - s, i.z + s, (n, o, a) => {
        const l = Math.hypot(o - i.x, a - i.z);
        e[n] = Math.max(e[n], (1 - smoothstep2(i.r * 0.7, s, l)) * 0.34);
      });
    }
    (this.bare.set(e), this._pack());
  }
  stampTrees(t) {
    const e = this.bare;
    e.set(this.staticBare);
    for (const i of t) {
      const s = Math.max(
          0.12,
          (i.radius || 0.4) *
            (i.kind === "bush" ? 0.5 : i.kind === "pine" ? 0.75 : 0.62),
        ),
        n = s * 1.6,
        o = i.kind === "bush" ? 0.55 : 0.9;
      this._rect(i.x - n, i.x + n, i.z - n, i.z + n, (a, l, c) => {
        const h = Math.hypot(l - i.x, c - i.z);
        e[a] = Math.max(e[a], (1 - smoothstep2(s * 0.25, n, h)) * o);
      });
    }
    this._pack();
  }
  bareAt(t, e) {
    const i = clamp(
        (t - TERRAIN_BOUNDS.minX) / this.cellX - 0.5,
        0,
        this.resX - 1.001,
      ),
      s = clamp(
        (e - TERRAIN_BOUNDS.minZ) / this.cellZ - 0.5,
        0,
        this.resZ - 1.001,
      ),
      n = Math.floor(i),
      o = Math.floor(s),
      a = i - n,
      l = s - o,
      c = this.resX,
      h = this.bare;
    return (
      (h[o * c + n] * (1 - a) + h[o * c + n + 1] * a) * (1 - l) +
      (h[(o + 1) * c + n] * (1 - a) + h[(o + 1) * c + n + 1] * a) * l
    );
  }
  _pack() {
    const t = this.data,
      e = this.resX * this.resZ;
    for (let i = 0; i < e; i++) {
      const s = 1 - smoothstep2(0, BANK_WIDTH, this.bank[i]);
      ((t[i * 4] = Math.round(s * 255)),
        (t[i * 4 + 1] = Math.round(this.shore[i] * 255)),
        (t[i * 4 + 2] = Math.round(clamp(this.bare[i], 0, 1) * 255)),
        (t[i * 4 + 3] = Math.round(this.hollow[i] * 255)));
    }
    this.texture && (this.texture.needsUpdate = !0);
  }
}
