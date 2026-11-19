/**
 * Precipitation column slots with rain/snow fall profiles plus the instanced falling-particle, rain-curtain, splash and hail render layers and their shaders.
 */
import * as THREE from "three";
import { BOX, TEMPERATURE_MODEL } from "../core/config.js";
import { clamp, damp, smoothstep2 } from "../util/math.js";
export const PRECIP_SLOT_COUNT = 8;
const SNOW_FALL_SPEED = 0.95;
const RAIN_FALL_SPEED = 6.4;
const MELT_TEMP_BAND = 1.2;
const DRIFT_TIME_CONSTANT = 3;
const SLOT_PHASE_WRAP = 64;
const SNOW_VIS_DEPTH_RANGE = [0.6, 2];
const MELT_LAYER_FALL_SPEED = 3.4;
const PRECIP_COMMON_GLSL = `
// col = (yTop, y1, y2, yBot), prof = (vs, vr, tA, tB). Returns distance fallen after tau seconds.
float precipFallDist(float tau, vec4 col, vec4 prof, out float v) {
  float dA = col.x - col.y;
  float h = col.y - col.z;
  if (tau < prof.z) { v = prof.x; return prof.x * tau; }
  float t2 = tau - prof.z;
  if (t2 < prof.w) {
    float k = (prof.y - prof.x) / max(h, 1e-4);
    float e = exp(k * t2);
    v = prof.x * e;
    return dA + prof.x / k * (e - 1.0);
  }
  v = prof.y;
  return dA + h + prof.y * (t2 - prof.w);
}
// Seconds needed to fall a distance d below the cloud base.
float precipFallTime(float d, vec4 col, vec4 prof) {
  float dA = col.x - col.y;
  float h = col.y - col.z;
  if (d < dA) return d / prof.x;
  float s = d - dA;
  if (s < h) { float k = (prof.y - prof.x) / max(h, 1e-4); return prof.z + log(1.0 + k * s / prof.x) / k; }
  return prof.z + prof.w + (s - h) / prof.y;
}
// Horizontal wind drift distance factor after t seconds of falling (saturating).
float precipDrift(float t) { return ${DRIFT_TIME_CONSTANT.toFixed(1)} * (1.0 - exp(-t / ${DRIFT_TIME_CONSTANT.toFixed(1)})); }
// Snow fraction of a falling particle at altitude y.
float precipSnowAt(float y) { return 1.0 - smoothstep(${(-MELT_TEMP_BAND).toFixed(2)}, ${MELT_TEMP_BAND.toFixed(2)}, temperatureAt(y)); }
// A frozen layer only a few decimetres thick under the cloud base is a melting layer: it reads
// as rain from the base (summer storms), not as a clump of flakes. Mirrors PrecipSlot.snowVis.
float precipSnowVis(vec4 col) { return smoothstep(${SNOW_VIS_DEPTH_RANGE[0].toFixed(2)}, ${SNOW_VIS_DEPTH_RANGE[1].toFixed(2)}, col.x - col.z); }
// Gaussian-ish radial offset inside a source disk of radius r from two uniform randoms.
vec2 precipDisk(vec2 rnd, float r) {
  float rr = r * min(1.2, 0.47 * sqrt(-2.0 * log(1.0 - 0.985 * rnd.x)));
  float a = rnd.y * 6.2831853;
  return vec2(cos(a), sin(a)) * rr;
}
// Where a falling particle stops: ground, lake surface, or roughly the river surface.
float precipFloorAt(vec2 xz) {
  vec4 ter = terrainAt(xz);
  float f = ter.x + ter.y * 0.07;
  return ter.z > 0.5 ? max(f, uWaterLevel) : f;
}
`;
const FLOOR_PROBE_COUNT = 8;
function precipFloorHeight(r, t, e, i) {
  ((e = clamp(e, -BOX.halfW, BOX.halfW)),
    (i = clamp(i, -BOX.halfD, BOX.halfD)));
  const s = r.height(e, i);
  return r.lakeMask(e, i) > 0.5 ? Math.max(s, t) : s;
}
export class PrecipSlot {
  constructor(t) {
    ((this.index = t),
      (this.live = !1),
      (this.visible = !1),
      (this.claimed = !1),
      (this.cloudId = null),
      (this.cloud = null),
      (this.x = 0),
      (this.y = 5),
      (this.z = 0),
      (this.radius = 1),
      (this.rate = 0),
      (this.srcRate = 0),
      (this.vx = 0),
      (this.vz = 0),
      (this.storm = 0),
      (this.clock = 0),
      (this.tStart = 0),
      (this.tStop = 1 / 0),
      (this.phase = Math.random() * SLOT_PHASE_WRAP),
      (this.seed = (t * 0.618034) % 1),
      (this.yBot = 0),
      (this.y1 = 0),
      (this.y2 = 0),
      (this.vs = SNOW_FALL_SPEED),
      (this.vr = RAIN_FALL_SPEED),
      (this.tA = 0),
      (this.tB = 0),
      (this.total = 1),
      (this.lo = 0),
      (this.hi = 0),
      (this.groundY = 0),
      (this.snowTop = 0),
      (this.snowGround = 0),
      (this.snowVis = 1),
      (this.arrival = 0),
      (this.count = 0),
      (this._fresh = !0));
  }
  begin(t, e, i) {
    ((this.live = !0),
      (this.visible = !0),
      (this.cloudId = t.cloudId ?? null),
      (this.cloud = e),
      (this.x = t.x),
      (this.y = t.y),
      (this.z = t.z),
      (this.radius = t.radius),
      (this.rate = i ? t.rate : t.rate * 0.5),
      (this.vx = 0),
      (this.vz = 0),
      (this.clock = 0),
      (this.tStart = i ? -1e4 : 0),
      (this.tStop = 1 / 0),
      (this.count = i ? -1 : 0),
      (this._fresh = !0));
  }
  feed(t, e, i) {
    if (
      (this.live || ((this.live = !0), (this.tStop = 1 / 0)),
      (this.cloud = e),
      i > 0)
    ) {
      const s = (t.x - this.x) / i,
        n = (t.z - this.z) / i,
        o = Math.abs(s) < 25 && Math.abs(n) < 25;
      ((this.vx = damp(this.vx, o ? s : 0, 5, i)),
        (this.vz = damp(this.vz, o ? n : 0, 5, i)));
    }
    ((this.x = t.x),
      (this.y = t.y),
      (this.z = t.z),
      (this.radius = t.radius),
      (this.srcRate = t.rate));
  }
  stop() {
    this.live &&
      ((this.live = !1), (this.tStop = this.clock), (this.srcRate = 0));
  }
  static temp(t, e) {
    return t.seaLevelTemp - TEMPERATURE_MODEL.lapse * Math.max(0, e);
  }
  update(t, e, i) {
    const { world: s, terrain: n } = e;
    ((this.clock += t),
      this.live
        ? (this.rate = damp(this.rate, this.srcRate, 2.5, t))
        : ((this.vx = damp(this.vx, 0, 1.5, t)),
          (this.vz = damp(this.vz, 0, 1.5, t))),
      (this.x = clamp(this.x, -BOX.halfW + 0.3, BOX.halfW - 0.3)),
      (this.z = clamp(this.z, -BOX.halfD + 0.3, BOX.halfD - 0.3)));
    const o = Math.min(this.y, BOX.topY - 0.2);
    this.y = o;
    const a =
        RAIN_FALL_SPEED +
        (SNOW_FALL_SPEED * 2.5 - RAIN_FALL_SPEED) * this.snowTop,
      l = Math.max(0.2, (o - this.groundY) / a);
    e.wind.sample(this.x, this.z, i);
    const c = DRIFT_TIME_CONSTANT * (1 - Math.exp(-l / DRIFT_TIME_CONSTANT)),
      h = this.x + i.x * c * 0.6 - this.vx * Math.min(l, 1.2) * 0.5,
      f = this.z + i.z * c * 0.6 - this.vz * Math.min(l, 1.2) * 0.5,
      u = s.lakeLevel;
    let d = precipFloorHeight(n, u, h, f);
    this.groundY = d;
    const p = this.radius * 1.05 + Math.hypot(i.x, i.z) * c * 0.5;
    for (let E = 0; E < FLOOR_PROBE_COUNT; E++) {
      const T = (E / FLOOR_PROBE_COUNT) * Math.PI * 2 + this.index;
      ((d = Math.min(
        d,
        precipFloorHeight(n, u, h + Math.cos(T) * p, f + Math.sin(T) * p),
      )),
        (d = Math.min(
          d,
          precipFloorHeight(
            n,
            u,
            this.x + Math.cos(T) * this.radius * 0.6,
            this.z + Math.sin(T) * this.radius * 0.6,
          ),
        )));
    }
    const v = Math.max(BOX.bottomY, Math.min(d - 0.3, o - 0.6));
    ((this.yBot = this._fresh ? v : Math.min(v, damp(this.yBot, v, 1.5, t))),
      (this._fresh = !1));
    const g = s.seaLevelTemp,
      x = TEMPERATURE_MODEL.lapse,
      m = this.yBot;
    ((this.y1 = clamp((g + MELT_TEMP_BAND) / x, m, o)),
      (this.y2 = clamp((g - MELT_TEMP_BAND) / x, m, this.y1)),
      (this.snowVis = smoothstep2(
        SNOW_VIS_DEPTH_RANGE[0],
        SNOW_VIS_DEPTH_RANGE[1],
        o - this.y2,
      )),
      (this.vs =
        MELT_LAYER_FALL_SPEED +
        (SNOW_FALL_SPEED - MELT_LAYER_FALL_SPEED) * this.snowVis));
    const w = this.vs,
      y = this.vr;
    this.tA = (o - this.y1) / w;
    const _ = this.y1 - this.y2;
    this.tB = _ > 1e-4 ? (_ * Math.log(y / w)) / (y - w) : 0;
    const M = (this.y2 - m) / y;
    ((this.total = Math.max(0.05, this.tA + this.tB + M)),
      t > 0 && (this.phase = (this.phase + t / this.total) % SLOT_PHASE_WRAP),
      (this.snowTop =
        smoothstep2(
          MELT_TEMP_BAND,
          -MELT_TEMP_BAND,
          PrecipSlot.temp(s, o - 0.3),
        ) * this.snowVis),
      (this.snowGround = smoothstep2(
        MELT_TEMP_BAND,
        -MELT_TEMP_BAND,
        PrecipSlot.temp(s, this.groundY),
      )),
      (this.lo = this.live ? 0 : this.clock - this.tStop),
      (this.hi = Math.min(1e4, this.clock - this.tStart)));
    const A = this.fallTime(Math.max(0, o - this.groundY)),
      b = smoothstep2(A * 0.85, A * 1.05, this.hi),
      S = smoothstep2(A * 0.9, A * 1.1, this.lo);
    ((this.arrival = b * (1 - S)),
      !this.live &&
        this.lo > this.total / 0.8 + 0.3 &&
        ((this.visible = !1),
        (this.cloudId = null),
        (this.cloud = null),
        (this.rate = 0),
        (this.count = 0)));
  }
  fallDist(t) {
    const e = this.y - this.y1,
      i = this.y1 - this.y2;
    if (t < this.tA) return this.vs * t;
    const s = t - this.tA;
    if (s < this.tB) {
      const n = (this.vr - this.vs) / Math.max(i, 1e-4);
      return e + (this.vs / n) * (Math.exp(n * s) - 1);
    }
    return e + i + this.vr * (s - this.tB);
  }
  fallTime(t) {
    const e = this.y - this.y1,
      i = this.y1 - this.y2;
    if (t < e) return t / this.vs;
    const s = t - e;
    if (s < i) {
      const n = (this.vr - this.vs) / Math.max(i, 1e-4);
      return this.tA + Math.log(1 + (n * s) / this.vs) / n;
    }
    return this.tA + this.tB + (s - i) / this.vr;
  }
  writeCol(t) {
    return t.set(this.y, this.y1, this.y2, this.yBot);
  }
  writeProf(t) {
    return t.set(this.vs, this.vr, this.tA, this.tB);
  }
}
const PRECIP_FALL_VERTEX_SHADER = `
attribute vec4 aSeed;
attribute float aRank;
uniform vec4 uSrc;    // x, z, radius, slot seed
uniform vec4 uCol;    // yTop, y1, y2, yBot
uniform vec4 uProf;   // vs, vr, tA, tB
uniform vec4 uRun;    // phase, column time, band lo, band hi
uniform vec4 uMisc;   // visible rank, intensity, source vel x, vel z
uniform float uPixel; // world size of one pixel at unit distance
varying vec2 vUv;
varying float vSnow;
varying float vAlpha;
varying vec3 vCol;
varying float vFloor;
varying float vY;
varying float vGlint;
varying float vSeed;

${PRECIP_COMMON_GLSL}

void cull() { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vAlpha = 0.0; }

void main() {
  float rankFade = 1.0 - smoothstep(uMisc.x * 0.88, uMisc.x, aRank);
  if (rankFade <= 0.0) { cull(); return; }
  vec4 sd = fract(aSeed + uSrc.w * vec4(1.0, 0.7548, 0.5698, 0.3141));
  // speed factor quantised to k/64 so the slot phase can wrap at 64 without a jump
  float spd = (54.0 + floor(sd.w * 21.0)) / 64.0;
  float s = fract(uRun.x * spd + sd.z);
  float tau = s * uRun.y;
  float tPhys = tau / spd;
  if (tPhys < uRun.z || tPhys > uRun.w) { cull(); return; }

  float v;
  float d = precipFallDist(tau, uCol, uProf, v);
  v *= spd;
  float y = uCol.x - d;
  float snow = precipSnowAt(y) * precipSnowVis(uCol);

  // horizontal: disk offset + wind drift (sampled near where the particle is now)
  // − the lag of a moving cloud (drops falling now were released where the cloud was)
  vec2 xz = uSrc.xy + precipDisk(sd.xy, uSrc.z);
  float drift = precipDrift(tPhys);
  vec2 w = windAt(xz + windAt(xz) * drift);
  xz += w * drift - uMisc.zw * min(tPhys, 1.2);
  // flakes flutter on little sinusoidal paths
  float fl = snow * (0.045 + 0.075 * sd.x);
  float f1 = 1.1 + 0.9 * sd.z, f2 = 0.9 + 1.1 * sd.w, ph = sd.y * 40.0;
  xz += fl * vec2(sin(tPhys * f1 + ph), cos(tPhys * f2 + ph * 1.3));
  vec3 vel = vec3(w.x, 0.0, w.y) * exp(-tPhys / ${DRIFT_TIME_CONSTANT.toFixed(1)});
  vel.y = -v;
  vel.xz += fl * vec2(f1 * cos(tPhys * f1 + ph), -f2 * sin(tPhys * f2 + ph * 1.3));

  // stop at the ground / lake surface; stay inside the glass
  float floorY = precipFloorAt(xz);
  float along = mix(0.4, 0.06, snow);
  if (y < floorY - along) { cull(); return; }
  float boxFade = (1.0 - smoothstep(5.8, 5.96, abs(xz.x))) * (1.0 - smoothstep(3.8, 3.96, abs(xz.y)));
  float topFade = smoothstep(0.0, 0.5, d);

  vec3 head = vec3(xz.x, y, xz.y);
  vec3 toCam = cameraPosition - head;
  float dist = length(toCam);
  toCam /= dist;
  float px = dist * uPixel;

  // rain: thin streak stretched along the velocity (motion blur), head at the drop
  float speed = length(vel);
  vec3 axis = vel / max(speed, 1e-3);
  float len = clamp(speed * 0.034, 0.05, 0.42) * (0.8 + 0.4 * sd.x);
  float wid = mix(0.004, 0.0075, sd.y);
  float widPx = max(wid, px * 0.85);
  vec3 side = normalize(cross(axis, toCam) + 1e-5);
  vec3 rainOff = side * widPx * position.x - axis * len * (position.y * 0.5 + 0.5);
  float rainA = 0.62 * sqrt(wid / widPx);

  // snow: camera-facing soft flake that tumbles (rotates and foreshortens)
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam) + vec3(1e-5, 0.0, 0.0));
  vec3 up = cross(toCam, right);
  float size = mix(0.02, 0.05, sd.w * sd.w) * (0.85 + 0.3 * sd.x);
  float sizePx = max(size, px * 0.9);
  float ang = tPhys * (0.6 + 1.8 * sd.x) + sd.y * 6.2831;
  float squash = 0.55 + 0.45 * abs(cos(tPhys * (1.2 + 1.6 * sd.z) + sd.w * 9.0));
  vec2 c = vec2(position.x, position.y * squash);
  c = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * c;
  vec3 snowOff = (right * c.x + up * c.y) * sizePx;
  float snowA = 0.95 * min(1.0, size / sizePx * 1.3);

  vec3 wp = head + mix(rainOff, snowOff, snow);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);

  // lighting: drops are clear – they catch light mostly when backlit (forward scattering),
  // flakes are diffuse white; both strobe with lightning
  vec3 viewDir = -toCam;
  float sunUp = smoothstep(-0.04, 0.12, uSunDir.y);
  float fwd = max(dot(viewDir, uSunDir), 0.0);
  float back = (pow(fwd, 5.0) * 1.6 + pow(fwd, 40.0) * 3.0) * sunUp;
  vec3 amb = (uSkyColor * 0.55 + uGroundColor * 0.25) * min(uAmbientIntensity, 1.2);
  vec3 flash = vec3(0.8, 0.86, 1.0) * uFlash * 1.2;
  vec3 rainC = (amb * 0.75 + uLightColor * (0.2 + back)) * (0.7 + 0.6 * sd.x) + flash;
  vec3 snowC = amb * 0.62 + uLightColor * (0.2 + pow(fwd, 4.0) * 0.1 * sunUp) + flash * 0.7;
  vCol = applyHaze(mix(rainC, snowC, snow), dist, y);
  float tw = sin(tPhys * (4.0 + 6.0 * sd.z) + sd.x * 60.0);
  vGlint = pow(max(tw, 0.0), 40.0) * sunUp * snow;

  vUv = position.xy;
  vSeed = sd.y;
  vSnow = snow;
  vAlpha = mix(rainA, snowA, snow) * rankFade * boxFade * topFade * uMisc.y;
  vFloor = floorY;
  vY = wp.y;
}
`;
const PRECIP_FALL_FRAGMENT_SHADER = `
varying vec2 vUv;
varying float vSnow;
varying float vAlpha;
varying vec3 vCol;
varying float vFloor;
varying float vY;
varying float vGlint;
varying float vSeed;

void main() {
  if (vAlpha <= 0.002 || vY < vFloor) discard;
  // rain: gaussian across, soft rounded head, tail fading out
  float along = vUv.y * 0.5 + 0.5; // 0 head … 1 tail
  float rain = exp(-vUv.x * vUv.x * 2.6) * smoothstep(0.0, 0.14, along) * (1.0 - along) * 1.35;
  // snow: soft fluffy disc (a hint of six-fold structure) with a brighter core
  float r = length(vUv);
  float ang = atan(vUv.y, vUv.x + 1e-5);
  float fluff = 1.0 + 0.1 * sin(ang * 6.0 + vSeed * 6.28) + 0.07 * sin(ang * 3.0 + vSeed * 17.0);
  float disc = 1.0 - smoothstep(0.3, 1.0, r * fluff);
  float core = exp(-r * r * 6.0);
  float a = mix(rain, disc, vSnow) * vAlpha;
  if (a < 0.003) discard;
  vec3 col = vCol * (1.0 + mix(0.35 * rain, 0.25 * core, vSnow)) + uLightColor * (vGlint * core * 1.2);
  gl_FragColor = vec4(col, a);
}
`;
export class PrecipFallLayer {
  constructor(t, e) {
    const { quality: i, scene: s } = t;
    ((this.ctx = t),
      (this.slots = e),
      (this.budget = i.pick(2500, 6e3, 12e3)),
      (this.maxPerSlot = i.pick(1200, 2600, 4200)),
      (this.density = i.pick(150, 260, 340)),
      (this.alphaScale = Math.min(1.2, Math.sqrt(260 / this.density))));
    const n = new THREE.BufferAttribute(
        new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
        3,
      ),
      o = new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1),
      a = this.maxPerSlot,
      l = new Float32Array(a * 4),
      c = new Float32Array(a);
    for (let u = 0; u < a; u++)
      ((l[u * 4] = Math.random()),
        (l[u * 4 + 1] = Math.random()),
        (l[u * 4 + 2] = Math.random()),
        (l[u * 4 + 3] = Math.random()),
        (c[u] = (u + 0.5) / a));
    const h = new THREE.InstancedBufferAttribute(l, 4),
      f = new THREE.InstancedBufferAttribute(c, 1);
    this.meshes = [];
    for (let u = 0; u < PRECIP_SLOT_COUNT; u++) {
      const d = new THREE.InstancedBufferGeometry();
      (d.setIndex(o),
        d.setAttribute("position", n),
        d.setAttribute("aSeed", h),
        d.setAttribute("aRank", f),
        (d.instanceCount = 0));
      const p = new THREE.ShaderMaterial({
          uniforms: {
            ...t.uniforms,
            uSrc: {
              value: new THREE.Vector4(),
            },
            uCol: {
              value: new THREE.Vector4(),
            },
            uProf: {
              value: new THREE.Vector4(),
            },
            uRun: {
              value: new THREE.Vector4(),
            },
            uMisc: {
              value: new THREE.Vector4(),
            },
            uPixel: {
              value: 0.001,
            },
          },
          vertexShader: t.GLSL_COMMON + PRECIP_FALL_VERTEX_SHADER,
          fragmentShader: t.GLSL_COMMON + PRECIP_FALL_FRAGMENT_SHADER,
          transparent: !0,
          depthWrite: !1,
          side: THREE.DoubleSide,
        }),
        v = new THREE.Mesh(d, p);
      ((v.name = `precip-fall-${u}`),
        (v.frustumCulled = !1),
        (v.renderOrder = 8),
        (v.visible = !1),
        s.add(v),
        this.meshes.push(v));
    }
    this.targets = new Float32Array(PRECIP_SLOT_COUNT);
  }
  update(t, e) {
    const { slots: i, meshes: s, targets: n } = this;
    let o = 0;
    for (let l = 0; l < PRECIP_SLOT_COUNT; l++) {
      const c = i[l];
      let h = 0;
      if (c.visible) {
        const f = Math.max(0.3, c.radius);
        ((h = Math.min(
          this.maxPerSlot,
          this.density * Math.pow(Math.max(0, c.rate), 0.8) * Math.PI * f * f,
        )),
          (h *= 1 + 0.5 * c.snowTop));
      }
      ((n[l] = h), (o += h));
    }
    const a = o > this.budget ? this.budget / o : 1;
    for (let l = 0; l < PRECIP_SLOT_COUNT; l++) {
      const c = i[l],
        h = s[l];
      if (!c.visible) {
        h.visible = !1;
        continue;
      }
      const f = n[l] * a;
      c.count < 0
        ? (c.count = f)
        : (c.live || f > c.count) &&
          (c.count += (f - c.count) * (1 - Math.exp(-t * 3)));
      const u = c.count;
      if (u < 1) {
        h.visible = !1;
        continue;
      }
      ((h.visible = !0),
        (h.geometry.instanceCount = Math.min(
          this.maxPerSlot,
          Math.ceil(u * 1.06) + 1,
        )));
      const d = h.material.uniforms;
      (d.uSrc.value.set(c.x, c.z, c.radius, c.seed),
        c.writeCol(d.uCol.value),
        c.writeProf(d.uProf.value),
        d.uRun.value.set(c.phase, c.total, c.lo, c.hi),
        d.uMisc.value.set(
          u / this.maxPerSlot,
          (0.72 + 0.28 * Math.min(1, c.rate)) * this.alphaScale,
          c.vx,
          c.vz,
        ),
        (d.uPixel.value = e));
    }
  }
}
const CURTAIN_SEGMENTS = 14;
const CURTAIN_VERTEX_SHADER = `
attribute vec4 aSheet;       // slot, lateral, depth, width randoms
uniform vec4 uCuSrc[${PRECIP_SLOT_COUNT}];   // x, z, radius, amount
uniform vec4 uCuCol[${PRECIP_SLOT_COUNT}];   // yTop, y1, y2, yBot
uniform vec4 uCuProf[${PRECIP_SLOT_COUNT}];  // vs, vr, tA, tB
uniform vec4 uCuRun[${PRECIP_SLOT_COUNT}];   // vel x, vel z, visible distance top, bottom
varying vec3 vWorld;
varying vec2 vLocal;        // across (-1..1), distance below the cloud base
varying float vAmt;
varying vec2 vBand;
varying float vSeed;
varying float vHalfW;
varying float vSnowVis;

${PRECIP_COMMON_GLSL}

void main() {
  int si = int(aSheet.x + 0.5);
  vec4 src = uCuSrc[si];
  if (src.w < 0.004) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vAmt = 0.0; return; }
  vec4 col = uCuCol[si];
  vec4 prof = uCuProf[si];
  vec4 run = uCuRun[si];
  vec3 fwd = vec3(cameraPosition.x - src.x, 0.0, cameraPosition.z - src.y);
  fwd = normalize(fwd + vec3(1e-4, 0.0, 0.0));
  vec3 right = vec3(fwd.z, 0.0, -fwd.x);
  float halfW = src.z * (0.5 + 0.3 * aSheet.w);
  vec2 base = src.xy + right.xz * (aSheet.y - 0.5) * 0.9 * src.z - fwd.xz * (aSheet.z - 0.5) * 1.1 * src.z;
  float y = mix(col.x, col.w, position.y);
  float d = col.x - y;
  float tf = precipFallTime(d, col, prof);
  vec2 xz = base + right.xz * position.x * halfW;
  xz += windAt(base) * precipDrift(tf) - run.xy * min(tf, 1.2);
  vWorld = vec3(xz.x, y, xz.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  vLocal = vec2(position.x, d);
  vAmt = src.w;
  vBand = run.zw;
  vSeed = aSheet.y * 17.0 + aSheet.z * 5.0 + float(si) * 3.1;
  vHalfW = halfW;
  vSnowVis = precipSnowVis(col);
}
`;
const CURTAIN_FRAGMENT_SHADER = `
varying vec3 vWorld;
varying vec2 vLocal;
varying float vAmt;
varying vec2 vBand;
varying float vSeed;
varying float vHalfW;
varying float vSnowVis;

${PRECIP_COMMON_GLSL}

void main() {
  if (vAmt <= 0.0) discard;
  float ground = precipFloorAt(vWorld.xz);
  float above = vWorld.y - ground;
  if (above < 0.0) discard;
  float box = (1.0 - smoothstep(5.6, 5.95, abs(vWorld.x))) * (1.0 - smoothstep(3.6, 3.95, abs(vWorld.z)));
  float d = vLocal.y;
  float band = smoothstep(vBand.x - 0.2, vBand.x + 0.4, d) * (1.0 - smoothstep(vBand.y - 0.5, vBand.y, d));
  float u = vLocal.x;
  float across = exp(-u * u * 2.8);
  float fades = smoothstep(0.0, 0.55, above) * smoothstep(0.1, 0.9, d) * across * band * box;
  if (fades < 0.003) discard;

  float snow = precipSnowAt(vWorld.y) * vSnowVis;
  float x = u * vHalfW;
  // rain: fine vertical streaks racing down; snow: soft slow blotches
  float r1 = wgNoise(vec2(x * 13.0 + vSeed, (vWorld.y + uTime * 3.4) * 0.8));
  float r2 = wgNoise(vec2(x * 29.0 - vSeed, (vWorld.y + uTime * 4.6) * 1.6));
  float s1 = wgNoise(vec2(x * 4.0 + vSeed, (vWorld.y + uTime * 0.55) * 3.0));
  float s2 = wgNoise(vec2(x * 9.0 - vSeed, (vWorld.y + uTime * 0.8) * 6.0));
  float n = mix(r1 * 0.6 + r2 * 0.4, s1 * 0.65 + s2 * 0.35, snow);
  float streak = smoothstep(0.32, 0.85, n);
  // big gusty clumps drifting through the shaft
  float clump = wgNoise(vec2(x * 1.3 + vSeed * 0.3 + uTime * 0.25, vWorld.y * 0.4 + uTime * 0.7));
  float a = vAmt * fades * (0.3 + 0.7 * streak) * (0.55 + 0.9 * clump) * mix(0.17, 0.06, snow);

  vec3 viewDir = normalize(vWorld - cameraPosition);
  float sunUp = smoothstep(-0.04, 0.12, uSunDir.y);
  float back = pow(max(dot(viewDir, uSunDir), 0.0), 4.0) * sunUp;
  vec3 amb = uSkyColor * 0.45 + uGroundColor * 0.15 + uHazeColor * 0.4;
  vec3 flash = vec3(0.8, 0.86, 1.0) * uFlash * 0.7;
  vec3 rainC = amb * 0.8 + uLightColor * (0.1 + back * 0.55) + flash;
  vec3 snowC = amb * 0.85 + uLightColor * (0.16 + back * 0.08) + flash;
  vec3 col = applyHaze(mix(rainC, snowC, snow), length(vWorld - cameraPosition), vWorld.y);
  gl_FragColor = vec4(col, a);
}
`;
export class PrecipCurtains {
  constructor(t, e) {
    ((this.ctx = t), (this.slots = e));
    const i = t.quality.pick(2, 3, 4);
    this.sheets = i;
    const s = [],
      n = [],
      o = [];
    let a = 0;
    for (let f = 0; f < PRECIP_SLOT_COUNT; f++)
      for (let u = 0; u < i; u++) {
        const d =
            i > 1
              ? ((u + 0.5) / i) * 0.8 + 0.1 + (Math.random() - 0.5) * 0.15
              : 0.5,
          p = Math.random(),
          v = Math.random();
        for (let g = 0; g <= CURTAIN_SEGMENTS; g++) {
          const x = g / CURTAIN_SEGMENTS;
          if (
            (s.push(-1, x, 0, 1, x, 0),
            n.push(f, d, p, v, f, d, p, v),
            g < CURTAIN_SEGMENTS)
          ) {
            const m = a + g * 2;
            o.push(m, m + 1, m + 2, m + 1, m + 3, m + 2);
          }
        }
        a += (CURTAIN_SEGMENTS + 1) * 2;
      }
    const l = new THREE.BufferGeometry();
    (l.setAttribute("position", new THREE.Float32BufferAttribute(s, 3)),
      l.setAttribute("aSheet", new THREE.Float32BufferAttribute(n, 4)),
      l.setIndex(o));
    const c = () =>
      Array.from(
        {
          length: PRECIP_SLOT_COUNT,
        },
        () => new THREE.Vector4(),
      );
    this.uniforms = {
      uCuSrc: {
        value: c(),
      },
      uCuCol: {
        value: c(),
      },
      uCuProf: {
        value: c(),
      },
      uCuRun: {
        value: c(),
      },
    };
    const h = new THREE.ShaderMaterial({
      uniforms: {
        ...t.uniforms,
        ...this.uniforms,
      },
      vertexShader: t.GLSL_COMMON + CURTAIN_VERTEX_SHADER,
      fragmentShader: t.GLSL_COMMON + CURTAIN_FRAGMENT_SHADER,
      transparent: !0,
      depthWrite: !1,
      side: THREE.DoubleSide,
    });
    ((this.mesh = new THREE.Mesh(l, h)),
      (this.mesh.name = "precip-curtains"),
      (this.mesh.frustumCulled = !1),
      (this.mesh.renderOrder = 7.9),
      (this.mesh.visible = !1),
      t.scene.add(this.mesh));
  }
  update(t, e, i) {
    const { slots: s, uniforms: n } = this;
    let o = !1;
    for (let a = 0; a < PRECIP_SLOT_COUNT; a++) {
      const l = s[a];
      let c = 0;
      if (l.visible) {
        const h = (l.rate - 0.45) / 0.9;
        ((c = h <= 0 ? 0 : h >= 1 ? 1 : h * h * (3 - 2 * h)),
          (c *= Math.min(1, l.radius / 0.7)));
      }
      (n.uCuSrc.value[a].set(l.x, l.z, l.radius, c),
        c > 0.004 &&
          ((o = !0),
          l.writeCol(n.uCuCol.value[a]),
          l.writeProf(n.uCuProf.value[a]),
          n.uCuRun.value[a].set(
            l.vx,
            l.vz,
            l.fallDist(l.lo),
            l.fallDist(Math.min(l.hi, 60)),
          )));
    }
    this.mesh.visible = o;
  }
}
const SPLASH_VERTEX_SHADER = `
attribute vec4 aSeed;
attribute vec2 aSlot;        // slot index, rank within the slot (0..1)
uniform vec4 uSpSrc[${PRECIP_SLOT_COUNT}];   // x, z, radius, visible fraction
uniform vec4 uSpCol[${PRECIP_SLOT_COUNT}];   // cloud base y, intensity, source vel x, vel z
uniform float uPixel;
uniform float uIce;
varying vec2 vUv;             // offset from the impact point in billboard space (world units)
varying float vT;             // seconds since impact
varying float vKind;          // 0 land crown, 1 water hop
varying vec3 vCol;
varying float vPx;
varying float vA;
varying vec4 vRnd;
varying vec3 vRight;
varying vec3 vUp;

${PRECIP_COMMON_GLSL}

void cull() { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vA = 0.0; }

void main() {
  int si = int(aSlot.x + 0.5);
  vec4 src = uSpSrc[si];
  if (aSlot.y >= src.w) { cull(); return; }
  vec4 col = uSpCol[si];
  float period = mix(0.32, 0.6, aSeed.x);
  float cyc = uTime / period + aSeed.y * 17.0;
  float ci = floor(cyc);
  float t = fract(cyc) * period;
  vec4 rnd = vec4(wgHash(vec2(ci, aSeed.z * 91.7)), wgHash(vec2(aSeed.w * 53.3, ci * 1.31)),
                  wgHash(vec2(ci * 0.71, aSeed.x * 37.1)), wgHash(vec2(aSeed.y * 13.9, ci * 2.17)));
  vec2 xz = src.xy + precipDisk(rnd.xy, src.z);
  // land where the (wind-slanted, cloud-lagged) drops land
  float tf = max(0.0, col.x - groundHeightAt(xz)) / ${RAIN_FALL_SPEED.toFixed(2)};
  xz += windAt(xz) * precipDrift(tf) - col.zw * min(tf, 1.2);
  if (abs(xz.x) > 5.9 || abs(xz.y) > 3.9) { cull(); return; }
  vec4 ter = terrainAt(xz);
  float lake = step(0.5, ter.z) * (1.0 - uIce);
  float water = max(lake, step(0.55, ter.y));
  float y = lake > 0.5 ? max(ter.x, uWaterLevel) : ter.x + ter.y * 0.07;
  if (precipSnowAt(y + 0.15) > 0.45 || (water < 0.5 && groundAt(xz).x > 0.22)) { cull(); return; }

  vec3 c = vec3(xz.x, y, xz.y);
  vec3 d = cameraPosition - c;
  float dist = length(d);
  vec3 toCam = d / dist;
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam) + vec3(1e-5, 0.0, 0.0));
  vec3 up = cross(toCam, right);
  float px = dist * uPixel;
  float hs = (water > 0.5 ? 0.075 : 0.1) * (0.8 + 0.35 * col.y);
  hs = max(hs, px * 6.0);
  float lift = hs * 0.55;
  vec3 wp = c + vec3(0.0, lift, 0.0) + (right * position.x + up * position.y) * hs;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);

  vUv = vec2(position.x * hs, position.y * hs + lift * up.y);
  vT = t;
  vKind = water;
  vPx = px;
  vRnd = rnd;
  vRight = right;
  vUp = up;
  vec3 viewDir = -toCam;
  float sunUp = smoothstep(-0.04, 0.12, uSunDir.y);
  float back = pow(max(dot(viewDir, uSunDir), 0.0), 5.0) * 1.5 * sunUp;
  vec3 amb = uSkyColor * 0.6 + uGroundColor * 0.2;
  vCol = applyHaze(amb * 0.85 + uLightColor * (0.32 + back) + vec3(0.8, 0.86, 1.0) * uFlash * 1.2, dist, y);
  vA = (0.55 + 0.45 * col.y) * min(1.0, 0.006 / px + 0.4);
}
`;
const SPLASH_FRAGMENT_SHADER = `
varying vec2 vUv;
varying float vT;
varying float vKind;
varying vec3 vCol;
varying float vPx;
varying float vA;
varying vec4 vRnd;
varying vec3 vRight;
varying vec3 vUp;

// a small glowing dot at p (billboard space), radius r
float dotAt(vec2 uv, vec2 p, float r) { vec2 q = uv - p; return exp(-dot(q, q) / (r * r)); }
// gaussian line profile: 1 on the curve, falling off with the (signed) distance x / width w
float line(float x, float w) { float k = x / w; return exp(-k * k); }
// project a world-space offset from the impact into billboard space
vec2 proj(vec3 o) { return vec2(dot(o, vRight), dot(o, vUp)); }

void main() {
  if (vA <= 0.0) discard;
  float t = vT;
  float r = max(0.0035, vPx * 0.75);
  float thick = max(0.003, vPx * 0.7);
  float e = max(0.12, length(vUp.xz)); // how open a horizontal ring looks from here
  float a = 0.0;
  if (vKind < 0.5) {
    // crown: an expanding rim that rises and collapses, then droplets fly out and fall
    float R = 0.07 * (1.0 - exp(-t * 16.0)) + 0.008;
    float H = 0.035 * sin(clamp(t / 0.16, 0.0, 1.0) * 3.14159) * (0.7 + 0.6 * vRnd.z);
    float fade = 1.0 - smoothstep(0.05, 0.16, t);
    vec2 q0 = vUv / vec2(R, R * e);
    vec2 q1 = (vUv - vec2(0.0, H)) / vec2(R * 0.85, R * 0.85 * e);
    float ring = line((length(q0) - 1.0) * R, thick * 1.4);
    // the rim breaks up into little points (the crown's fingers)
    float ang = atan(q1.y, q1.x + 1e-5);
    float fingers = pow(0.5 + 0.5 * sin(ang * 9.0 + vRnd.z * 40.0), 3.0);
    float rim = line((length(q1) - 1.0) * R * 0.85, thick * 1.3) * (0.25 + 0.75 * fingers);
    // a faint sheet between base and rim, visible mostly at the silhouette edges
    float side = smoothstep(0.6, 1.0, abs(vUv.x) / R) * (1.0 - smoothstep(1.0, 1.08, abs(vUv.x) / R));
    float wall = side * smoothstep(-R * e * 0.4, 0.0, vUv.y) * (1.0 - smoothstep(H * 0.7, H + R * e * 0.2, vUv.y));
    a += (ring * 0.18 * (1.0 - smoothstep(0.02, 0.07, t)) + rim * 0.45 + wall * 0.18) * fade;
    for (int k = 0; k < 6; k++) {
      float fk = float(k);
      float th = vRnd.w * 6.2831 + fk * 1.0472 + sin(fk * 7.3 + vRnd.z * 20.0) * 0.4;
      float h = 0.12 + 0.14 * fract(vRnd.z * 7.0 + fk * 0.37);
      float v0 = 0.45 + 0.45 * fract(vRnd.w * 5.0 + fk * 0.61);
      float tt = t - 0.02;
      float yv = v0 * tt - 2.8 * tt * tt;
      if (tt > 0.0 && yv > -0.004) a += dotAt(vUv, proj(vec3(cos(th) * h * tt, yv, sin(th) * h * tt)), r) * 0.9;
    }
  } else {
    // water: a quick ring and a single droplet jumping up out of the collapsing cavity
    float R = 0.045 * (1.0 - exp(-t * 12.0)) + 0.005;
    vec2 q0 = vUv / vec2(R, R * e);
    a += line((length(q0) - 1.0) * R, thick) * 0.16 * (1.0 - smoothstep(0.04, 0.14, t));
    a += dotAt(vUv, vec2(0.0, 0.004), r * 1.4) * (1.0 - smoothstep(0.0, 0.04, t)) * 0.8; // the impact glint
    float jet = smoothstep(0.03, 0.06, t) * (1.0 - smoothstep(0.1, 0.15, t));
    float jh = 0.028 * jet;
    a += jet * exp(-vUv.x * vUv.x / (r * r * 0.6)) * step(0.0, vUv.y) * step(vUv.y, jh) * 0.8;
    float tt = t - 0.09;
    float yv = (0.55 + 0.25 * vRnd.z) * tt - 3.0 * tt * tt + 0.02;
    if (tt > 0.0 && yv > 0.0) a += dotAt(vUv, vec2(0.0, yv), r * 1.1);
  }
  a = clamp(a, 0.0, 1.0) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol * (1.0 + a * 0.4), a);
}
`;
export class PrecipSplashes {
  constructor(t, e) {
    ((this.ctx = t),
      (this.slots = e),
      (this.perSlot = t.quality.pick(24, 60, 110)));
    const i = this.perSlot * PRECIP_SLOT_COUNT,
      s = new Float32Array(i * 4),
      n = new Float32Array(i * 2);
    for (let c = 0; c < i; c++) {
      for (let h = 0; h < 4; h++) s[c * 4 + h] = Math.random();
      ((n[c * 2] = c % PRECIP_SLOT_COUNT),
        (n[c * 2 + 1] =
          (Math.floor(c / PRECIP_SLOT_COUNT) + 0.5) / this.perSlot));
    }
    const o = new THREE.InstancedBufferGeometry();
    (o.setIndex([0, 1, 2, 0, 2, 3]),
      o.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0],
          3,
        ),
      ),
      o.setAttribute("aSeed", new THREE.InstancedBufferAttribute(s, 4)),
      o.setAttribute("aSlot", new THREE.InstancedBufferAttribute(n, 2)),
      (o.instanceCount = i));
    const a = () =>
      Array.from(
        {
          length: PRECIP_SLOT_COUNT,
        },
        () => new THREE.Vector4(),
      );
    this.uniforms = {
      uSpSrc: {
        value: a(),
      },
      uSpCol: {
        value: a(),
      },
      uPixel: {
        value: 0.001,
      },
      uIce: {
        value: 0,
      },
    };
    const l = new THREE.ShaderMaterial({
      uniforms: {
        ...t.uniforms,
        ...this.uniforms,
      },
      vertexShader: t.GLSL_COMMON + SPLASH_VERTEX_SHADER,
      fragmentShader: t.GLSL_COMMON + SPLASH_FRAGMENT_SHADER,
      transparent: !0,
      depthWrite: !1,
      side: THREE.DoubleSide,
    });
    ((this.mesh = new THREE.Mesh(o, l)),
      (this.mesh.name = "precip-splashes"),
      (this.mesh.frustumCulled = !1),
      (this.mesh.renderOrder = 8.1),
      (this.mesh.visible = !1),
      t.scene.add(this.mesh));
  }
  update(t, e, i) {
    const { slots: s, uniforms: n } = this;
    let o = !1;
    for (let a = 0; a < PRECIP_SLOT_COUNT; a++) {
      const l = s[a],
        c = n.uSpSrc.value[a];
      let h = 0;
      if (l.visible && l.arrival > 0.01 && l.snowGround < 0.6) {
        const f = l.rate * Math.PI * l.radius * l.radius * 16;
        h = Math.min(1, f / this.perSlot) * l.arrival * (1 - l.snowGround);
      }
      (c.set(l.x, l.z, l.radius * 0.95, h),
        n.uSpCol.value[a].set(l.y, Math.min(1.5, l.rate), l.vx, l.vz),
        h > 0.005 && (o = !0));
    }
    ((n.uPixel.value = i),
      (n.uIce.value =
        this.ctx.modules.water?.ice ?? this.ctx.fields.lakeFrozen ?? 0),
      (this.mesh.visible = o));
  }
}
const HAIL_CYCLE_SECONDS = 2.6;
const HAIL_FALL_SPEED = 7.5;
const HAIL_PELLET_GLSL = `
attribute vec4 aSeed;
attribute vec2 aSlot;
uniform vec4 uHaSrc[${PRECIP_SLOT_COUNT}];   // x, z, radius, visible fraction
uniform vec4 uHaCol[${PRECIP_SLOT_COUNT}];   // cloud base y, source vel x, vel z, ice (lake frozen)

// Position of a pellet (xyz) and its scale (w, 0 = hidden).
vec4 hailPellet() {
  int si = int(aSlot.x + 0.5);
  vec4 src = uHaSrc[si];
  if (aSlot.y >= src.w) return vec4(0.0);
  vec4 col = uHaCol[si];
  float cyc = uTime / ${HAIL_CYCLE_SECONDS.toFixed(2)} + aSeed.x * 13.0;
  float ci = floor(cyc);
  float t = fract(cyc) * ${HAIL_CYCLE_SECONDS.toFixed(2)};
  vec2 rnd = vec2(wgHash(vec2(ci, aSeed.y * 71.3)), wgHash(vec2(aSeed.z * 43.1, ci * 1.7)));
  float r = src.z * 0.8 * sqrt(rnd.x);
  float a = rnd.y * 6.2831853;
  vec2 xz = src.xy + vec2(cos(a), sin(a)) * r;
  vec4 ter0 = terrainAt(xz);
  float g = ter0.z > 0.5 ? max(ter0.x, uWaterLevel) : ter0.x; // open water stops them at the surface
  float tLand = max(0.05, (col.x - g) / ${HAIL_FALL_SPEED.toFixed(2)});
  xz += windAt(xz) * min(t, tLand) * 0.35 - col.yz * min(t, tLand) * 0.5;
  if (abs(xz.x) > 5.92 || abs(xz.y) > 3.92) return vec4(0.0);
  vec4 ter = terrainAt(xz);
  g = ter.x;
  float size = mix(0.02, 0.038, aSeed.w * aSeed.w);
  float y;
  float scale = size;
  if (t < tLand) {
    y = col.x - ${HAIL_FALL_SPEED.toFixed(2)} * t;
    scale *= smoothstep(0.0, 0.08, t);               // emerge from the cloud base
  } else {
    float lake = step(0.5, ter.z) * (1.0 - col.w);
    if (lake > 0.5 || ter.y > 0.55) return vec4(0.0); // plop – gone into the water
    float tb = t - tLand;
    // two hops with restitution, sliding outward, then rest and melt
    float soft = groundAt(xz).x > 0.25 ? 0.35 : 1.0; // snow swallows the bounce
    float v1 = (1.0 + 0.6 * aSeed.z) * soft, v2 = v1 * 0.38;
    float d1 = v1 / 4.9, d2 = v2 / 4.9;
    float h = 0.0, slide = 0.0;
    if (tb < d1) { h = v1 * tb - 4.9 * tb * tb; slide = tb / d1; }
    else if (tb < d1 + d2) { float u = tb - d1; h = v2 * u - 4.9 * u * u; slide = 1.0 + 0.4 * u / d2; }
    else slide = 1.4;
    float sa = aSeed.y * 6.2831853 + ci;
    xz += vec2(cos(sa), sin(sa)) * slide * 0.09 * soft;
    g = groundHeightAt(xz);
    y = g + size * 0.7 + h;
    float left = ${HAIL_CYCLE_SECONDS.toFixed(2)} - t;
    scale *= smoothstep(0.0, 0.7, left);              // melt
  }
  return vec4(xz.x, y, xz.y, scale);
}
`;
export class PrecipHail {
  constructor(t, e) {
    if (
      ((this.ctx = t),
      (this.slots = e),
      (this.perSlot = t.quality.pick(0, 120, 200)),
      (this.amount = 0),
      !this.perSlot)
    )
      return;
    const i = this.perSlot * PRECIP_SLOT_COUNT,
      s = new THREE.IcosahedronGeometry(1, t.quality.pick(0, 0, 1)),
      n = new THREE.InstancedBufferGeometry();
    (n.setAttribute("position", s.getAttribute("position")),
      n.setAttribute("normal", s.getAttribute("position").clone()));
    const o = new Float32Array(i * 4),
      a = new Float32Array(i * 2);
    for (let h = 0; h < i; h++) {
      for (let f = 0; f < 4; f++) o[h * 4 + f] = Math.random();
      ((a[h * 2] = h % PRECIP_SLOT_COUNT),
        (a[h * 2 + 1] =
          (Math.floor(h / PRECIP_SLOT_COUNT) + 0.5) / this.perSlot));
    }
    (n.setAttribute("aSeed", new THREE.InstancedBufferAttribute(o, 4)),
      n.setAttribute("aSlot", new THREE.InstancedBufferAttribute(a, 2)),
      (n.instanceCount = i));
    const l = () =>
      Array.from(
        {
          length: PRECIP_SLOT_COUNT,
        },
        () => new THREE.Vector4(),
      );
    this.uniforms = {
      uHaSrc: {
        value: l(),
      },
      uHaCol: {
        value: l(),
      },
    };
    const c = new THREE.MeshStandardMaterial({
      color: 15922940,
      roughness: 0.18,
      metalness: 0,
      emissive: 1843756,
    });
    ((c.onBeforeCompile = (h) => {
      (Object.assign(h.uniforms, t.uniforms, this.uniforms),
        (h.vertexShader =
          t.GLSL_COMMON +
          HAIL_PELLET_GLSL +
          h.vertexShader.replace(
            "#include <begin_vertex>",
            `vec4 hp = hailPellet();
         vec3 transformed = position * hp.w + hp.xyz;`,
          )));
    }),
      (c.customProgramCacheKey = () => "wg-precip-hail"),
      (this.mesh = new THREE.Mesh(n, c)),
      (this.mesh.name = "precip-hail"),
      (this.mesh.frustumCulled = !1),
      (this.mesh.visible = !1),
      t.scene.add(this.mesh));
  }
  update() {
    if (!this.perSlot) return 0;
    const { slots: t, uniforms: e } = this,
      i = this.ctx.world,
      s = this.ctx.modules.water?.ice ?? this.ctx.fields.lakeFrozen ?? 0;
    let n = 0;
    for (let o = 0; o < PRECIP_SLOT_COUNT; o++) {
      const a = t[o];
      let l = 0;
      if (a.visible && a.arrival > 0.01 && a.snowGround < 0.1) {
        const c = smoothstepHail(0.6, 0.95, a.storm),
          h = smoothstepHail(1.05, 1.6, a.rate),
          f = smoothstepHail(12, 18, i.temperatureAt(a.groundY));
        l = c * h * f * a.arrival;
      }
      (e.uHaSrc.value[o].set(a.x, a.z, a.radius, l),
        e.uHaCol.value[o].set(a.y, a.vx, a.vz, s),
        (n += l * a.rate));
    }
    return ((this.mesh.visible = n > 0.005), (this.amount = n), n);
  }
}
function smoothstepHail(r, t, e) {
  const i = Math.min(1, Math.max(0, (e - r) / (t - r)));
  return i * i * (3 - 2 * i);
}
