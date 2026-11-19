/**
 * CloudSystem: spawning, wind drift, merging, water cycle, charge/lightning strikes with fractal bolt paths, cloud shadow texture and grab/squeeze/condense input handlers.
 */
import * as THREE from "three";
import { BOX, CLOUD_LAYER, TERRAIN_BOUNDS } from "../core/config.js";
import { mulberry32 } from "../util/noise.js";
import {
  createFloatDataTexture,
  uploadFloatDataTexture,
} from "../world/terrain.js";
import { createCloudNoiseTexture } from "./cloudMaterial.js";
import {
  CLOUD_CEILING_Y,
  CloudBody,
  MAX_BODY_PUFFS,
  generateCloudPuffLayout,
} from "./cloudBody.js";
const clampStrikeCoord = (r, t, e) => (r < t ? t : r > e ? e : r);
function pickStrikeTarget(r, t, e, i, s) {
  const n = r.modules.vegetation?.trees;
  let o = null,
    a = -1 / 0;
  if (Array.isArray(n))
    for (const v of n) {
      if (!v) continue;
      const g = Math.hypot(v.x - t, v.z - e);
      if (g > i) continue;
      const m = (v.y ?? 0) + (v.height ?? 0.5) - g * 0.35 + s() * 0.35;
      m > a && ((a = m), (o = v));
    }
  const l = r.terrain.shape,
    c = l.highestNear(t, e, i * 0.85, 20);
  if (o) {
    const v = (o.y ?? 0) + (o.height ?? 0.5);
    if (v + 0.25 > c.y)
      return {
        point: new THREE.Vector3(o.x, v, o.z),
        kind: "tree",
        tree: o,
      };
  }
  const h = clampStrikeCoord(
      c.x + (s() - 0.5) * 0.3,
      -BOX.halfW + 0.2,
      BOX.halfW - 0.2,
    ),
    f = clampStrikeCoord(
      c.z + (s() - 0.5) * 0.3,
      -BOX.halfD + 0.2,
      BOX.halfD - 0.2,
    );
  let u = r.terrain.height(h, f),
    d = "ground";
  const p = r.world.lakeLevel;
  return (
    l.isWater(h, f, p) && u < p + 0.05 && ((u = Math.max(u, p)), (d = "water")),
    {
      point: new THREE.Vector3(h, u, f),
      kind: d,
      tree: null,
    }
  );
}
const boltPathDir = new THREE.Vector3();
const boltPathSide = new THREE.Vector3();
const boltPathUp = new THREE.Vector3();
const WORLD_UP2 = new THREE.Vector3(0, 1, 0);
function subdivideBoltPath(r, t, e, i, s) {
  let n = [r.clone(), t.clone()],
    o = i;
  for (let a = 0; a < e; a++) {
    const l = [n[0]];
    for (let c = 0; c < n.length - 1; c++) {
      const h = n[c],
        f = n[c + 1],
        u = h.distanceTo(f);
      (boltPathDir.subVectors(f, h).normalize(),
        boltPathSide.crossVectors(boltPathDir, WORLD_UP2),
        boltPathSide.lengthSq() < 1e-6 && boltPathSide.set(1, 0, 0),
        boltPathSide.normalize(),
        boltPathUp.crossVectors(boltPathDir, boltPathSide).normalize());
      const d = h.clone().lerp(f, 0.4 + s() * 0.2),
        p = (s() - 0.5) * 2 * o * u,
        v = (s() - 0.5) * 2 * o * u;
      (d.addScaledVector(boltPathSide, p).addScaledVector(boltPathUp, v),
        l.push(d, f));
    }
    ((n = l), (o *= 0.62));
  }
  return n;
}
function buildBoltPath(r, t, e, i, { levels: s = 5, branches: n = 3 } = {}) {
  const o = subdivideBoltPath(t, e, s, 0.32, i),
    a = [],
    l = o.length,
    c = Math.max(0, Math.round(n * (0.6 + i() * 0.8)));
  for (let h = 0; h < c; h++) {
    const f = Math.floor(l * (0.1 + i() * 0.55)),
      u = o[f],
      d = (u.y - e.y) * (0.25 + i() * 0.35),
      p = i() * Math.PI * 2,
      v = d * (0.5 + i() * 0.6),
      g = new THREE.Vector3(
        u.x + Math.cos(p) * v,
        u.y - d,
        u.z + Math.sin(p) * v,
      );
    ((g.x = clampStrikeCoord(g.x, -BOX.halfW + 0.1, BOX.halfW - 0.1)),
      (g.z = clampStrikeCoord(g.z, -BOX.halfD + 0.1, BOX.halfD - 0.1)),
      (g.y = Math.max(g.y, r.terrain.height(g.x, g.z) + 0.15)),
      a.push(subdivideBoltPath(u, g, Math.max(2, s - 2), 0.38, i)));
  }
  return {
    points: o,
    branches: a,
  };
}
const MAX_CLOUDS = 10;
const clampCloudParam = (r, t, e) => (r < t ? t : r > e ? e : r);
const saturateCloudSystem = (r) => (r < 0 ? 0 : r > 1 ? 1 : r);
const smoothstepCloudSystem = (r, t, e) => {
  const i = saturateCloudSystem((e - r) / (t - r));
  return i * i * (3 - 2 * i);
};
const dampTowards = (r, t, e, i) => r + (t - r) * (1 - Math.exp(-e * i));
const compareCameraDistanceDesc = (r, t) => t._camD - r._camD;
function wallWindFactor(r, t, e) {
  const i = t > 0 ? e - r : e + r;
  if (i > 1.8) return 1;
  const s = saturateCloudSystem(i / 1.8);
  return -0.15 + 1.15 * s * s;
}
export class CloudSystem {
  constructor(t) {
    ((this.ctx = t), (this.list = []), (this.rand = mulberry32(49421)));
    const e = t.quality;
    ((this.shared = {
      uNoise: {
        value: createCloudNoiseTexture(e.pick(48, 64, 64)),
      },
    }),
      (this.matOpts = {
        steps: e.pick(26, 38, 48),
        lightSteps: e.pick(4, 5, 6),
      }),
      (this.boxGeo = new THREE.BoxGeometry(1, 1, 1)),
      (this.group = new THREE.Group()),
      (this.group.name = "clouds"),
      t.scene.add(this.group),
      (this.grab = null),
      (this.condense = null),
      (this.hovered = null),
      (this.time = 0),
      (this._w = {
        x: 0,
        z: 0,
      }),
      (this._w2 = {
        x: 0,
        z: 0,
      }),
      (this._rel = {
        x: 0,
        z: 0,
        turb: 0,
      }),
      (this._p = new THREE.Vector3()),
      (this._q = new THREE.Vector3()),
      (this._anchor = new THREE.Vector3()),
      (this._m = new THREE.Matrix4()),
      (this._col = new THREE.Color()),
      (this._hitT = 1 / 0),
      (this._report = {
        cover: 0,
        storm: 0,
      }),
      this._initShadows(),
      this._initInput());
  }
  spawn({
    x: t = 0,
    z: e = 0,
    y: i = CLOUD_LAYER.defaultY,
    size: s = 1,
    water: n = 0.5,
    squeeze: o = 0,
    charge: a = 0,
    storm: l = 0,
    fadeIn: c = !1,
  } = {}) {
    this._enforceCap(1);
    const h = new CloudBody(this, {
      x: clampCloudParam(t, -BOX.halfW + 0.8, BOX.halfW - 0.8),
      z: clampCloudParam(e, -BOX.halfD + 0.8, BOX.halfD - 0.8),
      y: clampCloudParam(i, CLOUD_LAYER.minY, CLOUD_LAYER.maxY),
      size: clampCloudParam(s, 0.1, 2.4),
      water: clampCloudParam(n, 0, 1.5),
      squeeze: clampCloudParam(o, 0, 1),
      charge: clampCloudParam(a, 0, 1),
      storm: clampCloudParam(l, 0, 1),
      fadeIn: c,
    });
    return (
      this.list.push(h),
      h.stepBody(0, this.time, this._rel),
      h.syncRender(),
      this.ctx.events.emit("cloud:spawn", {
        cloud: h,
      }),
      h
    );
  }
  clear() {
    for (const t of this.list) t.dispose();
    ((this.list.length = 0),
      (this.grab = null),
      (this.condense = null),
      (this.hovered = null));
  }
  pick(t) {
    let e = null,
      i = 1 / 0;
    for (const s of this.list) {
      if (s.dissolving || s.fade < 0.2) continue;
      const n = s.raycast(t);
      n < i && ((i = n), (e = s));
    }
    return ((this._hitT = i), e);
  }
  strike(t = null, e = 1) {
    const i =
      t ||
      this.list.reduce(
        (d, p) => (!d || p.charge + p.storm > d.charge + d.storm ? p : d),
        null,
      );
    if (!i) return null;
    const { ctx: s, rand: n } = this,
      o = new THREE.Vector3(
        i.position.x + (n() - 0.5) * i.radius * 0.5,
        i.baseY + 0.08,
        i.position.z + (n() - 0.5) * i.radius * 0.4,
      ),
      a = pickStrikeTarget(s, o.x, o.z, Math.max(1.1, i.radius * 1.1), n),
      l = a.point,
      { points: c, branches: h } = buildBoltPath(s, o, l, n, {
        levels: s.quality.pick(4, 5, 5),
        branches: 3,
      }),
      f = clampCloudParam(e, 0.2, 1.5);
    s.events.emit("lightning", {
      start: o,
      end: l,
      points: c,
      strength: f,
      branches: h,
      cloudId: i.id,
      kind: a.kind,
    });
    const u = s.camera.position.distanceTo(l);
    return (
      s.events.emit("thunder", {
        delay: 0.12 + u * 0.025,
        strength: f,
      }),
      s.world.triggerFlash(1),
      s.cameraRig.shake(0.6),
      s.modules.vegetation?.shake?.(l.x, l.z, 0.8, 1),
      (i.glow = 2.6),
      i.glowPos.set(o.x, o.y + 0.25 * i.size, o.z),
      (i.charge = 0.04 + n() * 0.28),
      (i.compVel += 1.8),
      {
        start: o,
        end: l,
        points: c,
      }
    );
  }
  update(t, e) {
    this.time = e;
    const { ctx: i } = this,
      { world: s, wind: n } = i,
      o = this.list;
    if (t > 0) {
      this._interactions(t);
      for (let h = o.length - 1; h >= 0; h--) {
        const f = o[h];
        (this._physics(f, t, e),
          this._waterCycle(f, t, s),
          this._electrics(f, t),
          f.dissolving && f.fade <= 0 && this._remove(f));
      }
    }
    let a = 0,
      l = 0;
    for (const h of o) {
      const f = n.sample(h.position.x, h.position.z, this._w, 1);
      if (
        ((this._rel.x = clampCloudParam(f.x - h.velocity.x, -4, 4)),
        (this._rel.z = clampCloudParam(f.z - h.velocity.z, -4, 4)),
        (this._rel.turb = n.turbulenceAt(h.position.x, h.position.z)),
        h.stepBody(t, e, this._rel),
        (h.hover = dampTowards(
          h.hover,
          (this.hovered === h ? 0.65 : 0) + (h.grabbed ? 0.45 : 0),
          8,
          t || 1,
        )),
        h.syncRender(),
        h.rate > 0.02)
      ) {
        const u =
          h.src ||
          (h.src = {
            x: 0,
            y: 0,
            z: 0,
            radius: 1,
            rate: 0,
            cloudId: h.id,
          });
        ((u.x = h.position.x),
          (u.y = h.baseY),
          (u.z = h.position.z),
          (u.radius = h.radius * 0.72),
          (u.rate = h.rate),
          i.precip.sources.push(u));
      }
      ((a +=
        Math.PI *
        h.extent.x *
        h.extent.z *
        (0.55 + 0.45 * Math.min(1, h.water)) *
        h.fade),
        (l = Math.max(
          l,
          h.storm * smoothstepCloudSystem(0.25, 0.8, h.water) * h.fade,
        )));
    }
    const c = this._report;
    ((c.cover = saturateCloudSystem((a / (BOX.halfW * BOX.halfD * 4)) * 1.5)),
      (c.storm = saturateCloudSystem(
        l * 0.92 + Math.min(0.08, o.length * 0.004),
      )),
      s.reportClouds(c),
      this._sortAndSide(),
      this._syncShadows());
  }
  _physics(t, e, i) {
    const { ctx: s } = this,
      n = t.position,
      o = t.velocity;
    if (
      ((t.age += e),
      (t.fade = t.dissolving
        ? Math.max(0, t.fade - e * 0.7)
        : Math.min(1, t.fade + e * 1.6)),
      t.grabbed && this.grab?.cloud === t)
    ) {
      const v = this.grab.target;
      ((o.x += ((v.x - n.x) * 48 - o.x * 10.5) * e),
        (o.z += ((v.z - n.z) * 48 - o.z * 10.5) * e),
        (o.y += ((this.grab.y - n.y) * 30 - o.y * 9) * e));
    } else {
      const v = s.wind.sample(n.x, n.z, this._w2, 1),
        g = BOX.halfW - t.extent.x * 0.8,
        x = BOX.halfD - t.extent.z * 0.8,
        m = v.x * wallWindFactor(n.x, v.x, g),
        w = v.z * wallWindFactor(n.z, v.z, x),
        y = 1 / (0.55 + 0.45 * t.size),
        _ = 1 - Math.exp(-e * 0.75 * y);
      ((o.x += (m * 0.5 - o.x) * _), (o.z += (w * 0.5 - o.z) * _));
      const M =
        clampCloudParam(t.homeY, CLOUD_LAYER.minY, CLOUD_LAYER.maxY) -
        t.storm * 0.45 +
        Math.sin(i * 0.45 + t.phase) * 0.07;
      o.y += ((M - n.y) * 2.2 - o.y * 2) * e;
    }
    n.addScaledVector(o, e);
    const a = t.extent.x * 0.8,
      l = t.extent.z * 0.8,
      c = BOX.halfW - 0.06 - a,
      h = BOX.halfD - 0.06 - l;
    (c > 0
      ? (n.x > c
          ? ((o.x -= (n.x - c) * 60 * e),
            o.x > 0 && (o.x *= -0.45),
            this._bump(t, "x"))
          : n.x < -c &&
            ((o.x -= (n.x + c) * 60 * e),
            o.x < 0 && (o.x *= -0.45),
            this._bump(t, "x")),
        (n.x = clampCloudParam(n.x, -c - a * 0.45, c + a * 0.45)))
      : (o.x -= n.x * 20 * e),
      h > 0
        ? (n.z > h
            ? ((o.z -= (n.z - h) * 60 * e),
              o.z > 0 && (o.z *= -0.45),
              this._bump(t, "z"))
            : n.z < -h &&
              ((o.z -= (n.z + h) * 60 * e),
              o.z < 0 && (o.z *= -0.45),
              this._bump(t, "z")),
          (n.z = clampCloudParam(n.z, -h - l * 0.45, h + l * 0.45)))
        : (o.z -= n.z * 20 * e));
    const f = t.size,
      u = t.floorY() + 0.28 * f;
    n.y < u && ((n.y = dampTowards(n.y, u, 10, e)), o.y < 0 && (o.y *= 0.5));
    const d = t.restTop * f * (1 + 0.32 * t.storm),
      p = CLOUD_CEILING_Y - 0.1 - n.y;
    (p < d && ((o.y -= (d - p) * 8 * e), o.y > 0 && (o.y *= 0.6)),
      (t.vfit = dampTowards(
        t.vfit,
        clampCloudParam(p / Math.max(0.1, d), 0.45, 1),
        6,
        e,
      )));
  }
  _bump(t, e) {
    const i = Math.abs(e === "x" ? t.velocity.x : t.velocity.z);
    i > 0.9 &&
      t.age - (t._bumpT || 0) > 0.3 &&
      ((t._bumpT = t.age), (t.compVel += i * 0.6));
  }
  _interactions(t) {
    const e = this.list;
    for (let i = 0; i < e.length; i++) {
      const s = e[i];
      if (!(s.dissolving || s.fade < 0.5))
        for (let n = i + 1; n < e.length; n++) {
          const o = e[n];
          if (o.dissolving || o.fade < 0.5) continue;
          const a = o.position.x - s.position.x,
            l = o.position.z - s.position.z;
          if (
            Math.abs(o.position.y - s.position.y) >
            s.extent.y + o.extent.y + 0.6
          )
            continue;
          const c = Math.hypot(a, l) + 1e-5,
            h = s.radius,
            f = o.radius,
            u = (h + f) * 0.75;
          if (c >= u) continue;
          const d = a / c,
            p = l / c,
            v =
              (s.velocity.x - o.velocity.x) * d +
              (s.velocity.z - o.velocity.z) * p;
          if (
            ((s.grabbed || o.grabbed) && c < (h + f) * 0.6) ||
            (v > 2.4 && c < (h + f) * 0.62)
          ) {
            const y = s.grabbed ? s : o.grabbed ? o : s.size >= o.size ? s : o;
            this._merge(y, y === s ? o : s);
            return;
          }
          const x = s.size ** 3,
            m = o.size ** 3,
            w = ((u - c) / u) * 5.5 * t;
          if (!s.grabbed) {
            const y = o.grabbed ? 0.35 : m / (x + m);
            ((s.velocity.x -= d * w * y * 2), (s.velocity.z -= p * w * y * 2));
          }
          if (!o.grabbed) {
            const y = s.grabbed ? 0.35 : x / (x + m);
            ((o.velocity.x += d * w * y * 2), (o.velocity.z += p * w * y * 2));
          }
        }
    }
  }
  _merge(t, e) {
    const i = t.size ** 3,
      s = e.size ** 3,
      n = i + s,
      o = t.puffs.concat(e.puffs);
    (t.grabbed || t.position.lerp(e.position, s / n),
      t.velocity.multiplyScalar(i / n).addScaledVector(e.velocity, s / n),
      (t.size = Math.min(2.4, Math.cbrt(n))),
      (t.water = Math.min(1.5, t.water + e.water)),
      (t.charge = Math.max(t.charge, e.charge)),
      (t.storm = Math.max(t.storm, e.storm)),
      (t.stormTarget = Math.max(t.stormTarget, e.stormTarget)),
      t.water >= 1 &&
        t.size >= 1.4 &&
        (t.stormTarget = Math.max(
          t.stormTarget,
          0.55 + 0.45 * smoothstepCloudSystem(1, 1.45, t.water),
        )),
      (t.heldSqueeze = t.grabbed ? 0 : Math.max(t.heldSqueeze, e.heldSqueeze)));
    const a = clampCloudParam(
      Math.round((t.puffs.length + e.puffs.length) * 0.7),
      9,
      MAX_BODY_PUFFS,
    );
    (t.setLayout(
      generateCloudPuffLayout(this.rand, {
        elong: 1 + Math.max(0, t.size - 1.1) * 0.3,
        count: a,
      }),
      !1,
      o,
    ),
      (t.compVel += 2.4),
      this._remove(e),
      this.ctx.events.emit("cloud:merge", {
        cloud: t,
      }),
      this.ctx.audio?.play?.("merge", {
        volume: 0.7,
        pitch: clampCloudParam(1.25 - t.size * 0.2, 0.7, 1.2),
      }));
  }
  _remove(t) {
    const e = this.list.indexOf(t);
    (e >= 0 && this.list.splice(e, 1),
      this.grab?.cloud === t && (this.grab = null),
      this.condense?.cloud === t && (this.condense = null),
      this.hovered === t && (this.hovered = null),
      t.dispose());
  }
  _enforceCap(t) {
    let e = 0;
    for (const i of this.list) i.dissolving || e++;
    for (; e + t > MAX_CLOUDS;) {
      const i = this.list.find(
        (s) => !s.dissolving && !s.grabbed && this.condense?.cloud !== s,
      );
      if (!i) break;
      ((i.dissolving = !0), e--);
    }
  }
  _waterCycle(t, e, i) {
    const s = i.humidity,
      n = t.water;
    t.wheelHold > 0
      ? (t.wheelHold -= e)
      : (t.wheelSqueeze = Math.max(0, t.wheelSqueeze - e * 0.18));
    const o = Math.max(
      t.grabbed ? 0 : t.heldSqueeze,
      t.userSqueeze,
      t.wheelSqueeze,
    );
    t.squeeze = dampTowards(t.squeeze, o, o > t.squeeze ? 5 : 2.6, e);
    const a = 62;
    ((t.compVel +=
      ((t.squeeze - t.comp) * a - t.compVel * 2 * Math.sqrt(a) * 0.24) * e),
      (t.comp = clampCloudParam(t.comp + t.compVel * e, -0.5, 1.15)));
    const l = t.effSqueeze,
      c = smoothstepCloudSystem(0.02, 0.3, t.water),
      h = smoothstepCloudSystem(1.05, 1.5, t.water) * 0.5;
    let f =
      c *
      (Math.pow(l, 1.25) * (0.5 + 1.1 * Math.min(t.water, 1.2)) +
        h +
        t.storm * (0.45 + 0.8 * Math.min(t.water, 1.2)));
    ((f = t.dissolving ? 0 : Math.min(2.2, f * t.fade)),
      (t.rate = dampTowards(t.rate, f, f > t.rate ? 3 : 1.6, e)));
    const u = t.heldSqueeze > 0 && !t.grabbed && t.userSqueeze === 0;
    ((t.water -= t.rate * e * (u ? 0.006 : 0.03) * (1 - 0.6 * t.storm)),
      s > 0.58 && (t.water += (s - 0.58) * e * 0.06 * (0.6 + 0.4 * t.size)),
      (t.water += t.storm * s * e * 0.022));
    const d = saturateCloudSystem((0.5 - s) / 0.25);
    if (d > 0) {
      const p = smoothstepCloudSystem(12, 26, i.seaLevelTemp),
        v = i.day * (1 - 0.6 * i.cloudCover);
      t.water -=
        e * 0.03 * d * (0.35 + p) * v * (1.3 - Math.min(t.size, 1.2) * 0.6);
    }
    ((t.water = clampCloudParam(t.water, 0, 1.5)),
      (t.size = clampCloudParam(t.size + (t.water - n) * 0.28, 0.05, 2.4)),
      t.water < 0.03 &&
        !t.grabbed &&
        !t.dissolving &&
        this.condense?.cloud !== t &&
        ((t.size -= e * 0.12), t.size < 0.18 && (t.dissolving = !0)),
      t.water < 0.45
        ? (t.stormTarget = Math.max(0, t.stormTarget - e * 0.08))
        : t.storm > 0.5 &&
          (t.stormTarget = Math.max(0, t.stormTarget - e * 0.0035)),
      (t.storm = dampTowards(t.storm, t.stormTarget, 0.35, e)),
      (t.outflowT = (t.outflowT || 0) - e),
      t.rate > 0.7 &&
        t.outflowT <= 0 &&
        ((t.outflowT = 0.3),
        this.ctx.wind.addRadial(
          t.position.x,
          t.position.z,
          0.14 * t.rate,
          Math.max(0.8, t.radius * 0.9),
        )),
      (t.sqT = (t.sqT || 0) - e),
      t.squeeze > (t.sqLast ?? 0) + 0.06 && t.sqT <= 0 && t.squeeze > 0.08
        ? ((t.sqT = 0.28),
          (t.sqLast = t.squeeze),
          this.ctx.events.emit("cloud:squeeze", {
            cloud: t,
            amount: t.squeeze,
          }),
          this.ctx.audio?.play?.("squish", {
            volume: 0.25 + 0.5 * t.squeeze,
            pitch: 1.15 - 0.4 * t.squeeze,
          }))
        : t.squeeze < (t.sqLast ?? 0) - 0.1 && (t.sqLast = t.squeeze));
  }
  _electrics(t, e) {
    const i = this.rand;
    if (
      ((t.charge +=
        e *
        0.07 *
        t.storm *
        smoothstepCloudSystem(0.35, 0.9, t.water) *
        (0.6 + i() * 0.8)),
      !t.grabbed &&
        t.storm < 0.1 &&
        (t.charge = Math.max(0, t.charge - e * 0.035)),
      t.charge > 0.33 && !t.dissolving && ((t.crackleT -= e), t.crackleT <= 0))
    ) {
      ((t.crackleT = (0.05 + i() * 0.45) / (0.25 + t.charge * 1.6)),
        (t.glow = Math.max(
          t.glow,
          (0.3 + i() * 0.7) * t.charge * (t.grabbed ? 1.2 : 0.8),
        )));
      const s = t.puffs[Math.floor(i() * t.puffs.length)];
      (s &&
        t.glowPos.set(
          s.pos.x + (i() - 0.5) * s.rCur,
          s.pos.y - i() * s.rCur * 0.5,
          s.pos.z + (i() - 0.5) * s.rCur,
        ),
        t.grabbed &&
          this.ctx.audio?.play?.("zap", {
            volume: 0.12 + 0.35 * t.charge,
            pitch: 0.8 + i() * 0.6,
          }));
    }
    ((t.glow *= Math.exp(-e * 13)),
      t.charge >= 1 &&
        !t.dissolving &&
        t.water > 0.05 &&
        this.strike(t, 0.8 + 0.3 * Math.min(1, t.storm + t.water * 0.3)));
  }
  _sortAndSide() {
    const t = this.ctx.camera.position,
      e = this.list;
    for (const s of e) {
      const n = s.mesh;
      s._camD = n.position.distanceToSquared(t);
      const a =
        t.x > s.bmin.x - 0.4 &&
        t.x < s.bmax.x + 0.4 &&
        t.y > s.bmin.y - 0.4 &&
        t.y < s.bmax.y + 0.4 &&
        t.z > s.bmin.z - 0.4 &&
        t.z < s.bmax.z + 0.4
          ? THREE.BackSide
          : THREE.FrontSide;
      s.material.side !== a &&
        ((s.material.side = a), (s.material.needsUpdate = !0));
    }
    const i = this._order || (this._order = []);
    i.length = 0;
    for (const s of e) i.push(s);
    i.sort(compareCameraDistanceDesc);
    for (let s = 0; s < i.length; s++) i[s].mesh.renderOrder = 10 + s * 0.01;
  }
  _initShadows() {
    ((this._shW = 120),
      (this._shH = 80),
      (this._shData = new Float32Array(9600)),
      (this._shTmp = new Float32Array(9600)));
    const i = createFloatDataTexture(this._shData, 120, 80, THREE.RedFormat);
    ((this.shadowTexture = i), (this.ctx.uniforms.uCloudShadowTex.value = i));
  }
  _syncShadows() {
    if (this.list.length) this._shEmpty = !1;
    else {
      if (this._shEmpty) return;
      this._shEmpty = !0;
    }
    const t = this._shW,
      e = this._shH,
      i = this._shTmp,
      s = this._shData;
    i.fill(0);
    const n = t / TERRAIN_BOUNDS.sizeX,
      o = e / TERRAIN_BOUNDS.sizeZ;
    let a = 0,
      l = 0;
    for (const c of this.list) {
      const h = c.material.uniforms.uLook.value.x,
        f =
          Math.min(1.6, 0.55 + h * 0.6 + c.storm * 0.8) *
          c.fade *
          (c.dissolving ? c.fade : 1);
      if (f <= 0.01) continue;
      const u = c.puffs.length + c.stormPuffs.length;
      for (let d = 0; d < u; d++) {
        const p =
          d < c.puffs.length ? c.puffs[d] : c.stormPuffs[d - c.puffs.length];
        if (p.rCur < 0.03) continue;
        const v = p.rCur * 1.15,
          g = (p.pos.x - TERRAIN_BOUNDS.minX) * n,
          x = (p.pos.z - TERRAIN_BOUNDS.minZ) * o,
          m = Math.max(0, Math.floor(g - v * n)),
          w = Math.min(t - 1, Math.ceil(g + v * n)),
          y = Math.max(0, Math.floor(x - v * o)),
          _ = Math.min(e - 1, Math.ceil(x + v * o)),
          M = 1.35 * f * 2 * p.rCur;
        for (let A = y; A <= _; A++) {
          const b = (A + 0.5 - x) / (v * o);
          for (let S = m; S <= w; S++) {
            const E = (S + 0.5 - g) / (v * n),
              T = 1 - E * E - b * b;
            T > 0 && (i[A * t + S] += M * T * Math.sqrt(T));
          }
        }
        ((a += p.pos.y * p.rCur), (l += p.rCur));
      }
    }
    for (let c = 0; c < e; c++) {
      const h = c * t;
      for (let f = 0; f < t; f++)
        s[h + f] =
          (i[h + Math.max(0, f - 1)] +
            2 * i[h + f] +
            i[h + Math.min(t - 1, f + 1)]) *
          0.25;
    }
    for (let c = 0; c < e; c++) {
      const h = Math.max(0, c - 1) * t,
        f = c * t,
        u = Math.min(e - 1, c + 1) * t;
      for (let d = 0; d < t; d++)
        i[f + d] = (s[h + d] + 2 * s[f + d] + s[u + d]) * 0.25;
    }
    (s.set(i),
      uploadFloatDataTexture(this.shadowTexture),
      l > 0 && (this.ctx.uniforms.uCloudLayerY.value = a / l));
  }
  _initInput() {
    const { input: t } = this.ctx;
    (t.addHandler({
      name: "clouds",
      priority: 40,
      tools: ["hand"],
      cursor: "grab",
      activeCursor: "grabbing",
      hitTest: (e) => {
        const i = this.pick(e.ray);
        return i
          ? {
              distance: this._hitT,
              cloud: i,
            }
          : null;
      },
      onDown: (e, i) => this._grabStart(e.cloud, i),
      onFrame: (e, i) => this._grabFrame(e, i),
      onUp: () => this._grabEnd(),
      onHover: (e) => {
        this.hovered = e ? e.cloud : null;
      },
      onWheel: (e, i, s) => {
        const n = e?.cloud;
        return !n || !this.list.includes(n)
          ? !1
          : ((n.wheelSqueeze = clampCloudParam(
              n.wheelSqueeze + s * 0.0016,
              0,
              1,
            )),
            (n.wheelHold = 2.2),
            !0);
      },
    }),
      t.addHandler({
        name: "clouds-condense",
        priority: 40,
        tools: ["cloud"],
        cursor: "crosshair",
        activeCursor: "crosshair",
        hitTest: () => ({
          distance: 1e6,
        }),
        onDown: (e, i) => this._condenseStart(i),
        onFrame: (e, i) => this._condenseFrame(e, i),
        onUp: () => {
          this.condense = null;
        },
      }));
  }
  _planePoint(t, e, i) {
    const { input: s } = this.ctx,
      n = s.pointer.ray.direction;
    let o = Math.abs(n.y) > 0.1 ? s.rayToPlaneY(t, e) : null;
    return (
      o &&
        (Math.abs(o.x) > BOX.halfW + 4 || Math.abs(o.z) > BOX.halfD + 4) &&
        (o = null),
      !o && ((o = s.rayToCameraPlane(i || this._anchor.set(0, t, 0), e)), !o)
        ? null
        : ((e.y = t), e)
    );
  }
  _grabStart(t, e) {
    if (!t || t.dissolving || !this.list.includes(t)) return !1;
    const i = (this.grab = {
      cloud: t,
      y: t.position.y,
      off: new THREE.Vector3(),
      target: t.position.clone(),
      last: t.position.clone(),
      vel: new THREE.Vector3(),
      prevVel: new THREE.Vector3(),
      shake: 0,
    });
    return (
      this._planePoint(i.y, this._p, t.position) &&
        (i.off.set(this._p.x - t.position.x, 0, this._p.z - t.position.z),
        i.off.clampLength(0, t.radius * 0.8)),
      (t.grabbed = !0),
      (t.userSqueeze = Math.max(t.userSqueeze, t.heldSqueeze * 0.7)),
      (t.heldSqueeze = 0),
      (t.compVel -= 0.8),
      this.ctx.events.emit("cloud:grab", {
        cloud: t,
      }),
      this.ctx.audio?.play?.("grab", {
        volume: 0.55,
        pitch: clampCloudParam(1.3 - t.size * 0.25, 0.7, 1.3),
      }),
      !0
    );
  }
  _grabFrame(t, e) {
    const i = this.grab;
    if (!i || !this.list.includes(i.cloud)) {
      this.grab = null;
      return;
    }
    const s = i.cloud;
    if (this._planePoint(i.y, this._p, s.position)) {
      const o = Math.max(0.3, BOX.halfW - 0.1 - s.extent.x * 0.7),
        a = Math.max(0.3, BOX.halfD - 0.1 - s.extent.z * 0.7);
      i.target.set(
        clampCloudParam(this._p.x - i.off.x, -o, o),
        i.y,
        clampCloudParam(this._p.z - i.off.z, -a, a),
      );
    }
    if (e > 0) {
      (this._q.subVectors(i.target, i.last).divideScalar(e),
        i.vel.lerp(this._q, 1 - Math.exp(-e * 14)));
      const o = this._q.subVectors(i.vel, i.prevVel).length() / e;
      ((i.shake = dampTowards(i.shake, o, 5, e)),
        i.prevVel.copy(i.vel),
        i.last.copy(i.target));
    }
    t.stillTime > 0.2
      ? (s.userSqueeze = Math.min(
          1,
          s.userSqueeze + e * 0.55 * (1 - s.userSqueeze * 0.35),
        ))
      : (s.userSqueeze = Math.max(0, s.userSqueeze - e * 0.6));
    const n = smoothstepCloudSystem(9, 36, i.shake);
    n > 0 && (s.charge = Math.min(1.02, s.charge + e * n * 0.8));
  }
  _grabEnd() {
    const t = this.grab;
    if (!t) return;
    this.grab = null;
    const e = t.cloud;
    ((e.grabbed = !1), e.velocity.set(t.vel.x, 0, t.vel.z).clampLength(0, 7));
    const i = e.squeeze;
    if (((e.userSqueeze = 0), !this.list.includes(e))) return;
    this.ctx.events.emit("cloud:release", {
      cloud: e,
    });
    const s = Math.hypot(t.vel.x, t.vel.z);
    this.ctx.audio?.play?.("release", {
      volume: clampCloudParam(0.3 + s * 0.08 + i * 0.3, 0, 1),
      pitch: clampCloudParam(1.2 - e.size * 0.2, 0.7, 1.3),
    });
  }
  _condenseStart(t) {
    const { rand: e } = this,
      i = this.pick(t.ray);
    let s = i && i.size < 2.2 ? i : null;
    if (!s) {
      const o = this._planePoint(CLOUD_LAYER.defaultY, this._p);
      if (!o) return !1;
      const a = BOX.halfW - 1,
        l = BOX.halfD - 0.9;
      ((s = this.spawn({
        x: clampCloudParam(o.x, -a, a),
        z: clampCloudParam(o.z, -l, l),
        y: CLOUD_LAYER.defaultY + (e() - 0.5) * 0.4,
        size: 0.22,
        water: 0.12,
        fadeIn: !0,
      })),
        this.ctx.audio?.play?.("pop", {
          volume: 0.5,
          pitch: 1 + e() * 0.2,
        }));
    }
    const n = new THREE.Vector3();
    return (
      this._planePoint(s.position.y, n, s.position) || n.copy(s.position),
      (this.condense = {
        cloud: s,
        last: n,
      }),
      !0
    );
  }
  _condenseFrame(t, e) {
    const i = this.condense;
    if (!i || !this.list.includes(i.cloud)) {
      this.condense = null;
      return;
    }
    const s = i.cloud,
      n = this.ctx.world.humidity;
    (s.size < 1.8 &&
      (s.size = Math.min(
        1.8,
        s.size + e * (0.18 + 0.5 * n) * (1.2 - s.size / 1.9),
      )),
      (s.water = Math.min(1.5, s.water + e * (0.04 + 0.1 * n))));
    const o = this._planePoint(s.position.y, this._p, s.position);
    if (!o) return;
    ((o.x = clampCloudParam(o.x, -BOX.halfW + 0.5, BOX.halfW - 0.5)),
      (o.z = clampCloudParam(o.z, -BOX.halfD + 0.5, BOX.halfD - 0.5)));
    const a = Math.max(0.32, s.size * 0.4);
    if (o.distanceTo(i.last) > a) {
      this._q.subVectors(o, i.last).setLength(a).add(i.last);
      const l = Math.max(0.2, s.size * (0.32 + this.rand() * 0.12));
      s.addPuffAt(
        this._q.x,
        s.position.y + (this.rand() - 0.35) * 0.12 * s.size,
        this._q.z,
        l,
      )
        ? (i.last.copy(this._q),
          (s.size = Math.min(2.2, s.size + 0.03)),
          this.ctx.audio?.play?.("pop", {
            volume: 0.18,
            pitch: 1.2 + this.rand() * 0.3,
          }))
        : i.last.copy(o);
    }
  }
}
