/**
 * Walnut plinth, engraved brass plaques, humidity/temperature gauge with sprung needles, wooden table and backdrop dome, assembled by CaseStand.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  BASE_RAIL,
  GAUGE,
  GLASS_OUTER_HALF_D,
  GLASS_OUTER_HALF_W,
  PLAQUE,
  PLINTH,
  TABLE_Y,
} from "./caseLayout.js";
import {
  BACKDROP_FRAGMENT_SHADER,
  BACKDROP_VERTEX_SHADER,
  GAUGE_GLASS_FRAGMENT_SHADER,
  GAUGE_GLASS_VERTEX_SHADER,
  GLSL_BACKDROP,
  GLSL_STUDIO_REFLECTION,
} from "./glassShaders.js";
import { patchStudioMaterial } from "./studioEnvironment.js";
import { createRoundedRectCap, latheRoundedRect } from "./caseFrame.js";
const glslFloat2 = (r) => r.toFixed(4);
const GLSL_SD_ROUNDED_RECT = `
  float sdRRect(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
`;
const GLSL_WALNUT = `
  // fw = pixel footprint (world units), so fine lines fade out instead of aliasing
  vec3 walnut(vec3 p, vec3 n, float fw, out float figure) {
    float ax = smoothstep(0.5, 0.8, abs(n.x));          // grain runs along z on the end faces
    float along = mix(p.x, p.z, ax);
    float across = mix(p.z, p.x, ax) * 0.22 + p.y;
    float warp = wgNoise(vec2(along * 0.11, across * 0.7)) * 2.2 + wgNoise(vec2(along * 0.45, across * 2.2)) * 0.5;
    float g1 = across * 15.0 + warp * 2.6;               // growth lines
    float tri = abs(fract(g1) - 0.5) * 2.0;
    float aa = smoothstep(0.5, 0.2, fw * 15.0);
    float late = smoothstep(0.72, 0.98, tri) * aa;
    float broad = wgNoise(vec2(along * 0.07, across * 1.1 + warp * 0.6));
    float streak = wgNoise(vec2(along * 0.8, g1 * 0.45));
    float pores = wgNoise(vec2(along * 50.0, across * 200.0 + warp)) * smoothstep(0.004, 0.0015, fw);
    figure = broad;
    vec3 dark = vec3(0.026, 0.012, 0.0065);
    vec3 mid = vec3(0.08, 0.04, 0.02);
    vec3 lite = vec3(0.135, 0.074, 0.038);
    vec3 c = mix(mid, lite, smoothstep(0.4, 0.9, broad) * (0.55 + 0.45 * streak));
    c = mix(c, dark, smoothstep(0.35, 0.0, broad) * 0.55);
    c *= 1.0 - late * 0.42;
    c *= 0.9 + 0.2 * streak;
    c *= 1.0 - 0.22 * smoothstep(0.62, 0.92, pores);
    return c;
  }
`;
function plinthProfile() {
  const r = PLINTH.top,
    t = PLINTH.friezeOffset,
    e = PLINTH.height,
    i = PLINTH.footOffset;
  return [
    [0.17, r],
    [0.19, r - 0.004],
    [0.204, r - 0.016],
    [0.21, r - 0.035],
    [0.205, r - 0.052],
    [0.19, r - 0.064],
    [0.172, r - 0.072],
    [0.168, r - 0.088],
    [0.152, r - 0.122],
    [0.132, r - 0.157],
    [0.114, r - 0.187],
    [0.104, r - 0.21],
    [0.113, r - 0.226],
    [0.119, r - 0.241],
    [0.113, r - 0.256],
    [t, r - 0.266],
    [t, r - PLINTH.friezeBottom],
    [t + 0.016, r - 0.874],
    [t + 0.03, r - 0.89],
    [0.17, r - 0.93],
    [0.21, r - 0.972],
    [0.236, r - 1],
    [0.252, r - 1.02],
    [i - 0.006, r - 1.042],
    [i, r - 1.064],
    [i, r - e + 0.02],
    [i - 0.006, r - e + 0.006],
    [i - 0.018, r - e],
    [0, r - e],
  ];
}
function createPlinth(r, t, e) {
  const i = r.quality.pick(4, 6, 8),
    s = latheRoundedRect(plinthProfile(), {
      halfW: PLINTH.coreW,
      halfD: PLINTH.coreD,
      radius: PLINTH.cornerR,
      seg: i,
    }),
    n = createRoundedRectCap(
      PLINTH.coreW + 0.17,
      PLINTH.coreD + 0.17,
      PLINTH.cornerR + 0.17,
      PLINTH.top,
      i,
    ),
    o = mergeGeometries([s, n], !1);
  (s.dispose(), n.dispose());
  const a = new THREE.MeshPhysicalMaterial({
      color: 16777215,
      roughness: 0.42,
      metalness: 0,
      envMap: e,
      envMapIntensity: 1,
      clearcoat: r.quality.tier > 0 ? 0.55 : 0,
      clearcoatRoughness: 0.28,
    }),
    l = GLASS_OUTER_HALF_W + BASE_RAIL.t + 0.012,
    c = GLASS_OUTER_HALF_D + BASE_RAIL.t + 0.012;
  patchStudioMaterial(a, r, t, {
    key: "wg-glass-walnut",
    vars: GLSL_WALNUT + GLSL_SD_ROUNDED_RECT,
    color: `
      float wFig;
      diffuseColor.rgb = walnut(vXWorld, vXNormal, length(fwidth(vXWorld)), wFig);
      // honey-coloured wear on the top arris
      float arris = smoothstep(0.45, 0.85, vXNormal.y) * smoothstep(${glslFloat2(PLINTH.top - 0.08)}, ${glslFloat2(PLINTH.top)}, vXWorld.y);
      diffuseColor.rgb *= 1.0 + arris * 0.25 * wgNoise(vXWorld.xz * 3.0);`,
    rough:
      "roughnessFactor = clamp(0.38 + (0.5 - wFig) * 0.12 + (wgNoise(vXWorld.xz * 7.0 + vXWorld.y) - 0.5) * 0.1, 0.2, 0.7);",
    light: `
      // occlusion: contact with the table, under the brass shoe, inside the deep cove
      float pAO = mix(0.45, 1.0, smoothstep(${glslFloat2(TABLE_Y)}, ${glslFloat2(TABLE_Y + 0.3)}, vXWorld.y));
      float sd = sdRRect(vXWorld.xz, vec2(${glslFloat2(l)}, ${glslFloat2(c)}), 0.05);
      pAO *= mix(1.0, mix(0.35, 1.0, smoothstep(0.0, 0.22, sd)), smoothstep(0.6, 0.9, vXNormal.y));
      reflectedLight.indirectDiffuse *= pAO;
      reflectedLight.indirectSpecular *= mix(0.5, 1.0, pAO);
      reflectedLight.directDiffuse *= mix(0.65, 1.0, clamp(smoothstep(0.0, 0.05, sd) + (1.0 - smoothstep(0.6, 0.9, vXNormal.y)), 0.0, 1.0));`,
  });
  const h = new THREE.Mesh(o, a);
  return (
    (h.name = "glassPlinth"),
    (h.castShadow = !0),
    (h.receiveShadow = !0),
    h
  );
}
function createPlaqueTextures(T = "WEATHERGLASS") {
  const t = Math.round((1024 * PLAQUE.h) / PLAQUE.w),
    e = document.createElement("canvas");
  ((e.width = 1024), (e.height = t));
  const i = e.getContext("2d"),
    s = i.createLinearGradient(0, 0, 0, t);
  (s.addColorStop(0, "#d9b46a"),
    s.addColorStop(0.5, "#c79d52"),
    s.addColorStop(1, "#a67f3c"),
    (i.fillStyle = s),
    i.fillRect(0, 0, 1024, t));
  let n = 7;
  const o = () => (n = (n * 16807) % 2147483647) / 2147483647;
  for (let p = 0; p < 900; p++) {
    const v = o() * t;
    ((i.strokeStyle =
      o() > 0.5
        ? `rgba(255,236,190,${0.03 + o() * 0.06})`
        : `rgba(70,45,10,${0.03 + o() * 0.06})`),
      (i.lineWidth = 0.5 + o()),
      i.beginPath());
    const g = o() * 1024;
    (i.moveTo(g - 300 - o() * 400, v),
      i.lineTo(g + 300 + o() * 400, v),
      i.stroke());
  }
  const a = i.createRadialGradient(
    1024 / 2,
    t / 2,
    t * 0.3,
    1024 / 2,
    t / 2,
    1024 * 0.55,
  );
  (a.addColorStop(0, "rgba(0,0,0,0)"),
    a.addColorStop(1, "rgba(40,24,6,0.35)"),
    (i.fillStyle = a),
    i.fillRect(0, 0, 1024, t));
  const l = document.createElement("canvas");
  ((l.width = 1024), (l.height = t));
  const c = l.getContext("2d");
  ((c.fillStyle = "rgb(255,92,255)"), c.fillRect(0, 0, 1024, t));
  const h = (p) => {
      (i.save(),
        i.translate(1.5, 2),
        (i.fillStyle = i.strokeStyle = "rgba(255,240,200,0.55)"),
        p(i),
        i.restore(),
        i.save(),
        (i.fillStyle = i.strokeStyle = "#21160b"),
        p(i),
        i.restore(),
        c.save(),
        (c.fillStyle = c.strokeStyle = "rgb(40,200,40)"),
        p(c),
        c.restore());
    },
    f = '"Liberation Serif", "DejaVu Serif", Georgia, "Times New Roman", serif';
  (h((p) => {
    ((p.lineWidth = 3),
      p.strokeRect(22, 14, 980, t - 28),
      (p.lineWidth = 1.2),
      p.strokeRect(32, 22, 960, t - 44));
  }),
    h((p) => {
      ((p.font = `700 ${Math.round(t * 0.5)}px ${f}`),
        (p.textAlign = "center"),
        (p.textBaseline = "middle"),
        "letterSpacing" in p &&
          (p.letterSpacing = `${Math.round(t * 0.12)}px`));
      {
        const W = p.measureText(T).width,
          M = p.measureText("WEATHERGLASS").width;
        W > M && (p.font = `700 ${Math.floor((t * 0.5 * M) / W)}px ${f}`);
      }
      p.fillText(T, 1024 / 2 + ("letterSpacing" in p ? t * 0.06 : 0), t * 0.53);
    }),
    h((p) => {
      for (const v of [1024 * 0.115, 1024 * 0.885])
        (p.beginPath(),
          p.moveTo(v, t * 0.5 - 7),
          p.lineTo(v + 7, t * 0.5),
          p.lineTo(v, t * 0.5 + 7),
          p.lineTo(v - 7, t * 0.5),
          p.closePath(),
          p.fill());
    }));
  const u = new THREE.CanvasTexture(e);
  u.colorSpace = THREE.SRGBColorSpace;
  const d = new THREE.CanvasTexture(l);
  for (const p of [u, d])
    ((p.anisotropy = 4),
      (p.generateMipmaps = !0),
      (p.minFilter = THREE.LinearMipmapLinearFilter));
  return {
    map: u,
    orm: d,
  };
}
function createPlaque(r, t, e, T, B) {
  const { map: i, orm: s } = createPlaqueTextures(T),
    n = new THREE.MeshPhysicalMaterial({
      color: 16777215,
      map: i,
      roughnessMap: s,
      metalnessMap: s,
      bumpMap: s,
      bumpScale: 0.6,
      metalness: 1,
      roughness: 1,
      envMap: e,
      envMapIntensity: 1,
    });
  patchStudioMaterial(n, r, t, {
    key: "wg-glass-plaque",
  });
  const o = new THREE.BoxGeometry(PLAQUE.w, PLAQUE.h, PLAQUE.t),
    a = new THREE.Mesh(o, n);
  return (
    a.position.set(PLAQUE.x, PLINTH.friezeY, PLINTH.friezeZ + PLAQUE.t * 0.5),
    B &&
      ((a.rotation.y = Math.PI),
      (a.position.z = -a.position.z),
      (a.name = "glassPlaqueBack")),
    (a.castShadow = !1),
    (a.receiveShadow = !0),
    a
  );
}
const GAUGE_START_ANGLE = (225 * Math.PI) / 180;
const GAUGE_SWEEP_ANGLE = (270 * Math.PI) / 180;
const HUMIDITY_RANGE = [0, 100];
const TEMPERATURE_RANGE = [-20, 40];
function createGaugeDialTexture() {
  const t = document.createElement("canvas");
  t.width = t.height = 512;
  const e = t.getContext("2d"),
    i = 512 / 2,
    s = 512 / 2,
    n = 512 / 2,
    o = '"Liberation Sans", "DejaVu Sans", Arial, sans-serif',
    a = '"Liberation Serif", "DejaVu Serif", Georgia, serif',
    l = e.createRadialGradient(i, s * 0.85, n * 0.1, i, s, n);
  (l.addColorStop(0, "#f6efdc"),
    l.addColorStop(0.75, "#ece0c3"),
    l.addColorStop(1, "#cdbb93"),
    (e.fillStyle = l),
    e.fillRect(0, 0, 512, 512));
  const c = (d, p) => [i + Math.cos(d) * p, s - Math.sin(d) * p],
    h = (d) => GAUGE_START_ANGLE - d * GAUGE_SWEEP_ANGLE,
    f = (d, p, v, g, x) => {
      (e.beginPath(),
        e.arc(i, s, p, -h(v), -h(g), !1),
        e.arc(i, s, d, -h(g), -h(v), !0),
        e.closePath(),
        (e.fillStyle = x),
        e.fill());
    };
  (f(n * 0.8, n * 0.9, 0.4, 0.6, "rgba(90,140,90,0.32)"),
    f(n * 0.52, n * 0.6, 0, 20 / 60, "rgba(70,110,170,0.28)"),
    (e.strokeStyle = "#1d2533"));
  for (let d = 0; d <= 50; d++) {
    const p = d / 50,
      v = h(p),
      g = d % 5 === 0;
    e.lineWidth = g ? 3 : 1.4;
    const [x, m] = c(v, n * (g ? 0.79 : 0.83)),
      [w, y] = c(v, n * 0.9);
    (e.beginPath(), e.moveTo(x, m), e.lineTo(w, y), e.stroke());
  }
  ((e.lineWidth = 2),
    e.beginPath(),
    e.arc(
      i,
      s,
      n * 0.905,
      -GAUGE_START_ANGLE,
      -(GAUGE_START_ANGLE - GAUGE_SWEEP_ANGLE),
      !1,
    ),
    e.stroke(),
    (e.fillStyle = "#1d2533"),
    (e.font = `600 ${Math.round(512 * 0.052)}px ${a}`),
    (e.textAlign = "center"),
    (e.textBaseline = "middle"));
  for (let d = 0; d <= 100; d += 20) {
    const [p, v] = c(h(d / 100), n * 0.69);
    e.fillText(String(d), p, v);
  }
  e.strokeStyle = "#6b1d14";
  for (let d = -20; d <= 40; d += 2) {
    const p = (d + 20) / 60,
      v = h(p),
      g = d % 10 === 0;
    e.lineWidth = g ? 2.6 : 1.2;
    const [x, m] = c(v, n * 0.52),
      [w, y] = c(v, n * (g ? 0.6 : 0.565));
    (e.beginPath(), e.moveTo(x, m), e.lineTo(w, y), e.stroke());
  }
  ((e.fillStyle = "#6b1d14"),
    (e.font = `600 ${Math.round(512 * 0.04)}px ${a}`));
  for (let d = -20; d <= 40; d += 10) {
    const [p, v] = c(h((d + 20) / 60), n * 0.43);
    e.fillText(String(d), p, v);
  }
  ((e.fillStyle = "#1d2533"),
    (e.font = `700 ${Math.round(512 * 0.042)}px ${o}`),
    "letterSpacing" in e && (e.letterSpacing = "3px"),
    e.fillText("HUMIDITY %", i, s - n * 0.22),
    (e.fillStyle = "#6b1d14"),
    (e.font = `700 ${Math.round(512 * 0.04)}px ${a}`),
    e.fillText("°C", i, s + n * 0.22),
    (e.fillStyle = "#5a4a32"),
    (e.font = `italic 600 ${Math.round(512 * 0.03)}px ${a}`),
    "letterSpacing" in e && (e.letterSpacing = "2px"),
    e.fillText("Weatherglass & Co.", i, s + n * 0.8),
    (e.strokeStyle = "rgba(60,40,15,0.6)"),
    (e.lineWidth = 3),
    e.beginPath(),
    e.arc(i, s, n * 0.97, 0, Math.PI * 2),
    e.stroke());
  const u = new THREE.CanvasTexture(t);
  return ((u.colorSpace = THREE.SRGBColorSpace), (u.anisotropy = 4), u);
}
function createNeedleGeometry(r, t, e) {
  const i = new THREE.Shape();
  return (
    i.moveTo(0, r),
    i.lineTo(e * 0.5, 0.02),
    i.lineTo(e * 0.9, 0),
    i.lineTo(e * 0.6, -t * 0.7),
    i.absarc(0, -t, e * 1.3, 0, Math.PI * 2, !1),
    i.lineTo(-e * 0.6, -t * 0.7),
    i.lineTo(-e * 0.9, 0),
    i.lineTo(-e * 0.5, 0.02),
    i.closePath(),
    new THREE.ShapeGeometry(i, 6)
  );
}
function createGauge(r, t, e, i) {
  const s = new THREE.Group();
  ((s.name = "glassGauge"),
    s.position.set(GAUGE.x, PLINTH.friezeY, PLINTH.friezeZ));
  const n = new THREE.MeshPhysicalMaterial({
    map: createGaugeDialTexture(),
    roughness: 0.42,
    metalness: 0,
    envMap: e,
    envMapIntensity: 0.6,
    clearcoat: 0.6,
    clearcoatRoughness: 0.15,
  });
  patchStudioMaterial(n, r, t, {
    key: "wg-glass-dial",
  });
  const o = new THREE.Mesh(new THREE.CircleGeometry(GAUGE.r - 0.008, 48), n);
  ((o.position.z = 0.018), (o.receiveShadow = !0), s.add(o));
  const a = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.03, 0.045, 0.09),
      metalness: 0.75,
      roughness: 0.3,
      envMap: e,
      envMapIntensity: 1,
    }),
    l = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.32, 0.05, 0.03),
      metalness: 0.3,
      roughness: 0.38,
      envMap: e,
      envMapIntensity: 0.8,
    }),
    c = new THREE.Mesh(createNeedleGeometry(GAUGE.r * 0.84, 0.045, 0.011), a);
  c.position.z = 0.03;
  const h = new THREE.Mesh(
    createNeedleGeometry(GAUGE.r * 0.6, 0.035, 0.014),
    l,
  );
  ((h.position.z = 0.025), s.add(c, h));
  const f = new THREE.SphereGeometry(
    0.016,
    12,
    6,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.5,
  );
  f.rotateX(Math.PI / 2);
  const u = new THREE.Mesh(f, i);
  ((u.position.z = 0.034), s.add(u));
  const d = 0.62,
    p = Math.asin((GAUGE.r + 0.004) / d),
    v = new THREE.SphereGeometry(d, 32, 4, 0, Math.PI * 2, 0, p);
  (v.rotateX(Math.PI / 2), v.translate(0, 0, 0.048 - d * Math.cos(p)));
  const g = new THREE.Mesh(
    v,
    new THREE.ShaderMaterial({
      uniforms: {
        ...r.uniforms,
        ...t,
      },
      vertexShader: r.GLSL_COMMON + GAUGE_GLASS_VERTEX_SHADER,
      fragmentShader:
        r.GLSL_COMMON + GLSL_STUDIO_REFLECTION + GAUGE_GLASS_FRAGMENT_SHADER,
      transparent: !0,
      depthWrite: !1,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    }),
  );
  return (
    (g.renderOrder = 21),
    s.add(g),
    {
      group: s,
      hum: c,
      tmp: h,
    }
  );
}
const GLSL_TABLE_WOOD = `
  vec3 tableWood(vec2 xz, float fw, out float rough) {
    float pw = 1.18;
    float zi = floor(xz.y / pw);
    float zf = fract(xz.y / pw);
    float h = wgHash(vec2(zi, 3.7));
    float along = xz.x + h * 41.0;
    float L = 6.0 + 4.0 * h;
    float si = floor(along / L);
    float sf = fract(along / L);
    float h2 = wgHash(vec2(zi, si) + 9.1);
    float a = along * 1.0 + h2 * 13.0;
    float across = zf * pw + h2 * 3.0;
    float warp = wgNoise(vec2(a * 0.12, across * 1.4)) * 2.6 + wgNoise(vec2(a * 0.5, across * 4.0)) * 0.6;
    float b = mix(0.5, 0.5 + 0.5 * sin((across * 9.0 + warp) * 3.1416), smoothstep(0.5, 0.2, fw * 9.0));
    float streak = mix(0.5, wgNoise(vec2(a * 1.4, across * 22.0 + warp * 3.0)), smoothstep(0.6, 0.25, fw * 22.0));
    vec3 c = mix(vec3(0.03, 0.019, 0.011), vec3(0.075, 0.046, 0.026), smoothstep(0.15, 0.85, b));
    c *= 0.82 + 0.36 * streak;
    c *= 0.78 + 0.44 * h2;                                   // plank-to-plank tone
    float gw = max(0.012, fw * 1.2 / pw);
    float gap = smoothstep(0.0, gw, zf) * smoothstep(1.0, 1.0 - gw, zf) * smoothstep(0.0, gw * pw / L, sf) * smoothstep(1.0, 1.0 - gw * pw / L, sf);
    c *= mix(mix(0.25, 0.8, smoothstep(0.012, 0.05, fw)), 1.0, gap);
    rough = clamp(0.5 + (0.5 - b) * 0.15 + (1.0 - gap) * 0.3 + (streak - 0.5) * 0.12, 0.25, 0.95);
    return c;
  }
`;
function createTable(r, t, e) {
  const i = new THREE.PlaneGeometry(150, 150, 1, 1);
  i.rotateX(-Math.PI / 2);
  const s = new THREE.MeshStandardMaterial({
      color: 16777215,
      roughness: 0.55,
      metalness: 0,
      envMap: e,
      envMapIntensity: 0.6,
    }),
    n = PLINTH.coreW + PLINTH.footOffset,
    o = PLINTH.coreD + PLINTH.footOffset,
    a = PLINTH.cornerR + PLINTH.footOffset;
  patchStudioMaterial(s, r, t, {
    key: "wg-glass-table",
    vars: GLSL_TABLE_WOOD + GLSL_SD_ROUNDED_RECT + GLSL_BACKDROP,
    color:
      "float tRough; diffuseColor.rgb = tableWood(vXWorld.xz, length(fwidth(vXWorld.xz)), tRough);",
    rough: "roughnessFactor = tRough;",
    light: `
      // studio pool: the light is focused on the case and falls off across the table
      float rr = length(vXWorld.xz * vec2(0.85, 1.0));
      float pool = mix(0.15, 1.0, exp(-pow(max(rr - 6.0, 0.0) / 6.5, 2.0)));
      reflectedLight.directDiffuse *= pool;
      reflectedLight.directSpecular *= pool;
      // contact shadow + broad ambient occlusion around the plinth
      float sd = max(sdRRect(vXWorld.xz, vec2(${glslFloat2(n)}, ${glslFloat2(o)}), ${glslFloat2(a)}), 0.0);
      float ao = (1.0 - 0.8 * exp(-sd / 0.09)) * (1.0 - 0.45 * exp(-sd / 0.7)) * (1.0 - 0.3 * exp(-sd / 2.8));
      reflectedLight.indirectDiffuse *= ao * mix(0.5, 1.0, pool);
      reflectedLight.indirectSpecular *= ao * pool;
      reflectedLight.directDiffuse *= mix(0.4, 1.0, smoothstep(0.0, 0.08, sd));`,
    final: `
      float fr = length(vXWorld.xz * vec2(1.0, 1.2));
      float fade = smoothstep(9.0, 25.0, fr);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, gBackdrop(normalize(vXWorld - cameraPosition)), fade);`,
  });
  const l = new THREE.Mesh(i, s);
  return (
    (l.position.y = TABLE_Y),
    (l.receiveShadow = !0),
    (l.name = "glassTable"),
    (l.renderOrder = 0.5),
    l
  );
}
function createBackdrop(r, t) {
  const e = new THREE.ShaderMaterial({
      uniforms: {
        ...r.uniforms,
        ...t,
      },
      vertexShader: r.GLSL_COMMON + BACKDROP_VERTEX_SHADER,
      fragmentShader: r.GLSL_COMMON + GLSL_BACKDROP + BACKDROP_FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthWrite: !1,
    }),
    i = new THREE.Mesh(new THREE.SphereGeometry(95, 40, 20), e);
  return (
    (i.frustumCulled = !1),
    (i.renderOrder = 1),
    (i.name = "glassBackdrop"),
    i
  );
}
export class CaseStand {
  constructor(t, e, i, s, n) {
    ((this.ctx = t),
      (this.plinth = createPlinth(t, e, i)),
      (this.plaque = createPlaque(t, e, i)),
      (this.plaqueBack = createPlaque(t, e, i, "ThatZaliaSGuy", !0)),
      (this.gauge = createGauge(t, e, i, s)),
      (this.table = createTable(t, e, i)),
      (this.backdrop = createBackdrop(t, e)),
      n.add(
        this.plinth,
        this.plaque,
        this.plaqueBack,
        this.gauge.group,
        this.table,
        this.backdrop,
      ),
      (this.mats = [
        this.plinth.material,
        this.plaque.material,
        this.plaqueBack.material,
        this.table.material,
        this.gauge.group.children[0].material,
        this.gauge.hum.material,
        this.gauge.tmp.material,
      ]),
      (this.needles = [
        {
          mesh: this.gauge.hum,
          a: this._angle(0.5),
          v: 0,
        },
        {
          mesh: this.gauge.tmp,
          a: this._angle(0.5),
          v: 0,
        },
      ]),
      (this.center = new THREE.Vector3(
        GAUGE.x,
        PLINTH.friezeY,
        PLINTH.friezeZ + 0.04,
      )));
  }
  _angle(t) {
    return (
      GAUGE_START_ANGLE -
      Math.min(1.04, Math.max(-0.04, t)) * GAUGE_SWEEP_ANGLE -
      Math.PI / 2
    );
  }
  hitGauge(t) {
    return t.distanceSqToPoint(this.center) > GAUGE.bezel * GAUGE.bezel
      ? 1 / 0
      : t.origin.distanceTo(this.center);
  }
  tapGauge(t = 1) {
    ((this.needles[0].v += (Math.random() < 0.5 ? -1 : 1) * 2.2 * t),
      (this.needles[1].v += (Math.random() < 0.5 ? -1 : 1) * 1.6 * t));
  }
  hitPlinth(t, e) {
    const i =
      this._box ||
      (this._box = new THREE.Box3(
        new THREE.Vector3(
          -6.36 - PLINTH.footOffset,
          PLINTH.bottom,
          -4.36 - PLINTH.footOffset,
        ),
        new THREE.Vector3(
          PLINTH.coreW + PLINTH.footOffset,
          PLINTH.top,
          PLINTH.coreD + PLINTH.footOffset,
        ),
      ));
    return t.intersectBox(i, e) ? t.origin.distanceTo(e) : 1 / 0;
  }
  update(t, e) {
    const i = this.ctx.world,
      s = [
        (i.humidity * 100 - HUMIDITY_RANGE[0]) /
          (HUMIDITY_RANGE[1] - HUMIDITY_RANGE[0]),
        (i.seaLevelTemp - TEMPERATURE_RANGE[0]) /
          (TEMPERATURE_RANGE[1] - TEMPERATURE_RANGE[0]),
      ],
      n = Math.min(t, 1 / 30);
    for (let o = 0; o < 2; o++) {
      const a = this.needles[o],
        l = this._angle(s[o]);
      (n > 0
        ? ((a.v += ((l - a.a) * 38 - a.v * 7.5) * n), (a.a += a.v * n))
        : this._first !== !1 && (a.a = l),
        (a.mesh.rotation.z = a.a));
    }
    this._first = !1;
    for (const o of this.mats)
      o.envMapIntensity = e * (o === this.table.material ? 0.55 : 1);
  }
}
