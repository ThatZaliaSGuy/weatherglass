/**
 * Lake surface and front glass cross-section meshes with multiply/additive absorb-emit shader pairs (waves, foam, ice, cracks, light shafts).
 */
import * as THREE from "three";
import { BOX } from "../core/config.js";
import {
  lakeEllipse2,
  riverHalfWidth2,
  riverQuery2,
  terrainHeight2,
} from "../world/terrainShape.js";
import {
  FRONT_GLASS_Z,
  MAX_WATER_LEVEL,
  RIPPLE_BOX,
  WATER_COMMON_GLSL,
  waterShadowDefines,
} from "./waterCommon.js";
const LAKE_SURFACE_VERT = `
attribute vec3 aInfo;      // x = river surface y (raw), y = inside-channel weight, z = lake ellipse
varying vec3 vWorld;
varying vec3 vInfo;
void main() {
  vec3 p = position;
  float rough; vec2 dir;
  vec3 wv = wWaves(p.xz, uTime, rough, dir);
  float depth = uWaterLevel - groundHeightAt(p.xz);
  float k = smoothstep(0.0, 0.08, depth) * (1.0 - wIceMask(p.xz, depth));
  // Troughs only, and the open water rests ~1 mm low: floating leaves (+0.5–3.5 mm) and lily
  // pads (+2–4 mm) must stay above the surface, or the absorption pass veils them with the
  // whole lake depth and they read as dark speckles. (Normals still carry every crest.)
  float disp = (wv.x * W_WAVE_H + wRippleH(p.xz) * W_RIPPLE_H) * k;
  p.y = uWaterLevel + min(disp, 0.0) - 0.0008 * k;
  vWorld = p;
  vInfo = aInfo;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;
const LAKE_SURFACE_FRAG = `
varying vec3 vWorld;
varying vec3 vInfo;

// radial crack stars where the frozen lake was knocked
float wImpactCracks(vec2 p) {
  float c = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 im = uImpacts[i];
    float age = uTime - im.z;
    if (age < 0.0 || age > 14.0) continue;
    vec2 d = p - im.xy;
    float r = length(d);
    float R = (0.12 + 0.2 * im.w) * smoothstep(0.0, 0.18, age);
    if (r > R) continue;
    float a = atan(d.y, d.x);
    float h = wgHash(im.xy * 13.1);
    float rays = pow(abs(sin(a * (3.0 + floor(h * 3.0)) + h * 6.0 + r * 9.0 * (h - 0.5))), 60.0);
    float ring = smoothstep(0.012, 0.0, abs(r - R * (0.35 + 0.2 * h)));
    c += (rays + ring * 0.6) * smoothstep(R, R * 0.4, r) * smoothstep(14.0, 8.0, age);
  }
  return wSat(c);
}

// snow brushed off around recent knocks, so the crack star shows
float wImpactClear(vec2 p) {
  float c = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 im = uImpacts[i];
    float age = uTime - im.z;
    if (age < 0.0 || age > 20.0) continue;
    float R = 0.1 + 0.16 * im.w;
    c = max(c, smoothstep(R, R * 0.35, length(p - im.xy)) * smoothstep(20.0, 12.0, age));
  }
  return c;
}

void main() {
  vec2 p = vWorld.xz;
  vec2 fw = fwidth(p);   // before any discard (derivatives need the whole quad)
  float ground = groundHeightAt(p);
  float depth = uWaterLevel - ground;
  if (depth < -0.012) discard;
  // a river surface above the lake owns this spot (flooded channel upstream of the mouth)
  float ye = max(uWaterLevel, mix(vInfo.x, uWaterLevel, smoothstep(1.35, 0.98, vInfo.z)));
  float riverOwn = vInfo.y * smoothstep(uWaterLevel + 0.004, uWaterLevel + 0.02, ye);
  if (riverOwn > 0.995) discard;
  float vis = 1.0 - riverOwn;

  vec3 toCam = cameraPosition - vWorld;
  vec3 V = normalize(toCam);
  float rough; vec2 dir;
  vec3 wv = wWaves(p, uTime, rough, dir);
  vec4 gnd = groundAt(p);
  float ice = wIceMask(p, depth);
  float shore = smoothstep(-0.005, 0.07, depth);

  vec2 grad = wv.yz * (0.3 + 0.7 * shore);
  grad += wRippleGrad(p);
  vec3 rain = vec3(0.0);
  // pixel footprint in world units: normal detail finer than a pixel is faded (it aliased into
  // dark/bright speckles at grazing angles) and its slope variance widens the glint instead
  float fp = max(fw.x, fw.y);
  vec2 gradLo = grad;
#ifndef W_MUL
  grad += wChop(p, uTime, dir, rough, fp) * shore;
  rain = wRainRings(p, uTime, gnd.z * (1.0 - ice), fp);
  grad += rain.xy;
#endif
  grad *= 1.0 - ice;
  gradLo *= 1.0 - ice;
  vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
  // grazing views: keep the shading normal facing the eye (no fresnel blow-out to black)
  float nvRaw = dot(N, V);
  if (nvRaw < 0.02) { N = normalize(N + V * (0.02 - nvRaw)); }
  float F = wFresnel(wSat(dot(N, V)));

  // refraction path down to the bed
  vec3 Rr = refract(-V, N, 0.75);
  float path = max(depth, 0.0) / max(-Rr.y, 0.18);
  vec3 sigma = wSigma();
  vec3 T = exp(-sigma * path);

  // shoreline: a thin lapping foam line that breathes in and out, brighter when it's windy
  float lapPos = 0.011 + 0.008 * sin(uTime * 1.15 + wgNoise(p * 2.7) * 6.28);
  float lace = smoothstep(0.28, 0.72, wgNoise(p * 34.0 + vec2(uTime * 0.25, -uTime * 0.1)));
  float foam = smoothstep(0.011, 0.0, abs(depth - lapPos)) * lace;
  foam += smoothstep(0.007, 0.0, depth) * (0.35 + 0.4 * lace);
  foam *= 0.5 + 0.5 * smoothstep(0.1, 1.4, rough);
  // whitecaps in strong gusts / storms
  foam += smoothstep(1.5, 2.6, rough) * smoothstep(0.64, 0.92, wgNoise(p * 8.5 - dir * uTime * 1.5)) * 0.55;
  foam = wSat(foam) * (1.0 - ice);

  // ---- ice (only evaluated where there is some)
  float thick = 0.0, snow = 0.0, cracks = 0.0, bubbles = 0.0;
  vec3 Ni = vec3(0.0, 1.0, 0.0);
  vec3 iceTrans = vec3(1.0);
  if (ice > 0.001) {
    thick = wSat(uIce * 1.7 - wSat(depth / 0.9) * 0.9);
    // snow lies in wind-sculpted drifts; swept patches show the dark ice and its cracks
    float drift = wgNoise(p * 1.4 + 2.0) * 0.6 + wgNoise(p * 4.1 - 1.0) * 0.3 + wgNoise(p * 13.0) * 0.1;
    snow = smoothstep(0.35, 0.6, drift + smoothstep(0.03, 0.8, gnd.x) * 0.45 - 0.3) * smoothstep(0.02, 0.2, gnd.x) * ice;
    snow *= 1.0 - wImpactClear(p);
#ifndef W_MUL
    vec2 cp = p + 0.04 * vec2(wgNoise(p * 7.0), wgNoise(p * 7.0 + 4.0));
    cracks = (1.0 - smoothstep(0.0, 0.03, wCell(cp * 2.2, 0.0))) * 0.8
           + (1.0 - smoothstep(0.0, 0.045, wCell(cp * 6.3 + 7.7, 0.0))) * 0.35;
    cracks = wSat(cracks + wImpactCracks(p));
    vec2 bq = p * 46.0;
    vec2 bid = floor(bq);
    float bh = wgHash(bid);
    vec2 bo = 0.25 + 0.5 * vec2(wgHash(bid + 3.1), wgHash(bid + 7.7));
    bubbles = step(0.82, bh) * smoothstep(0.2, 0.07, length(fract(bq) - bo) * (0.8 + bh));
    bubbles += step(0.9, wgHash(floor(p * 17.0))) * smoothstep(0.25, 0.1, length(fract(p * 17.0) - 0.5)) * 0.6;
    vec2 ig = vec2(wgNoise(p * 3.0) - 0.5, wgNoise(p * 3.0 + 9.0) - 0.5) * 0.06;
    Ni = normalize(vec3(ig.x, 1.0, ig.y));
#endif
    iceTrans = vec3(0.3, 0.42, 0.46) * (1.0 - thick * 0.55) * (1.0 - cracks * 0.5) * (1.0 - snow);
  }

#ifdef W_MUL
  vec3 trans = T * (1.0 - F);
  trans *= 1.0 - foam * 0.8;
  trans = mix(trans, iceTrans, ice);
  gl_FragColor = vec4(mix(vec3(1.0), trans, vis), 1.0);
#else
  vec3 sp = vec3(vWorld.x, uWaterLevel, vWorld.z);
  // key-light visibility: at the surface for glints / foam; for the sunlit in-scatter averaged
  // down the refracted view path (light shafts through the water: a thin rail shadow only nicks
  // it, a tree or a hill really shades it), never below 30 % (multiple scattering)
  float cloudVis = cloudShadowAt(sp);
  float shSurf = wKeyShadow(sp);
  float sunVis = shSurf * cloudVis;
  float pathS = min(path, 0.6);
  float shVol = 0.4 * shSurf + 0.3 * wKeyShadow1(sp + Rr * (pathS * 0.3)) + 0.3 * wKeyShadow1(sp + Rr * pathS);
  float sunUp = max(uLightDir.y, 0.0);
  vec3 amb = wAmbient(mix(0.3, 1.0, shVol) * cloudVis);
  vec3 inscat = wAlbedo() * amb * (1.0 - T);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  // mirror distortion from the resolved (low-frequency) slopes only: chop / rain rings jitter
  // the lookup per pixel and sprinkled the reflection with dark speckles
  vec2 dist = gradLo * 0.1 + (grad - gradLo) * 0.025;
  vec3 refl = wReflect(R, sp, dist);
  // glint lobe: resolved roughness + the slope variance the pixel could not resolve
  float sharp = mix(2200.0, 320.0, wSat(rough * 0.45));
  float m2 = 2.0 / (sharp + 2.0) + wChopLostVar(rough, fp) + 0.0012 * wDusk();
  sharp = 2.0 / m2 - 2.0;
  vec3 glint = wGlint(N, V, sharp) * sunVis;
  float glitFade = 1.0 - smoothstep(0.02, 0.06, fp);
  vec3 emitW = inscat * (1.0 - F) + refl * F + glint + wGlitter(p, N, V, dir, rough, glitFade) * sunVis;
  emitW += wSky(vec3(0.0, 1.0, 0.0)) * rain.z * 0.07;   // ring crests catch the light
  vec3 foamCol = wFoamLight(sunUp * sunVis);
  emitW = mix(emitW, foamCol, foam * 0.85);

  // ice: frosted pale blue-white, dark cracks with bright edges, trapped bubbles, snow on top
  if (ice > 0.001) {
    vec3 iceAlb = mix(vec3(0.3, 0.46, 0.55), vec3(0.66, 0.8, 0.9), thick);
    iceAlb = mix(iceAlb, vec3(0.12, 0.24, 0.3), cracks * 0.6) + bubbles * 0.22;
    vec3 iceCol = iceAlb * wDiffuse(Ni, sunVis);
    float Fi = wFresnel(max(dot(Ni, V), 0.0));
    iceCol += wSky(reflect(-V, Ni)) * Fi * 0.6 + wGlint(Ni, V, 90.0) * 0.35 * sunVis;
    float sparkle = step(0.985, wgHash(floor(p * 160.0))) * pow(max(dot(normalize(uLightDir + V), vec3(0.0, 1.0, 0.0)), 0.0), 30.0) * glitFade;
    vec3 snowCol = vec3(0.9, 0.93, 0.98) * wDiffuse(vec3(0.0, 1.0, 0.0), sunVis) + uLightColor * sparkle * 0.8 * sunVis;
    iceCol = mix(iceCol, snowCol, snow * (0.75 + 0.25 * wgNoise(p * 9.0)));
    emitW = mix(emitW, iceCol, ice);
  }
  vec3 transAll = mix(T * (1.0 - F) * (1.0 - foam * 0.8), iceTrans, ice);
  vec3 emit = min(wHazeEmit(emitW, transAll, vWorld), vec3(64.0));
  gl_FragColor = vec4(emit * vis, 1.0);
#endif
}
`;
const LAKE_SECTION_VERT = `
attribute float aTop;
attribute float aBed;
varying vec3 vWorld;
varying float vTop;
varying float vBed;
void main() {
  vec3 p = position;
  float rough; vec2 dir;
  vec3 wv = wWaves(p.xz, uTime, rough, dir);
  float d = uWaterLevel - aBed;
  float k = smoothstep(0.0, 0.08, d) * (1.0 - wIceMask(p.xz, d));
  float top = uWaterLevel + (wv.x * W_WAVE_H + wRippleH(p.xz) * W_RIPPLE_H) * k;
  top = max(top, aBed);
  p.y = mix(aBed, top, aTop);
  vWorld = p;
  vTop = top;
  vBed = aBed;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;
const LAKE_SECTION_FRAG = `
varying vec3 vWorld;
varying float vTop;
varying float vBed;
void main() {
  vec3 P = vWorld;
  float below = vTop - P.y;
  if (below < 0.0 || vTop - vBed < 0.002) discard;
  vec3 D = normalize(P - cameraPosition);
  vec3 Dw = refract(D, vec3(0.0, 0.0, 1.0), 0.75);
  vec3 sigma = wSigma();
  vec3 Lr = wLightRefracted();
  float lrY = max(-Lr.y, 0.25);
  float depthHere = uWaterLevel - groundHeightAt(P.xz);
  float ice = wIceMask(P.xz, max(depthHere, 0.0));
  float iceTh = ice * (0.01 + 0.045 * wSat(uIce * 1.4 - 0.25));
  float sigL = sigma.g + 0.25;

  // march the view ray through the water body: path length (+ light shafts in the colour pass)
  vec3 q = P;
  float travel = 0.0, shaft = 0.0;
  float sl = 0.06;
  float a0 = q.y - groundHeightAt(q.xz);
  for (int i = 0; i < W_STEPS; i++) {
    vec3 nq = q + Dw * sl;
    float a1 = nq.y - groundHeightAt(nq.xz);
    if (a1 < 0.0) {
      float f = a0 / max(a0 - a1, 1e-4);
      travel += sl * f;
      break;
    }
    q = nq;
    travel += sl;
    a0 = a1;
#ifndef W_MUL
    float dz = max(uWaterLevel - q.y, 0.0);
    vec2 s = q.xz - Lr.xz * (dz / lrY);   // where this light entered the surface
    shaft += wShaftPattern(s * 1.5, uTime) * exp(-sigL * (dz / lrY + travel)) * sl;
#endif
    sl *= 1.2;
  }
  vec3 T = exp(-sigma * travel);
  float sunUp = max(uLightDir.y, 0.0);
  float sunVis = cloudShadowAt(vec3(P.x, uWaterLevel, P.z));
  vec3 amb = wAmbient(sunVis);
  float veil = 1.0 - ice * 0.75; // ice + snow on top dim the light below

  // meniscus: a bright sliver where the surface meets the glass, soft shadow band beneath
  float men = smoothstep(0.007, 0.0, below);
  float menDark = smoothstep(0.004, 0.012, below) * smoothstep(0.035, 0.012, below);
  // total internal reflection just below the surface reads as a silvery band
  float tir = smoothstep(0.08, 0.0, below) * (1.0 - men);

#ifdef W_MUL
  vec3 trans = T * (1.0 - menDark * 0.35) * (1.0 - men * 0.5);
  float inIce = step(below, iceTh);
  trans = mix(trans, vec3(0.28, 0.36, 0.4), inIce);
  gl_FragColor = vec4(trans, 1.0);
#else
  vec3 inscat = wAlbedo() * amb * (1.0 - T) * (0.22 + 0.78 * exp(-2.4 * below)) * veil;
  vec3 rays = uLightColor * sunUp * shaft * vec3(0.22, 0.5, 0.46) * 1.7 * veil * sunVis * (1.0 - 0.7 * uNight);

  // suspended motes on three parallax layers, catching the shafts
  float motes = 0.0;
  for (int m = 0; m < 3; m++) {
    float fm = float(m);
    float dd = 0.05 + fm * 0.17;
    vec3 mp = P + Dw * (dd / max(-Dw.z, 0.25));
    mp.x += sin(uTime * 0.11 + fm * 2.1) * 0.05;
    mp.y += uTime * (0.006 + fm * 0.003);
    vec2 cell = mp.xy * (30.0 - fm * 7.0) + fm * 17.3;
    vec2 id = floor(cell);
    float h = wgHash(id);
    vec2 o = 0.2 + 0.6 * vec2(wgHash(id + 5.3), wgHash(id + 9.1));
    float tw = 0.55 + 0.45 * sin(uTime * (0.8 + h) + h * 40.0);
    motes += step(0.86, h) * smoothstep(0.14, 0.0, length(fract(cell) - o)) * tw * (1.0 - fm * 0.25);
  }
  motes *= step(0.012, below);
  vec3 moteCol = (amb * 0.35 + uLightColor * sunUp * sunVis * (1.0 - 0.7 * uNight) * 0.5 * (0.3 + shaft * 3.0)) * motes * 0.6 * exp(-0.8 * below);

  vec3 emitW = inscat + rays + moteCol;
  vec3 surfCol = wSky(vec3(0.0, 1.0, 0.0)) * 0.55 + uLightColor * sunUp * 0.4;
  emitW += surfCol * (men * 0.9 + tir * 0.12) * veil;
  // ice band at the top: milky, bubbly, with snow on its upper edge
  float inIce = step(below, iceTh);
  vec2 bq = vec2(P.x * 60.0, below * 60.0);
  float bub = step(0.8, wgHash(floor(bq))) * smoothstep(0.35, 0.12, length(fract(bq) - 0.5));
  vec3 iceCol = vec3(0.6, 0.74, 0.84) * wDiffuse(vec3(0.0, 0.3, 0.95)) * (0.75 + 0.25 * wgNoise(vec2(P.x * 30.0, below * 200.0))) + bub * 0.12;
  float snowTop = smoothstep(0.03, 0.3, groundAt(P.xz).x) * ice;
  iceCol = mix(iceCol, vec3(0.9, 0.93, 0.98) * wDiffuse(vec3(0.0, 0.7, 0.7)), snowTop * smoothstep(iceTh * 0.6, 0.0, below));
  emitW = mix(emitW, iceCol, inIce);
  vec3 transAll = mix(T, vec3(0.28, 0.36, 0.4), inIce);
  gl_FragColor = vec4(wHazeEmit(emitW, transAll, P), 1.0);
#endif
}
`;
const MULTIPLY_BLENDING = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.ZeroFactor,
  blendDst: THREE.SrcColorFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
};
const ADDITIVE_BLENDING = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
};
function createAbsorbEmitMaterials(r, t, e, i, s, n = {}) {
  const o = {
      uniforms: {
        ...r.uniforms,
        ...t,
      },
      vertexShader: r.GLSL_COMMON + WATER_COMMON_GLSL + e,
      fragmentShader: r.GLSL_COMMON + WATER_COMMON_GLSL + i,
      transparent: !0,
      depthWrite: !1,
      depthTest: !0,
      side: THREE.FrontSide,
    },
    a = new THREE.ShaderMaterial({
      ...o,
      ...MULTIPLY_BLENDING,
      defines: {
        ...s,
        W_MUL: 1,
      },
    }),
    l = new THREE.ShaderMaterial({
      ...o,
      ...ADDITIVE_BLENDING,
      defines: {
        ...s,
        ...n,
      },
    });
  return {
    mul: a,
    add: l,
  };
}
export class LakeSurface {
  constructor(t, e, i) {
    this.ctx = t;
    const n = {
      W_Q: t.quality.tier,
      W_STEPS: t.quality.pick(8, 11, 14),
    };
    this.surfaceGeo = this._buildSurface(t.quality.pick(0.07, 0.05, 0.04));
    const o = createAbsorbEmitMaterials(
      t,
      e,
      LAKE_SURFACE_VERT,
      LAKE_SURFACE_FRAG,
      n,
      waterShadowDefines(t),
    );
    ((this.lakeMul = new THREE.Mesh(this.surfaceGeo, o.mul)),
      (this.lakeAdd = new THREE.Mesh(this.surfaceGeo, o.add)),
      (this.lakeMul.renderOrder = 1.03),
      (this.lakeAdd.renderOrder = 1.031),
      (this.lakeMul.name = "water:lake-absorb"),
      (this.lakeAdd.name = "water:lake"),
      (this.frontGeo = this._buildFront()));
    const a = createAbsorbEmitMaterials(
      t,
      e,
      LAKE_SECTION_VERT,
      LAKE_SECTION_FRAG,
      n,
    );
    ((this.frontMul = new THREE.Mesh(this.frontGeo, a.mul)),
      (this.frontAdd = new THREE.Mesh(this.frontGeo, a.add)),
      (this.frontMul.renderOrder = 1),
      (this.frontAdd.renderOrder = 1.001),
      (this.frontMul.name = "water:section-absorb"),
      (this.frontAdd.name = "water:section"));
    for (const l of [this.lakeMul, this.lakeAdd, this.frontMul, this.frontAdd])
      ((l.frustumCulled = !1), (l.matrixAutoUpdate = !1), i.add(l));
  }
  _buildSurface(t) {
    const { minX: e, maxX: i, minZ: s, maxZ: n } = RIPPLE_BOX,
      o = Math.ceil((i - e) / t) + 1,
      a = Math.ceil((n - s) / t) + 1,
      l = this.ctx.terrain,
      c = new Float32Array(o * a * 3),
      h = new Float32Array(o * a * 3),
      f = new Float32Array(o * a),
      u = {};
    for (let g = 0; g < a; g++) {
      const x = Math.min(n, s + g * t);
      for (let m = 0; m < o; m++) {
        const w = Math.min(i, e + m * t),
          y = g * o + m;
        ((c[y * 3] = w),
          (c[y * 3 + 1] = 0),
          (c[y * 3 + 2] = x),
          (f[y] = l.height(w, x)));
        let _ = -10,
          M = 0;
        if (riverQuery2(w, x, u)) {
          const A = riverHalfWidth2(u.t);
          ((M =
            1 - THREE.MathUtils.smoothstep(u.dist, A * 1.5, A * 2.1 + 0.08)),
            M > 0 && (_ = u.y));
        }
        ((h[y * 3] = _),
          (h[y * 3 + 1] = M),
          (h[y * 3 + 2] = lakeEllipse2(w, x)));
      }
    }
    const d = [],
      p = MAX_WATER_LEVEL + 0.035;
    for (let g = 0; g < a - 1; g++)
      for (let x = 0; x < o - 1; x++) {
        const m = g * o + x,
          w = m + 1,
          y = m + o,
          _ = y + 1;
        Math.min(f[m], f[w], f[y], f[_]) > p || d.push(m, y, w, w, y, _);
      }
    const v = new THREE.BufferGeometry();
    return (
      v.setAttribute("position", new THREE.BufferAttribute(c, 3)),
      v.setAttribute("aInfo", new THREE.BufferAttribute(h, 3)),
      v.setIndex(d),
      v
    );
  }
  _buildFront() {
    const e = [];
    for (let h = RIPPLE_BOX.minX; h <= RIPPLE_BOX.maxX + 1e-6; h += 0.02) {
      const f = terrainHeight2(h, FRONT_GLASS_Z);
      e.push({
        x: h,
        bed: f,
        wet: f < MAX_WATER_LEVEL + 0.02 && Math.abs(h) < BOX.halfW,
      });
    }
    const i = e.map((h, f) => h.wet || e[f - 1]?.wet || e[f + 1]?.wet),
      s = [],
      n = [],
      o = [],
      a = [];
    let l = -1;
    for (let h = 0; h < e.length; h++) {
      if (!i[h]) {
        l = -1;
        continue;
      }
      const f = e[h],
        u = s.length / 3;
      (s.push(f.x, 0, FRONT_GLASS_Z, f.x, 0, FRONT_GLASS_Z),
        n.push(0, 1),
        o.push(f.bed, f.bed),
        l >= 0 && a.push(l, u, l + 1, l + 1, u, u + 1),
        (l = u));
    }
    const c = new THREE.BufferGeometry();
    return (
      c.setAttribute("position", new THREE.Float32BufferAttribute(s, 3)),
      c.setAttribute("aTop", new THREE.Float32BufferAttribute(n, 1)),
      c.setAttribute("aBed", new THREE.Float32BufferAttribute(o, 1)),
      c.setIndex(a),
      c
    );
  }
  get meshes() {
    return [this.lakeMul, this.lakeAdd, this.frontMul, this.frontAdd];
  }
}
