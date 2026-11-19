/**
 * River ribbon, waterfall sheet, plunge pool and freezing icicles with their flow, foam and ice shaders.
 */
import * as THREE from "three";
import {
  RIVER_PATH2,
  lakeEllipse2,
  riverHalfWidth2,
  terrainHeight2,
} from "../world/terrainShape.js";
import {
  WATER_COMMON_GLSL,
  createWaterRandom,
  waterShadowDefines,
} from "./waterCommon.js";
const WATERFALL_LIP_SEG = 1.04;
const icicleMatrix = new THREE.Matrix4();
const icicleScale = new THREE.Vector3();
const WATERFALL_POOL_SEG = 1.93;
const RIVER_VERT = `
attribute vec4 aFlow;   // τ (flow time), v (-1..1 across), slope, t
attribute vec4 aSide;   // half-width on this side, lake ellipse, arc length s, spring fade
attribute vec2 aDir;    // flow direction (xz)
varying vec3 vWorld;
varying vec4 vFlow;
varying vec4 vSide;
varying vec2 vDir;
varying float vYe;
void main() {
  vec3 p = position;
  float ry = p.y + (uFlow - 1.0) * 0.012 * smoothstep(1.0, 0.6, abs(aFlow.y));
  // approaching the lake the river surface eases down onto the lake surface
  float ye = max(uWaterLevel, mix(ry, uWaterLevel, smoothstep(1.35, 0.98, aSide.y)));
  p.y = aSide.y < 1.5 ? ye + 0.0015 : ry;
  vYe = ye;
  vWorld = p;
  vFlow = aFlow;
  vSide = aSide;
  vDir = aDir;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;
const RIVER_FRAG = `
uniform float uPoolS;
uniform float uLipS;
varying vec3 vWorld;
varying vec4 vFlow;
varying vec4 vSide;
varying vec2 vDir;
varying float vYe;

vec2 wImpactRings(vec2 p) {
  vec2 g = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 im = uImpacts[i];
    float age = uTime - im.z;
    if (age < 0.0 || age > 2.5) continue;
    vec2 d = p - im.xy - vDir * age * 0.25; // rings drift downstream
    float r = length(d) + 1e-4;
    float x = (r - age * 0.28) * 45.0;
    g += d / r * cos(x) * exp(-x * x * 0.05) * (1.0 - age / 2.5) * 0.5 * im.w;
  }
  return g;
}

void main() {
  float tau = vFlow.x, v = vFlow.y, slope = vFlow.z;
  float hw = vSide.x, s = vSide.z;
  vec2 p = vWorld.xz;
  vec2 fw = fwidth(p);   // before any discard (derivatives need the whole quad)
  float depth = vWorld.y - groundHeightAt(p);
  float lakeVis = smoothstep(uWaterLevel + 0.004, uWaterLevel + 0.02, vYe);
  float lip = s < uPoolS ? smoothstep(uLipS + 0.005, uLipS - 0.07, s) : 1.0;  // pour over the lip, don't end in mid-air
  float coverage = lakeVis * (1.0 - smoothstep(0.7 - (1.0 - lip) * 0.4, 1.0, abs(v))) * smoothstep(-0.004, 0.02, depth) * vSide.w * lip;
  if (coverage < 0.004) discard;

  vec2 dir = normalize(vDir);
  vec2 nrm = vec2(-dir.y, dir.x);
  float across = v * hw;
  float speed = 0.2 + slope * 2.0;

  // ice creeps in from the banks; in hard frost the whole river locks up
  float freeze = wFreezeAt(vWorld.y);
  float iceN = wgNoise(p * 9.0) - 0.5;
  float ice = smoothstep(1.0 - freeze * 1.3, 1.1 - freeze * 1.3, abs(v) + iceN * 0.3);
  ice = max(ice, smoothstep(0.82, 0.97, freeze + iceN * 0.1));
  float flowK = 1.0 - ice;

  // flow-advected pattern space; eddies near the banks lag and curl
  float bank = smoothstep(0.45, 0.95, abs(v));
  float ft = tau - uFlowTime * (1.0 - bank * 0.55);
  vec2 eddy = vec2(wgNoise(vec2(across * 6.0, ft * 0.6)) - 0.5, 0.0) * bank * 0.6;
  vec2 q1 = vec2(across * 13.0 + eddy.x * 3.0, ft * 2.6);
  vec2 q2 = vec2(across * 31.0 - 4.0, ft * 6.0 + 3.1);
  vec2 g1 = wNoiseGrad(q1), g2 = wNoiseGrad(q2);
  float turb = (0.035 + min(slope, 0.6) * 0.28) * (0.75 + 0.35 * uFlow) * flowK;
  // pattern-space gradient → world slope (along-flow derivative of τ is 1/speed)
  vec2 gp = (g1 * vec2(13.0, 2.6 / speed) * 0.006 + g2 * vec2(31.0, 6.0 / speed) * 0.0022) * turb / 0.05;
  vec2 grad = nrm * gp.x + dir * gp.y;
  float fp = max(fw.x, fw.y);
  vec3 rain = wRainRings(p, uTime, groundAt(p).z, fp) * flowK;
  grad += rain.xy * 0.8;
  grad += wImpactRings(p);
  vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));

  vec3 V = normalize(cameraPosition - vWorld);
  float nvRaw = dot(N, V);
  if (nvRaw < 0.02) { N = normalize(N + V * (0.02 - nvRaw)); }
  float sunVis = wSunVis(vWorld);               // key-light shadow map × cloud shadow
  // a miniature river is optically "deeper" than its millimetres; plus a faint film sheen
  float F = mix(wFresnel(wSat(dot(N, V))), 1.0, 0.09);
  vec3 Rr = refract(-V, N, 0.75);
  vec3 sigma = (wSigma() + vec3(-0.35, -0.07, 0.21)) * 2.6; // greener over the brown bed
  vec3 T = exp(-sigma * max(depth, 0.0) / max(-Rr.y, 0.2));

  // foam: streaks riding the current, whitewater in the steep reaches, froth below the fall
  float streak = smoothstep(0.6, 0.9, wgNoise(vec2(across * 26.0, ft * 1.5)) * 0.7 + wgNoise(vec2(across * 55.0, ft * 4.0)) * 0.3);
  float white = smoothstep(0.2, 0.5, slope * (0.75 + 0.3 * uFlow));
  float post = exp(-max(s - uPoolS, 0.0) / 0.32) * step(uPoolS - 0.05, s);
  float churn = wgNoise(vec2(across * 18.0, ft * 3.4)) * 0.6 + wgNoise(vec2(across * 40.0, ft * 7.0)) * 0.4;
  float foam = streak * (0.12 + white * 0.5 + post * 0.6 + (uFlow - 1.0) * 0.3);
  foam += smoothstep(0.5, 0.78, churn) * (white * 0.6 + post * 0.7 + max(uFlow - 1.4, 0.0) * 0.25);
  foam += bank * 0.08 * smoothstep(0.55, 0.8, churn);
  // a thin lapping waterline against the banks
  foam += smoothstep(0.012, 0.0, abs(depth - 0.008 - 0.004 * sin(uTime * 1.7 + s * 9.0))) * smoothstep(0.35, 0.7, churn) * 0.45;
  // sparse bubble lines drifting with the current
  foam += smoothstep(0.84, 0.93, wgNoise(vec2(across * 38.0 + 2.0, ft * 2.4))) * 0.28;
  foam = clamp(foam * flowK, 0.0, 0.95);

  float sunUp = max(uLightDir.y, 0.0);
  vec3 inscat = wAlbedo() * vec3(1.2, 2.1, 1.9) * wAmbient(mix(0.35, 1.0, sunVis)) * (1.0 - T);
  // broken reflections: rippled facets catch bright sky or the dark banks
  vec3 R = reflect(-V, N);
  // low rays meet the banks and hills, not sky (consistent with the lake's mirror)
  vec3 refl = mix(wLandscape(R.y, sunVis), wSky(R), smoothstep(0.08, 0.6, R.y + (g1.x - g2.y) * 0.12));
  // the lower reaches borrow the lake's mirror (what hangs above the valley), fading upstream
  float mirrorK = uReflOn * (1.0 - smoothstep(0.15, 0.7, vWorld.y - uWaterLevel));
  if (mirrorK > 0.01) {
    vec4 m = wMirror(vec3(vWorld.x, uWaterLevel, vWorld.z), grad * 0.04);
    float k = mirrorK * 0.85;
    refl = refl * (1.0 - m.a * k) + m.rgb * k;          // premultiplied mirror over the sky
  }
  vec3 glint = wGlint(N, V, mix(900.0, 240.0, wSat(turb * 8.0))) * sunVis;
  vec3 emit = inscat * (1.0 - F) + refl * F + glint + wGlitter(p, N, V, dir, 0.4 + turb * 6.0, 1.0 - smoothstep(0.02, 0.06, fp)) * sunVis;
  emit += wSky(vec3(0.0, 1.0, 0.0)) * rain.z * 0.06;
  vec3 foamCol = wFoamLight(sunUp * sunVis);
  emit = mix(emit, foamCol, foam);
  vec3 trans = T * (1.0 - F) * (1.0 - foam);

  // river ice: milky and clear windows, cracks, bubbles, a dull sheen, snow in drifts
  if (ice > 0.001) {
    float n2 = wgNoise(p * 3.2 + 7.0) * 0.6 + wgNoise(p * 10.0 - 3.0) * 0.4;
    float clear = smoothstep(0.42, 0.7, n2) * (1.0 - smoothstep(0.9, 1.0, freeze) * 0.5);
    vec2 cp = p + 0.05 * vec2(wgNoise(p * 6.0), wgNoise(p * 6.0 + 3.0));
    float crack = (1.0 - smoothstep(0.0, 0.022, wCell(cp * 9.0 + 2.0, 0.0))) * smoothstep(0.45, 0.7, wgNoise(p * 2.7 - 5.0));
    vec2 bq = p * 60.0;
    float bub = step(0.86, wgHash(floor(bq))) * smoothstep(0.3, 0.1, length(fract(bq) - 0.5));
    vec3 Ni = normalize(vec3((n2 - 0.5) * 0.08, 1.0, (wgNoise(p * 4.0) - 0.5) * 0.08));
    vec3 iceLight = wDiffuse(Ni, sunVis);
    vec3 milky = mix(vec3(0.36, 0.48, 0.56), vec3(0.56, 0.67, 0.75), smoothstep(0.3, 1.0, freeze));
    vec3 iceCol = milky * iceLight;
    iceCol = mix(iceCol, emit * 0.55 + vec3(0.02, 0.05, 0.06) * iceLight, clear);   // see into the water
    iceCol = mix(iceCol, iceCol * 0.55, crack * 0.7) + bub * iceLight * 0.18;
    iceCol += wSky(reflect(-V, Ni)) * mix(wFresnel(max(dot(Ni, V), 0.0)), 1.0, 0.04) * 0.8 + wGlint(Ni, V, 120.0) * 0.5 * sunVis;
    float drift = wgNoise(p * 2.3 + 1.0) * 0.7 + wgNoise(p * 8.0) * 0.3;
    float snow = smoothstep(0.4, 0.62, drift + smoothstep(0.03, 0.5, groundAt(p).x) * 0.5 - 0.15) * smoothstep(0.02, 0.2, groundAt(p).x) * smoothstep(0.5, 1.0, freeze);
    iceCol = mix(iceCol, vec3(0.9, 0.93, 0.98) * wDiffuse(vec3(0.0, 1.0, 0.0)), snow);
    vec3 iceTrans = mix(vec3(0.22, 0.3, 0.33), T * 0.7, clear) * (1.0 - snow) * (1.0 - crack * 0.3);
    emit = mix(emit, iceCol, ice);
    trans = mix(trans, iceTrans, ice);
    // frozen margins feather irregularly into the banks
    coverage *= 1.0 - ice * smoothstep(0.5, 0.95, abs(v) + (wgNoise(p * 14.0) - 0.5) * 0.35) * 0.8;
  }

  float a = 1.0 - dot(trans, vec3(0.3333));
  emit = min(wHazeEmit(emit, trans, vWorld), vec3(64.0));
  gl_FragColor = vec4(emit * coverage, a * coverage);
}
`;
const WATERFALL_VERT = `
uniform vec2 uAcross;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNrm;
void main() {
  vec3 p = position;
  // the sheet swells with the flow and flutters slightly in the wind
  vec2 w = windAt(p.xz);
  float u = uv.x;
  p.xz += w * u * u * 0.025 * (1.0 - uFallFrozen);
  // more water → a wider, heavier sheet
  p.xz += uAcross * uv.y * (0.1 + 0.05 * u) * clamp(uFlow - 1.0, -0.4, 1.6) * 0.3 * (1.0 - uFallFrozen);
  vUv = uv;
  vWorld = p;
  vNrm = normal;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;
const WATERFALL_FRAG = `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNrm;
void main() {
  float u = vUv.x, w = vUv.y;       // u: 0 lip → 1 pool, w: -1..1 across
  float fz = uFallFrozen;
  float along = u * 1.7 - uFallClock * 2.1;
  float n1 = wgNoise(vec2(w * 7.0, along * 2.6));
  float n2 = wgNoise(vec2(w * 21.0 + 5.0, along * 6.0));
  float n3 = wgNoise(vec2(w * 48.0 - 3.0, along * 11.0));
  float streak = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
  float flowAmt = clamp(uFlow, 0.4, 3.0);

  // edges fray, the sheet opens into strands lower down (fewer with more water)
  float fray = abs(w) + (n2 - 0.5) * 0.45 * u;
  float edge = 1.0 - smoothstep(0.6 - 0.15 * u, 1.0, fray);
  float strands = smoothstep(0.18, 0.45, streak + 0.3 - u * 0.28 + (flowAmt - 1.0) * 0.18);
  float aer = smoothstep(0.02, 0.6, u);              // white water develops as it falls
  float tongue = 1.0 - smoothstep(0.0, 0.2, u);      // smooth glassy tongue over the lip
  float foam = smoothstep(0.32, 0.82, streak * 0.95 + aer * 0.42 - 0.08 + (flowAmt - 1.0) * 0.1);
  foam *= 1.0 - tongue * 0.85;
  float alpha = edge * (0.34 + 0.6 * foam) * mix(1.0, 0.4 + 0.6 * strands, aer) * smoothstep(0.0, 0.03, u);
  alpha = mix(alpha, edge * 0.8, tongue * 0.6);

  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vNrm);
  N = dot(N, V) < 0.0 ? -N : N; // thin sheet: light the side we look at
  float sunUp = max(uLightDir.y, 0.0);
  vec3 lit = uLightColor * (max(dot(N, uLightDir), 0.0) * 0.2 + 0.09 * sunUp) + uSkyColor * 0.4 * wAmbI();
  vec3 back = uLightColor * pow(max(dot(-V, uLightDir), 0.0), 4.0) * 0.35;  // sun shining through
  vec3 waterCol = vec3(0.05, 0.19, 0.2) * lit + wSky(reflect(-V, N)) * mix(wFresnel(max(dot(N, V), 0.0)), 1.0, 0.12);
  waterCol += uLightColor * sunUp * 0.25 * pow(n3, 6.0) * tongue;
  vec3 foamCol = vec3(0.8, 0.87, 0.93) * lit * (0.55 + 0.6 * n3 * n2 + 0.25 * n1);
  vec3 col = mix(waterCol, foamCol, foam) + back * (0.35 + 0.4 * (1.0 - foam));
  col += wGlint(N, V, 180.0) * (1.0 - foam) * 0.5;

  // frozen curtain: fluted ice columns, icicle tips instead of the plunge
  float flute = wgNoise(vec2(w * 26.0, u * 1.6)) * 0.65 + wgNoise(vec2(w * 70.0, u * 4.0)) * 0.35;
  vec3 iceCol = mix(vec3(0.55, 0.7, 0.8), vec3(0.88, 0.94, 0.98), flute) * (wDiffuse(N) * 0.8 + wDiffuse(vec3(0.0, 1.0, 0.0)) * 0.35);
  iceCol += wGlint(N, V, 60.0) * 0.6 + back * 0.3;
  float tips = 0.72 + 0.26 * wgNoise(vec2(w * 30.0, 1.7)) - 0.12 * wgNoise(vec2(w * 90.0, 2.9));
  float iceAlpha = (1.0 - smoothstep(tips - 0.02, tips, u)) * (1.0 - smoothstep(0.75, 1.02, abs(w) + (flute - 0.5) * 0.3)) * 0.9;
  col = mix(col, iceCol, fz);
  alpha = mix(alpha, iceAlpha, fz);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(wHazeEmit(col, vec3(1.0 - alpha), vWorld) * alpha, alpha);
}
`;
const PLUNGE_POOL_VERT = `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vWorld = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;
const PLUNGE_POOL_FRAG = `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec2 d = (vUv - 0.5) * 2.0;
  float r = length(d);
  float ang = atan(d.y, d.x);
  float fz = uFallFrozen;
  float clock = uFallClock;
  float ring = wgNoise(vec2(ang * 3.0 + r * 2.0, r * 9.0 - clock * 2.6)) * 0.6 + wgNoise(vec2(ang * 7.0, r * 22.0 - clock * 4.5)) * 0.4;
  float core = smoothstep(0.75, 0.0, r);
  float foam = clamp(core * 0.8 + smoothstep(0.45, 0.8, ring) * (1.0 - r) * 1.3, 0.0, 1.0) * clamp(0.55 + uFlow * 0.35, 0.0, 1.2);
  float bubbles = step(0.72, wgHash(floor(vWorld.xz * 70.0 + floor(clock * 6.0)))) * core;
  foam = clamp(foam + bubbles * 0.4, 0.0, 1.0);
  float alpha = foam * smoothstep(1.0, 0.55, r);
  float sunUp = max(uLightDir.y, 0.0);
  vec3 col = wFoamLight(sunUp);
  // frozen: a snowy ice mound under the curtain
  vec3 iceCol = vec3(0.82, 0.9, 0.96) * wDiffuse(vec3(0.0, 1.0, 0.0));
  float iceA = smoothstep(1.0, 0.6, r + (wgNoise(vWorld.xz * 12.0) - 0.5) * 0.3) * 0.95;
  col = mix(col, iceCol, fz);
  alpha = mix(alpha, iceA, fz);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(wHazeEmit(col, vec3(1.0 - alpha), vWorld) * alpha, alpha);
}
`;
const PREMULTIPLIED_BLENDING = {
  transparent: !0,
  depthWrite: !1,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
};
export class RiverWaterfall {
  constructor(t, e, i) {
    this.ctx = t;
    const s = (f, u, d = {}, p = {}) =>
        new THREE.ShaderMaterial({
          uniforms: {
            ...t.uniforms,
            ...e,
            ...d,
          },
          vertexShader: t.GLSL_COMMON + WATER_COMMON_GLSL + f,
          fragmentShader: t.GLSL_COMMON + WATER_COMMON_GLSL + u,
          defines: p,
          ...PREMULTIPLIED_BLENDING,
        }),
      { geo: n, poolS: o, lipS: a } = this._buildRibbon();
    ((this.ribbon = new THREE.Mesh(
      n,
      s(
        RIVER_VERT,
        RIVER_FRAG,
        {
          uPoolS: {
            value: o,
          },
          uLipS: {
            value: a,
          },
        },
        waterShadowDefines(t),
      ),
    )),
      (this.ribbon.renderOrder = 1.04),
      (this.ribbon.name = "water:river"),
      (this.lip = riverPointAtSegment(WATERFALL_LIP_SEG)),
      (this.pool = riverPointAtSegment(WATERFALL_POOL_SEG)),
      (this.fallGeo = this._buildFall()));
    const l = s(WATERFALL_VERT, WATERFALL_FRAG, {
      uAcross: {
        value: this._across(),
      },
    });
    ((l.side = THREE.DoubleSide),
      (this.fall = new THREE.Mesh(this.fallGeo, l)),
      (this.fall.renderOrder = 1.05),
      (this.fall.name = "water:waterfall"));
    const c = 0.36,
      h = new THREE.CircleGeometry(c, 40);
    (h.rotateX(-Math.PI / 2),
      h.translate(this.pool.x, this.pool.y + 0.006, this.pool.z),
      (this.poolMesh = new THREE.Mesh(
        h,
        s(PLUNGE_POOL_VERT, PLUNGE_POOL_FRAG),
      )),
      (this.poolMesh.renderOrder = 1.051),
      (this.poolMesh.name = "water:plunge-pool"),
      (this.icicles = this._buildIcicles()));
    for (const f of [this.ribbon, this.fall, this.poolMesh, this.icicles])
      ((f.frustumCulled = !1), (f.matrixAutoUpdate = !1), i.add(f));
    this.frost = 0;
  }
  _buildRibbon() {
    const t = RIVER_PATH2,
      e = t.length,
      i = new Float32Array(e),
      s = new Float32Array(e),
      n = new Float32Array(e),
      o = new Float32Array(e);
    for (let S = 0; S < e; S++) {
      const E = t[Math.max(0, S - 1)],
        T = t[Math.min(e - 1, S + 1)],
        R = T.x - E.x,
        z = T.z - E.z,
        L = Math.hypot(R, z) || 1;
      ((i[S] = R / L), (s[S] = z / L), (n[S] = Math.max(0, (E.y - T.y) / L)));
    }
    const a = Float32Array.from(n);
    for (let S = 0; S < e; S++) {
      let E = 0,
        T = 0;
      for (let R = -3; R <= 3; R++) {
        const z = S + R;
        z >= 0 && z < e && ((E += n[z]), T++);
      }
      a[S] = E / T;
    }
    for (let S = 1; S < e; S++) {
      const E = t[S].s - t[S - 1].s;
      o[S] = o[S - 1] + E / (0.2 + Math.min(a[S], 1.2) * 2);
    }
    const l = new Float32Array(e),
      c = new Float32Array(e);
    for (let S = 0; S < e; S++) {
      const E = t[S],
        T = riverHalfWidth2(E.t) * 1.9 + 0.05,
        R = -s[S],
        z = i[S];
      for (const L of [1, -1]) {
        let k = T;
        for (let U = 0.02; U < T; U += 0.01)
          if (terrainHeight2(E.x + R * U * L, E.z + z * U * L) >= E.y + 0.004) {
            k = Math.min(T, U + 0.035);
            break;
          }
        (L > 0 ? l : c)[S] = k;
      }
    }
    const h = (S) => {
        const E = Float32Array.from(S);
        for (let T = 0; T < e; T++) {
          let R = 0,
            z = 0;
          for (let L = -4; L <= 4; L++) {
            const k = T + L;
            k >= 0 && k < e && ((R += S[k]), z++);
          }
          E[T] = R / z;
        }
        return E;
      },
      f = h(l),
      u = h(c),
      d = 9,
      p = [],
      v = [],
      g = [],
      x = [],
      m = [];
    let w = 0;
    const y = [
      [0, -1],
      [-1, e - 1],
    ];
    let _ = 0,
      M = 0;
    for (let S = 0; S < e; S++)
      (t[S].seg <= WATERFALL_LIP_SEG + 0.02 && (_ = S),
        !M && t[S].seg >= WATERFALL_POOL_SEG - 0.02 && (M = S));
    ((y[0][1] = _), (y[1][0] = M), (w = t[M].s));
    const A = t[_].s;
    for (const [S, E] of y) {
      const T = p.length / 3;
      for (let z = S; z <= E; z++) {
        const L = t[z],
          k = -s[z],
          U = i[z],
          F = lakeEllipse2(L.x, L.z),
          G = Math.min(1, L.s / 0.1);
        for (let B = 0; B < d; B++) {
          const q = (B / (d - 1)) * 2 - 1,
            X = q >= 0 ? f[z] : u[z];
          (p.push(L.x + k * q * X, L.y, L.z + U * q * X),
            v.push(o[z], q, a[z], L.t),
            g.push(X, F, L.s, G),
            x.push(i[z], s[z]));
        }
      }
      const R = E - S + 1;
      for (let z = 0; z < R - 1; z++)
        for (let L = 0; L < d - 1; L++) {
          const k = T + z * d + L,
            U = k + 1,
            F = k + d,
            G = F + 1;
          m.push(k, U, F, U, G, F);
        }
    }
    const b = new THREE.BufferGeometry();
    return (
      b.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)),
      b.setAttribute("aFlow", new THREE.Float32BufferAttribute(v, 4)),
      b.setAttribute("aSide", new THREE.Float32BufferAttribute(g, 4)),
      b.setAttribute("aDir", new THREE.Float32BufferAttribute(x, 2)),
      b.setIndex(m),
      {
        geo: b,
        poolS: w,
        lipS: A,
      }
    );
  }
  _across() {
    const t = this.pool.x - this.lip.x,
      e = this.pool.z - this.lip.z,
      i = Math.hypot(t, e);
    return new THREE.Vector2(-e / i, t / i);
  }
  _buildFall() {
    const t = this.lip,
      e = this.pool,
      i = e.x - t.x,
      s = e.z - t.z,
      n = Math.hypot(i, s),
      o = i / n,
      a = s / n,
      l = -a,
      c = o,
      h = t.y - e.y,
      f = 32,
      u = 10,
      d = [],
      p = [],
      v = [],
      g = [];
    for (let m = 0; m <= f; m++) {
      const w = m / f,
        y = t.y + 0.004 - h * w * w,
        _ = 0.1 + 0.05 * w,
        M = o * n,
        A = a * n,
        b = -2 * h * w;
      let S = -c * b,
        E = c * M - l * A,
        T = l * b;
      S * o + T * a < 0 && ((S = -S), (E = -E), (T = -T));
      const R = Math.hypot(S, E, T) || 1;
      for (let z = 0; z <= u; z++) {
        const L = (z / u) * 2 - 1,
          k = 0.018 * (1 - L * L) * Math.sin(Math.PI * Math.min(1, w * 1.3));
        (d.push(
          t.x + o * n * w + l * _ * L + (S / R) * k,
          y + (E / R) * k,
          t.z + a * n * w + c * _ * L + (T / R) * k,
        ),
          p.push(w, L),
          v.push(S / R, E / R, T / R));
      }
    }
    for (let m = 0; m < f; m++)
      for (let w = 0; w < u; w++) {
        const y = m * (u + 1) + w,
          _ = y + 1,
          M = y + u + 1,
          A = M + 1;
        g.push(y, M, _, _, M, A);
      }
    const x = new THREE.BufferGeometry();
    return (
      x.setAttribute("position", new THREE.Float32BufferAttribute(d, 3)),
      x.setAttribute("uv", new THREE.Float32BufferAttribute(p, 2)),
      x.setAttribute("normal", new THREE.Float32BufferAttribute(v, 3)),
      x.setIndex(g),
      x
    );
  }
  _buildIcicles() {
    const t = new THREE.ConeGeometry(0.011, 1, 6, 1, !1);
    (t.rotateX(Math.PI), t.translate(0, -0.5, 0));
    const e = new THREE.MeshStandardMaterial({
        color: 14085367,
        roughness: 0.12,
        metalness: 0,
        transparent: !0,
        opacity: 0.82,
        emissive: 1451052,
      }),
      i = this.lip,
      s = this.pool,
      n = s.x - i.x,
      o = s.z - i.z,
      a = Math.hypot(n, o),
      l = n / a,
      c = o / a,
      h = -c,
      f = l,
      u = createWaterRandom(99),
      d = [];
    for (let w = 0; w < 16; w++) {
      const y = (w / 15) * 2 - 1;
      d.push({
        u: 0.02 + u() * 0.04,
        w: y * 1.25,
        len: 0.08 + u() * 0.28 * (1 - Math.abs(y) * 0.5),
      });
    }
    for (let w = 0; w < 10; w++) {
      const y = w % 2 ? 1 : -1;
      d.push({
        u: 0.1 + u() * 0.45,
        w: y * (1.35 + u() * 0.5),
        len: 0.05 + u() * 0.15,
      });
    }
    const p = new THREE.InstancedMesh(t, e, d.length),
      v = new THREE.Matrix4(),
      g = new THREE.Quaternion(),
      x = new THREE.Vector3(),
      m = new THREE.Vector3();
    return (
      (this._icicleBase = []),
      d.forEach((w, y) => {
        const _ = i.y - s.y,
          M = 0.1 + 0.05 * w.u,
          A = i.x + l * a * w.u + h * M * w.w - l * 0.03,
          b = i.z + c * a * w.u + f * M * w.w - c * 0.03,
          S = Math.max(i.y + 0.01 - _ * w.u * w.u, terrainHeight2(A, b) + 0.02);
        (g.setFromAxisAngle(
          new THREE.Vector3(u() - 0.5, 0, u() - 0.5).normalize(),
          (u() - 0.5) * 0.25,
        ),
          m.set(A, S, b),
          x.set(0.7 + u() * 0.8, w.len, 0.7 + u() * 0.8),
          this._icicleBase.push({
            p: m.clone(),
            q: g.clone(),
            s: x.clone(),
            delay: u() * 0.35,
          }),
          v.compose(m, g, x),
          p.setMatrixAt(y, v));
      }),
      (p.renderOrder = 1.06),
      (p.name = "water:icicles"),
      (p.visible = !1),
      (p.castShadow = !1),
      p
    );
  }
  update(t, e) {
    const i = e;
    this.frost +=
      (i - this.frost) * Math.min(1, t * (i > this.frost ? 0.25 : 0.4));
    const s = this.frost > 0.02;
    ((this.icicles.visible = s),
      s &&
        (this._icicleBase.forEach((n, o) => {
          const a = Math.max(
            0,
            Math.min(1, (this.frost - n.delay) / (1 - n.delay)),
          );
          (icicleScale.set(
            n.s.x * (0.4 + 0.6 * a),
            Math.max(1e-4, n.s.y * a * a),
            n.s.z * (0.4 + 0.6 * a),
          ),
            icicleMatrix.compose(n.p, n.q, icicleScale),
            this.icicles.setMatrixAt(o, icicleMatrix));
        }),
        (this.icicles.instanceMatrix.needsUpdate = !0)));
  }
  get meshes() {
    return [this.ribbon, this.fall, this.poolMesh, this.icicles];
  }
}
function riverPointAtSegment(r) {
  const t = RIVER_PATH2;
  for (let i = 0; i < t.length - 1; i++)
    if (t[i + 1].seg >= r) {
      const s = (r - t[i].seg) / Math.max(1e-6, t[i + 1].seg - t[i].seg);
      return {
        x: t[i].x + (t[i + 1].x - t[i].x) * s,
        y: t[i].y + (t[i + 1].y - t[i].y) * s,
        z: t[i].z + (t[i + 1].z - t[i].z) * s,
        t: t[i].t,
      };
    }
  const e = t[t.length - 1];
  return {
    x: e.x,
    y: e.y,
    z: e.z,
    t: 1,
  };
}
