/**
 * LifeSystem: cabin props, bobbing moored boat with rope, hearth light and the smoke/leaves/wisps/insects/birds sub-systems driven by a seasonal/weather environment snapshot.
 */
import * as THREE from "three";
import { createSimplexNoise } from "../util/noise.js";
import { clamp, damp, smoothstep2 } from "../util/math.js";
import { CABIN2 } from "../world/terrainShape.js";
import { PROP_KIND } from "./propGeometryBuilder.js";
import { CabinBuilder } from "./cabinBuilder.js";
import { buildRowboatGeometry } from "./rowboatGeometry.js";
import { createPropMaterial } from "./propMaterial.js";
import { ChimneySmoke } from "./chimneySmoke.js";
import { BirdFlock } from "./birdFlock.js";
import { FlyingInsects } from "./flyingInsects.js";
import { FallingLeaves } from "./fallingLeaves.js";
import { WindWisps } from "./windWisps.js";
const boatWindSample = {
  x: 0,
  z: 0,
};
export class LifeSystem {
  constructor(t) {
    this.ctx = t;
    const { scene: e, events: i } = t;
    ((this.noise = createSimplexNoise(777)),
      (this.group = new THREE.Group()),
      (this.group.name = "life"),
      e.add(this.group),
      (this.uniforms = {
        uLifeGlow: {
          value: 0,
        },
        uLifeFlicker: {
          value: 0,
        },
        uLifeWet: {
          value: 0,
        },
        uRoofSnow: {
          value: 0,
        },
      }),
      (this.env = {
        day: 1,
        night: 0,
        golden: 0,
        dusk: 0,
        sunny: 1,
        rain: 0,
        snow: 0,
        storm: 0,
        wet: 0,
        temp: 15,
        cold: 0,
        summer: 1,
        spring: 0,
        autumn: 0,
        winter: 0,
        activity: 1,
        wind: 0,
        fire: 0.2,
        glow: 0,
        flowers: 1,
        fireflies: 0,
        butterflies: 0,
        motes: 0,
        leafFall: 0,
        blossom: 0,
        ice: 0,
        level: t.world.lakeLevel,
        time: 0,
      }),
      (this.props = new CabinBuilder(t, this.group, this.uniforms)),
      (this.material = createPropMaterial(t, this.uniforms, CABIN2.y)),
      (this.propMesh = new THREE.Mesh(this.props.geometry, this.material)),
      (this.propMesh.name = "life-props"),
      (this.propMesh.castShadow = !0),
      (this.propMesh.receiveShadow = !0),
      (this.propMesh.matrixAutoUpdate = !1),
      this.group.add(this.propMesh));
    const s = buildRowboatGeometry();
    ((this.boat = new THREE.Mesh(s.geometry, this.material)),
      (this.boat.name = "life-boat"),
      (this.boat.castShadow = !0),
      (this.boat.receiveShadow = !0),
      (this.boatInfo = s),
      this.group.add(this.boat),
      (this._boat = {
        yaw: 0,
        yawV: 0,
        roll: 0,
        rollV: 0,
        pitch: 0,
        pitchV: 0,
        heave: 0,
        heaveV: 0,
        ripT: 0,
        x: 0,
        z: 0,
      }),
      this._initRope(),
      (this.hearth = new THREE.PointLight(16751184, 0, 1.7, 2)),
      this.hearth.position.copy(this.props.cabinPoint(0.17, 0.2, 0.36)),
      (this.hearth.castShadow = !1),
      this.group.add(this.hearth),
      (this.glow = 0),
      (this._flick = 0),
      (this.cabin = {
        x: CABIN2.x,
        y: CABIN2.y,
        z: CABIN2.z,
      }),
      (this.chimneyTop = this.props.chimneyTop),
      (this.jettyEnd = this.props.jettyEnd),
      (this.perches = this.props.perches),
      (this.systems = []));
    const n = (a, l) => {
      try {
        const c = l();
        ((this[a] = c),
          this.systems.push({
            name: a,
            s: c,
            dead: !1,
          }));
      } catch (c) {
        console.error(`[life] ${a} failed to initialise`, c);
      }
    };
    (n("smoke", () => new ChimneySmoke(t, this.group, this.props.chimneyTop)),
      n("leaves", () => new FallingLeaves(t, this.group)),
      n("wisps", () => new WindWisps(t, this.group)),
      n("insects", () => new FlyingInsects(t, this.group, this)),
      n("birds", () => new BirdFlock(t, this.group, this)),
      i.on("tree:shake", (a) => this.leaves?.shake?.(a, this.env)),
      i.on("wind:stroke", (a) => {
        (this.wisps?.stroke?.(a, this.env),
          this.leaves?.stroke?.(a, this.env),
          this.insects?.disturb?.(a.x, a.z, 0.6 + (a.strength || 0)));
      }));
    const o = (a, l, c) => {
      (this.birds?.scatter?.(a, l, c), this.insects?.disturb?.(a, l, c));
    };
    (i.on("tap", () => o(void 0, void 0, 1)),
      i.on("glass:tap", () => o(void 0, void 0, 1)),
      i.on("lightning", (a) => {
        (o(a?.end?.x, a?.end?.z, 2), this.insects?.flash?.());
      }),
      i.on("splash", (a) => this._boatSplash(a)),
      i.on("scenario", () => this._reset()),
      this._updateEnv(0),
      this._reset());
  }
  scatterBirds(t, e) {
    this.birds?.scatter?.(t, e, 1);
  }
  _updateEnv(t) {
    const { world: e, wind: i, fields: s } = this.ctx,
      n = this.env,
      o = e.seasonal,
      a = e.season,
      l = (x) => Math.abs(((((a - x) % 4) + 6) % 4) - 2);
    ((n.time = e.timeOfDay),
      (n.day = e.day),
      (n.night = e.night),
      (n.golden = e.golden),
      (n.dusk = smoothstep2(0.3, 0, e.sunElevation) * (1 - e.night)),
      (n.storm = e.storminess),
      (n.rain = clamp(e.rainfall * 1.2, 0, 1)),
      (n.snow = clamp(e.snowfall * 1.2, 0, 1)),
      (n.temp = e.temperatureAt(CABIN2.y)),
      (n.cold = smoothstep2(15, -2, n.temp)),
      (n.spring = 1 - smoothstep2(0.3, 0.95, l(0))),
      (n.summer = 1 - smoothstep2(0.35, 0.95, l(1))),
      (n.autumn = 1 - smoothstep2(0.3, 0.9, l(2))),
      (n.winter = 1 - smoothstep2(0.35, 0.95, l(3))),
      (n.activity = o.activity),
      (n.flowers = o.flowers),
      (n.blossom = o.blossom),
      (n.leafFall = o.fallingLeaves),
      (n.wind = e.windEnergy),
      (n.wet = clamp(s.wetAt?.(CABIN2.x, CABIN2.z) ?? e.groundWetness, 0, 1)));
    const c = clamp(e.cloudCover * 0.8 + e.storminess, 0, 1);
    n.sunny = e.day * (1 - c * 0.75) * (1 - n.rain) * (1 - n.snow * 0.8);
    const h = this.ctx.modules.water;
    ((n.level = typeof h?.level == "number" ? h.level : e.lakeLevel),
      (n.ice = typeof h?.ice == "number" ? h.ice : s.lakeFrozen || 0));
    const f = smoothstep2(0.22, -0.06, e.sunElevation),
      u = smoothstep2(0.03, 0.08, n.time) * smoothstep2(0.24, 0.17, n.time),
      d = clamp(
        e.storminess * 1.1 + c * 0.35 * (1 - e.day * 0.6) + n.rain * 0.4,
        0,
        1,
      ),
      p = clamp(Math.max(f * (1 - u * 0.65), d * 0.85), 0, 1);
    ((this.glow = t > 0 ? damp(this.glow, p, 1.5, t) : p),
      (n.glow = this.glow),
      (n.fire = clamp(
        0.12 + n.cold * 0.85 + this.glow * 0.45 + n.storm * 0.2,
        0.1,
        1,
      )));
    const v = (1 - n.rain) * (1 - n.storm) * (1 - smoothstep2(1.5, 3, n.wind));
    n.butterflies = clamp(
      Math.max(n.spring, n.summer) *
        n.sunny *
        smoothstep2(0.2, 0.6, o.flowers) *
        v *
        smoothstep2(8, 14, n.temp),
      0,
      1,
    );
    const g = Math.max(e.night, smoothstep2(0.12, -0.04, e.sunElevation));
    ((n.fireflies = clamp(
      Math.max(n.summer, n.spring * 0.25) *
        g *
        v *
        smoothstep2(10, 16, n.temp) *
        (1 -
          smoothstep2(0.08, 0.2, n.time) * smoothstep2(0.3, 0.2, n.time) * 0),
      0,
      1,
    )),
      (n.motes = clamp(
        n.sunny *
          Math.max(n.summer, n.spring * 0.6, n.autumn * 0.4) *
          (1 - n.rain),
        0,
        1,
      )));
  }
  update(t, e) {
    this._updateEnv(t);
    const i = this.env,
      { fields: s } = this.ctx,
      n = this.noise;
    this._flick =
      0.55 * n.noise2(e * 5.3, 1.7) +
      0.3 * n.noise2(e * 13.1, 4.2) +
      0.15 * n.noise2(e * 29, 9.9);
    const o = this.uniforms;
    ((o.uLifeGlow.value = this.glow), (o.uLifeFlicker.value = this._flick));
    const a = s.snowAt?.(CABIN2.x, CABIN2.z) ?? 0,
      l = clamp(a, 0, 1.4) * 0.024;
    ((o.uRoofSnow.value = t > 0 ? damp(o.uRoofSnow.value, l, 0.8, t) : l),
      (o.uLifeWet.value = i.rain * 0.5),
      (this.hearth.intensity = this.glow * (0.22 + 0.06 * this._flick)),
      this._updateBoat(t, e));
    for (const c of this.systems)
      if (!c.dead)
        try {
          c.s.update(t, e, i);
        } catch (h) {
          (console.error(`[life] ${c.name} update failed; disabling it`, h),
            (c.dead = !0));
          try {
            c.s.hide?.();
          } catch {}
        }
  }
  _reset() {
    this._updateEnv(0);
    const t = this._boat;
    ((t.yaw =
      t.yawV =
      t.roll =
      t.rollV =
      t.pitch =
      t.pitchV =
      t.heave =
      t.heaveV =
        0),
      this._updateBoat(0, this.ctx.time || 0));
    for (const e of this.systems)
      if (!e.dead)
        try {
          e.s.reset?.(this.env);
        } catch (i) {
          console.error(`[life] ${e.name} reset failed`, i);
        }
  }
  _updateBoat(t, e) {
    const i = this.env,
      s = this.props,
      n = this._boat,
      o = s.boatHome,
      a = this.ctx.wind.sample(o.x, o.z, boatWindSample),
      l = Math.hypot(a.x, a.z),
      c = smoothstep2(
        0.35,
        0.75,
        this.ctx.modules.water?.iceAt?.(o.x, o.z) ?? i.ice,
      ),
      h = 1 - c,
      f = s.jettyDir,
      u = a.x * -f.z + a.z * f.x,
      d = a.x * f.x + a.z * f.z;
    if (t > 0) {
      const M = clamp(d * 0.05, -0.18, 0.18) * h;
      ((n.yawV += ((M - n.yaw) * 2 - n.yawV * 1.2) * t), (n.yaw += n.yawV * t));
      const A = clamp(u * 0.035, -0.12, 0.12) * h;
      if (
        ((n.rollV += ((A - n.roll) * 9 - n.rollV * 2.2) * t),
        (n.roll += n.rollV * t),
        (n.pitchV += ((0 - n.pitch) * 9 - n.pitchV * 2.2) * t),
        (n.pitch += n.pitchV * t),
        (n.heaveV += ((0 - n.heave) * 14 - n.heaveV * 3) * t),
        (n.heave += n.heaveV * t),
        (n.ripT -= t),
        n.ripT <= 0 && h > 0.5)
      ) {
        n.ripT = 1.1 + Math.random() * 1.6 - Math.min(0.8, l * 0.25);
        const b = this.ctx.modules.water?.ripples;
        if (b?.add) {
          const S = Math.random() * Math.PI * 2;
          b.add(
            o.x + Math.cos(S) * 0.1,
            o.z + Math.sin(S) * 0.05,
            0.035,
            -(0.35 + l * 0.25 + i.rain),
          );
        }
      }
    }
    const p = 0.4 + Math.min(1.6, l * 0.45) + i.storm * 1.2,
      v =
        (0.0035 * Math.sin(e * 1.7) + 0.0022 * Math.sin(e * 2.9 + 1.3)) * p * h,
      g =
        (0.03 * Math.sin(e * 1.25 + 0.4) + 0.018 * Math.sin(e * 2.3)) * p * h +
        n.roll,
      x =
        (0.016 * Math.sin(e * 1.05 + 2) + 0.01 * Math.sin(e * 2.7 + 0.2)) *
          p *
          h +
        n.pitch,
      m = s.boatYaw + n.yaw + 0.03 * Math.sin(e * 0.21) * h,
      w = 0.012 * Math.max(0, u) * h;
    ((n.x = o.x - f.z * w),
      (n.z = o.z + f.x * w),
      this.boat.position.set(n.x, i.level + v + n.heave - c * 0.004, n.z),
      this.boat.rotation.set(g, m, x, "YXZ"),
      this.boat.updateMatrix(),
      this._updateRope());
  }
  _boatSplash(t) {
    if (!t) return;
    const e = this.props.boatHome,
      i = Math.hypot(t.x - e.x, t.z - e.z);
    if (i > 0.9) return;
    const s = (1 - i / 0.9) * (t.strength ?? 0.6),
      n = this._boat;
    ((n.rollV += (Math.random() - 0.5) * 1.6 * s),
      (n.pitchV += (Math.random() - 0.5) * 0.9 * s),
      (n.heaveV -= 0.12 * s));
  }
  _initRope() {
    ((this._ropeSeg = 12), (this._ropeSides = 4));
    const i = 65,
      s = new THREE.BufferGeometry();
    ((this._ropePos = new Float32Array(i * 3)),
      (this._ropeNrm = new Float32Array(i * 3)));
    const n = new Float32Array(i * 3),
      o = new Float32Array(i * 3),
      a = new Float32Array(i * 4),
      l = new Float32Array(i * 4),
      c = new THREE.Color("#b59a6a");
    for (let f = 0; f < i; f++)
      ((n[f * 3] = c.r),
        (n[f * 3 + 1] = c.g),
        (n[f * 3 + 2] = c.b),
        (a[f * 4] = 1.3),
        (a[f * 4 + 1] = PROP_KIND.rope),
        (a[f * 4 + 2] = 1),
        (a[f * 4 + 3] = 0.003));
    for (let f = 0; f <= 12; f++)
      for (let u = 0; u <= 4; u++) {
        const d = f * 5 + u,
          p = (u / 4) * Math.PI * 2;
        ((o[d * 3] = f * 0.02),
          (o[d * 3 + 1] = Math.cos(p) * 0.003),
          (o[d * 3 + 2] = Math.sin(p) * 0.003));
      }
    const h = [];
    for (let f = 0; f < 12; f++)
      for (let u = 0; u < 4; u++) {
        const d = f * 5 + u,
          p = d + 4 + 1;
        h.push(d, p, p + 1, d, p + 1, d + 1);
      }
    (s.setAttribute(
      "position",
      new THREE.BufferAttribute(this._ropePos, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    ),
      s.setAttribute(
        "normal",
        new THREE.BufferAttribute(this._ropeNrm, 3).setUsage(
          THREE.DynamicDrawUsage,
        ),
      ),
      s.setAttribute("aCol", new THREE.BufferAttribute(n, 3)),
      s.setAttribute("aGrain", new THREE.BufferAttribute(o, 3)),
      s.setAttribute("aInfo", new THREE.BufferAttribute(a, 4)),
      s.setAttribute("aRoof", new THREE.BufferAttribute(l, 4)),
      s.setIndex(h),
      (this.rope = new THREE.Mesh(s, this.material)),
      (this.rope.name = "life-rope"),
      (this.rope.frustumCulled = !1),
      (this.rope.receiveShadow = !0),
      this.group.add(this.rope),
      (this._ropeA = new THREE.Vector3()),
      (this._ropeB = new THREE.Vector3()),
      (this._ropeLen = 0));
  }
  _updateRope() {
    const t = this._ropeA.copy(this.props.boatRopeAnchor),
      e = this._ropeB
        .copy(this.boatInfo.bowLocal)
        .applyMatrix4(this.boat.matrix),
      i = t.distanceTo(e);
    this._ropeLen || (this._ropeLen = i * 1.12);
    const s =
        Math.sqrt(Math.max(0, this._ropeLen * this._ropeLen - i * i)) * 0.5,
      n = this._ropeSeg,
      o = this._ropeSides,
      a = 0.0026,
      l = this._ropePos,
      c = this._ropeNrm;
    let h = 0,
      f = 0,
      u = 0;
    for (let d = 0; d <= n; d++) {
      const p = d / n,
        v = t.x + (e.x - t.x) * p,
        g = t.z + (e.z - t.z) * p,
        x = t.y + (e.y - t.y) * p - s * 4 * p * (1 - p);
      let m, w, y;
      if (d < n) {
        const z = (d + 1) / n;
        ((m = (e.x - t.x) / n),
          (y = (e.z - t.z) / n),
          (w = t.y + (e.y - t.y) * z - s * 4 * z * (1 - z) - x));
      } else ((m = v - h), (w = x - f), (y = g - u));
      ((h = v), (f = x), (u = g));
      const _ = Math.hypot(m, w, y) || 1;
      ((m /= _), (w /= _), (y /= _));
      let M = w * 0 - y * 1,
        A = y * 0 - m * 0,
        b = m * 1 - w * 0;
      const S = Math.hypot(M, A, b) || 1;
      ((M /= S), (A /= S), (b /= S));
      const E = A * y - b * w,
        T = b * m - M * y,
        R = M * w - A * m;
      for (let z = 0; z <= o; z++) {
        const L = (z / o) * Math.PI * 2,
          k = Math.cos(L),
          U = Math.sin(L),
          F = M * k + E * U,
          G = A * k + T * U,
          B = b * k + R * U,
          q = (d * (o + 1) + z) * 3;
        ((l[q] = v + F * a),
          (l[q + 1] = x + G * a),
          (l[q + 2] = g + B * a),
          (c[q] = F),
          (c[q + 1] = G),
          (c[q + 2] = B));
      }
    }
    ((this.rope.geometry.attributes.position.needsUpdate = !0),
      (this.rope.geometry.attributes.normal.needsUpdate = !0));
  }
}
