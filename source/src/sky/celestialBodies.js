/**
 * Billboarded sun disc with corona and glare and a shaded moon with maria, craters and corona, including occlusion and hit-testing.
 */
import * as THREE from "three";
import { BOX } from "../core/config.js";
import { clamp, damp, lerp2, smoothstep2 } from "../util/math.js";
const SUN_RADIUS = 0.32;
const MOON_RADIUS = 0.36;
const BILLBOARD_VERTEX_SHADER = `
uniform vec2 uHalf;      // quad half-size (world units)
varying vec2 vUv;        // -1..1 across the quad
void main() {
  vUv = position.xy * 2.0;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += vUv * uHalf;
  gl_Position = projectionMatrix * mv;
}
`;
const SUN_FRAGMENT_SHADER = `
uniform vec3 uCore;      // disc colour (HDR)
uniform vec3 uLimb;      // limb-darkening tint (redder toward the rim)
uniform vec3 uGlow;      // chromosphere / corona colour (HDR, saturated)
uniform float uDiscR;    // disc radius as a fraction of the quad half-size
uniform float uCorona;
uniform float uSquash;   // < 1 flattens the disc near the horizon
uniform float uFade;
uniform float uPulse;
varying vec2 vUv;
void main() {
  vec2 p = vec2(vUv.x, vUv.y / uSquash);
  vec2 q = p / uDiscR;                         // disc space: |q| = 1 at the limb
  float r = length(q);
  float aa = max(fwidth(r), 1e-3) * 1.2;
  float disc = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  vec3 col = vec3(0.0);
  if (disc > 0.0) {
    float mu = sqrt(max(1.0 - r * r, 0.0));
    vec3 limb = mix(uLimb, vec3(1.0), pow(mu, 0.55));
    // slow boiling granulation
    float g = wgNoise3(vec3(q * 3.5, uTime * 0.32)) * 0.6 + wgNoise3(vec3(q * 9.0 + 7.0, uTime * 0.55)) * 0.4;
    col = uCore * limb * (0.9 + 0.2 * g) * disc;
  }
  // outside the limb: a bright thin chromosphere, streamered corona, faint warm aureole
  float d = max(r - 1.0, 0.0);
  float ang = atan(q.y, q.x);
  float streamers = 0.7 + 0.3 * wgNoise(vec2(ang * 6.0 + uTime * 0.05, d * 0.7 - uTime * 0.12));
  float glow = exp(-d * 7.0) * 0.9 + exp(-d * 1.7) * 0.3 * streamers + exp(-d * 0.42) * 0.06;
  col += uGlow * glow * (1.0 + uPulse * 0.8) * uCorona * (1.0 - disc);
  float edge = 1.0 - smoothstep(0.7, 1.0, length(vUv));
  gl_FragColor = vec4(col * edge * uFade, 0.0);
}
`;
const SUN_GLARE_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uRot;
uniform float uAspect;   // glare quad is wider than tall
varying vec2 vUv;
void main() {
  vec2 p = vUv * vec2(uAspect, 1.0);
  float d = length(p);
  float ang = atan(p.y, p.x) + uRot;
  // thin 6-point aperture starburst + finer rays (no broad veil: that reads as a grey smudge)
  float spikes = pow(abs(cos(ang * 3.0)), 220.0) * exp(-d * 5.0);
  spikes += pow(abs(cos(ang * 7.0 + 0.4)), 320.0) * exp(-d * 8.0) * 0.45;
  // faint anamorphic streak
  float streak = exp(-abs(vUv.y) * 60.0) * exp(-abs(p.x) * 1.8) * 0.22;
  float core = exp(-d * d * 60.0) * 0.5;
  vec3 col = uColor * (spikes * 0.6 + streak + core);
  float edge = 1.0 - smoothstep(0.7, 1.0, max(abs(vUv.x), abs(vUv.y)));
  gl_FragColor = vec4(col * uIntensity * edge, 0.0);
}
`;
const MOON_FRAGMENT_SHADER = `
uniform vec3 uSunV;      // sun direction in view space (biased toward the viewer: mostly full)
uniform vec3 uTint;      // albedo × brightness (HDR)
uniform vec3 uHaloCol;
uniform float uDiscR;
uniform float uHalo;
uniform float uCoronaRing; // lunar corona (humid air)
uniform float uFade;
uniform float uPulse;
varying vec2 vUv;

// soft elliptical blob in disc space
float blob(vec2 q, vec2 c, vec2 r, float rot) {
  vec2 d = q - c;
  float cs = cos(rot), sn = sin(rot);
  d = vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y) / r;
  return 1.0 - smoothstep(0.55, 1.0, length(d));
}
// crater with a dark floor, bright rim and optional ejecta rays; foreshortened toward the limb
vec2 crater(vec2 q, vec2 c, float r, float rays) {
  vec2 d = q - c;
  float fz = sqrt(max(1.0 - dot(c, c), 0.05));
  vec2 radial = normalize(c + 1e-4);
  float along = dot(d, radial) / fz;
  vec2 dd = vec2(along, dot(d, vec2(-radial.y, radial.x)));
  float l = length(dd) / r;
  float floorD = (1.0 - smoothstep(0.6, 0.95, l)) * 0.18;
  float rim = exp(-pow((l - 1.0) * 5.0, 2.0)) * 0.22;
  float ang = atan(dd.y, dd.x);
  float ray = rays * pow(abs(sin(ang * 7.0 + 1.3) * sin(ang * 3.0)), 6.0) * exp(-max(l - 1.0, 0.0) * 1.3) * step(1.0, l);
  return vec2(rim + ray * 0.35, floorD);
}

void main() {
  vec2 p = vUv;
  vec2 q = p / uDiscR;
  float r = length(q);
  float aa = max(fwidth(r), 1e-3) * 1.5;
  float disc = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  vec3 col = vec3(0.0);
  if (r < 1.0 + aa) {
    vec3 n = vec3(q, sqrt(max(1.0 - r * r, 0.0)));
    // maria (the familiar near-side face)
    float warp = wgNoise(q * 3.0 + 4.0) * 0.12;
    vec2 w = q + warp;
    float m = 0.0;
    m = max(m, blob(w, vec2(-0.32, 0.36), vec2(0.36, 0.28), 0.3));   // Imbrium
    m = max(m, blob(w, vec2(-0.55, -0.02), vec2(0.28, 0.5), 0.1));   // Procellarum
    m = max(m, blob(w, vec2(0.18, 0.34), vec2(0.18, 0.16), 0.0));    // Serenitatis
    m = max(m, blob(w, vec2(0.32, 0.08), vec2(0.24, 0.2), -0.4));    // Tranquillitatis
    m = max(m, blob(w, vec2(0.68, 0.28), vec2(0.12, 0.14), 0.0));    // Crisium
    m = max(m, blob(w, vec2(0.46, -0.24), vec2(0.18, 0.14), 0.3));   // Fecunditatis
    m = max(m, blob(w, vec2(-0.12, -0.36), vec2(0.22, 0.14), 0.2));  // Nubium
    m *= 0.75 + 0.25 * wgNoise(q * 9.0);
    float alb = mix(1.0, 0.56, m);
    // fine regolith texture
    alb *= 0.9 + 0.1 * wgNoise(q * 22.0) + 0.05 * wgNoise(q * 47.0);
    // craters: Tycho (rays), Copernicus, Kepler, Aristarchus, Plato, Grimaldi + small ones
    vec2 cr = crater(q, vec2(-0.12, -0.62), 0.07, 1.0);
    vec2 c2 = crater(q, vec2(-0.3, 0.12), 0.06, 0.45); cr += c2;
    c2 = crater(q, vec2(-0.5, 0.08), 0.04, 0.3); cr += c2;
    c2 = crater(q, vec2(-0.66, 0.3), 0.035, 0.2); cr += c2;
    c2 = crater(q, vec2(-0.1, 0.7), 0.05, 0.0); cr.y += c2.y * 1.6; cr.x += c2.x * 0.4;
    c2 = crater(q, vec2(-0.82, -0.1), 0.06, 0.0); cr.y += c2.y * 1.8;
    c2 = crater(q, vec2(0.3, -0.52), 0.05, 0.0); cr += c2 * 0.7;
    c2 = crater(q, vec2(0.58, -0.5), 0.045, 0.0); cr += c2 * 0.7;
    c2 = crater(q, vec2(0.1, -0.14), 0.035, 0.0); cr += c2 * 0.6;
    alb = alb * (1.0 - cr.y) + cr.x * 0.8;
    // Lommel–Seeliger: the lunar disc stays flat-bright right to the limb
    float mu0 = max(dot(n, uSunV), 0.0);
    float mu = max(n.z, 0.05);
    float ls = mu0 / (mu0 + mu) * 2.0;
    float term = smoothstep(-0.02, 0.12, dot(n, uSunV));
    float lit = mix(0.035, 1.0, term) * ls;   // faint earthshine on the dark side
    col = uTint * alb * lit * disc;
  }
  float d = length(p) / uDiscR;
  float halo = exp(-max(d - 1.0, 0.0) * 4.5) * 0.16 + exp(-max(d - 1.0, 0.0) * 0.9) * 0.04;
  halo *= uHalo * (1.0 + uPulse);
  // lunar corona: pale iridescent ring when the air is humid
  float ringX = d - 2.6;
  vec3 iri = 0.6 + 0.4 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + d * 0.9));
  vec3 ring = iri * exp(-ringX * ringX * 3.0) * 0.07 * uCoronaRing;
  col += (uHaloCol * halo + ring * uHaloCol) * (1.0 - disc * 0.9);
  float edge = 1.0 - smoothstep(0.62, 1.0, length(p));
  gl_FragColor = vec4(col * edge * uFade, 0.0);
}
`;
function makeAdditiveBlend(r) {
  return (
    (r.transparent = !0),
    (r.depthWrite = !1),
    (r.blending = THREE.CustomBlending),
    (r.blendEquation = THREE.AddEquation),
    (r.blendSrc = THREE.OneFactor),
    (r.blendDst = THREE.OneFactor),
    (r.blendSrcAlpha = THREE.ZeroFactor),
    (r.blendDstAlpha = THREE.OneFactor),
    r
  );
}
const celestialScratch = new THREE.Vector3();
const sunOffsetScratch = new THREE.Vector3();
const occlusionRayVector = new THREE.Vector3();
const occlusionHitPoint = new THREE.Vector3();
const occlusionRay = new THREE.Ray();
const cameraRightScratch = new THREE.Vector3();
const caseBoxMin = new THREE.Vector3(-BOX.halfW, BOX.bottomY, -BOX.halfD);
const caseBoxMax = new THREE.Vector3(BOX.halfW, BOX.topY, BOX.halfD);
const CASE_BOUNDS = new THREE.Box3(caseBoxMin, caseBoxMax);
class CelestialOrb {
  constructor(t, e) {
    ((this.name = t),
      (this.radius = e),
      (this.position = new THREE.Vector3()),
      (this.fade = 0),
      (this.visibility = 1),
      (this.hover = 0),
      (this.hovered = !1),
      (this.grabbed = !1),
      (this.pulse = 0),
      (this.screen = new THREE.Vector2()),
      (this.screenR = 0),
      (this.onScreen = !1),
      (this._occ = [1, 1, 1]),
      (this._cloudOcc = 0));
  }
}
export class CelestialBodies {
  constructor(t, e) {
    this.ctx = t;
    const i = THREE;
    ((this.sun = new CelestialOrb("sun", SUN_RADIUS)),
      (this.moon = new CelestialOrb("moon", MOON_RADIUS)),
      (this._frame = 0));
    const s = new i.PlaneGeometry(1, 1),
      n = () => ({
        ...t.uniforms,
        uHalf: {
          value: new i.Vector2(1, 1),
        },
        uFade: {
          value: 0,
        },
        uPulse: {
          value: 0,
        },
      });
    ((this.sunMat = makeAdditiveBlend(
      new i.ShaderMaterial({
        name: "sky-sun",
        uniforms: {
          ...n(),
          uCore: {
            value: new i.Color(),
          },
          uLimb: {
            value: new i.Color(0.62, 0.34, 0.16),
          },
          uGlow: {
            value: new i.Color(),
          },
          uDiscR: {
            value: 0.1,
          },
          uCorona: {
            value: 1,
          },
          uSquash: {
            value: 1,
          },
        },
        vertexShader: BILLBOARD_VERTEX_SHADER,
        fragmentShader: t.GLSL_COMMON + SUN_FRAGMENT_SHADER,
      }),
    )),
      (this.sunMesh = new i.Mesh(s, this.sunMat)),
      (this.sunMesh.name = "sky-sun"),
      (this.glareMat = makeAdditiveBlend(
        new i.ShaderMaterial({
          name: "sky-sun-glare",
          uniforms: {
            uHalf: {
              value: new i.Vector2(1, 1),
            },
            uColor: {
              value: new i.Color(),
            },
            uIntensity: {
              value: 0,
            },
            uRot: {
              value: 0,
            },
            uAspect: {
              value: 2.2,
            },
          },
          vertexShader: BILLBOARD_VERTEX_SHADER,
          fragmentShader: SUN_GLARE_FRAGMENT_SHADER,
        }),
      )),
      (this.glareMat.depthTest = !1),
      (this.glareMesh = new i.Mesh(s, this.glareMat)),
      (this.glareMesh.name = "sky-sun-glare"),
      (this.glareMesh.renderOrder = 30),
      (this.moonMat = makeAdditiveBlend(
        new i.ShaderMaterial({
          name: "sky-moon",
          uniforms: {
            ...n(),
            uSunV: {
              value: new i.Vector3(0, 0, 1),
            },
            uTint: {
              value: new i.Color(),
            },
            uHaloCol: {
              value: new i.Color(),
            },
            uDiscR: {
              value: 0.2,
            },
            uHalo: {
              value: 1,
            },
            uCoronaRing: {
              value: 0,
            },
          },
          vertexShader: BILLBOARD_VERTEX_SHADER,
          fragmentShader: t.GLSL_COMMON + MOON_FRAGMENT_SHADER,
        }),
      )),
      (this.moonMesh = new i.Mesh(s, this.moonMat)),
      (this.moonMesh.name = "sky-moon"));
    for (const o of [this.sunMesh, this.glareMesh, this.moonMesh])
      ((o.frustumCulled = !1),
        (o.userData.noReflect = !0),
        (o.matrixAutoUpdate = !0),
        e.add(o));
    ((this.sunCore = new i.Color()), (this.sunGlow = new i.Color()));
  }
  _project(t) {
    const { camera: e, renderer: i } = this.ctx,
      s = i.domElement,
      n = s.clientWidth || window.innerWidth,
      o = s.clientHeight || window.innerHeight;
    if ((celestialScratch.copy(t.position).project(e), celestialScratch.z > 1))
      return ((t.onScreen = !1), !1);
    t.screen.set(
      (celestialScratch.x * 0.5 + 0.5) * n,
      (-celestialScratch.y * 0.5 + 0.5) * o,
    );
    const a = e.position.distanceTo(t.position),
      l = THREE.MathUtils.degToRad(e.fov);
    return (
      (t.screenR = (t.radius / (a * Math.tan(l * 0.5))) * o * 0.5),
      (t.onScreen =
        Math.abs(celestialScratch.x) < 1.2 &&
        Math.abs(celestialScratch.y) < 1.2),
      !0
    );
  }
  _occlusion(t, e) {
    const { camera: i, terrain: s } = this.ctx,
      n = this._frame % 3;
    (celestialScratch.copy(t.position),
      n > 0 &&
        (cameraRightScratch.setFromMatrixColumn(i.matrixWorld, 0),
        celestialScratch.addScaledVector(
          cameraRightScratch,
          (n === 1 ? -0.7 : 0.7) * t.radius,
        )),
      occlusionRay.origin.copy(i.position));
    const o = occlusionRayVector
      .subVectors(celestialScratch, i.position)
      .length();
    occlusionRay.direction.copy(occlusionRayVector).divideScalar(o);
    let a = 1;
    if (occlusionRay.intersectsBox(CASE_BOUNDS)) {
      const f = s.raycast(occlusionRay, occlusionHitPoint, o);
      f && f.distanceTo(i.position) < o && (a = 0);
    }
    t._occ[n] = a;
    let l = 0;
    const c = this.ctx.modules.clouds?.list;
    if (c) {
      occlusionRay.direction.subVectors(t.position, i.position).normalize();
      for (let f = 0; f < c.length; f++) {
        const u = c[f];
        if (!u?.position) continue;
        const d = (u.radius ?? u.size ?? 1) * 0.85,
          p = occlusionRay.distanceSqToPoint(u.position);
        p < d * d && (l = Math.max(l, (1 - Math.sqrt(p) / d) * 1.4));
      }
    }
    t._cloudOcc = damp(t._cloudOcc, clamp(l, 0, 1), 6, e);
    const h = t._occ[0] * 0.5 + t._occ[1] * 0.25 + t._occ[2] * 0.25;
    t.visibility = damp(t.visibility, h, 10, e);
  }
  _sortOrder(t, e) {
    const i = this.ctx.camera.position;
    (occlusionRay.origin.copy(i),
      occlusionRay.direction.subVectors(t.position, i));
    const s = occlusionRay.direction.length();
    occlusionRay.direction.divideScalar(s);
    const n = occlusionRay.intersectBox(CASE_BOUNDS, occlusionHitPoint)
      ? occlusionHitPoint.distanceTo(i)
      : 1 / 0;
    e.renderOrder = n < s ? 1.9 : 30;
  }
  update(t, e, i) {
    const { world: s, camera: n } = this.ctx;
    this._frame++;
    const o = this.sun,
      a = this.moon;
    (o.position.copy(s.sunPosition), a.position.copy(s.moonPosition));
    const l = clamp(s.cloudCover * 0.55 + s.storminess * 0.75, 0, 1),
      c = smoothstep2(0.1, 0.55, l);
    {
      const z = celestialScratch.set(0, 1.6, 0).sub(n.position),
        L = z.length(),
        k = sunOffsetScratch.copy(o.position).sub(n.position),
        U = k.length(),
        F = Math.acos(clamp(z.dot(k) / (L * U + 1e-6), -1, 1)),
        G = smoothstep2(Math.atan(8.5 / L) * 1.15, Math.atan(5 / L), F),
        B = smoothstep2(L - 2, L - 6, U);
      this.inFront = damp(this.inFront || 0, G * B, 6, t);
    }
    const h = lerp2(1, 0.22, this.inFront),
      f = s.sunElevation;
    o.fade = smoothstep2(-0.17, 0.03, f);
    const u = smoothstep2(0.5, -0.02, f),
      d = smoothstep2(0.06, -0.08, f);
    (this.sunCore
      .setRGB(1, lerp2(0.95, 0.5, u), lerp2(0.86, 0.16, u))
      .lerp(scratchColor(1, 0.32, 0.07), d),
      this.sunCore.multiplyScalar(
        lerp2(10, 4.2, u) *
          lerp2(1, 0.75, d) *
          lerp2(1, 0.04, c) *
          lerp2(1, 0.45, this.inFront),
      ),
      this.sunGlow
        .setRGB(1, lerp2(0.74, 0.42, u), lerp2(0.42, 0.12, u))
        .lerp(scratchColor(1, 0.28, 0.08), d),
      (o.hover = damp(o.hover, o.hovered || o.grabbed ? 1 : 0, 9, t)),
      (o.pulse = Math.max(0, o.pulse - t * 1.6)));
    const p = 1 + Math.sin(e * 1.3) * 0.03,
      v = 1 + o.hover * 0.2 + (o.grabbed ? 0.08 : 0),
      g = SUN_RADIUS * (1 + 0.35 * u) * v,
      x = 0.1,
      m = this.sunMat.uniforms;
    (m.uHalf.value.set(g / x, g / x),
      (m.uDiscR.value = x),
      m.uCore.value.copy(this.sunCore).multiplyScalar(1 + o.hover * 0.3),
      m.uLimb.value.setRGB(0.66, lerp2(0.36, 0.22, u), lerp2(0.16, 0.06, u)),
      m.uGlow.value
        .copy(this.sunGlow)
        .multiplyScalar(lerp2(1.7, 1.9, u) * p * lerp2(1, 0.1, c) * h),
      (m.uCorona.value =
        (1 + s.humidity * 0.3 + o.hover * 0.9) * lerp2(1, 1.6, s.golden)),
      (m.uSquash.value = 1 - 0.14 * smoothstep2(0.1, -0.06, f)),
      (m.uFade.value = o.fade),
      (m.uPulse.value = o.pulse),
      this.sunMesh.position.copy(o.position),
      (this.sunMesh.visible = o.fade > 0.001),
      this._sortOrder(o, this.sunMesh),
      this.sunMesh.visible && this._occlusion(o, t),
      this._project(o));
    const w = o.fade * o.visibility * (1 - o._cloudOcc) * (1 - c),
      y = this.glareMat.uniforms,
      _ = SUN_RADIUS * 7 * (1 + 0.25 * u + o.hover * 0.2);
    (y.uHalf.value.set(_ * 2.2, _),
      (y.uAspect.value = 2.2),
      y.uColor.value.copy(this.sunGlow),
      (y.uIntensity.value =
        w * (0.9 + 0.4 * u + o.hover * 0.5 + o.pulse * 0.8) * h),
      (y.uRot.value =
        Math.atan2(o.position.x - n.position.x, o.position.z - n.position.z) *
        0.6),
      this.glareMesh.position.copy(o.position),
      (this.glareMesh.visible = w > 0.003));
    const M = s.moonDir.y;
    ((a.fade = smoothstep2(-0.14, 0.04, M) * (0.35 + 0.65 * s.night)),
      (a.hover = damp(a.hover, a.hovered || a.grabbed ? 1 : 0, 9, t)),
      (a.pulse = Math.max(0, a.pulse - t * 1.6)));
    const A = 1 + a.hover * 0.2 + (a.grabbed ? 0.08 : 0),
      b = 0.2,
      S = this.moonMat.uniforms,
      E = MOON_RADIUS * A;
    (S.uHalf.value.set(E / b, E / b),
      (S.uDiscR.value = b),
      celestialScratch.copy(s.sunDir).transformDirection(n.matrixWorldInverse),
      (celestialScratch.z += 1.25),
      S.uSunV.value.copy(celestialScratch.normalize()));
    const T = smoothstep2(0.35, 0, M),
      R =
        lerp2(1.05, 0.8, 1 - s.night) *
        (1 + a.hover * 0.25) *
        lerp2(1, 0.08, c);
    (S.uTint.value
      .setRGB(0.93, lerp2(0.95, 0.84, T), lerp2(1, 0.7, T))
      .multiplyScalar(R),
      S.uHaloCol.value
        .setRGB(0.55, 0.64, 0.9)
        .multiplyScalar(0.9 + a.hover * 0.5),
      (S.uHalo.value = 1 + s.humidity * 0.6),
      (S.uCoronaRing.value =
        smoothstep2(0.45, 0.85, s.humidity) * (1 - s.storminess)),
      (S.uFade.value = a.fade),
      (S.uPulse.value = a.pulse),
      this.moonMesh.position.copy(a.position),
      (this.moonMesh.visible = a.fade > 0.001),
      this._sortOrder(a, this.moonMesh),
      this.moonMesh.visible && this._occlusion(a, t),
      this._project(a),
      (i.sunVisibility = w));
  }
  hitTest(t) {
    let e = null;
    for (const i of [this.sun, this.moon]) {
      if (
        i.fade < 0.2 ||
        !i.onScreen ||
        (i.visibility < 0.3 && !i.grabbed) ||
        ((i._cloudOcc || 0) > 0.3 && !i.grabbed)
      )
        continue;
      const s = Math.hypot(t.x - i.screen.x, t.y - i.screen.y),
        n = Math.max(18, i.screenR * 1.4);
      s > n ||
        ((!e || s < e.screenD) &&
          (e = {
            body: i.name,
            screenD: s,
            distance: this.ctx.camera.position.distanceTo(i.position),
          }));
    }
    return e;
  }
  orb(t) {
    return t === "moon" ? this.moon : this.sun;
  }
}
const colorScratch = new THREE.Color();
function scratchColor(r, t, e) {
  return colorScratch.setRGB(r, t, e);
}
