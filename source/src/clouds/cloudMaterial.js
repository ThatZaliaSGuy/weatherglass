/**
 * Builds the tileable Perlin-Worley 3D cloud noise texture and the raymarched metaball cloud ShaderMaterial (multiple scattering, storm darkening, internal lightning glow).
 */
import * as THREE from "three";
import { mulberry32 } from "../util/noise.js";
const clamp01CloudNoise = (r) => (r < 0 ? 0 : r > 1 ? 1 : r);
const remapRange = (r, t, e, i, s) => i + ((r - t) / (e - t)) * (s - i);
function randomFeaturePoints(r, t) {
  const e = new Float32Array(r * r * r * 3);
  for (let i = 0; i < e.length; i++) e[i] = t();
  return e;
}
function tileableWorleyAt(r, t, e, i, s) {
  const n = r * i,
    o = t * i,
    a = e * i,
    l = Math.floor(n),
    c = Math.floor(o),
    h = Math.floor(a);
  let f = 9;
  for (let u = -1; u <= 1; u++) {
    const d = h + u,
      p = ((d % i) + i) % i;
    for (let v = -1; v <= 1; v++) {
      const g = c + v,
        x = ((g % i) + i) % i;
      for (let m = -1; m <= 1; m++) {
        const w = l + m,
          y = ((w % i) + i) % i,
          _ = ((p * i + x) * i + y) * 3,
          M = w + s[_] - n,
          A = g + s[_ + 1] - o,
          b = d + s[_ + 2] - a,
          S = M * M + A * A + b * b;
        S < f && (f = S);
      }
    }
  }
  return 1 - clamp01CloudNoise(Math.sqrt(f));
}
function createTileablePerlin3D(r) {
  const t = new Float32Array(768);
  for (let n = 0; n < 256; n++) {
    const o = r() * 2 - 1,
      a = r() * Math.PI * 2,
      l = Math.sqrt(1 - o * o);
    ((t[n * 3] = l * Math.cos(a)),
      (t[n * 3 + 1] = l * Math.sin(a)),
      (t[n * 3 + 2] = o));
  }
  const e = new Uint8Array(512);
  for (let n = 0; n < 256; n++) e[n] = n;
  for (let n = 255; n > 0; n--) {
    const o = Math.floor(r() * (n + 1)),
      a = e[n];
    ((e[n] = e[o]), (e[o] = a));
  }
  for (let n = 0; n < 256; n++) e[n + 256] = e[n];
  const i = (n) => n * n * n * (n * (n * 6 - 15) + 10),
    s = (n, o, a, l, c, h) => {
      const f = e[e[e[n & 255] + (o & 255)] + (a & 255)] * 3;
      return t[f] * l + t[f + 1] * c + t[f + 2] * h;
    };
  return function (o, a, l, c) {
    const h = Math.floor(o),
      f = Math.floor(a),
      u = Math.floor(l),
      d = o - h,
      p = a - f,
      v = l - u,
      g = ((h % c) + c) % c,
      x = (g + 1) % c,
      m = ((f % c) + c) % c,
      w = (m + 1) % c,
      y = ((u % c) + c) % c,
      _ = (y + 1) % c,
      M = i(d),
      A = i(p),
      b = i(v),
      S = s(g, m, y, d, p, v),
      E = s(x, m, y, d - 1, p, v),
      T = s(g, w, y, d, p - 1, v),
      R = s(x, w, y, d - 1, p - 1, v),
      z = s(g, m, _, d, p, v - 1),
      L = s(x, m, _, d - 1, p, v - 1),
      k = s(g, w, _, d, p - 1, v - 1),
      U = s(x, w, _, d - 1, p - 1, v - 1),
      F = S + (E - S) * M,
      G = T + (R - T) * M,
      B = z + (L - z) * M,
      q = k + (U - k) * M,
      X = F + (G - F) * A,
      vt = B + (q - B) * A;
    return (X + (vt - X) * b) * 1.6;
  };
}
export function createCloudNoiseTexture(r = 64, t = 7) {
  const e = mulberry32(t),
    i = createTileablePerlin3D(e),
    s = randomFeaturePoints(4, e),
    n = randomFeaturePoints(8, e),
    o = randomFeaturePoints(16, e),
    a = randomFeaturePoints(32, e),
    l = r * r * r,
    c = new Float32Array(l * 4),
    h = 1 / r;
  let f = 0;
  for (let v = 0; v < r; v++) {
    const g = (v + 0.5) * h;
    for (let x = 0; x < r; x++) {
      const m = (x + 0.5) * h;
      for (let w = 0; w < r; w++) {
        const y = (w + 0.5) * h,
          _ = tileableWorleyAt(y, m, g, 4, s),
          M = tileableWorleyAt(y, m, g, 8, n),
          A = tileableWorleyAt(y, m, g, 16, o),
          b = tileableWorleyAt(y, m, g, 32, a);
        let S = 0,
          E = 0.5,
          T = 4;
        for (let k = 0; k < 3; k++)
          ((S += E * i(y * T, m * T, g * T, T)), (E *= 0.5), (T *= 2));
        const R = clamp01CloudNoise(S * 0.5 + 0.5),
          z = _ * 0.625 + M * 0.25 + A * 0.125,
          L = M * 0.625 + A * 0.25 + b * 0.125;
        ((c[f++] = remapRange(R, 0, 1, z, 1)),
          (c[f++] = z),
          (c[f++] = L),
          (c[f++] = R));
      }
    }
  }
  const u = new Uint8Array(l * 4),
    d = new Uint32Array(1024);
  for (let v = 0; v < 4; v++) {
    d.fill(0);
    for (let _ = v; _ < c.length; _ += 4)
      d[Math.min(1023, Math.max(0, Math.floor(c[_] * 1023)))]++;
    let g = 0,
      x = 1023,
      m = 0;
    for (let _ = 0; _ < 1024; _++)
      if (((m += d[_]), m > l * 0.005)) {
        g = _;
        break;
      }
    m = 0;
    for (let _ = 1023; _ >= 0; _--)
      if (((m += d[_]), m > l * 0.005)) {
        x = _;
        break;
      }
    const w = g / 1023,
      y = 1 / Math.max(0.001, (x - g) / 1023);
    for (let _ = v; _ < c.length; _ += 4)
      u[_] = Math.round(clamp01CloudNoise((c[_] - w) * y) * 255);
  }
  const p = new THREE.Data3DTexture(u, r, r, r);
  return (
    (p.format = THREE.RGBAFormat),
    (p.type = THREE.UnsignedByteType),
    (p.minFilter = THREE.LinearFilter),
    (p.magFilter = THREE.LinearFilter),
    (p.wrapS = p.wrapT = p.wrapR = THREE.RepeatWrapping),
    (p.unpackAlignment = 1),
    (p.generateMipmaps = !1),
    (p.needsUpdate = !0),
    p
  );
}
export const MAX_CLOUD_PUFFS = 20;
const CLOUD_VERTEX_SHADER = `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const CLOUD_FRAGMENT_SHADER = `
precision highp sampler3D;
uniform sampler3D uNoise;
uniform vec4 uPuffs[MAX_PUFFS];   // xyz world centre, w radius
uniform int uPuffCount;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform vec3 uCenter;
uniform vec3 uSeed;
uniform vec4 uShape;   // x base y, y ceiling y, z edge width, w smooth-union k
uniform vec4 uLook;    // x grey (0 white … 1 slate), y storm, z density mul, w hover
uniform vec4 uLook2;   // x fade, y raggedness (rain), z size, w cloud top y
uniform vec4 uGlow;    // xyz internal lightning position, w intensity
uniform float uSteps;
varying vec3 vWorld;

float cloudSmin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

/** Signed distance to the smooth union of the puffs (negative inside). */
float shapeSD(vec3 p) {
  float d = 1e3;
  for (int i = 0; i < MAX_PUFFS; i++) {
    if (i >= uPuffCount) break;
    vec4 s = uPuffs[i];
    d = cloudSmin(d, length(p - s.xyz) - s.w, uShape.w);
  }
  return d;
}

float remap01(float v, float lo, float hi) { return clamp((v - lo) / max(hi - lo, 1e-4), 0.0, 1.0); }

/** 0 at the flat base … 1 at the top of the cloud. */
float heightFrac(float y) { return clamp((y - uShape.x) / max(uLook2.w - uShape.x, 0.2), 0.0, 1.0); }

/** Cloud-local noise coordinate: noise sticks to the cloud and boils slowly upward. */
vec3 noiseCoord(vec3 p) { return (p - uCenter) + uSeed; }

/** Base density (shape + low-frequency erosion). Returns coverage in cov. */
float baseDensity(vec3 p, float sd, vec3 q, out float cov, out vec4 n1) {
  float edge = uShape.z;
  cov = smoothstep(edge, -edge * 1.6, sd);
  n1 = texture(uNoise, q * 0.34 + vec3(0.0, -uTime * 0.012, 0.0));
  float hf = heightFrac(p.y);
  // low-frequency erosion carves the metaball shell into billows
  float erode = mix(0.62, 0.78, hf);
  float d = remap01(cov, (1.0 - n1.r) * erode, 1.0);
  // flat condensation base; ragged + lowered when raining
  float soft = uLook2.z * mix(0.05, 0.3, uLook2.y);
  float baseY = uShape.x + (n1.a - 0.5) * soft * 2.2 * uLook2.y;
  d *= smoothstep(baseY - soft * 0.4, baseY + soft, p.y);
  // tropopause / glass lid: storms spread into a flat anvil (lumpy, not ruler-straight)
  float ceil_ = uShape.y - n1.g * 0.2;
  d *= smoothstep(ceil_, ceil_ - 0.24, p.y);
  return d;
}

/** Full density with high-frequency detail erosion (cauliflower top, wispy bottom). */
float fullDensity(vec3 p, float sd, out float cov) {
  vec3 q = noiseCoord(p);
  vec4 n1;
  float d = baseDensity(p, sd, q, cov, n1);
  if (d <= 0.0) return 0.0;
  float hf = heightFrac(p.y);
  // domain-warped detail, rising a little faster than the base (convective boil)
  vec3 w = (n1.aga - 0.5) * 0.3;
  vec4 n2 = texture(uNoise, q * 0.72 + w + vec3(0.0, -uTime * 0.03, uTime * 0.006));
  float detail = mix(n2.g, n2.b, 0.2);
  float billowy = smoothstep(0.06, 0.4, hf);
  float mod_ = mix(1.0 - detail, detail, billowy);
  d = remap01(d, mod_ * mix(0.5, 0.42, billowy), 1.0);
  // crisp tops, soft bottoms
  d = pow(d, mix(1.05, 0.55, hf));
  return d;
}

/** Cheaper density for the light march (no detail octave). */
float lightDensity(vec3 p) {
  float sd = shapeSD(p);
  if (sd > uShape.z) return 0.0;
  float cov; vec4 n1;
  return baseDensity(p, sd, noiseCoord(p), cov, n1);
}

float hg(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5); // ×4π-normalised (isotropic = 1)
}

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - ro);
  vec3 inv = 1.0 / mix(rd, vec3(1e-6), vec3(lessThan(abs(rd), vec3(1e-6))));
  vec3 t0 = (uBoxMin - ro) * inv, t1 = (uBoxMax - ro) * inv;
  vec3 tmn = min(t0, t1), tmx = max(t0, t1);
  float tN = max(max(max(tmn.x, tmn.y), tmn.z), 0.0);
  float tF = min(min(tmx.x, tmx.y), tmx.z);
  if (tF <= tN) discard;

  float size = uLook2.z;
  float grey = uLook.x;
  float storm = uLook.y;
  float sigma = 20.0 * uLook.z / max(0.6, pow(size, 0.35));
  float edge = uShape.z;

  float chord = tF - tN;
  // coarse steps until the first contact, then back off and refine (crisp, grain-free surfaces)
  // (budget: ~0.8·uSteps coarse strides + a small refinement allowance, see MAX_STEPS)
  float dsC = max(chord / (uSteps * 0.8), 0.02);
  float dsF = max(min(dsC * 0.38, 1.2 / sigma), 0.012); // ≲ 1 optical depth per fine step
  float ds = dsC;
  float jit = ign(gl_FragCoord.xy);
  float t = tN + ds * jit;
  bool fine = false;
  int thin = 0;
  int lightTick = 0;
  float od = 0.0;

  // per-pixel phase: dual-lobe HG (forward silver lining + soft back scatter) per octave
  float cosT = dot(rd, uLightDir);
  float ph0 = mix(hg(cosT, -0.3), hg(cosT, 0.8), 0.5);
  float ph1 = mix(hg(cosT, -0.15), hg(cosT, 0.4), 0.5);
  float ph2 = mix(hg(cosT, -0.07), hg(cosT, 0.2), 0.5);
  float backlit = smoothstep(0.1, 0.95, cosT);

  // colours: white fair-weather → slate when wrung/wet → near-black storm bases
  vec3 albedo = mix(vec3(1.0), vec3(0.37, 0.4, 0.47), grey);
  albedo = mix(albedo, vec3(0.2, 0.215, 0.26), storm * 0.85);
  vec3 albedoTop = mix(vec3(0.96, 0.97, 1.0), albedo, 0.4 + 0.25 * grey * (1.0 - storm)); // sunlit crowns
  float nightK = 1.0 + uNight * 1.6;
  vec3 sunCol = uLightColor * 0.27 * nightK;
  // sky ambient: the zenith is cooler than the horizon glow → lavender shadow sides at dusk
  float skyLum = dot(uSkyColor, vec3(0.3, 0.5, 0.2));
  vec3 skyCol = mix(uSkyColor, vec3(0.62, 0.68, 1.0) * skyLum * 1.05, 0.45 * uGolden);
  skyCol *= (0.34 + uNight * 0.5) * (1.0 - storm * 0.35);
  vec3 bounce = uGroundColor * 0.8 + uLightColor * uGolden * vec3(0.32, 0.16, 0.14);
  vec3 flashCol = vec3(0.8, 0.85, 1.0) * uFlash * 1.1;
  vec3 glowCol = vec3(0.72, 0.8, 1.0) * uGlow.w;

  float lStep0 = size * 0.09 + 0.03;
  float T = 1.0;
  vec3 col = vec3(0.0);
  float hover = uLook.w;
  float fade = uLook2.x;

  for (int i = 0; i < MAX_STEPS; i++) {
    if (t >= tF || T < 0.02) break;
    vec3 p = ro + rd * t;
    float sd = shapeSD(p);
    if (sd > edge) {
      // empty space: leap ahead on the jittered lattice
      t += ds * max(1.0, floor((sd - edge) / ds));
      continue;
    }
    float cov;
    float dens = fullDensity(p, sd, cov) * fade;
    if (dens > 0.003) {
      if (!fine) { fine = true; ds = dsF; t = max(tN, t - dsC * 0.8); continue; }
      thin = 0;
      // --- light march toward the key light (Beer-Lambert optical depth). Optical depth changes
      // slowly between neighbouring fine samples, so odd ones reuse it; once the ray is mostly
      // occluded fewer light samples are enough.
      if (!fine || (++lightTick & 1) == 1 || T > 0.7) {
        int nL = T > 0.3 ? LIGHT_STEPS : LIGHT_STEPS - 2;
        od = 0.0;
        float sl = lStep0;
        vec3 lp = p;
        for (int j = 0; j < LIGHT_STEPS; j++) {
          if (j >= nL) break;
          lp += uLightDir * sl;
          od += lightDensity(lp) * sl;
          sl *= 1.65;
        }
        od *= sigma * fade * (nL < LIGHT_STEPS ? 1.25 : 1.0);
      }
      // multiple-scattering octaves (Wrenninge): keeps thick cores luminous, not muddy
      // powder: dark creases between front-lit billows (single-scatter term), gone when backlit
      float powder = mix(1.0, 1.0 - exp(-od * 2.0 - dens * 0.6), 0.75 * (1.0 - backlit));
      float lum = exp(-od) * ph0 * powder + 0.45 * exp(-od * 0.3) * ph1 + 0.22 * exp(-od * 0.1) * ph2;

      float hf = heightFrac(p.y);
      float depth = clamp(-sd / (size * 0.7), 0.0, 1.0);
      float amo = mix(1.0, 0.3, depth) * (0.55 + 0.45 * exp(-od * 0.35)); // ambient occlusion
      vec3 amb = mix(bounce, skyCol, smoothstep(0.0, 0.85, hf)) * amo;

      vec3 Lin = sunCol * lum + amb;
      // wet and stormy clouds get heavy, dark bellies
      float low = 1.0 - smoothstep(0.02, 0.7, hf);
      Lin *= 1.0 - low * (grey * 0.45 + storm * 0.58);
      Lin += flashCol * (0.35 + 0.65 * low) * amo;
      float gd = length(p - uGlow.xyz) / size;
      Lin += glowCol * 2.6 * exp(-gd * 3.4);
      // hover: a subtle brightening of the outer shell
      Lin += hover * smoothstep(0.7, 0.3, cov) * (sunCol * 0.4 + skyCol * 0.3);

      float sE = dens * sigma;
      float Tr = exp(-sE * ds);
      vec3 alb = mix(albedo, albedoTop, smoothstep(0.4, 1.0, hf) * (0.35 + 0.65 * storm));
      col += T * alb * Lin * (1.0 - Tr);
      T *= Tr;
    } else if (fine && ++thin > 4) {
      fine = false; ds = dsC; // left the dense part: back to coarse strides
    }
    t += ds;
  }

  float alpha = 1.0 - T;
  if (alpha < 0.002) discard;
  // interior atmosphere haze (premultiplied)
  float dist = tN + chord * 0.5;
  vec3 hazed = applyHaze(col / alpha, dist, uCenter.y) * alpha;
  gl_FragColor = vec4(hazed, alpha);
}
`;
export function createCloudMaterial(
  r,
  t,
  { steps: e = 40, lightSteps: i = 5 } = {},
) {
  const s = [];
  for (let a = 0; a < MAX_CLOUD_PUFFS; a++)
    s.push(new THREE.Vector4(0, -100, 0, 0));
  const n = {
    ...r.uniforms,
    uNoise: t.uNoise,
    uPuffs: {
      value: s,
    },
    uPuffCount: {
      value: 0,
    },
    uBoxMin: {
      value: new THREE.Vector3(),
    },
    uBoxMax: {
      value: new THREE.Vector3(),
    },
    uCenter: {
      value: new THREE.Vector3(),
    },
    uSeed: {
      value: new THREE.Vector3(),
    },
    uShape: {
      value: new THREE.Vector4(5, 7.2, 0.3, 0.3),
    },
    uLook: {
      value: new THREE.Vector4(0, 0, 1, 0),
    },
    uLook2: {
      value: new THREE.Vector4(1, 0, 1, 0),
    },
    uGlow: {
      value: new THREE.Vector4(0, 0, 0, 0),
    },
    uSteps: {
      value: e,
    },
  };
  return new THREE.ShaderMaterial({
    uniforms: n,
    defines: {
      MAX_PUFFS: MAX_CLOUD_PUFFS,
      MAX_STEPS: e + 12,
      LIGHT_STEPS: i,
    },
    vertexShader: r.GLSL_COMMON + CLOUD_VERTEX_SHADER,
    fragmentShader: r.GLSL_COMMON + CLOUD_FRAGMENT_SHADER,
    transparent: !0,
    premultipliedAlpha: !0,
    depthWrite: !1,
    depthTest: !0,
    side: THREE.FrontSide,
  });
}
