/**
 * GLSL for studio reflections, backdrop, glass pane tint/condensation/droplet surfaces, edge slabs, gauge glass and backdrop sphere.
 */
export const SOFTBOX_COUNT = 5;
export const GLSL_STUDIO_REFLECTION = `
#define SB_COUNT ${SOFTBOX_COUNT}
uniform vec3 uRoom;          // studio colour (linear), follows world.roomColor
uniform float uStudio;       // softbox brightness (dims at night)
uniform vec3 uSbC[SB_COUNT]; // softbox centre directions
uniform vec3 uSbR[SB_COUNT]; // softbox right axes
uniform vec3 uSbU[SB_COUNT]; // softbox up axes
uniform vec4 uSbS[SB_COUNT]; // (half width, half height, edge softness, intensity) in tan units
uniform vec3 uSunPos;
uniform vec3 uSunCol;        // HDR, 0 when the sun is down
uniform vec3 uMoonPos;
uniform vec3 uMoonCol;
uniform vec3 uFlashPos;

float gSat(float x) { return clamp(x, 0.0, 1.0); }
float gLum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

/** Soft-edged rectangular softbox seen in direction r (gnomonic projection). */
float gSoftbox(vec3 r, vec3 c, vec3 rt, vec3 up, vec4 s) {
  float d = dot(r, c);
  if (d < 0.3) return 0.0;
  vec2 q = vec2(dot(r, rt), dot(r, up)) / d;
  vec2 e = smoothstep(s.xy + s.z, s.xy - s.z, abs(q));
  vec2 k = q / (s.xy + s.z);
  return e.x * e.y * (1.0 - 0.35 * dot(k, k)) * s.w;
}

/** The studio around the case, as reflected in direction r (linear HDR). */
vec3 gStudio(vec3 r) {
  float up = r.y;
  vec3 wall = uRoom * (0.9 + 1.2 * exp(-up * up * 9.0));
  vec3 ceil = uRoom * 0.4;
  vec3 table = uRoom * vec3(0.75, 0.52, 0.36) * 0.9;
  vec3 c = up > 0.0 ? mix(wall, ceil, smoothstep(0.2, 0.9, up)) : mix(wall, table, smoothstep(0.0, -0.12, up));
  float b = 0.0;
  for (int i = 0; i < SB_COUNT; i++) b += gSoftbox(r, uSbC[i], uSbR[i], uSbU[i], uSbS[i]);
  // the dim room itself reflects only faintly (a broad grey veil would flatten the soil section);
  // the softbox streaks stay crisp and bright
  return c * 0.4 + vec3(1.0, 0.95, 0.88) * b * uStudio;
}

/** Mirror image of an orb (sun / moon) of the given radius: crisp disc + soft halo. */
vec3 gOrbSpec(vec3 r, vec3 p, vec3 pos, vec3 col, float radius) {
  vec3 l = pos - p;
  float dist = length(l);
  float c = dot(r, l / dist);
  if (c < 0.6) return vec3(0.0);
  float ang = radius / dist;
  float disc = smoothstep(cos(ang * 1.35), cos(ang * 0.65), c);
  float halo = pow(c, 1200.0) * 0.12 + pow(c, 90.0) * 0.008;
  return col * (disc + halo);
}

vec3 gSpecular(vec3 r, vec3 p) {
  vec3 s = gOrbSpec(r, p, uSunPos, uSunCol, 0.34) + gOrbSpec(r, p, uMoonPos, uMoonCol, 0.26);
  if (uFlash > 0.001) s += vec3(0.75, 0.8, 1.0) * uFlash * pow(gSat(dot(r, normalize(uFlashPos - p))), 24.0) * 4.0;
  return s;
}
`;
export const GLSL_BACKDROP = `
uniform vec3 uBdRoom;        // room colour (linear)
uniform vec3 uHaloDir;       // camera → case centre (unit)
uniform float uHalo;         // halo strength (dims at night)
uniform vec3 uHaloTint;      // follows the world light a little
vec3 gBackdrop(vec3 d) {
  float g = max(dot(d, uHaloDir), 0.0);
  float halo = pow(g, 10.0) * 0.6 + pow(g, 3.0) * 0.3 + g * g * 0.06;
  vec3 c = uBdRoom * (0.26 + uHalo * halo * 1.25);
  c *= 1.0 - 0.55 * smoothstep(0.0, 0.75, d.y);                 // ceiling falls into darkness
  c *= mix(vec3(1.0), uHaloTint, clamp(halo * uHalo, 0.0, 1.0)); // warm halo behind the case
  return c;
}
`;
export const PANE_VERTEX_SHADER = `
attribute vec2 aPane;        // pane coordinates (world units along uT / uB)
varying vec3 vWorld;
varying vec2 vP;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vP = aPane;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const PANE_FRAGMENT_COMMON = `
uniform vec3 uN;
uniform vec3 uT;
uniform vec3 uB;
uniform vec4 uBounds;        // visible glass in pane coords (uMin, uMax, vMin, vMax)
uniform float uF0;
uniform float uLid;
varying vec3 vWorld;
varying vec2 vP;

/** Proximity to the frame: light running along inside the pane pours out green near its edges. */
float gEdgeBand(vec2 p) {
  float d = min(min(p.x - uBounds.x, uBounds.y - p.x), min(p.y - uBounds.z, uBounds.w - p.y));
  return exp(-max(d, 0.0) / 0.06);
}
`;
export const PANE_TINT_FRAGMENT_SHADER =
  PANE_FRAGMENT_COMMON +
  `
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  float NoV = abs(dot(V, uN));
  float F = uF0 + (1.0 - uF0) * pow(1.0 - NoV, 5.0);
  float graze = (1.0 - NoV) * (1.0 - NoV);
  vec3 tint = mix(vec3(0.99, 0.997, 0.994), vec3(0.72, 0.9, 0.85), graze * (0.6 + 0.3 * uLid));
  tint *= mix(vec3(1.0), vec3(0.78, 0.93, 0.89), gEdgeBand(vP) * 0.75);
  gl_FragColor = vec4(tint * (1.0 - F * 0.85), 1.0);
}
`;
export const PANE_SURFACE_FRAGMENT_SHADER =
  PANE_FRAGMENT_COMMON +
  `
uniform sampler2D uCond;     // atlas: r film, g beads, b wet trail, a rain on glass
uniform vec4 uCondMap;       // (hu, hv, atlas v offset, atlas v scale)
uniform vec2 uCondX;         // atlas u offset, scale
uniform sampler2D uImperf;   // r greasy haze, g micro-scratches, b dust
uniform float uSeed;
uniform float uFrost;        // condensation freezing into fern frost (cold)
uniform float uRainT;        // rain-on-glass animation clock
uniform vec4 uDrips[MAX_DRIPS];   // running drops (u, v, radius, stretch)
uniform vec4 uRings[4];      // tap shimmer (u, v, start time, strength)
uniform vec4 uPrints[3];     // fingerprints (u, v, angle, size)
uniform vec2 uShake;         // (amplitude, start time) — pane ringing after a tap
uniform vec4 uBrush;         // wipe-tool cursor (u, v, radius, alpha)

// ---- droplets ------------------------------------------------------------------------
// Each returns (coverage, lens slope.xy): coverage > 0 inside the footprint, |slope| → 1 at the
// rim (the lens normal tilts outward there).

// One bead per cell (or none); the centre is jittered only as far as keeps the bead inside its
// cell, so a single lookup suffices (no neighbour search).
vec3 gBeads(vec2 p, float cell, float density, float seed) {
  vec2 g = p / cell;
  vec2 id = floor(g);
  float h = wgHash(id + seed);
  if (h > density) return vec3(0.0);
  vec2 f = fract(g) - 0.5;
  float r = 0.15 + 0.27 * wgHash(id * 1.71 + seed + 11.0);
  vec2 c = (vec2(wgHash(id * 1.37 + seed + 5.1), wgHash(id * 0.71 + seed - 2.3)) - 0.5) * (0.92 - 2.0 * r);
  vec2 d = (f - c) / r;
  d.y *= d.y < 0.0 ? 0.86 : 1.07;   // beads sag a little under gravity
  return vec3(1.0 - dot(d, d), d);
}

vec3 gDrips(vec2 p) {
  vec3 best = vec3(0.0);
  for (int i = 0; i < MAX_DRIPS; i++) {
    vec4 d = uDrips[i];
    if (d.z <= 0.0) continue;
    vec2 q = p - d.xy;
    if (abs(q.x) > d.z * 1.6 || q.y < -d.z * 1.4 || q.y > d.z * (1.6 + 5.0 * d.w)) continue;
    float up = max(q.y, 0.0) / d.z;
    q.y = q.y > 0.0 ? q.y / (1.0 + 2.2 * d.w) : q.y * 1.08;
    q.x *= 1.0 + up * 0.55 * d.w;             // taper toward the tail
    vec2 k = q / d.z;
    float cov = 1.0 - dot(k, k);
    if (cov > best.x) best = vec3(cov, k);
  }
  return best;
}

// Rain running down the glass: columns of cells scroll downward; each drop creeps (≈ holding on
// the glass) then snaps down — the stick-slip of real drops — leaving a thin wet wake strung with
// tiny beads that stay put. Returns (coverage, slope.xy, wake).
vec4 gRainSlide(vec2 p, float t, float scale, float seed, float amount) {
  vec2 cs = vec2(0.22, 1.0) * scale;
  float col = floor(p.x / cs.x);
  float hc = wgHash(vec2(col, seed));
  float rate = 0.12 + 0.2 * hc;
  float y = p.y / cs.y + t * rate + hc * 17.0;
  vec2 id = vec2(col, floor(y));
  float h1 = wgHash(id + seed), h2 = wgHash(id.yx * 1.3 + seed + 4.7), h3 = wgHash(id * 2.1 - seed);
  if (h3 > amount) return vec4(0.0);
  vec2 st = vec2(fract(p.x / cs.x), fract(y));
  float ph = fract(t * rate * 1.3 + h2);
  float slide = smoothstep(0.84, 1.0, ph);
  float yd = ph < 0.84 ? mix(0.1, 0.84, ph / 0.84) : mix(0.84, 0.1, slide);
  float ay = p.y / cs.y;
  float x = 0.5 + (h1 - 0.5) * 0.45 + sin(ay * 5.0 + h2 * 6.2832) * 0.08 * (h1 - 0.3);
  float r = (0.024 + 0.022 * h2) * scale;
  vec2 dq = (st - vec2(x, yd)) * cs;
  float stretch = 1.0 + slide * (1.0 - slide) * 2.5;
  dq.y /= dq.y > 0.0 ? 1.25 * stretch : 0.92;
  vec2 k = dq / r;
  vec3 best = vec3(1.0 - dot(k, k), k);
  float wake = 0.0;
  float above = st.y - yd;
  if (above > 0.0) {
    float w = abs(st.x - x) * cs.x;
    float along = exp(-above * 2.6);
    wake = smoothstep(r * 0.75, r * 0.2, w) * along;
    float bn = ay * 9.0 + h1 * 3.0;
    float hb = wgHash(vec2(floor(bn), col + seed));
    if (hb > 0.45) {
      float rb = r * (0.25 + 0.3 * hb) * (0.4 + 0.6 * along);
      vec2 bq = vec2((st.x - x) * cs.x - (hb - 0.7) * r * 0.8, (fract(bn) - 0.5) * cs.y / 9.0) / rb;
      float bc = 1.0 - dot(bq, bq);
      if (bc > best.x) best = vec3(bc, bq);
    }
  }
  return vec4(best, wake);
}

// ---- frost & fingerprints -------------------------------------------------------------

float gFrostFerns(vec2 p) {
  vec2 q = p * 2.6;
  float a = wgNoise(q * 0.6 + uSeed) * 6.2832 + wgNoise(q * 1.3 - uSeed) * 3.0;
  vec2 w = q + vec2(cos(a), sin(a)) * 0.55;
  float r1 = 1.0 - abs(wgNoise(w * 3.5) * 2.0 - 1.0);
  float r2 = 1.0 - abs(wgNoise(w * 9.0 + 7.0) * 2.0 - 1.0);
  float r3 = 1.0 - abs(wgNoise(w * 23.0 - 3.0) * 2.0 - 1.0);
  return pow(r1, 4.0) * 0.5 + pow(r2, 5.0) * 0.35 + pow(r3, 6.0) * 0.25;
}

float gPrint(vec2 p, vec4 pr, float fw) {
  if (pr.w <= 0.0) return 0.0;
  vec2 q = p - pr.xy;
  if (abs(q.x) > pr.w * 1.5 || abs(q.y) > pr.w * 1.5) return 0.0;
  float ca = cos(pr.z), sa = sin(pr.z);
  q = vec2(ca * q.x - sa * q.y, sa * q.x + ca * q.y) / pr.w;
  float e = length(q * vec2(1.0, 0.76));
  if (e > 1.1) return 0.0;
  float blob = smoothstep(1.0, 0.35, e);
  float warp = wgNoise(q * 3.0 + pr.xy * 7.0);
  float f = 38.0;
  float ridges = 0.5 + 0.5 * sin((e + warp * 0.12 + q.x * 0.1) * f);
  ridges = mix(ridges, 0.5, smoothstep(0.25, 0.9, fw * f / pr.w));
  return blob * (0.3 + 0.7 * ridges) * (0.55 + 0.45 * wgNoise(q * 2.5 + 9.0));
}

void main() {
  vec3 P = vWorld;
  vec3 V = normalize(cameraPosition - P);
  float side = dot(V, uN) >= 0.0 ? 1.0 : -1.0;   // +1 looking at the outer face
  vec3 Nf = uN * side;
  vec2 p = vP;
  float fw = length(fwidth(p));                    // pixel footprint in world units

  vec2 cuv = vec2(uCondX.x + gSat((p.x + uCondMap.x) / (2.0 * uCondMap.x)) * uCondX.y,
                  uCondMap.z + gSat((p.y + uCondMap.y) / (2.0 * uCondMap.y)) * uCondMap.w);
  vec4 cond = texture2D(uCond, cuv);
  float film = cond.r, beads = cond.g, trail = cond.b, rainAmt = cond.a;

  // ---- surface relief: drawn-glass waviness + tap shimmer + ringing ---------------------
  vec2 slope = (vec2(wgNoise(p * 0.6 + uSeed), wgNoise(p * 0.6 - uSeed + 3.3)) - 0.5) * 0.016;
  slope.y += sin(p.y * 6.0 + wgNoise(p * vec2(0.25, 1.5) + uSeed) * 4.0) * 0.002;
  float ringGlow = 0.0;
  vec3 ringCol = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 rg = uRings[i];
    float age = uTime - rg.z;
    if (rg.w <= 0.0 || age < 0.0 || age > 1.9) continue;
    vec2 dv = p - rg.xy;
    float d = length(dv);
    if (d > 3.6) continue;
    float fade = pow(1.0 - age / 1.9, 2.0) * rg.w;
    for (int e = 0; e < 2; e++) {
      float R = 0.04 + (age - float(e) * 0.12) * (1.7 - float(e) * 0.4);
      float w = 0.025 + age * 0.05;
      float x = (d - R) / w;
      float ring = exp(-x * x) * fade * (e == 0 ? 1.0 : 0.45) * step(0.0, R);
      slope += (d > 1e-4 ? dv / d : vec2(0.0)) * ring * x * 0.05;
      ringGlow += ring;
      ringCol += ring * mix(vec3(0.85, 0.95, 1.0), 0.5 + 0.5 * cos(6.2832 * (x * 0.18 + age * 0.5 + vec3(0.0, 0.33, 0.67))), 0.35);
    }
    ringGlow += exp(-d * d / 0.004) * fade * smoothstep(0.35, 0.0, age) * 0.6;   // the struck point
  }
  float sa = uTime - uShake.y;
  if (uShake.x > 0.0 && sa < 2.0 && sa >= 0.0) {
    float k = uShake.x * exp(-sa * 3.5) * sin(sa * 70.0);
    slope += vec2(sin(p.y * 2.3 + p.x * 0.7), cos(p.x * 1.9 - p.y * 0.4)) * k * 0.012;
  }

  // ---- droplets ---------------------------------------------------------------------------
  vec3 drop = vec3(0.0);
  float wake = 0.0;
  float farFade = smoothstep(0.06, 0.02, fw);      // beads dissolve into film far away (no shimmer)
  if (beads > 0.02 && farFade > 0.0) {
    vec3 a = gBeads(p, 0.04, beads * 0.8, uSeed);
#ifdef GLASS_HQ
    vec3 b = gBeads(mat2(0.8, -0.6, 0.6, 0.8) * p + 3.7, 0.11, max(0.0, beads - 0.45) * 0.9 + rainAmt * 0.25, uSeed + 17.0);
    drop = a.x > b.x ? a : b;
#else
    drop = a;
#endif
    drop.x *= farFade;
  }
  vec3 dd = gDrips(p);
  if (dd.x > drop.x) drop = dd;
  if (rainAmt > 0.02) {
    if (uLid < 0.5) {
      vec4 r1 = gRainSlide(p, uRainT, 1.0, uSeed + 3.0, rainAmt * 0.9);
      wake = r1.w;
      if (r1.x > drop.x) drop = r1.xyz;
#ifdef GLASS_HQ
      vec4 r2 = gRainSlide(p + vec2(0.11, 0.37), uRainT * 1.3, 0.7, uSeed + 9.0, rainAmt * 0.7);
      wake = max(wake, r2.w);
      if (r2.x > drop.x) drop = r2.xyz;
#endif
    }
    // splatter: small static drops scattered by the rain
    vec3 sp = gBeads(p + 1.3, 0.09, rainAmt * 0.5, uSeed + 31.0);
    if (sp.x > drop.x) drop = sp;
  }
  float dc = gSat(drop.x * 6.0);                  // footprint mask with a crisp, antialiased rim
  vec2 ds = drop.yz;
  float ds2 = min(dot(ds, ds), 0.98);

  vec3 n = normalize(Nf + uT * slope.x + uB * slope.y);
  float NoV = gSat(abs(dot(n, V)));
  float F = uF0 + (1.0 - uF0) * pow(1.0 - NoV, 5.0);
  vec3 R = reflect(-V, n);

  // outer faces reflect the studio; inner faces (seen from inside) mirror the little world
  vec3 env;
  if (side > 0.0) env = gStudio(R);
  else env = mix(uGroundColor * 0.25 + uHazeColor * 0.04, uHazeColor * 0.22 + uSkyColor * 0.05, smoothstep(-0.25, 0.35, R.y)) * (0.35 + 0.65 * uAmbientIntensity);
  vec3 spec = gSpecular(R, P);
  vec3 E = (env + spec) * F;
  float A = 0.0;

  // ---- green light escaping near the frame ---------------------------------------------
  float band = gEdgeBand(p);
  vec3 gather = uSkyColor * 0.3 + uLightColor * 0.14 + uRoom * 1.6 + vec3(0.75, 0.8, 1.0) * uFlash;
  E += band * vec3(0.16, 0.7, 0.58) * gather * (0.04 + 0.22 * (1.0 - NoV));

  // ---- smudges & micro-scratches: only catch the light at certain angles ------------------
  vec3 Ls = normalize(uSunPos - P);
  float sunLobe = pow(gSat(dot(R, Ls)), 16.0);
  float sunBack = pow(gSat(dot(-V, Ls)), 48.0);   // looking toward the sun through the glass (tight: no veil)
  float sunL = gLum(uSunCol) * 0.04;
  float lightHere = gLum(env) + sunL * (sunLobe + sunBack);
  vec3 imp = texture2D(uImperf, p * 0.083 + vec2(uSeed * 0.137, uSeed * 0.291)).rgb;
  float smudge = imp.r * 0.7;
#ifdef GLASS_HQ
  for (int i = 0; i < 3; i++) smudge += gPrint(p, uPrints[i], fw) * 0.8;
#endif
  E += smudge * (lightHere * 0.07 + gLum(uRoom) * 0.08) * vec3(1.0, 0.98, 0.95);
  // micro-scratches glint only near the sun's mirror direction or against a bright softbox
  E += imp.g * (sunL * pow(sunLobe, 3.0) * 0.6 + gLum(env) * 0.05 + sunL * pow(sunBack, 4.0) * 0.08);
  E += imp.b * lightHere * 0.02;

  // ---- condensation film -----------------------------------------------------------------
  vec3 Ld = normalize(uLightDir);
  float fwd = pow(gSat(dot(-V, Ld)), 5.0);        // backlit film glows
  vec3 flashC = vec3(0.75, 0.8, 1.0) * uFlash;
  vec3 filmLight = uSkyColor * 0.24 * uAmbientIntensity + uGroundColor * 0.1 + uLightColor * (0.035 + 0.2 * fwd) + uRoom * 1.2
                 + vec3(1.0, 0.96, 0.9) * uStudio * 0.07 + flashC * 1.2;
  float filmA = 0.0;
  if (film > 0.004) {
    float org = wgNoise(p * 5.0 + uSeed) * 0.6 + wgNoise(p * 17.0 - uSeed) * 0.4;   // organic boundary
    float cover = smoothstep(org * 0.22 - 0.03, org * 0.22 + 0.12, film);
    float micro = wgNoise(p * 55.0) * 0.55 + wgNoise(p * 130.0 + 3.1) * 0.45;
    micro = mix(micro, 0.5, smoothstep(0.004, 0.02, fw));
    // gentle large-scale mottling + faint vertical streaks where old runs thinned the mist
    float mott = wgNoise(p * 0.9 - uSeed) * 0.5 + wgNoise(p * vec2(9.0, 0.35) + uSeed) * 0.5;
    float grain = wgNoise(p * 14.0 + uSeed);
    float dens = cover * (0.24 + 0.58 * film) * (0.85 + 0.3 * micro) * (0.8 + 0.4 * mott) * (0.88 + 0.24 * grain);
#ifdef GLASS_HQ
    if (uFrost > 0.01) {
      float fz = uFrost * smoothstep(0.1, 0.5, film);
      float fern = gFrostFerns(p);
      dens = mix(dens, gSat(cover * (0.35 + 0.9 * fern) * (0.6 + 0.5 * film)), fz);
      float sparkle = step(0.994, wgHash(floor(p * 90.0) + floor(uTime * 3.0))) * pow(gSat(dot(R, Ld)), 3.0);
      E += sparkle * fz * cover * uLightColor * 0.8;
    }
#endif
    dens *= 1.0 - dc * 0.6;                        // drops are clearer lenses in the mist
    dens *= 1.0 - smoothstep(0.1, 0.7, trail) * 0.92;
    dens *= 1.0 - wake;
    filmA = gSat(dens) * 0.8;
    E += filmLight * filmA * 0.85;
    // beads in the mist catch the light as fine fixed specks
    vec2 sc = floor(p * 26.0);
    float sp = step(1.0 - 0.06 * film, wgHash(sc + uSeed * 3.0)) * smoothstep(0.12, 0.0, length(fract(p * 26.0) - 0.5) - 0.18);
    E += sp * filmA * (uLightColor * (0.12 + 0.6 * fwd) + vec3(0.12) * uStudio + flashC);
    A += filmA;
  }

  // ---- droplet lenses --------------------------------------------------------------------
  if (dc > 0.0) {
    vec3 dn = normalize(Nf * sqrt(1.0 - ds2) + uT * ds.x + uB * ds.y);
    float dNoV = gSat(abs(dot(dn, V)));
    float dF = 0.03 + 0.97 * pow(1.0 - dNoV, 5.0);
    vec3 dR = reflect(-V, dn);
    vec3 denv = side > 0.0 ? gStudio(dR) : uHazeColor * 0.45 + uSkyColor * 0.12;
    float rim = smoothstep(0.3, 0.95, ds2);
    // the lens focuses light from above into a bright crescent low in the drop
    float caus = smoothstep(0.55, 0.0, length(ds - vec2(0.0, -0.42))) * (1.0 - rim) * (0.25 + 0.75 * smoothstep(0.03, 0.01, fw));
    vec3 glint = gSpecular(dR, P) * 1.5 + uLightColor * pow(gSat(dot(dR, Ld)), 80.0) * 1.2;
    E += dc * ((denv + glint) * dF + caus * (uSkyColor * 0.2 + uLightColor * 0.12 + uRoom) + rim * filmLight * (0.06 + 0.2 * film));
    A += dc * rim * 0.3;
  }
  // wet trails: a thin sheet of water is a slightly better mirror
  E += (env * F * 0.6 + gLum(env) * 0.012) * gSat(trail * 0.8 + wake * 0.5) * (1.0 - filmA);

  // ---- tap shimmer & wipe cursor ----------------------------------------------------------
  E += ringCol * (0.1 + gLum(env) * 0.5 + gLum(filmLight) * filmA * 0.5) + ringGlow * (0.06 * gather + 0.04);
  if (uBrush.w > 0.0) {
    float bd = length(p - uBrush.xy);
    float bx = (bd - uBrush.z) / (0.012 + fw * 1.5);
    float ring = exp(-bx * bx) * uBrush.w;
    E += ring * (0.05 + gLum(filmLight) * 0.12) + smoothstep(uBrush.z, 0.0, bd) * uBrush.w * filmA * 0.04;
  }

  // lightning lights the whole pane a touch
  E += flashC * (F * 0.8 + 0.008);
  gl_FragColor = vec4(E, gSat(A));
}
`;
export const EDGE_VERTEX_SHADER = `
attribute vec3 aEdge;        // x along the edge (units), y across 0..1, z = 1 on bevels
varying vec3 vWorld;
varying vec3 vNrm;
varying vec3 vEdge;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNrm = normalize(mat3(modelMatrix) * normal);
  vEdge = aEdge;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
export const EDGE_FRAGMENT_SHADER = `
varying vec3 vWorld;
varying vec3 vNrm;
varying vec3 vEdge;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 n = normalize(vNrm);
  if (!gl_FrontFacing) n = -n;
  float NoV = gSat(dot(n, V));
  float across = vEdge.y;
  float bevel = vEdge.z;
  vec3 gather = uSkyColor * 0.35 * uAmbientIntensity + uLightColor * 0.3 + uRoom * 2.4 + vec3(0.8, 0.85, 1.0) * uFlash * 2.5;
  float shift = dot(V, vec3(0.0, 1.0, 0.0) - n * n.y) / max(NoV, 0.25) * 0.35;
  float core = smoothstep(0.0, 0.35, across) * smoothstep(1.0, 0.65, across);
  float bands = 0.5 + 0.5 * cos((across + shift) * 12.566 + wgNoise(vec2(vEdge.x * 0.8, 1.0)) * 2.0);
  vec3 green = vec3(0.1, 0.5, 0.36);
  vec3 body = green * gather * (0.2 + 0.42 * core + 0.42 * bands * core);
  // light piped along the slab from the sunlit side
  body += green * uLightColor * 0.25 * pow(gSat(dot(-V, normalize(uLightDir))) , 3.0);
  float arris = smoothstep(0.12, 0.0, across) + smoothstep(0.88, 1.0, across);
  body += vec3(0.6, 1.0, 0.85) * gather * arris * 0.24;
  vec3 R = reflect(-V, n);
  float F = 0.04 + 0.96 * pow(1.0 - NoV, 5.0);
  vec3 refl = (gStudio(R) + gSpecular(R, vWorld)) * F;
  vec3 keySpec = uLightColor * pow(gSat(dot(R, normalize(uLightDir))), 120.0) * 1.5;
  vec3 col = mix(body + refl, body * 0.4 + refl * 2.0 + keySpec + green * gather * 0.15, bevel);
  gl_FragColor = vec4(col, 1.0);
}
`;
export const GAUGE_GLASS_VERTEX_SHADER = `
varying vec3 vWorld;
varying vec3 vNrm;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNrm = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
export const GAUGE_GLASS_FRAGMENT_SHADER = `
varying vec3 vWorld;
varying vec3 vNrm;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 n = normalize(vNrm);
  float NoV = gSat(dot(n, V));
  float F = 0.04 + 0.96 * pow(1.0 - NoV, 5.0);
  vec3 R = reflect(-V, n);
  vec3 E = (gStudio(R) * 1.4 + gSpecular(R, vWorld)) * F + uLightColor * pow(gSat(dot(R, normalize(uLightDir))), 200.0) * 2.0;
  gl_FragColor = vec4(E, gSat(F * 0.5));
}
`;
export const BACKDROP_VERTEX_SHADER = `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
export const BACKDROP_FRAGMENT_SHADER = `
varying vec3 vWorld;
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  vec3 c = gBackdrop(d);
  // cloth-like large-scale mottling so the gradient never looks digital
  c *= 0.92 + 0.16 * wgNoise(d.xz * 5.0 / max(0.25, 1.0 + d.y) + d.y * 3.0);
  gl_FragColor = vec4(c, 1.0);
}
`;
