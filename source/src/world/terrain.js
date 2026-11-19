/**
 * Float data-texture helpers and the baked terrain sampler with bilinear height/mask lookup and ray marching.
 */
import * as THREE from "three";
import { BOX, TERRAIN_BOUNDS } from "../core/config.js";
import { clamp } from "../util/math.js";
import { bakeTerrainData2, terrainShapeModule } from "./terrainShape.js";
let floatLinearSupported = !0;
export function detectFloatLinearSupport(r) {
  return (
    (floatLinearSupported = !!r.extensions.has("OES_texture_float_linear")),
    floatLinearSupported
  );
}
export function createFloatDataTexture(r, t, e, i = THREE.RGBAFormat) {
  let s;
  return (
    floatLinearSupported
      ? (s = new THREE.DataTexture(r, t, e, i, THREE.FloatType))
      : ((s = new THREE.DataTexture(
          new Uint16Array(r.length),
          t,
          e,
          i,
          THREE.HalfFloatType,
        )),
        (s.userData.src = r)),
    (s.magFilter = THREE.LinearFilter),
    (s.minFilter = THREE.LinearFilter),
    (s.wrapS = s.wrapT = THREE.ClampToEdgeWrapping),
    uploadFloatDataTexture(s),
    s
  );
}
export function uploadFloatDataTexture(r) {
  const t = r.userData.src;
  if (t) {
    const e = r.image.data,
      i = THREE.DataUtils.toHalfFloat;
    for (let s = 0; s < t.length; s++) e[s] = i(t[s]);
  }
  r.needsUpdate = !0;
}
export class TerrainSampler {
  constructor() {
    const t = bakeTerrainData2(384, 256);
    ((this.baked = t),
      (this.resX = t.resX),
      (this.resZ = t.resZ),
      (this.data = t.data),
      (this.texture = createFloatDataTexture(this.data, this.resX, this.resZ)),
      (this.shape = terrainShapeModule));
  }
  _s(t, e, i) {
    const s = clamp(
        ((e - TERRAIN_BOUNDS.minX) / TERRAIN_BOUNDS.sizeX) * this.resX - 0.5,
        0,
        this.resX - 1.001,
      ),
      n = clamp(
        ((i - TERRAIN_BOUNDS.minZ) / TERRAIN_BOUNDS.sizeZ) * this.resZ - 0.5,
        0,
        this.resZ - 1.001,
      ),
      o = Math.floor(s),
      a = Math.floor(n),
      l = s - o,
      c = n - a,
      h = this.resX,
      f = this.data,
      u = f[(a * h + o) * 4 + t],
      d = f[(a * h + o + 1) * 4 + t],
      p = f[((a + 1) * h + o) * 4 + t],
      v = f[((a + 1) * h + o + 1) * 4 + t];
    return (u * (1 - l) + d * l) * (1 - c) + (p * (1 - l) + v * l) * c;
  }
  height(t, e) {
    return this._s(0, t, e);
  }
  riverMask(t, e) {
    return this._s(1, t, e);
  }
  lakeMask(t, e) {
    return this._s(2, t, e);
  }
  slope(t, e) {
    return this._s(3, t, e);
  }
  normal(t, e, i = new THREE.Vector3()) {
    return i
      .set(
        this.height(t - 0.05, e) - this.height(t + 0.05, e),
        2 * 0.05,
        this.height(t, e - 0.05) - this.height(t, e + 0.05),
      )
      .normalize();
  }
  raycast(t, e = new THREE.Vector3(), i = 80) {
    const s = t.origin,
      n = t.direction;
    let o = 0,
      a = i;
    const l = (u, d, p, v) => {
      if (Math.abs(d) < 1e-8) return u >= p && u <= v;
      let g = (p - u) / d,
        x = (v - u) / d;
      return (
        g > x && ([g, x] = [x, g]),
        (o = Math.max(o, g)),
        (a = Math.min(a, x)),
        o <= a
      );
    };
    if (
      !l(s.x, n.x, -BOX.halfW, BOX.halfW) ||
      !l(s.z, n.z, -BOX.halfD, BOX.halfD) ||
      !l(s.y, n.y, BOX.bottomY, BOX.topY)
    )
      return null;
    const c = 0.04;
    let h = o,
      f = !0;
    for (let u = o; u <= a; u += c) {
      const d = s.x + n.x * u,
        p = s.y + n.y * u,
        v = s.z + n.z * u,
        g = p > this.height(d, v);
      if (!g) {
        if (u === o) return (e.set(d, p, v), e);
        let x = h,
          m = u;
        for (let w = 0; w < 10; w++) {
          const y = (x + m) * 0.5,
            _ = s.x + n.x * y,
            M = s.y + n.y * y,
            A = s.z + n.z * y;
          M > this.height(_, A) ? (x = y) : (m = y);
        }
        return e.set(s.x + n.x * m, s.y + n.y * m, s.z + n.z * m);
      }
      ((h = u), (f = g));
    }
    return null;
  }
}
