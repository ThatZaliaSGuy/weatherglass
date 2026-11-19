/**
 * Starfield: twinkling point stars inside the case and occasional shooting-star meteors.
 */
import * as THREE from "three";
import { BOX } from "../core/config.js";
import { mulberry32 } from "../util/noise.js";
import { clamp, damp, smoothstep2 } from "../util/math.js";
const STAR_VERTEX_SHADER = `
attribute vec3 aStar;      // seed, magnitude (0 faint … 1 bright), colour temperature
uniform float uTime;
uniform float uVis;
uniform float uScale;      // px per world unit at distance 1
varying vec3 vCol;
varying float vA;
varying float vSpike;
void main() {
  float seed = aStar.x, mag = aStar.y, temp = aStar.z;
  vec3 p = position;
  p.x += sin(uTime * 0.05 + seed * 40.0) * 0.05;
  p.y += sin(uTime * 0.07 + seed * 17.0) * 0.035;
  p.z += sin(uTime * 0.04 + seed * 29.0) * 0.05;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // scintillation: two beating sines, faint stars twinkle harder
  float tw = sin(uTime * (1.6 + seed * 4.1) + seed * 61.0) * sin(uTime * (0.85 + seed * 2.3) + seed * 13.0);
  tw = 1.0 + tw * mix(0.55, 0.22, mag);
  float px = mix(0.016, 0.045, mag) * uScale / max(-mv.z, 0.1);
  gl_PointSize = clamp(px * 3.2, 2.0, 11.0);
  vA = uVis * mix(0.12, 1.0, mag * mag) * tw;
  vCol = mix(vec3(0.66, 0.78, 1.0), vec3(1.0, 0.84, 0.66), temp);
  vSpike = smoothstep(0.7, 1.0, mag);
  gl_Position = projectionMatrix * mv;
}
`;
const STAR_FRAGMENT_SHADER = `
uniform float uBright;
varying vec3 vCol;
varying float vA;
varying float vSpike;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 30.0);
  float glow = exp(-r2 * 7.0) * 0.12;
  float spike = (exp(-abs(c.x) * 30.0) + exp(-abs(c.y) * 30.0)) * (1.0 - r2) * vSpike * 0.4;
  float I = (core + glow + spike) * vA;
  gl_FragColor = vec4(vCol * I * uBright, clamp(I, 0.0, 1.0) * 0.6);
}
`;
const METEOR_VERTEX_SHADER = `
attribute float aT;       // 0 tail … 1 head
attribute float aSide;    // −1 / +1 across the streak
uniform vec3 uHead;
uniform vec3 uTail;
uniform float uWidth;
varying float vT;
varying float vSide;
void main() {
  vec3 p = mix(uTail, uHead, aT);
  vec3 dir = normalize(uHead - uTail);
  vec3 toCam = normalize(cameraPosition - p);
  vec3 side = normalize(cross(dir, toCam));
  p += side * aSide * uWidth * (0.3 + 0.7 * aT);
  vT = aT;
  vSide = aSide;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;
const METEOR_FRAGMENT_SHADER = `
uniform float uAlpha;
varying float vT;
varying float vSide;
void main() {
  float a = pow(vT, 2.2) * exp(-vSide * vSide * 3.0) * uAlpha;
  vec3 c = mix(vec3(0.6, 0.75, 1.0), vec3(1.0, 0.97, 0.9), vT);
  gl_FragColor = vec4(c * a * 5.0, 0.0);
}
`;
function makeAdditiveStarBlend(r, t) {
  return (
    (r.transparent = !0),
    (r.depthWrite = !1),
    (r.blending = THREE.CustomBlending),
    (r.blendEquation = THREE.AddEquation),
    (r.blendSrc = THREE.OneFactor),
    (r.blendDst = THREE.OneFactor),
    (r.blendSrcAlpha = t ? THREE.OneFactor : THREE.ZeroFactor),
    (r.blendDstAlpha = t ? THREE.OneMinusSrcAlphaFactor : THREE.OneFactor),
    r
  );
}
export class Starfield {
  constructor(t, e) {
    this.ctx = t;
    const i = t.quality.pick(300, 450, 600),
      s = mulberry32(358949),
      n = new Float32Array(i * 3),
      o = new Float32Array(i * 3),
      a = 0.2;
    for (let p = 0; p < i; p++)
      ((n[p * 3] = (s() * 2 - 1) * (BOX.halfW - a)),
        (n[p * 3 + 1] = 5 + (BOX.topY - 0.22 - 5) * Math.sqrt(s())),
        (n[p * 3 + 2] = (s() * 2 - 1) * (BOX.halfD - a)),
        (o[p * 3] = s()),
        (o[p * 3 + 1] = Math.pow(s(), 3.2)),
        (o[p * 3 + 2] = Math.pow(s(), 1.6)));
    const l = new THREE.BufferGeometry();
    (l.setAttribute("position", new THREE.BufferAttribute(n, 3)),
      l.setAttribute("aStar", new THREE.BufferAttribute(o, 3)),
      (this.material = makeAdditiveStarBlend(
        new THREE.ShaderMaterial({
          name: "sky-stars",
          uniforms: {
            uTime: t.uniforms.uTime,
            uVis: {
              value: 0,
            },
            uScale: {
              value: 400,
            },
            uBright: {
              value: 2.4,
            },
          },
          vertexShader: STAR_VERTEX_SHADER,
          fragmentShader: STAR_FRAGMENT_SHADER,
        }),
        !0,
      )),
      (this.points = new THREE.Points(l, this.material)),
      (this.points.name = "sky-stars"),
      (this.points.renderOrder = 2.2),
      (this.points.frustumCulled = !1),
      e.add(this.points));
    const c = 12,
      h = new THREE.BufferGeometry(),
      f = new Float32Array((c + 1) * 2),
      u = new Float32Array((c + 1) * 2),
      d = [];
    for (let p = 0; p <= c; p++)
      if (
        ((f[p * 2] = f[p * 2 + 1] = p / c),
        (u[p * 2] = -1),
        (u[p * 2 + 1] = 1),
        p < c)
      ) {
        const v = p * 2;
        d.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    (h.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array((c + 1) * 2 * 3), 3),
    ),
      h.setAttribute("aT", new THREE.BufferAttribute(f, 1)),
      h.setAttribute("aSide", new THREE.BufferAttribute(u, 1)),
      h.setIndex(d),
      (this.meteorMat = makeAdditiveStarBlend(
        new THREE.ShaderMaterial({
          name: "sky-meteor",
          uniforms: {
            uHead: {
              value: new THREE.Vector3(),
            },
            uTail: {
              value: new THREE.Vector3(),
            },
            uWidth: {
              value: 0.012,
            },
            uAlpha: {
              value: 0,
            },
          },
          vertexShader: METEOR_VERTEX_SHADER,
          fragmentShader: METEOR_FRAGMENT_SHADER,
          side: THREE.DoubleSide,
        }),
        !1,
      )),
      (this.meteor = new THREE.Mesh(h, this.meteorMat)),
      (this.meteor.name = "sky-meteor"),
      (this.meteor.renderOrder = 2.25),
      (this.meteor.frustumCulled = !1),
      (this.meteor.visible = !1),
      (this.meteor.userData.noReflect = !0),
      e.add(this.meteor),
      (this._m = {
        t: -1,
        dur: 0.8,
        from: new THREE.Vector3(),
        to: new THREE.Vector3(),
        next: 9 + s() * 12,
      }),
      (this._rand = s),
      (this.visibility = 0));
  }
  update(t) {
    const { world: e, camera: i, renderer: s } = this.ctx,
      n =
        (1 - smoothstep2(0.1, 0.75, e.cloudCover)) *
        (1 - e.storminess) *
        (1 - e.fogAmount * 0.8),
      o = smoothstep2(0.35, 0.95, e.night) * clamp(0.25 + 0.75 * n, 0, 1);
    this.visibility = damp(this.visibility, o, 1.5, t);
    const a = this.material.uniforms;
    a.uVis.value = this.visibility;
    const l = s.getContext().drawingBufferHeight;
    ((a.uScale.value =
      l / (2 * Math.tan(THREE.MathUtils.degToRad(i.fov) * 0.5))),
      (this.points.visible = this.visibility > 0.004));
    const c = this._m;
    if (c.t < 0)
      ((c.next -= t * (this.visibility > 0.5 ? 1 : 0)),
        c.next <= 0 && n > 0.6 && this._launch());
    else {
      c.t += t / c.dur;
      const h = c.t,
        f = Math.min(1, h * 1.15),
        u = Math.max(0, h * 1.15 - 0.45),
        d = this.meteorMat.uniforms;
      (d.uHead.value.lerpVectors(c.from, c.to, f),
        d.uTail.value.lerpVectors(c.from, c.to, u),
        (d.uAlpha.value = Math.sin(Math.min(1, h) * Math.PI) * this.visibility),
        h >= 1.35 &&
          ((c.t = -1),
          (this.meteor.visible = !1),
          (c.next = 14 + this._rand() * 26)));
    }
  }
  _launch() {
    const t = this._rand,
      e = this._m,
      i = BOX.topY - 0.4 - t() * 1,
      s = t() < 0.5 ? -1 : 1;
    (e.from.set(-s * (2 + t() * 3), i, -3 + t() * 5),
      e.to.set(
        e.from.x + s * (3 + t() * 3),
        i - 0.6 - t() * 0.8,
        e.from.z + (t() - 0.5) * 2.5,
      ),
      (e.to.x = clamp(e.to.x, -BOX.halfW + 0.3, BOX.halfW - 0.3)),
      (e.to.z = clamp(e.to.z, -BOX.halfD + 0.3, BOX.halfD - 0.3)),
      (e.dur = 0.55 + t() * 0.5),
      (e.t = 0),
      (this.meteor.visible = !0));
  }
}
