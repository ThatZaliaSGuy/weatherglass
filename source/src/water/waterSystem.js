/**
 * Top-level water controller tying together lake, river, ripples, reflection, fish, particles, ice/flow state, rain and pointer interaction.
 */
import * as THREE from "three";
import { BOX } from "../core/config.js";
import { clamp, damp, smoothstep2 } from "../util/math.js";
import {
  RIVER_PATH2,
  riverHalfWidth2,
  riverQuery2,
} from "../world/terrainShape.js";
import {
  MAX_WATER_LEVEL,
  RIPPLE_BOX,
  createWaterRandom,
  createWaterShadowBinder,
  createWaterUniforms,
} from "./waterCommon.js";
import { WaterRippleSim } from "./waterRipples.js";
import { LakeSurface } from "./lakeSurface.js";
import { WaterReflection } from "./waterReflection.js";
import { RiverWaterfall } from "./riverWaterfall.js";
import { WaterParticles } from "./waterParticles.js";
import { FishSchool } from "./fishSchool.js";
import { LilyPads } from "./lilyPads.js";
const terrainHitPoint = new THREE.Vector3();
const riverQuery3 = {};
export class WaterSystem {
  constructor(t) {
    this.ctx = t;
    const { world: e, scene: i, events: s } = t;
    ((this.level = e.lakeLevel),
      (this.ice = 0),
      (this.flow = 1),
      (this.turbid = 0),
      (this.iceTemp = e.seaLevelTemp),
      (this.riverFreeze = 0),
      (this.fallFrozen = 0),
      (this.impactIndex = 0),
      (this._rainAcc = 0),
      (this._rand = createWaterRandom(7031)),
      (this.u = createWaterUniforms()),
      (this._bindShadow = createWaterShadowBinder(t, this.u)),
      (this.group = new THREE.Group()),
      (this.group.name = "water"),
      i.add(this.group),
      (this.ripples = new WaterRippleSim(t, this.u)),
      (this.lake = new LakeSurface(t, this.u, this.group)),
      (this.river = new RiverWaterfall(t, this.u, this.group)),
      (this.fish = new FishSchool(t, this.u, this.group, this)),
      (this.particles = new WaterParticles(t, this.u, this.group, this)),
      (this.flora = new LilyPads(t, this.u, this.group)),
      (this.lake.lakeAdd.onBeforeRender = this._bindShadow),
      (this.river.ribbon.onBeforeRender = this._bindShadow),
      (this.reflection =
        t.quality.tier > 0
          ? new WaterReflection(
              t,
              this.u,
              () => this._ownMeshes(),
              this._mirrorBounds(),
            )
          : null),
      this._installInput(),
      s.on("scenario", () => this._onScenario()),
      s.on("splash", (n) => {
        !n ||
          n.source === "water" ||
          this._disturb(n.x, n.z, n.strength ?? 0.6, !1);
      }),
      s.on("lightning", (n) => {
        const o = n?.end;
        !o ||
          !this.isLakeWater(o.x, o.z) ||
          this.poke(o.x, o.z, 1.6 * (n.strength ?? 1));
      }));
  }
  _mirrorBounds() {
    const t = {
      minX: RIPPLE_BOX.minX,
      maxX: RIPPLE_BOX.maxX,
      minZ: RIPPLE_BOX.minZ,
      maxZ: RIPPLE_BOX.maxZ,
    };
    for (const e of RIVER_PATH2) {
      if (e.y > MAX_WATER_LEVEL + 0.7) continue;
      const i = riverHalfWidth2(e.t) * 2 + 0.05;
      ((t.minX = Math.min(t.minX, e.x - i)),
        (t.maxX = Math.max(t.maxX, e.x + i)),
        (t.minZ = Math.min(t.minZ, e.z - i)),
        (t.maxZ = Math.max(t.maxZ, e.z + i)));
    }
    return t;
  }
  lakeDepth(t, e) {
    return t < RIPPLE_BOX.minX ||
      t > RIPPLE_BOX.maxX ||
      e < RIPPLE_BOX.minZ ||
      e > RIPPLE_BOX.maxZ
      ? -1
      : this.level - this.ctx.terrain.height(t, e);
  }
  isLakeWater(t, e, i = 0.006) {
    return this.lakeDepth(t, e) > i;
  }
  iceAt(t, e) {
    if (this.ice <= 0.001) return 0;
    const i = Math.max(0, this.lakeDepth(t, e)),
      s = this.ice * 1.4 - Math.min(1, i / 0.9) * 0.82 - 0.18 + 0.08;
    return smoothstep2(0, 0.05, s);
  }
  poke(t, e, i = 1) {
    return this._disturb(t, e, i, !0);
  }
  ripple(t, e, i = 0.04, s = 1) {
    const n = clamp(s, 0, 3);
    if (n <= 0) return !1;
    const o = clamp(i, 0.012, 0.3);
    return this.isLakeWater(t, e)
      ? this.iceAt(t, e) > 0.5
        ? !1
        : (this.ripples.add(t, e, o, -2.4 * n), !0)
      : this.riverFreeze < 0.8 &&
          riverQuery2(t, e, riverQuery3) &&
          riverQuery3.dist < riverHalfWidth2(riverQuery3.t) * 1.6
        ? (this._impact(t, e, Math.min(1.2, 0.35 * n)), !0)
        : !1;
  }
  _disturb(t, e, i, s) {
    const n = clamp(i, 0.05, 3),
      o = s ? this.ctx.audio : null,
      a = clamp(t / BOX.halfW, -1, 1);
    let l = null;
    return (
      this.isLakeWater(t, e)
        ? ((l = this.level),
          this.iceAt(t, e) > 0.5
            ? (this._impact(t, e, n),
              this.ctx.fields.snowAt(t, e) > 0.05 &&
                this.particles.puff(t, l, e, n),
              o?.play?.("tink", {
                volume: 0.35 + 0.3 * n,
                pitch: 0.7 + this._rand() * 0.3,
                pan: a,
              }),
              this.fish.scare(t, e, 0.4 * n))
            : (this.ripples.add(t, e, 0.1 + 0.05 * n, -7 * n),
              this.ripples.add(t, e, 0.035, 4 * n),
              this.particles.burst(t, l, e, n),
              this.fish.scare(t, e, n),
              o?.play?.("splash", {
                volume: 0.3 + 0.4 * Math.min(1.5, n),
                pitch: 0.85 + this._rand() * 0.3,
                pan: a,
              })))
        : riverQuery2(t, e, riverQuery3) &&
          riverQuery3.dist < riverHalfWidth2(riverQuery3.t) * 2 &&
          ((l = riverQuery3.y),
          this._impact(t, e, n),
          this.riverFreeze < 0.8 && this.particles.burst(t, l, e, n * 0.6),
          o?.play?.("splash", {
            volume: 0.25 + 0.3 * n,
            pitch: 1 + this._rand() * 0.3,
            pan: a,
          })),
      l === null
        ? !1
        : (s &&
            this.ctx.events.emit("splash", {
              x: t,
              y: l,
              z: e,
              strength: n,
              source: "water",
            }),
          !0)
    );
  }
  _impact(t, e, i) {
    (this.u.uImpacts.value[this.impactIndex].set(t, e, this.ctx.time, i),
      (this.impactIndex = (this.impactIndex + 1) % 4));
  }
  _rayLake(t, e) {
    const i = t.direction,
      s = t.origin;
    if (i.y > -1e-4) return null;
    const n = (this.level - s.y) / i.y;
    if (
      n < 0 ||
      (e.copy(s).addScaledVector(i, n),
      Math.abs(e.x) > BOX.halfW || e.z > BOX.halfD || e.z < -BOX.halfD) ||
      !this.isLakeWater(e.x, e.z, 0.004)
    )
      return null;
    const o = this.ctx.terrain.raycast(t, terrainHitPoint, n + 0.5);
    return o && o.distanceTo(s) < n - 0.08 ? null : n;
  }
  _rayRiver(t, e) {
    if (this.riverFreeze > 0.95) return null;
    const i = this.ctx.terrain.raycast(t, e);
    return !i ||
      this.isLakeWater(i.x, i.z) ||
      !riverQuery2(i.x, i.z, riverQuery3) ||
      riverQuery3.dist > riverHalfWidth2(riverQuery3.t) * 1.6
      ? null
      : ((i.y = riverQuery3.y), i.distanceTo(t.origin));
  }
  _installInput() {
    const { input: t } = this.ctx,
      e = new THREE.Vector3(),
      i = new THREE.Vector3(),
      s = new THREE.Vector3();
    let n = 0,
      o = null;
    t.addHandler({
      name: "water",
      priority: 20,
      tools: ["hand"],
      cursor: "pointer",
      activeCursor: "pointer",
      hitTest: (a) => {
        let l = this._rayLake(a.ray, e);
        return l !== null
          ? {
              distance: l,
              x: e.x,
              z: e.z,
              river: !1,
            }
          : ((l = this._rayRiver(a.ray, e)),
            l !== null
              ? {
                  distance: l,
                  x: e.x,
                  z: e.z,
                  river: !0,
                }
              : null);
      },
      onDown: (a) => (
        (o = a.river ? "river" : "lake"),
        i.set(a.x, this.level, a.z),
        (n = 0),
        this.poke(a.x, a.z, a.river ? 0.7 : 1),
        !0
      ),
      onMove: (a) => {
        if (
          !(o === "river"
            ? this._rayRiver(a.ray, s) !== null
            : this._rayLake(a.ray, s) !== null)
        )
          return;
        const c = s.x - i.x,
          h = s.z - i.z,
          f = Math.hypot(c, h);
        if (f < (o === "river" ? 0.08 : 0.02)) return;
        n = 0;
        const u = Math.min(1, f * 6),
          d = clamp(s.x / BOX.halfW, -1, 1);
        if (o === "river")
          (this._impact(s.x, s.z, 0.5),
            this.particles.wake(s.x, s.y, s.z, c, h, u * 0.7));
        else {
          const p = Math.min(10, Math.ceil(f / 0.035));
          for (let v = 1; v <= p; v++) {
            const g = i.x + (c * v) / p,
              x = i.z + (h * v) / p;
            this.iceAt(g, x) < 0.5 &&
              this.ripples.add(g, x, 0.055, -1.4 - 2.2 * u);
          }
          (this.particles.wake(s.x, this.level, s.z, c, h, u),
            this.fish.scare(s.x, s.z, 0.35 * u));
        }
        (u > 0.6 &&
          this._rand() < 0.25 &&
          this.ctx.audio?.play?.("drip", {
            volume: 0.2 * u,
            pitch: 0.9 + this._rand() * 0.4,
            pan: d,
          }),
          i.copy(s));
      },
      onFrame: (a, l) => {
        ((n += l),
          o === "lake" &&
            n > 0.35 &&
            this.iceAt(i.x, i.z) < 0.5 &&
            ((n = 0.05), this.ripples.add(i.x, i.z, 0.07, -2.2)));
      },
      onUp: () => {
        (o === "lake" &&
          this.iceAt(i.x, i.z) < 0.5 &&
          this.particles.drips(i.x, this.level, i.z),
          (o = null));
      },
    });
  }
  _onScenario() {
    const { world: t, fields: e } = this.ctx;
    ((this.level = t.lakeLevel),
      (this.iceTemp = t.seaLevelTemp),
      e.lakeFrozen > this.ice + 0.01
        ? (this.ice = e.lakeFrozen)
        : t.temperatureAt(this.level) > 1 && (this.ice = 0),
      (e.lakeFrozen = this.ice));
    const i = t.seaLevelTemp - t.temperatureAt(1);
    ((this.fallFrozen = smoothstep2(-2, -7.5, this.iceTemp - i * 1.5)),
      (this.river.frost = this.fallFrozen));
  }
  update(t) {
    const { world: e, fields: i } = this.ctx;
    ((this.level = e.lakeLevel),
      i.lakeFrozen > this.ice + 0.02 && (this.ice = i.lakeFrozen));
    const s = e.temperatureAt(this.level);
    if (s < 0)
      this.ice = Math.min(1, this.ice + t * 0.045 * clamp(-s / 6, 0.12, 2));
    else {
      const h = e.day * (1 - e.cloudCover * 0.6) * Math.max(0, e.sunElevation);
      this.ice = Math.max(
        0,
        this.ice -
          t * 0.03 * (clamp(s / 6, 0.1, 2) + h * 0.5 + e.rainfall * 0.4),
      );
    }
    ((i.lakeFrozen = this.ice),
      (this.iceTemp = damp(this.iceTemp, e.seaLevelTemp, 0.08, t)));
    const n = e.seaLevelTemp - e.temperatureAt(1);
    ((this.riverFreeze = smoothstep2(-0.5, -6.5, this.iceTemp - n * 0.9)),
      (this.fallFrozen = smoothstep2(-2, -7.5, this.iceTemp - n * 1.5)));
    const o = e.snowCover * clamp((e.seaLevelTemp - 1) / 8, 0, 1) * 1.6,
      a = 1 - 0.15 * smoothstep2(0.6, 1, 1 - Math.abs(e.season - 1.1)),
      l = clamp(
        (0.9 + e.rainfall * 0.8 + o + e.storminess * 0.35) * a,
        0.5,
        3.2,
      );
    ((this.flow = damp(this.flow, l, l > this.flow ? 0.35 : 0.12, t)),
      (this.turbid = damp(
        this.turbid,
        clamp(e.rainfall * 0.22 + (this.flow - 1) * 0.12, 0, 0.5),
        e.rainfall > 0.1 ? 0.2 : 0.04,
        t,
      )));
    const c = this.u;
    ((c.uIce.value = this.ice),
      (c.uIceTemp.value = this.iceTemp),
      (c.uFlow.value = this.flow),
      (c.uFlowTime.value += t * this.flow * (1 - this.riverFreeze * 0.85)),
      (c.uFallClock.value += t * this.flow * (1 - this.fallFrozen)),
      (c.uFallFrozen.value = this.fallFrozen),
      (c.uTurbid.value = this.turbid),
      this.river.update(t, this.fallFrozen),
      this.fish.update(t),
      this.particles.update(t),
      this.flora.update(e));
  }
  beforeRender(t) {
    (this._rain(t),
      this.ripples.step(t, this.level),
      this.reflection?.render(this.level, this.ice));
  }
  resize() {
    this.reflection?.resize();
  }
  _ownMeshes() {
    return this.group.children;
  }
  _rain(t) {
    const { precip: e, world: i } = this.ctx;
    if (!e.sources.length || t <= 0) return;
    const s = i.snowFractionAt(this.level);
    if (!(s > 0.9)) {
      for (const n of e.sources) {
        if (
          n.x + n.radius < RIPPLE_BOX.minX ||
          n.x - n.radius > RIPPLE_BOX.maxX ||
          n.z + n.radius < RIPPLE_BOX.minZ ||
          n.z - n.radius > RIPPLE_BOX.maxZ
        )
          continue;
        this._rainAcc +=
          n.rate * (1 - s) * n.radius * n.radius * Math.PI * 7 * t;
        let o = Math.min(24, Math.floor(this._rainAcc));
        for (this._rainAcc -= o; o-- > 0;) {
          const a = this._rand() * Math.PI * 2,
            l = n.radius * Math.sqrt(this._rand()) * 0.95,
            c = n.x + Math.cos(a) * l,
            h = n.z + Math.sin(a) * l;
          if (!this.isLakeWater(c, h, 0.01) || this.iceAt(c, h) > 0.4) continue;
          const f = this._rand();
          this.ripples.add(c, h, 0.022 + f * 0.02, -(0.9 + f * 1.6));
        }
      }
      this._rainAcc = Math.min(this._rainAcc, 4);
    }
  }
}
