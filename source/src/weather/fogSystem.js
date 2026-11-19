/**
 * Billboard fog puff particles with their shaders plus the FogSystem module that drives the fog field simulation, volume meshes, climate-driven fog sources and the fog-pouring tool.
 */
import * as THREE from "three";
import { BOX, TEMPERATURE_MODEL } from "../core/config.js";
import { createSimplexNoise, mulberry32 } from "../util/noise.js";
import { clamp, damp, lerp2, smoothstep2 } from "../util/math.js";
import {
  createFloatDataTexture,
  uploadFloatDataTexture,
} from "../world/terrain.js";
import { FOG_GRID_NX, FOG_GRID_NZ, FogField } from "./fogField.js";
import {
  createBlueNoiseTexture,
  createFogLidGeometry,
  createFogMaterials,
  createFogNoiseTexture,
} from "./fogMaterial.js";
const FOG_PUFF_VERTEX_SHADER = `
attribute vec4 aPuff;    // xyz centre, w size
attribute vec4 aPuff2;   // x opacity, y seed, z age 0..1, w flatten
varying vec2 vUv;
varying vec4 vData;
varying vec3 vWorld;
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float a = aPuff2.y * 6.2831 + aPuff2.z * (aPuff2.y - 0.5) * 1.5;   // slow roll
  vec2 c = vec2(cos(a), sin(a));
  vec2 v = vec2(position.x * c.x - position.y * c.y, position.x * c.y + position.y * c.x);
  vec3 wp = aPuff.xyz + (right * v.x + up * v.y * aPuff2.w) * aPuff.w;
  vWorld = wp;
  vUv = position.xy + 0.5;
  vData = aPuff2;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;
const FOG_PUFF_FRAGMENT_SHADER = `
uniform vec4 uLook;   // same as the volume: x extinction, y sun gain, z ambient gain, w night gain
varying vec2 vUv;
varying vec4 vData;
varying vec3 vWorld;
float puffHG(float c, float g) { float g2 = g * g; return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float seed = vData.y * 37.0;
  float age = vData.z;
  // cauliflower edge: noise-eroded disc that frays as it ages
  float n = wgFbm(p * 1.6 + vec2(seed, seed * 0.7) + vec2(0.0, -age * 0.8));
  float shape = smoothstep(1.0, 0.25, r + (n - 0.5) * (0.7 + age * 0.6));
  float a = shape * shape * vData.x;
  // don't cut hard into the ground / water
  vec4 ter = terrainAt(vWorld.xz);
  float floorY = max(ter.x, uWaterLevel);
  a *= smoothstep(0.0, 0.1, vWorld.y - floorY);
  if (a < 0.004) discard;
  vec3 rd = normalize(vWorld - cameraPosition);
  float cosT = dot(rd, uLightDir);
  float phase = mix(puffHG(cosT, -0.15), puffHG(cosT, 0.62), 0.5);
  float core = 1.0 - shape * 0.35;   // thicker middle is a little shadowed
  vec3 Lin = uLightColor * uLook.y * phase * (1.0 + uNight * uLook.w) * (0.55 + 0.45 * core)
           + mix(uGroundColor * 1.3, uSkyColor, 0.55 + 0.45 * p.y) * uLook.z * (1.0 + uNight * 0.8)
           + vec3(0.8, 0.85, 1.0) * uFlash * 1.2;
  vec3 c = applyHaze(Lin * vec3(0.93, 0.94, 0.96), length(vWorld - cameraPosition), vWorld.y);
  gl_FragColor = vec4(c * a, a);
}
`;
class FogPuffs {
  constructor(t, e, i) {
    ((this.ctx = t), (this.max = e), (this.free = []));
    for (let o = 0; o < e; o++)
      this.free.push({
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        life: 1,
        size: 0.3,
        grow: 0.5,
        seed: 0,
        alpha: 0.5,
        lift: 0.2,
      });
    ((this.live = []),
      (this.rand = mulberry32(985493)),
      (this._w = {
        x: 0,
        z: 0,
      }));
    const s = new THREE.PlaneGeometry(1, 1),
      n = new THREE.InstancedBufferGeometry();
    ((n.index = s.index),
      n.setAttribute("position", s.getAttribute("position")),
      (this.a1 = new THREE.InstancedBufferAttribute(
        new Float32Array(e * 4),
        4,
      ).setUsage(THREE.DynamicDrawUsage)),
      (this.a2 = new THREE.InstancedBufferAttribute(
        new Float32Array(e * 4),
        4,
      ).setUsage(THREE.DynamicDrawUsage)),
      n.setAttribute("aPuff", this.a1),
      n.setAttribute("aPuff2", this.a2),
      (n.instanceCount = 0),
      (this.geo = n),
      (this.material = new THREE.ShaderMaterial({
        uniforms: {
          ...t.uniforms,
          uLook: i,
        },
        vertexShader: t.GLSL_COMMON + FOG_PUFF_VERTEX_SHADER,
        fragmentShader: t.GLSL_COMMON + FOG_PUFF_FRAGMENT_SHADER,
        transparent: !0,
        premultipliedAlpha: !0,
        depthWrite: !1,
      })),
      (this.mesh = new THREE.Mesh(n, this.material)),
      (this.mesh.name = "fog-puffs"),
      (this.mesh.frustumCulled = !1),
      (this.mesh.renderOrder = 5),
      (this.mesh.visible = !1),
      t.scene.add(this.mesh));
  }
  emit(t, e, i, s, n, o, a) {
    const l = this.free.pop() || this.live.shift(),
      c = this.rand;
    ((l.x = t),
      (l.y = e),
      (l.z = i),
      (l.vx = s * o),
      (l.vz = n * o),
      (l.vy = 0.15 + c() * 0.25),
      (l.age = 0),
      (l.life = 1.3 + c() * 1.1),
      (l.size = a * (0.55 + c() * 0.35)),
      (l.grow = a * (1.1 + c() * 0.8)),
      (l.seed = c()),
      (l.alpha = 0.32 + c() * 0.22),
      (l.lift = 0.12 + c() * 0.2),
      this.live.push(l));
  }
  update(t) {
    const { live: e } = this,
      i = this.ctx.terrain,
      s = this.ctx.wind,
      n = this._w,
      o = Math.exp(-t * 1.6);
    let a = 0;
    for (let h = 0; h < e.length; h++) {
      const f = e[h];
      if (((f.age += t / f.life), f.age >= 1)) {
        this.free.push(f);
        continue;
      }
      (s.sample(f.x, f.z, n, 0),
        (f.vx = f.vx * o + n.x * (1 - o) * 0.8),
        (f.vz = f.vz * o + n.z * (1 - o) * 0.8),
        (f.x += f.vx * t),
        (f.z += f.vz * t));
      const d =
        Math.max(i.height(f.x, f.z), this.ctx.world.lakeLevel) +
        f.lift * (1 - f.age * 0.6);
      ((f.vy += ((d - f.y) * 3 - f.vy * 1.8) * t),
        (f.y += f.vy * t),
        (e[a++] = f));
    }
    e.length = a;
    const l = this.a1.array,
      c = this.a2.array;
    for (let h = 0; h < a; h++) {
      const f = e[h],
        u = h * 4,
        d = f.age;
      ((l[u] = f.x),
        (l[u + 1] = f.y),
        (l[u + 2] = f.z),
        (l[u + 3] = f.size + f.grow * (1 - (1 - d) * (1 - d))),
        (c[u] = f.alpha * Math.min(1, d * 9) * (1 - d) * (1 - d)),
        (c[u + 1] = f.seed),
        (c[u + 2] = d),
        (c[u + 3] = 0.62));
    }
    ((this.geo.instanceCount = a),
      (this.mesh.visible = a > 0),
      a > 0 && ((this.a1.needsUpdate = !0), (this.a2.needsUpdate = !0)));
  }
  clear() {
    for (const t of this.live) this.free.push(t);
    ((this.live.length = 0),
      (this.geo.instanceCount = 0),
      (this.mesh.visible = !1));
  }
}
const FOG_SIM_STEP = 1 / 30;
export class FogSystem {
  constructor(t) {
    this.ctx = t;
    const e = t.quality;
    ((this.field = new FogField(t.terrain, t.wind)),
      (this.noise = createSimplexNoise(3849)),
      (this.rand = mulberry32(3850)),
      (this.tex = createFloatDataTexture(
        this.field.data,
        FOG_GRID_NX,
        FOG_GRID_NZ,
      )));
    const i = createFogMaterials(t, {
      fogTex: this.tex,
      noiseTex: createFogNoiseTexture(32),
      blueTex: createBlueNoiseTexture(64),
      steps: e.pick(14, 22, 32),
      taps: e.pick(2, 2, 3),
      grow: e.pick(1.1, 1.07, 1.05),
    });
    ((this.uniforms = i.uniforms),
      (this.uniforms.uStep.value = e.pick(0.08, 0.062, 0.05)),
      (this.lid = new THREE.Mesh(createFogLidGeometry(), i.lid)),
      (this.lid.name = "fog-volume"),
      (this.lid.renderOrder = 5),
      (this.lid.visible = !1),
      (this.box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), i.inside)),
      (this.box.name = "fog-volume-inside"),
      (this.box.frustumCulled = !1),
      (this.box.renderOrder = 5),
      (this.box.visible = !1),
      t.scene.add(this.lid, this.box),
      (this.puffs = new FogPuffs(t, e.pick(32, 64, 96), this.uniforms.uLook)),
      (this.stormMemory = 0),
      (this.rainMemory = 0),
      (this.steamLook = 0),
      (this.src = {
        valley: 0,
        valleyTarget: 0.4,
        valleyTop: 0.8,
        steam: 0,
        steamTarget: 0.3,
        bank: 0,
        bankTarget: 0.45,
        mist: 0,
        mistTarget: 0.35,
      }),
      (this.env = {
        wind: t.wind,
        ambientK: 0.3,
        drain: 0.32,
        diffusion: 0.4,
        level: 1.6,
        base: 0.0015,
        sun: 0,
        dry: 0,
        seaTemp: 10,
        lapse: TEMPERATURE_MODEL.lapse,
        warmK: 0.004,
        windK: 0.09,
        turbK: 0.12,
      }),
      (this._acc = 0),
      (this._sincePack = 1),
      (this._dirty = !0),
      (this.pour = {
        active: !1,
        x: 0,
        y: 0,
        z: 0,
        hold: 0,
        stroke: 0,
        nextWhoosh: 1.8,
        puffAcc: 0,
      }),
      (this._hit = new THREE.Vector3()),
      (this._tmp = new THREE.Vector3()),
      this._initInput());
  }
  get amount() {
    return this.field.amount;
  }
  addFog(t, e, i = 1, s = 1) {
    const n = clamp(Number(s) || 0, 0, 3);
    n <= 0 ||
      (this.field.splat(
        t,
        e,
        Math.max(0.05, i),
        n,
        0.3 + 0.28 * Math.min(n, 1.5),
        0.45 * Math.min(n, 1),
        0.6,
      ),
      (this._dirty = !0));
  }
  clear() {
    (this.field.clear(), this.puffs.clear(), (this._dirty = !0));
  }
  densityAt(t, e, i) {
    i === void 0 && ((i = e), (e = void 0));
    const s = this.field.sampleData(0, t, i);
    if (e === void 0 || s <= 0) return Math.max(0, s);
    const n = this.field.sampleData(1, t, i),
      o = Math.max(this.ctx.terrain.height(t, i), this.ctx.world.lakeLevel),
      a = n - o;
    if (a <= 0 || e < o) return 0;
    const l = Math.max(0.05, 0.42 * a);
    return (
      s *
      smoothstep2(n + 0.02, n - l, e) *
      lerp2(1.25, 0.8, clamp((e - o) / Math.max(a, 0.05), 0, 1))
    );
  }
  update(t, e) {
    const i = this.ctx.world,
      s = this.field;
    s.setWaterLevel(i.lakeLevel);
    let n = !1;
    if (t > 0) {
      if (
        (this._climate(t), (this._acc += t), this._acc >= FOG_SIM_STEP * 0.999)
      ) {
        const l = Math.min(this._acc, 0.1);
        this._acc = 0;
        const c = this.src,
          h = c.valley + c.steam + c.bank + c.mist > 1e-5;
        (h || !s.empty) &&
          (h && s.sources(l, c, this.noise, e),
          s.step(l, this.env),
          (this._dirty = !0),
          (n = !0));
      }
      this._drift(t);
    }
    ((this._sincePack += t),
      this._dirty &&
        (!n || t === 0 || this._sincePack >= FOG_SIM_STEP * 1.999) &&
        (s.pack(),
        uploadFloatDataTexture(this.tex),
        (this._dirty = !1),
        (this._sincePack = 0),
        this._syncBounds()),
      (i.fogAmount = s.amount));
    const o = this.uniforms;
    o.uSteam.value = this.steamLook;
    const a = this.ctx.lights?.flash;
    (a &&
      o.uBolt.value.set(
        a.position.x,
        Math.min(a.position.y, 3.5),
        a.position.z,
        i.flash,
      ),
      this.puffs.update(t));
  }
  _drift(t) {
    const e = this.ctx.wind,
      i = this.field,
      s = i.any ? 0.6 : 0,
      n = e.ambient.x * (1 - s) + i.drift.x * s,
      o = e.ambient.y * (1 - s) + i.drift.z * s,
      a = this.uniforms.uDrift0.value,
      l = this.uniforms.uDrift1.value,
      c = (h) => h - Math.floor(h);
    ((a.x = c(a.x + n * 0.85 * 0.42 * t)),
      (a.z = c(a.z + o * 0.85 * 0.42 * t)),
      (a.y = c(a.y - 0.006 * t)),
      (a.w = c(a.w + 0.07 * t)),
      (l.x = c(l.x + n * 1 * 1.25 * t)),
      (l.z = c(l.z + o * 1 * 1.25 * t)),
      (l.y = c(l.y - 0.035 * t)));
  }
  beforeRender() {
    const t = this.field.any,
      e = this.field.bounds,
      i = this.ctx.camera.position,
      s =
        t &&
        i.x > e.minX - 0.3 &&
        i.x < e.maxX + 0.3 &&
        i.z > e.minZ - 0.3 &&
        i.z < e.maxZ + 0.3 &&
        i.y > e.minY - 0.5 &&
        i.y < e.maxY + 0.3;
    ((this.lid.visible = t && !s), (this.box.visible = s));
  }
  _syncBounds() {
    const t = this.field.bounds;
    if (!this.field.any) return;
    const e = this.uniforms,
      i = Math.max(t.minY, -1);
    (e.uBoxMin.value.set(t.minX, i, t.minZ),
      e.uBoxMax.value.set(t.maxX, t.maxY, t.maxZ),
      (e.uBottomY.value = i - 0.4),
      this.box.position.set(
        (t.minX + t.maxX) / 2,
        (i + t.maxY) / 2,
        (t.minZ + t.maxZ) / 2,
      ),
      this.box.scale.set(t.maxX - t.minX, t.maxY - i, t.maxZ - t.minZ));
  }
  _climate(t) {
    const e = this.ctx.world,
      i = e.humidity,
      s = e.timeOfDay,
      n = e.season,
      o = 0.5 - 0.15 * Math.sin((n * Math.PI) / 2),
      a = o + (1 - o) * (Math.cos(Math.PI * n) + 1) * 0.5,
      l = Math.exp(-(((s - 0.27) / 0.075) ** 2)),
      c = 0.6 * Math.exp(-(((s - 0.79) / 0.06) ** 2)),
      h = Math.max(l, c, e.night * 0.55),
      f = smoothstep2(0.5, 0.84, i),
      u = smoothstep2(19, 8, e.temperatureAt(0.5)),
      d = smoothstep2(2.4, 0.7, e.windEnergy),
      p = 1 - e.day * smoothstep2(0.12, 0.55, e.sunElevation),
      v = this.src;
    ((v.valley = 0.06 * a * h * f * u * d * p),
      (v.valleyTarget = 0.26 + 0.24 * f),
      (v.valleyTop = 0.62 + 0.28 * f * h),
      (this.rainMemory = Math.min(
        1.5,
        this.rainMemory * Math.exp(-t / 45) + e.rainfall * 0.35 * t,
      )),
      (this.stormMemory = Math.min(
        1,
        this.stormMemory * Math.exp(-t / 50) + e.storminess * 0.35 * t,
      )));
    const g = this.ctx.modules.water?.ice ?? this.ctx.fields.lakeFrozen ?? 0,
      x = e.temperatureAt(e.lakeLevel),
      m = clamp(this.rainMemory + e.groundWetness * 0.5 - 0.12, 0, 1),
      w = smoothstep2(0.9, 0.2, e.rainfall),
      y = smoothstep2(13, 22, x) * m * (0.35 + 0.65 * e.day) * w,
      _ = smoothstep2(9, 3, x) * h * f;
    ((v.steam = (0.08 * y + 0.03 * _) * d * (1 - clamp(g, 0, 1))),
      (this.steamLook = damp(
        this.steamLook,
        clamp(y * 1.5 + _ * 0.6, 0, 1) * (1 - clamp(g, 0, 1)),
        0.5,
        t,
      )),
      (v.bank =
        0.07 *
        smoothstep2(0.74, 0.93, i) *
        (0.4 + 0.6 * u) *
        smoothstep2(3.2, 1.2, e.windEnergy) *
        (1 - 0.5 * e.day * smoothstep2(0.3, 0.8, e.sunElevation))),
      (v.bankTarget = 0.42 + 0.15 * this.stormMemory));
    const M =
      smoothstep2(0.5, 0.15, e.storminess) * smoothstep2(0.7, 0.15, e.rainfall);
    ((v.mist = 0.07 * this.stormMemory * M * (0.4 + 0.6 * f)),
      (v.mistTarget = 0.3 + 0.1 * this.stormMemory));
    const A = this.env;
    ((A.sun =
      0.018 *
      e.day *
      Math.pow(Math.max(0, e.sunElevation), 0.8) *
      (1 - 0.5 * e.cloudCover)),
      (A.dry = 0.06 * Math.max(0, 0.6 - i)),
      (A.seaTemp = e.seaLevelTemp));
  }
  _initInput() {
    const { input: t } = this.ctx;
    t.addHandler({
      name: "fog",
      priority: 10,
      tools: ["fog"],
      cursor: "crosshair",
      activeCursor: "crosshair",
      hitTest: () => {
        const e = this._pourPoint(this._hit);
        return e
          ? {
              distance: this.ctx.camera.position.distanceTo(e),
            }
          : null;
      },
      onDown: () => {
        const e = this._pourPoint(this._hit);
        if (!e) return !1;
        const i = this.pour;
        ((i.active = !0),
          (i.x = e.x),
          (i.y = e.y),
          (i.z = e.z),
          (i.hold = 0),
          (i.stroke = 0),
          (i.nextWhoosh = 1.8),
          (i.puffAcc = 0),
          this.field.splat(
            e.x,
            e.z,
            0.55,
            0.3,
            this._pourThickness(e.x, e.z),
            0.8,
            1,
          ));
        for (let s = 0; s < 6; s++) this._emitPuff(e.x, e.z, 0.7);
        return (
          (this._dirty = !0),
          this.ctx.audio?.play?.("whoosh", {
            volume: 0.3,
            pitch: 0.9 + this.rand() * 0.2,
          }),
          !0
        );
      },
      onMove: () => {
        const e = this._pourPoint(this._tmp);
        e && this._pourStroke(e);
      },
      onFrame: (e, i) => this._pourHold(i),
      onUp: () => {
        this.pour.active = !1;
      },
    });
  }
  _pourPoint(t) {
    const e = this.ctx.input,
      i = e.rayToTerrain(t);
    if (!i) return null;
    const s = this.ctx.world.lakeLevel;
    if (i.y < s) {
      const n = e.rayToPlaneY(
        s,
        this._tmp2 || (this._tmp2 = new THREE.Vector3()),
      );
      n && Math.abs(n.x) < BOX.halfW && Math.abs(n.z) < BOX.halfD && t.copy(n);
    }
    return t;
  }
  _pourThickness(t, e) {
    return 0.42 + 0.35 * Math.min(1, this.field.sampleData(0, t, e));
  }
  _pourStroke(t) {
    const e = this.pour;
    if (!e.active) return;
    const i = t.x - e.x,
      s = t.z - e.z,
      n = Math.hypot(i, s);
    if (n < 0.001) return;
    const o = Math.min(24, Math.ceil(n / 0.12)),
      a = this._pourThickness(t.x, t.z);
    for (let c = 1; c <= o; c++) {
      const h = c / o;
      this.field.splat(
        e.x + i * h,
        e.z + s * h,
        0.5,
        (0.26 * (n / o)) / 0.12,
        a,
        0.75,
        1,
      );
    }
    const l = Math.min(8, Math.round(n / 0.16 + this.rand() * 0.6));
    for (let c = 0; c < l; c++) {
      const h = this.rand();
      this._emitPuff(e.x + i * h, e.z + s * h, 0.55, -s / n, i / n);
    }
    ((e.stroke += n),
      e.stroke > e.nextWhoosh &&
        ((e.nextWhoosh = e.stroke + 2.2),
        this.ctx.audio?.play?.("whoosh", {
          volume: 0.16,
          pitch: 0.85 + this.rand() * 0.3,
        })),
      (e.x = t.x),
      (e.y = t.y),
      (e.z = t.z),
      (this._dirty = !0));
  }
  _pourHold(t) {
    const e = this.pour;
    if (!e.active || t <= 0) return;
    e.hold += t;
    const i = 0.45 + 0.3 * smoothstep2(0, 2.5, e.hold);
    for (
      this.field.splat(
        e.x,
        e.z,
        i,
        1.6 * t,
        this._pourThickness(e.x, e.z),
        0.95,
        1,
      ),
        e.puffAcc += t * 16;
      e.puffAcc >= 1;
    )
      ((e.puffAcc -= 1), this._emitPuff(e.x, e.z, 0.75));
    this._dirty = !0;
  }
  _emitPuff(t, e, i, s = 0, n = 0) {
    const o = this.rand;
    let a, l;
    if (s || n) {
      const f = o() < 0.5 ? -1 : 1,
        u = (o() - 0.5) * 0.9;
      ((a = s * f + n * u), (l = n * f - s * u));
    } else {
      const f = o() * Math.PI * 2;
      ((a = Math.cos(f)), (l = Math.sin(f)));
    }
    const c = Math.hypot(a, l) || 1,
      h = Math.max(this.ctx.terrain.height(t, e), this.ctx.world.lakeLevel);
    this.puffs.emit(
      t + (a / c) * 0.08,
      h + 0.06,
      e + (l / c) * 0.08,
      a / c,
      l / c,
      i * (0.6 + o() * 0.6),
      0.34,
    );
  }
}
