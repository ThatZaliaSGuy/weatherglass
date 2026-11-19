/**
 * GLSL chunks and patched MeshStandardMaterials for the terrain surface and soil sides.
 */
import * as THREE from "three";
import { BOX, WATER_LEVELS } from "../core/config.js";
const glslFloat = (r) => r.toFixed(4);
const TERRAIN_SNOW_LIFT_GLSL = `
#define T_BASE_LAKE ${glslFloat(WATER_LEVELS.lakeLevel)}
#define T_BOTTOM_Y ${glslFloat(BOX.bottomY)}
float tSnowLift(vec3 p, float ny) {
  float d = groundAt(p.xz).x;
  float dry = smoothstep(uWaterLevel - 0.01, uWaterLevel + 0.04, p.y) * (1.0 - terrainAt(p.xz).y);
  return min(d, 1.2) * 0.05 * (0.3 + 0.7 * smoothstep(0.45, 0.9, ny)) * dry;
}
`;
const TERRAIN_DETAIL_GLSL = `
uniform sampler2D uTDetail;
uniform float uTIce;

// Cellular noise: x = F1, y = F2, z = hash of the nearest cell; toF = offset to its feature point.
vec3 tCell(vec2 p, out vec2 toF) {
  vec2 i = floor(p), fr = fract(p);
  float d1 = 8.0, d2 = 8.0, id = 0.0;
  toF = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 c = i + g;
      vec2 r = g + vec2(wgHash(c), wgHash(c + 17.31)) * 0.8 + 0.1 - fr;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = wgHash(c + 5.17); toF = r; }
      else if (d < d2) { d2 = d; }
    }
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}

// Animated caustic web (iterated domain warp); bright thin filaments on a dark field.
float tCaustic(vec2 p, float t) {
  vec2 q = p * 6.0 - 250.0;
  vec2 i = q;
  float c = 1.0;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    i = q + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(q.x / (sin(i.x + tt) / 0.005), q.y / (cos(i.y + tt) / 0.005)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}

// Expanding raindrop rings; returns a horizontal normal offset (xz).
vec2 tRipples(vec2 p, float t) {
  vec2 acc = vec2(0.0);
  for (int k = 0; k < 2; k++) {
    vec2 q = p * 7.5 + float(k) * vec2(0.43, 0.71);
    vec2 c = floor(q);
    vec2 d = fract(q) - 0.5 - (vec2(wgHash(c + 1.37), wgHash(c + 4.11)) - 0.5) * 0.4;
    float ph = fract(t * (0.8 + 0.3 * float(k)) + wgHash(c + float(k) * 7.31));
    float r = length(d);
    float x = r - ph * 0.42;
    float wave = sin(x * 70.0) * smoothstep(0.07, 0.0, abs(x)) * (1.0 - ph) * (1.0 - ph);
    acc += d / max(r, 1e-3) * wave;
  }
  return acc;
}

// Bump from a scalar height field H (world units) via screen derivatives (Mikkelsen 2010).
// Must be called in uniform control flow.
vec3 tBump(vec3 pos, vec3 n, float H) {
  vec3 dpx = dFdx(pos), dpy = dFdy(pos);
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dFdx(H) * r1 + dFdy(H) * r2);
  return normalize(abs(det) * n - grad);
}

// Pebbles: shared by beaches, banks, beds and paths. x = inside mask, y = dome height, z = cell hash.
vec3 tPebbles(vec2 xz, float scale) {
  vec2 toF;
  vec3 c = tCell(xz * scale, toF);
  float pr = 0.26 + 0.2 * fract(c.z * 7.7);
  float inside = 1.0 - smoothstep(pr * 0.8, pr, c.x);
  float dome = sqrt(max(0.0, 1.0 - (c.x * c.x) / (pr * pr)));
  return vec3(inside, dome, c.z);
}

vec3 tPebbleColor(float id, float grain) {
  vec3 c = mix(vec3(0.17, 0.165, 0.155), vec3(0.36, 0.33, 0.29), fract(id * 13.3));
  c = mix(c, vec3(0.33, 0.23, 0.16), step(0.78, fract(id * 5.1)) * 0.7);
  c = mix(c, vec3(0.5, 0.48, 0.45), step(0.94, fract(id * 3.7)));
  return c * (0.85 + 0.3 * grain);
}

float tLum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;
const TERRAIN_SURFACE_GLSL = `
struct TSurf { vec3 albedo; float rough; vec3 n; float sparkle; float caustic; float ao; float puddle; float ripple; };

// Mountain rock: folded beds that show in patches, ridged crags, joints, rain streaks, lichen.
// out H = relief (world units), ao = cavity occlusion.
vec3 tRock(vec3 p, vec3 nG, float h, float fine, out float H, out float ao, out float cav) {
  float m1 = wgNoise3(p * 0.8 + 2.0);
  float fold = wgNoise3(p * 0.45 + 9.0) * 2.6 + wgNoise3(p * 1.3) * 0.7;
  float sy = p.y * 5.5 + fold + p.x * 0.3;
  float bandId = floor(sy), bf = fract(sy);
  float bh = wgHash(vec2(bandId, 3.1));
  float strata = smoothstep(0.38, 0.62, wgNoise3(p * 0.9 + 1.0));          // beds show in patches
  float crag = (1.0 - abs(wgNoise3(p * vec3(2.2, 1.1, 2.2)) * 2.0 - 1.0)) * 0.62
             + (1.0 - abs(wgNoise3(p * vec3(5.5, 3.0, 5.5) + 4.0) * 2.0 - 1.0)) * 0.38;
  float r1 = wgNoise3(p * 7.0);
  float r2 = wgNoise3(p * 23.0 + 3.0);
  vec3 rock = mix(vec3(0.13, 0.125, 0.12), vec3(0.3, 0.28, 0.25), m1 * 0.55 + crag * 0.45);
  rock = mix(rock, rock * mix(0.78, 1.18, bh), strata);
  rock = mix(rock, vec3(0.26, 0.18, 0.12), step(0.84, bh) * strata * 0.5);  // iron-stained beds
  float ledge = smoothstep(0.0, 0.3, bf) * smoothstep(1.0, 0.9, bf);    // continuous → no bump seams
  rock *= mix(1.0, 0.78 + 0.22 * ledge, strata);
  float r3 = wgNoise3(p * 64.0);                                            // close-up grain
  rock *= (0.68 + 0.32 * crag) * (0.84 + 0.26 * r1 + 0.14 * (r2 - 0.5)) * (1.0 + (r3 - 0.5) * 0.18 * fine);
  float cr = abs(wgNoise3(p * vec3(4.2, 0.8, 4.2) + bandId * 1.37) - 0.5);
  float crack = (1.0 - smoothstep(0.0, 0.07, cr)) * step(0.35, bh) * smoothstep(0.0, 0.1, bf) * smoothstep(1.0, 0.9, bf);
  rock *= 1.0 - crack * 0.22;
  rock *= 0.84 + 0.16 * smoothstep(0.2, 0.6, wgNoise3(p * vec3(10.0, 0.5, 10.0)));  // rain streaks
  float lich = smoothstep(0.67, 0.71, wgNoise3(p * 8.0 + 11.0)) * smoothstep(0.1, 0.6, nG.y);
  vec3 lichCol = mix(vec3(0.34, 0.37, 0.24), vec3(0.44, 0.3, 0.11), step(0.62, wgNoise(p.xz * 7.0 + p.y)));
  rock = mix(rock, lichCol * (0.8 + 0.3 * r2), lich * 0.6);
  rock = mix(rock, vec3(0.07, 0.11, 0.035), (1.0 - crag) * smoothstep(2.0, 0.9, h) * 0.5 * smoothstep(0.4, 0.62, r1));
  H = crag * 0.045 + ledge * 0.022 * strata + r1 * 0.018 + ((r2 - 0.5) * 0.01 + (r3 - 0.5) * 0.0025) * fine - crack * 0.012;
  ao = 1.0 - (1.0 - crag) * 0.35 - (1.0 - ledge) * 0.22 * strata - crack * 0.25;
  cav = clamp((1.0 - crag) * 0.8 + (1.0 - ledge) * 0.4 * strata, 0.0, 1.0);
  return rock;
}

TSurf terrainSurface(vec3 p, vec3 nG, float lift) {
  TSurf s;
  vec4 T = terrainAt(p.xz);
  vec4 G = groundAt(p.xz);
  vec4 D = texture2D(uTDetail, fieldUV(p.xz));
  float fw = length(fwidth(p));
  float fine = 1.0 - smoothstep(0.012, 0.05, fw);   // fade sub-pixel detail
  float h = p.y - lift;                             // ground height under the snow
  float slope = 1.0 - nG.y;
  float wl = uWaterLevel;
  vec3 V = normalize(cameraPosition - p);

  float nA = wgNoise(p.xz * 0.85 + 3.7);
  float nB = wgNoise(p.xz * 3.1 - 1.3);
  float nC = wgNoise(p.xz * 10.0 + 7.1);
  float nD = wgNoise(p.xz * 31.0 - 2.9);
  float n3 = wgNoise3(p * 2.4);
  float autumn = smoothstep(1.35, 2.0, uSeason) * (1.0 - smoothstep(2.6, 3.2, uSeason));
  float winter = smoothstep(2.55, 3.1, uSeason) * (1.0 - smoothstep(3.6, 3.95, uSeason));

  // ---- where is what
  float underwater = smoothstep(wl + 0.004, wl - 0.03, h);
  float depth = max(0.0, wl - h);
  float riverBed = smoothstep(0.35, 0.85, T.y);
  float alpine = smoothstep(1.3, 2.4, h + (nA - 0.5) * 0.6);
  float rockM = smoothstep(0.3, 0.46, slope + (n3 - 0.5) * 0.3);
  rockM = max(rockM, smoothstep(2.5, 3.3, h + (nA - 0.5) * 0.8 + (nB - 0.5) * 0.3) * smoothstep(0.02, 0.1, slope + nB * 0.05));
  rockM = max(rockM, alpine * smoothstep(0.58, 0.7, n3 * 0.65 + nB * 0.35) * smoothstep(0.1, 0.22, slope));
  rockM *= 1.0 - riverBed;
  float bankM = smoothstep(0.42, 0.78, D.r + (nB - 0.5) * 0.3 + (nC - 0.5) * 0.12) * (1.0 - rockM * 0.7);
  float beachM = D.g * smoothstep(T_BASE_LAKE + 0.24, T_BASE_LAKE + 0.1, h + (nB - 0.5) * 0.08 + (nC - 0.5) * 0.03);
  float bareM = smoothstep(0.3, 0.62, D.b + (nB - 0.5) * 0.46 + (nC - 0.5) * 0.24) * (1.0 - rockM);
  float beachW = beachM * (1.0 - bankM * 0.5);

  // pebbles only where some pebbly material shows (branching is safe: derivatives are taken
  // on the final height outside any branch)
  vec3 peb = vec3(0.0);
  vec3 pebCol = vec3(0.3);
  if (bareM + bankM + beachW + riverBed + underwater > 0.003) {
    peb = tPebbles(p.xz, 26.0);
    pebCol = tPebbleColor(peb.z, nD);
  }

  // ---- meadow floor: what shows between the grass blades
  float dryP = smoothstep(0.32, 0.78, nA * 0.55 + nB * 0.3 + nC * 0.15 + alpine * 0.3);
  vec3 grass = mix(uGrassColor, uGrassDry, dryP);
  float tuft = nC * 0.55 + nD * 0.45;
  vec3 col = grass * (0.4 + 0.34 * tuft);
  float band = dot(p.xz, vec2(0.8, 0.6)) * 2.6 + nA * 1.4;          // soft mowing-like streaks
  col *= 1.0 + (smoothstep(0.3, 0.7, abs(fract(band) - 0.5) * 2.0) - 0.5) * 0.14 * (1.0 - alpine);
  // autumn: russet patches, but damp hollows and banks hang on to their green
  float damp = clamp(D.r * 0.9 + D.a * 0.7 + D.g * 0.3, 0.0, 1.0);
  col = mix(col, vec3(0.28, 0.14, 0.05) * (0.6 + 0.6 * tuft), autumn * smoothstep(0.4, 0.85, nB * 0.5 + nA * 0.3 + nD * 0.2) * 0.6);
  col = mix(col, vec3(0.12, 0.17, 0.05) * (0.6 + 0.6 * tuft), autumn * smoothstep(0.3, 0.7, damp + (nB - 0.5) * 0.5) * 0.65);
  col = mix(col, vec3(0.33, 0.28, 0.18) * (0.6 + 0.5 * tuft), winter * 0.6);
  col = mix(col, mix(col, vec3(0.22, 0.2, 0.14), 0.55) * (0.8 + 0.4 * nD), alpine * 0.65);
  float rough = 0.92;
  float H = (tuft - 0.5) * 0.008 * fine;
  float ao = 1.0;
  float cav = 0.5;   // rock cavities (gullies, bedding ledges) hold snow on steep faces

  // ---- bare, trodden earth (cabin clearing, paths, under trees, around rocks)
  if (bareM > 0.001) {
    vec3 soil = mix(vec3(0.16, 0.11, 0.07), vec3(0.25, 0.18, 0.115), nC) * (0.82 + 0.36 * nD);
    float trod = smoothstep(0.62, 0.95, D.b);
    soil = mix(soil, vec3(0.36, 0.29, 0.2) * (0.9 + 0.2 * nD), trod * 0.6);
    float litter = smoothstep(0.55, 0.8, nD * 0.7 + nC * 0.3) * (1.0 - trod);
    soil = mix(soil, mix(vec3(0.2, 0.11, 0.05), vec3(0.6, 0.27, 0.06), autumn), litter * 0.55);
    float sp = step(fract(peb.z * 3.3), 0.16) * peb.x;
    soil = mix(soil, pebCol * 0.75, sp);
    col = mix(col, soil, bareM);
    rough = mix(rough, 0.95, bareM);
    H = mix(H, (sp * peb.y * 0.006 + (nD - 0.5) * 0.004 * (1.0 - trod)) * fine, bareM);
  }

  // ---- rich dark river banks with pebbles and moss
  if (bankM > 0.001) {
    vec3 bank = mix(vec3(0.07, 0.05, 0.035), vec3(0.12, 0.088, 0.055), nC);
    bank = mix(bank, vec3(0.1, 0.15, 0.045), smoothstep(0.55, 0.75, nB) * 0.6 * (1.0 - D.r * 0.5));
    float bp = step(fract(peb.z * 3.3), mix(0.25, 0.85, D.r)) * peb.x;
    bank = mix(bank, pebCol * 0.8, bp);
    col = mix(col, bank, bankM);
    rough = mix(rough, 0.8, bankM);
    H = mix(H, bp * peb.y * 0.009 * fine, bankM);
  }

  // ---- sandy, pebbly beach
  if (beachW > 0.001) {
    vec3 sand = mix(vec3(0.42, 0.35, 0.25), vec3(0.54, 0.46, 0.33), nC) * (0.88 + 0.24 * nD);
    sand *= 1.0 + 0.06 * sin(dot(p.xz, vec2(0.35, 1.0)) * 70.0 + nB * 6.0) * fine;  // ripple marks
    float bsp = step(fract(peb.z * 3.3), 0.3 + 0.35 * smoothstep(0.12, 0.0, h - T_BASE_LAKE)) * peb.x;
    sand = mix(sand, pebCol, bsp);
    col = mix(col, sand, beachW);
    rough = mix(rough, 0.9, beachW);
    H = mix(H, bsp * peb.y * 0.008 * fine, beachW);
  }

  // ---- rock
  if (rockM > 0.001) {
    float rH, rAO;
    vec3 rock = tRock(p, nG, h, fine, rH, rAO, cav);
    col = mix(col, rock, rockM);
    rough = mix(rough, 0.84, rockM);
    H = mix(H, rH, rockM);
    ao = mix(1.0, rAO, rockM);
  }

  // ---- river bed and lake floor
  float sub = max(underwater, riverBed);
  float caus = 0.0;
  if (sub > 0.001) {
    float bedP = step(fract(peb.z * 3.3), 0.8) * peb.x;
    col = mix(col, mix(vec3(0.15, 0.13, 0.095), pebCol * 0.85, bedP), riverBed);
    H = mix(H, bedP * peb.y * 0.008 * fine, riverBed);
    vec3 silt = mix(vec3(0.23, 0.21, 0.155), vec3(0.15, 0.16, 0.125), smoothstep(0.0, 0.35, depth)) * (0.85 + 0.3 * nC);
    col = mix(col, mix(col, silt, 0.35 + 0.65 * smoothstep(0.02, 0.25, depth)), underwater);
    col *= mix(1.0, 0.62, sub);
    col *= mix(vec3(1.0), vec3(0.72, 0.86, 0.84) * exp(-depth * 0.9), underwater);
    rough = mix(rough, 0.85, sub);   // the shine belongs to the water surface, not the bed
    float cd = max(depth * underwater, riverBed * 0.08);
    caus = tCaustic(p.xz, uTime * 0.6) * 0.7 + tCaustic(vec2(p.z, -p.x) * 0.73 + 3.0, uTime * 0.47 + 1.7) * 0.5;
    caus *= smoothstep(0.0, 0.03, cd) * exp(-cd * 1.4) * sub * (1.0 - uTIce) * (1.0 - uNight) * (1.0 - uStorm * 0.6);
  }

  // ---- wetness: darker, richer, glossier
  float wet = G.y;
  wet = max(wet, bankM * 0.55 * smoothstep(0.5, 1.0, D.r));
  wet = max(wet, beachM * smoothstep(wl + 0.07, wl, h));
  wet *= 1.0 - sub;
  float por = 1.0 - rockM * 0.45;
  float turf = (1.0 - bareM) * (1.0 - bankM) * (1.0 - beachW) * (1.0 - rockM);
  col *= 1.0 - wet * 0.5 * por;
  col = mix(vec3(tLum(col)), col, 1.0 + wet * 0.15);
  rough = mix(rough, mix(mix(0.3, 0.62, turf), 0.2, rockM), wet);   // soil & rock glisten, turf just darkens

  // ---- puddles in flat hollows
  float flatG = smoothstep(0.045, 0.01, slope);
  float pudN = D.a * 1.3 + (nB - 0.5) * 0.55 + (nC - 0.5) * 0.18 + wet * 0.25;
  float puddle = smoothstep(0.5, 0.58, pudN) * flatG * smoothstep(0.35, 0.7, wet) * (1.0 - rockM) * (1.0 - sub);

  // ---- snow: flat tops first, patchy edges, soft drifts
  float snow = 0.0;
  if (G.x > 0.004) {
    float sc = snowCover(p.xz, nG);
    sc *= 1.0 - smoothstep(0.26, 0.52, slope) * mix(0.95, 0.3, cav * rockM);  // steep faces shed it
    float sN = wgNoise(p.xz * 2.2 + 1.7) * 0.55 + nC * 0.3 + nD * 0.15;
    snow = smoothstep(sN * 0.75, sN * 0.75 + 0.22, sc) * (1.0 - sub);
    col = mix(col, vec3(0.55, 0.58, 0.63) * (0.95 + 0.05 * nC), snow);
    rough = mix(rough, 0.62, snow);
    H = mix(H, nB * 0.03 + nC * 0.008, snow);
    ao = mix(ao, 1.0, snow * 0.7);
  }
  puddle *= 1.0 - snow;
  col *= 1.0 - smoothstep(0.0, 0.5, puddle) * (1.0 - puddle) * 0.5;     // soaked rim
  col = mix(col, vec3(0.045, 0.042, 0.034), puddle);                  // muddy water
  rough = mix(rough, 0.03, puddle);

  // ---- frost rime on cold ground
  float frost = G.w * (1.0 - snow) * (1.0 - sub);
  frost *= 1.0 - 0.7 * smoothstep(0.1, 0.6, dot(nG, uSunDir)) * (1.0 - uNight);   // sunny slopes thaw first
  frost *= 0.75 + 0.25 * smoothstep(0.3, 0.7, nA);
  float rime = frost * (0.06 + 0.16 * smoothstep(0.5, 0.85, nD * 0.6 + nC * 0.4)) * (1.0 - wet * 0.6);
  col = mix(col, vec3(tLum(col)) * vec3(1.02, 1.06, 1.12), frost * 0.22);   // dulled, bluish
  col = mix(col, vec3(0.6, 0.65, 0.7), rime);

  // ---- normal: micro relief, flat puddle mirrors dimpled by rain rings
  vec3 n = tBump(p, nG, H * (1.0 - puddle));
  vec2 rip = vec2(0.0);
  if (G.z > 0.02 && wet + puddle > 0.05) rip = tRipples(p.xz, uTime) * G.z * (1.0 - snow);
  n = normalize(mix(n, normalize(vec3(rip.x * 0.9, 1.0, rip.y * 0.9)), puddle));
  n = normalize(n + vec3(rip.x, 0.0, rip.y) * 0.3 * wet * (1.0 - puddle));

  // ---- glints: snow crystals and frost
  float spark = 0.0;
  float glintAmt = snow + frost * 0.3;
  if (glintAmt > 0.01) {
    vec3 gc = floor(p * 70.0);
    vec3 gn = normalize(vec3(wgHash3(gc + 1.7), wgHash3(gc + 3.1), wgHash3(gc + 5.3)) * 2.0 - 1.0 + vec3(0.0, 0.7, 0.0));
    spark = step(0.9, wgHash3(gc + 0.5)) * pow(max(dot(gn, normalize(uLightDir + V)), 0.0), 80.0) * glintAmt;
  }

  s.albedo = col;
  s.rough = clamp(rough, 0.03, 1.0);
  s.n = n;
  s.sparkle = spark;
  s.caustic = caus;
  s.ao = ao * (1.0 - D.a * 0.12);
  s.puddle = puddle;
  s.ripple = length(rip);
  return s;
}
`;
const TERRAIN_VARYINGS_GLSL = `varying vec3 vTPos;
varying vec3 vTNrm;
varying float vTLift;
`;
export function createTerrainSurfaceMaterial(r, t) {
  const e = new THREE.MeshStandardMaterial({
    color: 16777215,
    roughness: 0.9,
    metalness: 0,
  });
  return (
    (e.onBeforeCompile = (i) => {
      (Object.assign(i.uniforms, r.uniforms, t),
        (i.vertexShader =
          r.GLSL_COMMON +
          TERRAIN_SNOW_LIFT_GLSL +
          i.vertexShader
            .replace(
              "#include <common>",
              `#include <common>
` + TERRAIN_VARYINGS_GLSL,
            )
            .replace(
              "#include <begin_vertex>",
              `#include <begin_vertex>
        float tLift = tSnowLift(transformed, normal.y);
        transformed.y += tLift;
        vTPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTNrm = normal;
        vTLift = tLift;`,
            )),
        (i.fragmentShader =
          r.GLSL_COMMON +
          TERRAIN_SNOW_LIFT_GLSL +
          TERRAIN_DETAIL_GLSL +
          TERRAIN_SURFACE_GLSL +
          i.fragmentShader
            .replace(
              "#include <common>",
              `#include <common>
` + TERRAIN_VARYINGS_GLSL,
            )
            .replace(
              "#include <map_fragment>",
              `#include <map_fragment>
        TSurf tS = terrainSurface(vTPos, normalize(vTNrm), vTLift);
        diffuseColor.rgb = tS.albedo;`,
            )
            .replace(
              "#include <roughnessmap_fragment>",
              "float roughnessFactor = tS.rough;",
            )
            .replace(
              "#include <normal_fragment_maps>",
              `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(tS.n, 0.0)).xyz);`,
            )
            .replace(
              "#include <lights_fragment_end>",
              `#include <lights_fragment_end>
        vec3 tLit = reflectedLight.directDiffuse / max(diffuseColor.rgb, vec3(0.02));
        reflectedLight.directDiffuse += tLit * tS.caustic * vec3(0.75, 0.9, 0.82);   // focused sun on the bed
        reflectedLight.directSpecular += tLit * tS.sparkle * 1.6;
        reflectedLight.indirectDiffuse *= tS.ao;
        reflectedLight.indirectSpecular *= tS.ao;
        // puddles mirror a hint of sky; rain rings catch it on their crests
        float tF = 0.02 + 0.98 * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 5.0);
        reflectedLight.indirectSpecular += tS.puddle * (tF + tS.ripple * 0.35) * uSkyColor * (1.0 - uNight * 0.8);`,
            )));
    }),
    (e.customProgramCacheKey = () => "wg-terrain-surface"),
    e
  );
}
const TERRAIN_SOIL_GLSL = `
struct TSoil { vec3 albedo; float rough; vec3 n; float ao; };

// Hanging roots: one wiggly, tapering root per column of width 1/scale. Coverage-antialiased.
float tRoots(float u, float d, float scale, float density, float maxLen, float w0, float fw) {
  float cu = u * scale;
  float ci = floor(cu);
  float h1 = wgHash(vec2(ci, 5.1));
  float len = maxLen * (0.35 + 0.65 * wgHash(vec2(ci, 2.3)));
  float x0 = ci + 0.3 + 0.4 * wgHash(vec2(ci, 9.7));
  float wig = (wgNoise(vec2(d * 16.0, ci * 3.1)) - 0.5) * 0.3 + sin(d * 34.0 + h1 * 20.0) * 0.05;
  float dist = abs(cu - x0 - wig) / scale;
  float taper = 1.0 - smoothstep(0.0, len, d);
  float w = w0 * (0.3 + 0.7 * taper);
  float wAA = max(w, fw * 0.75);
  float cover = (1.0 - smoothstep(wAA * 0.5, wAA, dist)) * min(1.0, w / wAA);
  return cover * step(h1, density) * step(0.0, d) * step(d, len);
}

TSoil soilSection(vec3 p, vec3 N, float u, float S, float ny) {
  TSoil s;
  float fw = length(fwidth(p));
  float fine = 1.0 - smoothstep(0.01, 0.04, fw);
  float d = S - p.y;                                               // depth below the surface
  float m = smoothstep(0.85, 1.7, S);                              // mountain column
  float lake = smoothstep(T_BASE_LAKE + 0.08, T_BASE_LAKE - 0.04, S); // lake-bed column
  float steep = smoothstep(0.78, 0.58, ny);                        // bare rock at the surface
  vec4 G = groundAt(p.xz);
  vec2 q = vec2(u, p.y);

  // wavy boundaries that follow the terrain profile (thick soil under meadows, rock under peaks)
  float w1 = wgNoise(vec2(u * 2.3, 1.3)) - 0.5;
  float w2 = wgNoise(vec2(u * 1.2, 7.9)) - 0.5;
  float w3 = wgNoise(vec2(u * 0.6, 3.3)) - 0.5;
  float w4 = wgNoise(vec2(u * 6.0, 9.1)) - 0.5;
  float rimB = mix(0.04, 0.012, max(steep, lake)) + 0.014 * wgNoise(vec2(u * 34.0, 0.5));
  float topB = mix(mix(0.27, 0.09, m), 0.05, lake) + w1 * 0.06 + w4 * 0.015;
  float yRock = mix(-0.98 + w3 * 0.22, S - 0.13 - abs(w1) * 0.12, m);
  float yTop = S - topB;
  float yLoam = min(max(-0.16 + (S - 0.6) * 0.5 + w2 * 0.12 + w4 * 0.02, yRock), yTop - 0.02);
  float yClay = min(max(yLoam - (0.16 + w1 * 0.06 + w3 * 0.05), yRock), yLoam);
  float yGrav = min(max(-0.9 + (S - 0.6) * 0.15 + w3 * 0.2 + w1 * 0.04, yRock), yClay);

  // layer masks + how much of each layer actually shows (upper layers paint over lower ones),
  // so the expensive cellular patterns are only evaluated where visible
  float inSnow = step(S + 0.0005, p.y);
  float inRim = smoothstep(S - rimB - 0.004, S - rimB + 0.004, p.y);
  float inTop = smoothstep(yTop - 0.05, yTop + 0.02, p.y + (wgNoise(q * 24.0) - 0.5) * 0.04);
  float topW = inTop * (1.0 - steep * 0.6);
  float inLoam = smoothstep(yLoam - 0.012, yLoam + 0.012, p.y + w4 * 0.015);
  float inClay = smoothstep(yClay - 0.004, yClay + 0.004, p.y);
  float inGrav = smoothstep(yGrav - 0.004, yGrav + 0.008, p.y + (w4 * 0.02));
  float vis = (1.0 - inSnow) * (1.0 - inRim) * (1.0 - topW);
  float wLoam = vis * inLoam;
  vis *= 1.0 - inLoam;
  float wClay = vis * inClay;
  vis *= 1.0 - inClay;
  float wGrav = vis * inGrav;
  float wRock = vis * (1.0 - inGrav);
  vec3 col = vec3(0.0);
  float H = 0.0, rough = 0.85, ao = 1.0;

  // ---- bedrock: sandstone & shale beds of uneven thickness, tilted under the mountains
  vec3 rock = vec3(0.2, 0.15, 0.1);
  if (wRock > 0.001 || steep > 0.001) {
  float tilt = mix(0.05, 0.42, m);
  float sc = p.y + u * tilt + w2 * 0.15 + (wgNoise(q * vec2(1.5, 3.0)) - 0.5) * 0.06;
  float sb = sc * 8.0 + sin(sc * 21.0 + w3 * 3.0) * 0.45;          // non-uniform bed spacing
  float sid = floor(sb), sfr = fract(sb);
  float sh = wgHash(vec2(sid, 1.7));
  vec3 sand = mix(vec3(0.25, 0.155, 0.095), vec3(0.38, 0.26, 0.16), sh);
  sand = mix(sand, vec3(0.15, 0.11, 0.09), step(0.8, sh) * 0.85);
  vec3 grey = mix(vec3(0.17, 0.165, 0.16), vec3(0.3, 0.285, 0.265), sh);
  vec3 rock = mix(sand, grey, smoothstep(0.25, 0.85, m + (p.y - S + 1.2) * 0.25));
  rock *= 0.9 + 0.1 * (sin(sb * 18.85 + wgNoise(q * 8.0) * 2.0) * 0.5 + 0.5);   // laminations
  float bedEdge = smoothstep(0.0, 0.08, sfr) * smoothstep(1.0, 0.9, sfr);
  rock *= 0.86 + 0.14 * bedEdge;
  float rn = wgNoise(q * 14.0);
  rock *= 0.85 + 0.25 * rn + 0.1 * (wgNoise(q * 60.0) - 0.5);
  // sparse, slanted joints — only some beds are fractured
  float jc = abs(wgNoise(vec2(u * 1.6 + p.y * 0.9, sid * 1.7)) - 0.5);
  float joint = (1.0 - smoothstep(0.0, 0.012, jc)) * step(0.62, wgHash(vec2(sid, 9.3))) * bedEdge;
  rock *= 1.0 - joint * 0.5;
  col = rock;
  H = (bedEdge * 0.006 + rn * 0.005 - joint * 0.006);
  ao = 1.0 - joint * 0.4;
  }

  // ---- gravel: rounded, flat-lying stones of mixed sizes packed in dark grit
  if (wGrav > 0.001) {
  vec2 toF;
  vec3 gc = tCell(q * vec2(8.0, 10.5), toF);
  float gr = 0.28 + 0.2 * fract(gc.z * 7.7);
  float gIn = 1.0 - smoothstep(gr - 0.05, gr, gc.x);
  float gDome = sqrt(max(0.0, 1.0 - gc.x * gc.x / (gr * gr)));
  vec2 toC;
  vec3 cc = tCell(q * vec2(3.6, 4.6) + 31.0, toC);                    // occasional cobbles
  float cr_ = 0.3 + 0.12 * fract(cc.z * 3.3);
  float cIn = (1.0 - smoothstep(cr_ - 0.03, cr_, cc.x)) * step(fract(cc.z * 7.1), 0.35);
  float cDome = sqrt(max(0.0, 1.0 - cc.x * cc.x / (cr_ * cr_)));
  vec3 stone = tPebbleColor(gc.z, wgNoise(q * 70.0)) * mix(0.6, 1.0, fract(gc.z * 17.3));
  vec3 cobble = tPebbleColor(cc.z + 0.37, wgNoise(q * 40.0)) * 0.9;
  vec3 grit = vec3(0.14, 0.11, 0.08) * (0.75 + 0.4 * wgNoise(q * 90.0)) * mix(0.55, 1.0, smoothstep(gr, gr + 0.18, gc.x));
  vec3 gravel = mix(mix(grit, stone, gIn), cobble, cIn);
  float gH = mix(gIn * gDome * 0.018, cDome * 0.03, cIn);
  col = mix(col, gravel, inGrav);
  H = mix(H, gH, inGrav);
  rough = mix(rough, mix(0.95, 0.55, max(gIn, cIn)), inGrav);
  ao = mix(ao, mix(0.6, 1.0, max(max(gIn, cIn), smoothstep(gr, gr + 0.25, gc.x))), inGrav);
  }

  // ---- clay band: smooth, laminated, slightly sheeny
  if (wClay > 0.001) {
  vec3 clay = mix(vec3(0.36, 0.17, 0.07), vec3(0.45, 0.25, 0.12), wgNoise(q * vec2(3.0, 20.0)));
  clay *= 0.92 + 0.08 * sin(p.y * 260.0 + w4 * 24.0);
  clay = mix(clay, vec3(0.27, 0.27, 0.25), lake * 0.6);                 // grey lake clay
  col = mix(col, clay, inClay);
  H = mix(H, (wgNoise(q * 30.0) - 0.5) * 0.002, inClay);
  rough = mix(rough, 0.62, inClay);
  ao = mix(ao, 1.0, inClay);
  }

  // ---- loam: mottled, streaky, with embedded stones and worm burrows
  if (wLoam > 0.001) {
  float mott = wgNoise(q * vec2(2.2, 6.0) + 3.0);
  vec3 loam = mix(vec3(0.11, 0.07, 0.042), vec3(0.19, 0.12, 0.07), wgNoise(q * 9.0) * 0.6 + mott * 0.4);
  loam = mix(loam, vec3(0.21, 0.12, 0.06), smoothstep(0.62, 0.8, mott) * 0.5);        // iron mottles
  loam *= 0.88 + 0.24 * wgNoise(q * vec2(20.0, 90.0));                                 // fine streaks
  loam *= mix(1.0, 1.12, smoothstep(0.0, 0.4, (yTop - p.y)));                          // lighter with depth
  float burrow = smoothstep(0.86, 0.9, wgNoise(q * vec2(16.0, 13.0) + 9.0)) * step(0.5, wgNoise(q * 3.0 + 1.0));
  loam = mix(loam, vec3(0.05, 0.035, 0.025), burrow * 0.7);
  loam = mix(loam, vec3(0.24, 0.21, 0.155) * (0.85 + 0.3 * wgNoise(q * 40.0)), lake);  // lake sand
  vec2 toE;
  vec3 ec = tCell(q * 4.5 + 17.0, toE);
  float er = 0.12 + 0.3 * fract(ec.z * 5.9);
  float eIn = (1.0 - smoothstep(er - 0.035, er, ec.x)) * step(fract(ec.z * 3.1), 0.12);
  float eDome = sqrt(max(0.0, 1.0 - ec.x * ec.x / (er * er)));
  loam = mix(loam, tPebbleColor(ec.z, wgNoise(q * 70.0)) * 0.55, eIn);
  col = mix(col, loam, inLoam);
  H = mix(H, eIn * eDome * 0.03 + (wgNoise(q * 45.0) - 0.5) * 0.003 - burrow * 0.004, inLoam);
  rough = mix(rough, mix(0.95, 0.6, eIn), inLoam);
  ao = mix(ao, 1.0 - burrow * 0.4, inLoam);
  }

  // ---- humus topsoil, bleeding softly into the loam
  vec3 humus = mix(vec3(0.03, 0.022, 0.016), vec3(0.055, 0.04, 0.028), wgNoise(q * 25.0));
  humus = mix(humus, vec3(0.1, 0.1, 0.08), lake);                  // lake silt
  col = mix(col, humus, topW);
  H = mix(H, (wgNoise(q * 60.0) - 0.5) * 0.003, inTop);
  rough = mix(rough, 0.97, inTop);

  // ---- roots hanging from the turf (thin rootlets + a few thicker ones)
  float rootZone = (1.0 - lake) * (1.0 - steep) * smoothstep(yClay, yClay + 0.05, p.y) * step(p.y, S - rimB * 0.6);
  float roots = 0.0;
  if (rootZone > 0.001) {
    roots = max(tRoots(u, d - rimB, 22.0, 0.75, mix(0.34, 0.12, m), 0.0045, fw),
                tRoots(u + 7.3, d - rimB, 7.0, 0.45, mix(0.5, 0.16, m), 0.009, fw)) * rootZone;
  }
  col = mix(col, vec3(0.3, 0.23, 0.15) * (0.85 + 0.3 * wgNoise(q * 50.0)), roots);
  H += roots * 0.004;

  // ---- turf / moss rim (or bare rock / silt where the surface is rock or lake bed)
  vec3 turf = mix(uGrassColor * 0.32, vec3(0.07, 0.09, 0.035), wgNoise(vec2(u * 40.0, p.y * 30.0)));
  turf *= 0.7 + 0.5 * wgNoise(vec2(u * 140.0, p.y * 6.0));           // blade streaks
  turf = mix(turf, rock * 0.9, steep);
  turf = mix(turf, vec3(0.13, 0.13, 0.1), lake);
  col = mix(col, turf, inRim);
  H = mix(H, wgNoise(vec2(u * 140.0, p.y * 6.0)) * 0.004, inRim);
  ao *= mix(0.72, 1.0, smoothstep(0.0, 0.07, d - rimB));             // overhang of the turf

  // ---- wetness soaks down from the surface
  float wetD = G.y * 0.45 + G.z * 0.15;
  float wet = G.y * smoothstep(wetD + 0.06, wetD - 0.04, d) * (1.0 - lake);
  col *= 1.0 - wet * 0.4;
  rough = mix(rough, 0.45, wet);

  // ---- snow cap (above the surface: the snow-lifted band)
  col = mix(col, vec3(0.55, 0.58, 0.63), inSnow);
  rough = mix(rough, 0.6, inSnow);

  // ---- deeper = darker (less light reaches through the glass floor)
  float deep = smoothstep(T_BOTTOM_Y, T_BOTTOM_Y + 1.0, p.y);
  col *= mix(0.62, 1.0, deep);
  ao *= mix(0.55, 1.0, deep);

  // the floor under the block
  float floor_ = step(N.y, -0.5);
  col = mix(col, vec3(0.04, 0.032, 0.025), floor_);

  s.albedo = col;
  s.rough = rough;
  s.n = tBump(p, N, H * fine * (1.0 - floor_));
  s.ao = ao;
  return s;
}
`;
const SOIL_VARYINGS_GLSL = `varying vec3 vSPos;
varying vec3 vSNrm;
varying float vSU;
varying float vSSurf;
varying float vSNy;
`;
export function createTerrainSoilMaterial(r, t) {
  const e = new THREE.MeshStandardMaterial({
    color: 16777215,
    roughness: 0.9,
    metalness: 0,
  });
  return (
    (e.onBeforeCompile = (i) => {
      (Object.assign(i.uniforms, r.uniforms, t),
        (i.vertexShader =
          r.GLSL_COMMON +
          TERRAIN_SNOW_LIFT_GLSL +
          i.vertexShader
            .replace(
              "#include <common>",
              `#include <common>
attribute float aU;
attribute float aSurf;
attribute float aTop;
attribute float aNy;
` + SOIL_VARYINGS_GLSL,
            )
            .replace(
              "#include <begin_vertex>",
              `#include <begin_vertex>
        if (aTop > 0.5) transformed.y += tSnowLift(transformed, aNy);
        vSPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vSNrm = normal;
        vSU = aU;
        vSSurf = aSurf;
        vSNy = aNy;`,
            )),
        (i.fragmentShader =
          r.GLSL_COMMON +
          TERRAIN_SNOW_LIFT_GLSL +
          TERRAIN_DETAIL_GLSL +
          TERRAIN_SOIL_GLSL +
          i.fragmentShader
            .replace(
              "#include <common>",
              `#include <common>
` + SOIL_VARYINGS_GLSL,
            )
            .replace(
              "#include <map_fragment>",
              `#include <map_fragment>
        TSoil tS = soilSection(vSPos, normalize(vSNrm), vSU, vSSurf, vSNy);
        diffuseColor.rgb = tS.albedo;`,
            )
            .replace(
              "#include <roughnessmap_fragment>",
              "float roughnessFactor = tS.rough;",
            )
            .replace(
              "#include <normal_fragment_maps>",
              `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(tS.n, 0.0)).xyz);`,
            )
            .replace(
              "#include <lights_fragment_end>",
              `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse *= tS.ao;
        reflectedLight.indirectSpecular *= tS.ao;
        reflectedLight.directDiffuse *= mix(0.75, 1.0, tS.ao);`,
            )));
    }),
    (e.customProgramCacheKey = () => "wg-terrain-soil"),
    e
  );
}
