/**
 * Instanced grass, reed, cattail and wildflower geometries plus their season/wind-aware GLSL material patches.
 */
import * as THREE from "three";
import { patchVegetationMaterial } from "./vegetationShaderPatch.js";
function createBladeStripGeometry(r) {
  const t = [],
    e = [];
  for (let n = 0; n < r; n++) {
    const o = n / r;
    t.push(-0.5, o, 0, 0.5, o, 0);
  }
  t.push(0, 1, 0);
  for (let n = 0; n < r - 1; n++) {
    const o = n * 2;
    e.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
  }
  const i = (r - 1) * 2;
  e.push(i, i + 1, r * 2);
  const s = new THREE.InstancedBufferGeometry();
  return (
    s.setAttribute("position", new THREE.Float32BufferAttribute(t, 3)),
    s.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(new Float32Array(t.length), 3),
    ),
    s.setIndex(e),
    s
  );
}
const GRASS_VERTEX_HEAD = `
attribute vec4 aRoot;    // root xyz, rand
attribute vec4 aShape;   // height, width, yaw, lean
attribute vec4 aTint;    // grass: dryness, lake basin, damp   reeds: cattail, in water
varying vec4 vGrass;     // t, dryness, rand, wind-crest sheen
varying vec4 vGround;
varying vec2 vGrassXZ;
varying vec3 vGrassCol;  // per-blade albedo (grass; computed once per vertex, not per pixel)
varying vec4 vGrassFx;   // snow cover, frost, wetness, turf density (root occlusion)

/** Bend (radians, xz) and effective height of a blade; shared by blades and cattail heads. */
vec2 vegBladeBend(out float H, out float gust, out float alive) {
  vec4 G = groundAt(aRoot.xz);
  float rnd = aRoot.w;
  float winter = vegWinter(), autumn = vegAutumn();
  float snowFlat = smoothstep(0.04, 0.6, G.x);
  H = aShape.x;
#ifdef VEG_REED
  float stiff = aTint.x > 0.5 ? 2.0 : 1.2;
  alive = 1.0;
  H *= mix(1.0, 0.82, winter) * (0.85 + 0.15 * (1.0 - vegSpring() * 0.4));
  H *= 1.0 - 0.3 * snowFlat;
  float droop = aShape.w * (1.0 + winter * 1.4 + snowFlat * 1.2 + G.y * 0.3);
#else
  float stiff = 1.0;
  // winter: half the blades gone, the rest short dry straw; spring: fresh growth
  alive = step(rnd, 1.0 - winter * 0.5);
  H *= mix(1.0, 0.62, winter) * mix(1.0, 0.9, autumn) * mix(1.0, 0.88, vegSpring() * (1.0 - rnd));
  H *= 1.0 - 0.55 * snowFlat;
  // drowned when the lake rises over the root
  alive *= 1.0 - aTint.y * step(aRoot.y + H * 0.4, uWaterLevel);
  float droop = aShape.w * (1.0 + snowFlat * 1.8 + G.y * 0.45);
#endif
  H *= alive;
  vec2 B = vegWindBend(aRoot.xz, rnd, stiff, gust);
  B *= mix(0.65, 1.3, clamp(H / 0.16, 0.0, 1.0));            // taller blades bend further (≈ height²)
#ifdef VEG_REED
  // reed beds rock as a body: a slow, deep sway on top of the flutter, growing with the wind
  {
    vec2 Wr = windAt(aRoot.xz);
    float spr = length(Wr);
    vec2 dr = spr > 1e-4 ? Wr / spr : vec2(1.0, 0.0);
    float ph = dot(aRoot.xz, dr) * 3.0 + rnd * 1.5;
    B += dr * sin(uTime * (1.5 + spr * 0.25) - ph) * (0.06 + 0.12 * min(spr, 3.0)) / stiff;
  }
#endif
  vec2 face = vec2(-sin(aShape.z), cos(aShape.z));
  B += face * droop;
  vGround = G;
  return B;
}

#ifndef VEG_REED
/** Per-blade albedo: meadow patches, lush damp swathes, odd straw blades, season. */
vec3 vegGrassAlbedo(vec4 G) {
  vec2 xz = aRoot.xz;
  float rnd = aRoot.w;
  float winter = vegWinter(), autumn = vegAutumn();
  float nA = wgNoise(xz * 0.85 + 3.7), nB = wgNoise(xz * 3.1 - 1.3), nL = wgNoise(xz * 0.45 - 7.3);
  float dryP = smoothstep(0.32, 0.78, nA * 0.55 + nB * 0.3 + fract(rnd * 3.1) * 0.15 + aTint.x * 0.35);
  vec3 base = mix(uGrassColor, uGrassDry, dryP);
  // lush swathes (damp ground, hollows, around water): deeper, cooler green
  float lush = clamp(aTint.z * 0.75 + smoothstep(0.5, 0.85, nL) * 0.7, 0.0, 1.0) * (1.0 - dryP * 0.5);
  base = mix(base, base * vec3(0.58, 0.8, 0.55), lush * 0.65);
  base *= 0.74 + 0.5 * fract(rnd * 7.13);
  base = mix(base, base * vec3(0.86, 1.06, 0.74), smoothstep(0.7, 1.0, fract(rnd * 11.3)) * 0.6);
  // a few dead / seeding blades: straw flecks that make a meadow read as real
  float straw = step(0.94 - 0.3 * autumn - 0.08 * smoothstep(0.7, 1.5, uSeason), fract(rnd * 17.9));
  base = mix(base, vec3(0.5, 0.42, 0.24) * (0.8 + 0.4 * fract(rnd * 5.3)), straw * 0.8);
  base = mix(base, vec3(0.42, 0.26, 0.1) * (0.8 + 0.4 * rnd), autumn * smoothstep(0.45, 0.85, nB * 0.6 + fract(rnd * 3.7) * 0.4) * 0.6);
  base = mix(base, vec3(0.5, 0.43, 0.29) * (0.78 + 0.44 * fract(rnd * 5.3)), winter * 0.8);
  return base * 0.64;
}
#endif
`;
const GRASS_BEGIN_NORMAL_VERTEX = `
  float vegH, vegGust, vegAlive;
  vec2 vegB = vegBladeBend(vegH, vegGust, vegAlive);
  float vegT = position.y;
  vec3 vegTan;
  vec3 vegOff = vegArc(vegB, vegH, vegT, vegTan);
  float vegTw = aShape.z + (aRoot.w - 0.5) * 1.3 * vegT;            // slight twist up the blade
  vec3 vegSide = vec3(cos(vegTw), 0.0, sin(vegTw));
#ifdef VEG_REED
  float vegW = aShape.y * (aTint.x > 0.5 ? 1.0 : pow(1.0 - pow(vegT, 2.2), 0.7));
#else
  float vegW = aShape.y * pow(1.0 - pow(vegT, 1.5), 0.8);
#endif
  vec3 vegPos = aRoot.xyz + vegOff + vegSide * position.x * vegW * vegAlive;
  vec3 vegNrm = cross(vegSide, vegTan);
  vegNrm /= max(length(vegNrm), 1e-4);
  vegNrm *= sign(dot(vegNrm, cameraPosition - vegPos) + 1e-5);      // face the eye (thin blade)
  vec3 objectNormal = normalize(mix(vegNrm, vec3(0.0, 1.0, 0.0), 0.45));
  vGrass = vec4(vegT, aTint.x, aRoot.w, vegGust);
  vGrassXZ = aRoot.xz;
  vGrassFx = vec4(snowCover(aRoot.xz, vec3(0.0, 1.0, 0.0)), vGround.w, vGround.y, aTint.w);
#ifdef VEG_REED
  vGrassCol = vec3(0.0);
  vGrassFx.w = 0.4;
#else
  vGrassCol = vegGrassAlbedo(vGround);
#endif
`;
const GRASS_FRAGMENT_HEAD = `
varying vec4 vGrass;
varying vec4 vGround;
varying vec2 vGrassXZ;
varying vec3 vGrassCol;
varying vec4 vGrassFx;
`;
const GRASS_COLOR_FRAGMENT = `
  float t = vGrass.x;
  vec4 fx = vGrassFx;
  float winter = vegWinter();
  vec3 col = vGrassCol * mix(0.6, 1.0, smoothstep(0.0, 0.8, t));
  col = mix(col, col * 1.22 + vec3(0.01, 0.014, 0.0), smoothstep(0.6, 1.0, t) * (1.0 - winter * 0.5));   // fresh tips
  // wind crests: bent blades turn their pale, glossy flanks up, so gusts sweep visibly as bands
  col = mix(col, col * 1.45 + vec3(0.03, 0.036, 0.016), vGrass.w * t * t * (1.0 - fx.x));
  col *= 1.0 - fx.z * 0.3;                                                 // wet: darker
  col = mix(col, vec3(0.76, 0.83, 0.9), fx.y * smoothstep(0.35, 1.0, t) * 0.6);   // frosted tips
  col = mix(col, vec3(0.86, 0.9, 0.96), fx.x * smoothstep(0.15, 0.8, t) * 0.9);  // snow-tipped
  diffuseColor.rgb = col;
  vegTransAmt = (1.0 - fx.x) * 0.6 * smoothstep(0.1, 0.8, t);
`;
const GRASS_AO_FRAGMENT = `
  {
    float vegT = vGrass.x, vegD = vGrassFx.w;
    float vegAo = mix(mix(0.4, 0.14, vegD), 1.0, smoothstep(0.0, 0.85, vegT));
    reflectedLight.indirectDiffuse *= vegAo;
    reflectedLight.indirectSpecular *= vegAo * mix(0.3, 1.0, vGrassFx.z);
    reflectedLight.directDiffuse *= mix(mix(0.62, 0.36, vegD), 1.0, smoothstep(0.0, 0.7, vegT));
    reflectedLight.directSpecular *= mix(0.3, 1.0, vegT);
  }
`;
const REED_COLOR_FRAGMENT = `
  float t = vGrass.x, rnd = vGrass.z;
  vec4 G = vGround;
  float winter = vegWinter(), autumn = vegAutumn();
  vec3 green = mix(vec3(0.09, 0.2, 0.045), vec3(0.19, 0.33, 0.08), fract(rnd * 3.3));
  green = mix(green, vec3(0.26, 0.42, 0.1), vegSpring() * 0.4);
  green = mix(green, vec3(0.1, 0.17, 0.05), vGrass.y);              // cattail stalks: darker, glossier
  vec3 base = mix(green, vec3(0.52, 0.38, 0.17) * (0.8 + 0.4 * rnd), autumn * (0.55 + 0.4 * rnd));
  base = mix(base, vec3(0.6, 0.52, 0.34) * (0.8 + 0.3 * rnd), winter);
  base = mix(base, base * vec3(1.2, 1.0, 0.6), smoothstep(0.6, 1.0, t) * (autumn + 0.25));   // sun-bleached tips
  vec3 col = base * mix(0.35, 0.85, smoothstep(0.0, 0.5, t));
  col *= 1.0 - G.y * 0.15;
  col = mix(col, vec3(0.86, 0.9, 0.96), vGrassFx.x * smoothstep(0.5, 1.0, t) * 0.5);
  col = mix(col, col * 1.3 + vec3(0.02, 0.024, 0.01), vGrass.w * t * 0.6);
  diffuseColor.rgb = col;
  vegTransAmt = 0.5 * smoothstep(0.1, 0.7, t);
`;
const GRASS_ROUGHNESS_FRAGMENT = `
  float roughnessFactor = mix(roughness, 0.3, vGround.y * 0.75);
`;
function createBladeMaterial(r, t) {
  const e = new THREE.MeshStandardMaterial({
    roughness: t ? 0.6 : 0.8,
    metalness: 0,
    side: THREE.DoubleSide,
    envMapIntensity: t ? 0.5 : 0.35,
  });
  return (
    t &&
      (e.defines = {
        VEG_REED: "",
      }),
    patchVegetationMaterial(e, r, {
      key: t ? "veg-reed" : "veg-grass",
      vertexHead: GRASS_VERTEX_HEAD,
      fragmentHead: GRASS_FRAGMENT_HEAD,
      vertex: {
        beginnormal_vertex: GRASS_BEGIN_NORMAL_VERTEX,
        begin_vertex: "vec3 transformed = vegPos;",
      },
      fragment: {
        color_fragment: t ? REED_COLOR_FRAGMENT : GRASS_COLOR_FRAGMENT,
        roughnessmap_fragment: GRASS_ROUGHNESS_FRAGMENT,
        aomap_fragment: GRASS_AO_FRAGMENT,
      },
      light: !0,
      noFlip: !0,
    })
  );
}
function applyBladeInstanceAttributes(r, t, e) {
  return (
    r.setAttribute(
      "aRoot",
      new THREE.InstancedBufferAttribute(t.root.subarray(0, e * 4), 4),
    ),
    r.setAttribute(
      "aShape",
      new THREE.InstancedBufferAttribute(t.shape.subarray(0, e * 4), 4),
    ),
    r.setAttribute(
      "aTint",
      new THREE.InstancedBufferAttribute(t.tint.subarray(0, e * 4), 4),
    ),
    (r.instanceCount = e),
    (r.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 8)),
    (r.boundingBox = new THREE.Box3(
      new THREE.Vector3(-6, -1, -4),
      new THREE.Vector3(6, 4, 4),
    )),
    r
  );
}
export function createGrassMesh(r, t, e) {
  const i = applyBladeInstanceAttributes(
      createBladeStripGeometry(e),
      t,
      t.count,
    ),
    s = new THREE.Mesh(i, createBladeMaterial(r, !1));
  return (
    (s.name = "vegetation-grass"),
    (s.receiveShadow = !0),
    (s.castShadow = !1),
    (s.userData.noReflect = !0),
    s
  );
}
const CATTAIL_VERTEX_HEAD =
  GRASS_VERTEX_HEAD +
  `
attribute vec3 aHead;    // lathe: x, y (0..1.5 along the stalk), z
`;
const CATTAIL_BEGIN_NORMAL_VERTEX = `
  float vegH, vegGust, vegAlive;
  vec2 vegB = vegBladeBend(vegH, vegGust, vegAlive);
  float t0 = 0.72;
  vec3 vegTan;
  vec3 vegOff = vegArc(vegB, vegH, t0, vegTan);
  vec3 s1 = normalize(cross(vegTan, abs(vegTan.x) > 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0)));
  vec3 s2 = cross(vegTan, s1);
  float winter = vegWinter();
  float rad = 0.0105 * (1.0 + winter * 0.35 * smoothstep(0.3, 1.1, aHead.y));   // winter heads go fluffy
  float len = 0.06;
  vec3 vegPos = aRoot.xyz + vegOff + (s1 * aHead.x + s2 * aHead.z) * rad + vegTan * aHead.y * len;
  vec3 objectNormal = normalize(s1 * aHead.x + s2 * aHead.z + vegTan * 0.2);
  vGrass = vec4(aHead.y, 1.0, aRoot.w, vegGust);
  vGrassXZ = aRoot.xz;
`;
const CATTAIL_COLOR_FRAGMENT = `
  float winter = vegWinter();
  float spike = step(1.02, vGrass.x);
  vec3 col = mix(vec3(0.2, 0.1, 0.05), vec3(0.3, 0.17, 0.08), fract(vGrass.z * 5.1));
  col = mix(col, vec3(0.55, 0.47, 0.35), winter * 0.6 * wgNoise(vec2(vGrass.x * 20.0, vGrass.z * 40.0)));
  col = mix(col, vec3(0.3, 0.27, 0.12), spike);
  float sc = snowCover(vGrassXZ, vec3(0.0, 1.0, 0.0));
  col = mix(col, vec3(0.86, 0.9, 0.96), sc * 0.4);
  diffuseColor.rgb = col;
`;
function createCattailHeadGeometry() {
  const r = [
      [0, 0],
      [0.7, 0.03],
      [1, 0.14],
      [1, 0.86],
      [0.75, 0.98],
      [0.18, 1.02],
      [0.14, 1.35],
      [0, 1.45],
    ],
    t = 6,
    e = [],
    i = [];
  for (let o = 0; o < r.length; o++)
    for (let a = 0; a <= t; a++) {
      const l = (a / t) * Math.PI * 2;
      e.push(Math.cos(l) * r[o][0], r[o][1], Math.sin(l) * r[o][0]);
    }
  const s = t + 1;
  for (let o = 0; o < r.length - 1; o++)
    for (let a = 0; a < t; a++) {
      const l = o * s + a,
        c = l + s;
      i.push(l, c, l + 1, c, c + 1, l + 1);
    }
  const n = new THREE.InstancedBufferGeometry();
  return (
    n.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(e.length), 3),
    ),
    n.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(new Float32Array(e.length), 3),
    ),
    n.setAttribute("aHead", new THREE.Float32BufferAttribute(e, 3)),
    n.setIndex(i),
    n
  );
}
export function createReedMeshes(r, t) {
  const e = applyBladeInstanceAttributes(
      createBladeStripGeometry(5),
      t,
      t.count,
    ),
    i = new THREE.Mesh(e, createBladeMaterial(r, !0));
  ((i.name = "vegetation-reeds"), (i.receiveShadow = !0));
  let s = 0;
  for (let h = 0; h < t.count; h++) t.tint[h * 4] > 0.5 && s++;
  const n = {
    root: new Float32Array(s * 4),
    shape: new Float32Array(s * 4),
    tint: new Float32Array(s * 4),
  };
  let o = 0;
  for (let h = 0; h < t.count; h++)
    t.tint[h * 4] <= 0.5 ||
      (n.root.set(t.root.subarray(h * 4, h * 4 + 4), o * 4),
      n.shape.set(t.shape.subarray(h * 4, h * 4 + 4), o * 4),
      n.tint.set(t.tint.subarray(h * 4, h * 4 + 4), o * 4),
      o++);
  const a = applyBladeInstanceAttributes(createCattailHeadGeometry(), n, s),
    l = new THREE.MeshStandardMaterial({
      roughness: 0.95,
      metalness: 0,
    });
  ((l.defines = {
    VEG_REED: "",
  }),
    patchVegetationMaterial(l, r, {
      key: "veg-cattail",
      vertexHead: CATTAIL_VERTEX_HEAD,
      fragmentHead: GRASS_FRAGMENT_HEAD,
      vertex: {
        beginnormal_vertex: CATTAIL_BEGIN_NORMAL_VERTEX,
        begin_vertex: "vec3 transformed = vegPos;",
      },
      fragment: {
        color_fragment: CATTAIL_COLOR_FRAGMENT,
      },
    }));
  const c = new THREE.Mesh(a, l);
  return (
    (c.name = "vegetation-cattails"),
    (c.castShadow = !1),
    (c.receiveShadow = !0),
    {
      reeds: i,
      heads: c,
    }
  );
}
const FLOWER_PETAL_SLOTS = 8;
function createFlowerGeometry() {
  const r = [],
    t = [],
    e = [],
    i = (l, c, h, f) => (r.push(l, c, h), t.push(f), t.length - 1),
    s = t.length;
  for (let l = 0; l <= 2; l++) (i(-0.5, l / 2, 0, 0), i(0.5, l / 2, 0, 0));
  for (let l = 0; l < 2; l++) {
    const c = s + l * 2;
    e.push(c, c + 1, c + 2, c + 1, c + 3, c + 2);
  }
  for (let l = 0; l < 2; l++) {
    const c = t.length;
    (i(-0.5, 0, l, 3), i(0.5, 0, l, 3));
    const h = i(0, 1, l, 3);
    e.push(c, c + 1, h);
  }
  const n = i(0, 0, 1, 2),
    o = 5;
  for (let l = 0; l < o; l++) {
    const c = (l / o) * Math.PI * 2;
    i(Math.cos(c), Math.sin(c), 0, 2);
  }
  for (let l = 0; l < o; l++) e.push(n, n + 1 + l, n + 1 + ((l + 1) % o));
  for (let l = 0; l < FLOWER_PETAL_SLOTS; l++) {
    const c = t.length;
    (i(0, -1, l, 1),
      i(0, 1, l, 1),
      i(1, -1, l, 1),
      i(1, 1, l, 1),
      e.push(c, c + 2, c + 1, c + 1, c + 2, c + 3));
  }
  const a = new THREE.InstancedBufferGeometry();
  return (
    a.setAttribute("position", new THREE.Float32BufferAttribute(r, 3)),
    a.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(new Float32Array(r.length), 3),
    ),
    a.setAttribute("aPart", new THREE.Float32BufferAttribute(t, 1)),
    a.setIndex(e),
    a
  );
}
const FLOWER_VERTEX_HEAD = `
attribute vec4 aRoot;    // root xyz, rand
attribute vec4 aShape;   // height, head size, species, yaw
attribute float aPart;   // 0 stem, 1 petal, 2 centre, 3 leaf
varying vec4 vFl;        // part, u, v, species
varying vec4 vFl2;       // rand, t, petal index, 0
varying vec4 vGround;
varying vec2 vGrassXZ;

float vegWindow(float s, float a, float b) {
  float x = mod(s - a + 4.0, 4.0);
  float w = mod(b - a + 4.0, 4.0);
  return smoothstep(0.0, 0.3, x) * smoothstep(w, w - 0.3, x);
}
float vegBloomWindow(float sp) {
  float s = uSeason;
  if (sp < 0.5) return vegWindow(s, 3.8, 1.9);    // daisy
  if (sp < 1.5) return vegWindow(s, 3.85, 1.35);  // buttercup
  if (sp < 2.5) return vegWindow(s, 0.65, 2.05);  // cornflower
  if (sp < 3.5) return vegWindow(s, 3.55, 0.95);  // violet
  if (sp < 4.5) return vegWindow(s, 0.55, 1.8);   // poppy
  return vegWindow(s, 1.35, 2.75);                // aster
}
// petals: count, length, width, cup (radians)
vec4 vegPetalShape(float sp) {
  if (sp < 0.5) return vec4(8.0, 1.0, 0.24, 0.06);
  if (sp < 1.5) return vec4(5.0, 0.72, 0.5, 0.7);
  if (sp < 2.5) return vec4(8.0, 0.9, 0.3, 0.28);
  if (sp < 3.5) return vec4(5.0, 0.78, 0.45, 0.22);
  if (sp < 4.5) return vec4(4.0, 0.95, 0.8, 0.6);
  return vec4(8.0, 1.0, 0.19, 0.12);
}
`;
const FLOWER_BEGIN_NORMAL_VERTEX = `
  vec4 G = groundAt(aRoot.xz);
  float rnd = aRoot.w;
  float sp = aShape.z;
  // bloom: species window × meadow flowers × a lift after rain; asters carry autumn alone
  float amount = vegBloomWindow(sp) * mix(uFlowers, 1.0, sp > 4.5 ? 0.55 : 0.0) * (0.72 + 0.5 * G.y);
  float r2 = fract(rnd * 17.31);
  float show = smoothstep(r2 - 0.1, r2, amount) * (1.0 - smoothstep(0.08, 0.35, G.x));
  float H = aShape.x * (0.35 + 0.65 * show);
  float size = aShape.y * show * (0.9 + 0.2 * G.y);
  float gust;
  vec2 B = vegWindBend(aRoot.xz, rnd, 0.85, gust) * 1.15;
  vec2 face = vec2(-sin(aShape.w), cos(aShape.w));
  B += face * (0.12 + 0.2 * uNight);                                  // heads nod at night
  vec3 T;
  vec3 tip = aRoot.xyz + vegArc(B, H, 1.0, T);
  vec3 p;
  vec3 n;
  float part = aPart;
  if (part < 0.5) {
    // stem: a thin strip turned toward the eye
    vec3 Ts;
    p = aRoot.xyz + vegArc(B, H, position.y, Ts);
    vec3 side = normalize(cross(Ts, cameraPosition - p));
    p += side * position.x * 0.0035 * (0.4 + 0.6 * show);
    n = normalize(mix(cross(side, Ts), vec3(0.0, 1.0, 0.0), 0.5));
  } else if (part > 2.5) {
    // basal leaves: short arcs close to the ground
    float a = aShape.w + position.z * 3.14159 + 0.6;
    vec2 d = vec2(cos(a), sin(a));
    vec2 Bl = d * 1.1 + B * 0.3;
    vec3 Tl;
    float Ll = aShape.x * 0.38;
    p = aRoot.xyz + vegArc(Bl, Ll, position.y, Tl);
    vec3 side = normalize(vec3(-d.y, 0.0, d.x));
    p += side * position.x * 0.009 * (1.0 - position.y * 0.6);
    n = normalize(mix(cross(side, Tl), vec3(0.0, 1.0, 0.0), 0.5));
    n *= sign(n.y + 1e-4);
  } else {
    // head frame: stem tangent, turned toward the sun by day
    vec3 up = normalize(T + vec3(uSunDir.x, max(uSunDir.y, 0.0), uSunDir.z) * 0.55 * (1.0 - uNight));
    vec3 e1 = normalize(cross(up, abs(up.z) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0)));
    vec3 e2 = cross(up, e1);
    vec4 ps = vegPetalShape(sp);
    if (part < 1.5) {
      float idx = position.z;
      float a = aShape.w * 3.0 + idx / ps.x * 6.28318;
      vec3 radial = e1 * cos(a) + e2 * sin(a);
      float cup = ps.w + (1.25 - ps.w) * uNight * 0.75;              // close up at night
      vec3 pv = radial * cos(cup) + up * sin(cup);
      vec3 across = cross(up, radial);
      float len = size * ps.y;
      p = tip + pv * (size * 0.12 + position.x * len) + across * position.y * size * ps.z * 0.5;
      p += up * size * 0.05;
      if (idx >= ps.x) p = tip;                                       // unused petal slot
      n = normalize(up * cos(cup) - radial * sin(cup) * 0.6);
    } else {
      float cs = sp < 0.5 || sp > 4.5 ? 0.3 : 0.22;
      p = tip + (e1 * position.x + e2 * position.y) * size * cs + up * position.z * size * 0.14;
      n = normalize(up + (e1 * position.x + e2 * position.y) * 0.6);
    }
  }
  vec3 objectNormal = n;
  vec3 vegPos = p;
  vFl = vec4(part, position.x, position.y, sp);
  vFl2 = vec4(rnd, position.y, position.z, show);
  vGround = G;
  vGrassXZ = aRoot.xz;
`;
const FLOWER_FRAGMENT_HEAD = `
varying vec4 vFl;
varying vec4 vFl2;
varying vec4 vGround;
varying vec2 vGrassXZ;
`;
const FLOWER_COLOR_FRAGMENT = `
  float part = vFl.x, sp = vFl.w, rnd = vFl2.x;
  vec3 col;
  float autumn = vegAutumn();
  vec3 green = mix(vec3(0.12, 0.26, 0.06), vec3(0.2, 0.34, 0.08), fract(rnd * 3.3));
  green = mix(green, vec3(0.3, 0.24, 0.1), autumn * 0.6);
  if (part < 0.5 || part > 2.5) {
    col = green * (part > 2.5 ? 0.85 : mix(0.5, 1.0, vFl2.y));
    vegTransAmt = 0.6;
  } else if (part < 1.5) {
    float u = vFl.y, v = abs(vFl.z);
    // outline: slim ribbons (daisy, aster), cups (buttercup, violet, poppy), ragged (cornflower)
    float w;
    if (sp < 0.5 || sp > 4.5) w = 0.95 * pow(max(sin(3.14159 * min(u * 1.08, 1.0)), 0.0), 0.45);
    else if (sp > 1.5 && sp < 2.5) w = (0.55 + 0.45 * u) * (1.0 - smoothstep(0.8, 1.0, u) * (0.5 + 0.5 * sin(v * 18.0)));
    else w = sqrt(max(0.0, 1.0 - pow(u * 2.0 - 1.0, 2.0))) * mix(0.55, 1.0, smoothstep(0.0, 0.5, u));
    if (v > w) discard;
    vec3 pc;
    if (sp < 0.5) pc = mix(vec3(0.95, 0.94, 0.9), vec3(0.95, 0.62, 0.72), smoothstep(0.85, 1.0, u) * 0.6);
    else if (sp < 1.5) pc = vec3(1.0, 0.72, 0.02);
    else if (sp < 2.5) pc = vec3(0.1, 0.24, 0.9);
    else if (sp < 3.5) pc = vec3(0.4, 0.16, 0.72);
    else if (sp < 4.5) pc = mix(vec3(0.05, 0.03, 0.03), vec3(0.9, 0.06, 0.03), smoothstep(0.1, 0.28, u));
    else pc = vec3(0.66, 0.5, 0.9);
    pc *= 0.88 + 0.24 * fract(rnd * 9.7);
    col = pc * mix(0.75, 1.0, smoothstep(0.0, 0.4, u));
    vegTransAmt = 1.0;
  } else {
    vec3 cc = sp < 0.5 || sp > 4.5 ? vec3(0.95, 0.62, 0.04) : sp < 1.5 ? vec3(0.8, 0.7, 0.1) : sp > 3.5 ? vec3(0.04, 0.05, 0.03) : vec3(0.12, 0.08, 0.3);
    float dots = wgNoise(vec2(vFl.y, vFl.z) * 9.0 + rnd * 20.0);
    col = cc * (0.7 + 0.5 * dots);
    vegTransAmt = 0.3;
  }
  col *= 1.0 - vGround.y * 0.15;
  col = mix(col, vec3(0.75, 0.82, 0.9), vGround.w * 0.35);
  diffuseColor.rgb = col;
`;
const FLOWER_ROUGHNESS_FRAGMENT = `
  float roughnessFactor = vFl.x > 0.5 && vFl.x < 1.5 && vFl.w > 0.5 && vFl.w < 1.5 ? 0.3 : mix(roughness, 0.35, vGround.y * 0.7);
`;
export function createFlowerMesh(r, t) {
  const e = createFlowerGeometry();
  (e.setAttribute(
    "aRoot",
    new THREE.InstancedBufferAttribute(t.root.subarray(0, t.count * 4), 4),
  ),
    e.setAttribute(
      "aShape",
      new THREE.InstancedBufferAttribute(t.shape.subarray(0, t.count * 4), 4),
    ),
    (e.instanceCount = t.count),
    (e.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 8)));
  const i = patchVegetationMaterial(
      new THREE.MeshStandardMaterial({
        roughness: 0.6,
        metalness: 0,
        side: THREE.DoubleSide,
        envMapIntensity: 0.5,
      }),
      r,
      {
        key: "veg-flowers",
        vertexHead: FLOWER_VERTEX_HEAD,
        fragmentHead: FLOWER_FRAGMENT_HEAD,
        vertex: {
          beginnormal_vertex: FLOWER_BEGIN_NORMAL_VERTEX,
          begin_vertex: "vec3 transformed = vegPos;",
        },
        fragment: {
          color_fragment: FLOWER_COLOR_FRAGMENT,
          roughnessmap_fragment: FLOWER_ROUGHNESS_FRAGMENT,
        },
        light: !0,
        noFlip: !0,
      },
    ),
    s = new THREE.Mesh(e, i);
  return (
    (s.name = "vegetation-flowers"),
    (s.receiveShadow = !0),
    (s.userData.noReflect = !0),
    s
  );
}
