/**
 * Glass pane meshes with imperfection texture, fingerprints, tap rings, wipe brush and glowing edge slabs.
 */
import * as THREE from "three";
import { BOX } from "../core/config.js";
import {
  GLASS_DRIP_LIMITS,
  GLASS_OUTER_HALF_D,
  GLASS_OUTER_HALF_W,
  LID_SLAB,
} from "./caseLayout.js";
import {
  EDGE_FRAGMENT_SHADER,
  EDGE_VERTEX_SHADER,
  GLSL_STUDIO_REFLECTION,
  PANE_SURFACE_FRAGMENT_SHADER,
  PANE_TINT_FRAGMENT_SHADER,
  PANE_VERTEX_SHADER,
} from "./glassShaders.js";
import { latheRoundedRect } from "./caseFrame.js";
const paneToCameraScratch = new THREE.Vector3();
const cameraPositionScratch = new THREE.Vector3();
function createGlassImperfectionTexture() {
  const t = document.createElement("canvas");
  t.width = t.height = 1024;
  const e = t.getContext("2d");
  ((e.fillStyle = "#000"),
    e.fillRect(0, 0, 1024, 1024),
    (e.globalCompositeOperation = "lighter"));
  let i = 1234567;
  const s = () => (i = (i * 16807) % 2147483647) / 2147483647;
  for (let o = 0; o < 70; o++) {
    const a = s() * 1024,
      l = s() * 1024,
      c = 20 + s() * 90,
      h = e.createRadialGradient(a, l, 0, a, l, c),
      f = 0.05 + s() * 0.12;
    (h.addColorStop(0, `rgba(255,0,0,${f})`),
      h.addColorStop(1, "rgba(255,0,0,0)"),
      (e.fillStyle = h),
      e.save(),
      e.translate(a, l),
      e.rotate(s() * Math.PI),
      e.scale(1, 0.35 + s() * 0.6),
      e.translate(-a, -l),
      e.fillRect(a - c, l - c, c * 2, c * 2),
      e.restore());
  }
  for (let o = 0; o < 9; o++) {
    const a = s() * 1024,
      l = s() * 1024,
      c = 80 + s() * 160;
    ((e.strokeStyle = `rgba(255,0,0,${0.035 + s() * 0.04})`),
      (e.lineWidth = 12 + s() * 26),
      e.beginPath());
    const h = s() * Math.PI * 2;
    (e.arc(a, l, c, h, h + 0.8 + s() * 1.6), e.stroke());
  }
  for (let o = 0; o < 9; o++) {
    const a = s() * 1024,
      l = s() * 1024,
      c = s() * Math.PI,
      h = 6 + ((s() * 18) | 0);
    for (let f = 0; f < h; f++) {
      const u = c + (s() - 0.5) * 0.5,
        d = 10 + s() * 70,
        p = a + (s() - 0.5) * 120,
        v = l + (s() - 0.5) * 120;
      ((e.strokeStyle = `rgba(0,255,0,${0.12 + s() * 0.3})`),
        (e.lineWidth = 0.5 + s() * 0.5),
        e.beginPath(),
        e.moveTo(p, v),
        e.quadraticCurveTo(
          p + Math.cos(u) * d * 0.5 + (s() - 0.5) * 6,
          v + Math.sin(u) * d * 0.5 + (s() - 0.5) * 6,
          p + Math.cos(u) * d,
          v + Math.sin(u) * d,
        ),
        e.stroke());
    }
  }
  for (let o = 0; o < 6; o++) {
    const a = s() * 1024,
      l = s() * 1024,
      c = s() * Math.PI,
      h = 200 + s() * 400;
    ((e.strokeStyle = `rgba(0,255,0,${0.1 + s() * 0.2})`),
      (e.lineWidth = 0.6),
      e.beginPath(),
      e.moveTo(a, l),
      e.lineTo(a + Math.cos(c) * h, l + Math.sin(c) * h),
      e.stroke());
  }
  for (let o = 0; o < 900; o++) {
    e.fillStyle = `rgba(0,0,255,${0.3 + s() * 0.7})`;
    const a = 0.5 + s() * 1.3;
    (e.beginPath(), e.arc(s() * 1024, s() * 1024, a, 0, Math.PI * 2), e.fill());
  }
  const n = new THREE.CanvasTexture(t);
  return (
    (n.wrapS = n.wrapT = THREE.RepeatWrapping),
    (n.anisotropy = 4),
    (n.colorSpace = THREE.NoColorSpace),
    (n.name = "glassImperfections"),
    n
  );
}
function createPaneGeometry(r) {
  const t = new THREE.BufferGeometry(),
    [e, i, s] = r.c,
    n = r.t,
    o = r.b,
    a = new Float32Array(12),
    l = new Float32Array(8);
  return (
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].forEach(([h, f], u) => {
      const d = h * r.hu,
        p = f * r.hv;
      ((a[u * 3] = e + n[0] * d + o[0] * p),
        (a[u * 3 + 1] = i + n[1] * d + o[1] * p),
        (a[u * 3 + 2] = s + n[2] * d + o[2] * p),
        (l[u * 2] = d),
        (l[u * 2 + 1] = p));
    }),
    t.setAttribute("position", new THREE.BufferAttribute(a, 3)),
    t.setAttribute("aPane", new THREE.BufferAttribute(l, 2)),
    t.setIndex([0, 1, 2, 0, 2, 3]),
    t.computeBoundingSphere(),
    t
  );
}
const FINGERPRINTS_BY_PANE = {
  front: [
    [4.6, 3.6, 0.6, 0.2],
    [5.05, 3.2, 0.3, 0.17],
    [-3.2, -2.6, -0.4, 0.19],
  ],
  right: [[-2.6, 2.9, 0.9, 0.18]],
  left: [[2.2, -1.4, -0.7, 0.18]],
  lid: [
    [0.42, 0.35, 0.4, 0.17],
    [-0.5, -0.2, 2.1, 0.18],
    [0.05, -0.55, 1.2, 0.16],
  ],
  back: [],
};
export class GlassPanes {
  constructor(t, e, i, s, n) {
    ((this.ctx = t), (this.defs = s));
    const o = t.quality.tier > 0,
      a = createGlassImperfectionTexture();
    ((this.shared = {
      uFrost: {
        value: 0,
      },
      uRainT: {
        value: 0,
      },
    }),
      (this.panes = s.map((l, c) => {
        const h = createPaneGeometry(l),
          f = i.mapFor(c),
          u = (FINGERPRINTS_BY_PANE[l.name] || []).map(
            (y) => new THREE.Vector4(...y),
          );
        for (; u.length < 3;) u.push(new THREE.Vector4(0, 0, 0, 0));
        const d = {
            ...t.uniforms,
            ...e,
            ...this.shared,
            uN: {
              value: new THREE.Vector3(...l.n),
            },
            uT: {
              value: new THREE.Vector3(...l.t),
            },
            uB: {
              value: new THREE.Vector3(...l.b),
            },
            uBounds: {
              value: new THREE.Vector4(...l.vis),
            },
            uF0: {
              value: 0.04,
            },
            uLid: {
              value: l.lid ? 1 : 0,
            },
            uCond: {
              value: i.texture,
            },
            uCondMap: {
              value: f.map,
            },
            uCondX: {
              value: f.x,
            },
            uImperf: {
              value: a,
            },
            uSeed: {
              value: 3.17 + c * 7.31,
            },
            uDrips: {
              value: i.panes[c].dripU,
            },
            uRings: {
              value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -10, 0)),
            },
            uPrints: {
              value: u,
            },
            uShake: {
              value: new THREE.Vector2(0, -10),
            },
            uBrush: {
              value: new THREE.Vector4(0, 0, 0.45, 0),
            },
          },
          p = {
            uniforms: d,
            vertexShader: t.GLSL_COMMON + PANE_VERTEX_SHADER,
            transparent: !0,
            depthWrite: !1,
            depthTest: !0,
            side: THREE.DoubleSide,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
          },
          v = new THREE.ShaderMaterial({
            ...p,
            fragmentShader: t.GLSL_COMMON + PANE_TINT_FRAGMENT_SHADER,
            blendSrc: THREE.ZeroFactor,
            blendDst: THREE.SrcColorFactor,
            blendSrcAlpha: THREE.ZeroFactor,
            blendDstAlpha: THREE.OneFactor,
          }),
          g = {
            MAX_DRIPS: GLASS_DRIP_LIMITS.maxDrips,
          };
        o && (g.GLASS_HQ = "");
        const x = new THREE.ShaderMaterial({
            ...p,
            defines: g,
            fragmentShader:
              t.GLSL_COMMON +
              GLSL_STUDIO_REFLECTION +
              PANE_SURFACE_FRAGMENT_SHADER,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor,
            blendSrcAlpha: THREE.ZeroFactor,
            blendDstAlpha: THREE.OneFactor,
          }),
          m = new THREE.Mesh(h, v),
          w = new THREE.Mesh(h, x);
        return (
          (m.name = `glassPane:${l.name}:tint`),
          (w.name = `glassPane:${l.name}`),
          (m.renderOrder = 20),
          (w.renderOrder = 20.001),
          n.add(m, w),
          {
            def: l,
            k: c,
            mul: m,
            over: w,
            uniforms: d,
            c: new THREE.Vector3(...l.c),
            n: new THREE.Vector3(...l.n),
            t: new THREE.Vector3(...l.t),
            b: new THREE.Vector3(...l.b),
            ring: 0,
            brushA: 0,
            brushGoal: 0,
          }
        );
      })),
      (this.edges = this._buildEdges(t, e)),
      n.add(this.edges));
  }
  _buildEdges(t, e) {
    const i = LID_SLAB.bevel,
      s = latheRoundedRect(
        [
          [-i, LID_SLAB.y1],
          [0, LID_SLAB.y1 - i],
          [0, LID_SLAB.y0 + i],
          [-i, LID_SLAB.y0],
        ],
        {
          halfW: LID_SLAB.x,
          halfD: LID_SLAB.z,
          radius: LID_SLAB.cornerR,
          seg: 5,
          crease: 0.95,
          tags: [1, 0, 1],
          edgeAttr: !0,
        },
      ),
      n = BOX.topY - 0.002,
      o = [],
      a = (y, _, M, A, b, S, E, T, R) =>
        o.push({
          p: [y, _, M, A, b, S, E, T],
          L: R,
        });
    (a(
      -GLASS_OUTER_HALF_W,
      BOX.halfD,
      GLASS_OUTER_HALF_W,
      BOX.halfD,
      GLASS_OUTER_HALF_W,
      GLASS_OUTER_HALF_D,
      -GLASS_OUTER_HALF_W,
      GLASS_OUTER_HALF_D,
      2 * GLASS_OUTER_HALF_W,
    ),
      a(
        GLASS_OUTER_HALF_W,
        -BOX.halfD,
        -GLASS_OUTER_HALF_W,
        -BOX.halfD,
        -GLASS_OUTER_HALF_W,
        -GLASS_OUTER_HALF_D,
        GLASS_OUTER_HALF_W,
        -GLASS_OUTER_HALF_D,
        2 * GLASS_OUTER_HALF_W,
      ),
      a(
        BOX.halfW,
        BOX.halfD,
        BOX.halfW,
        -BOX.halfD,
        GLASS_OUTER_HALF_W,
        -BOX.halfD,
        GLASS_OUTER_HALF_W,
        BOX.halfD,
        2 * BOX.halfD,
      ),
      a(
        -BOX.halfW,
        -BOX.halfD,
        -BOX.halfW,
        BOX.halfD,
        -GLASS_OUTER_HALF_W,
        BOX.halfD,
        -GLASS_OUTER_HALF_W,
        -BOX.halfD,
        2 * BOX.halfD,
      ));
    const l = s.attributes.position,
      c = s.attributes.normal,
      h = s.attributes.aEdge,
      f = l.count,
      u = o.length * 4,
      d = new Float32Array((f + u) * 3),
      p = new Float32Array((f + u) * 3),
      v = new Float32Array((f + u) * 3);
    (d.set(l.array), p.set(c.array), v.set(h.array));
    const g = Array.from(s.index.array);
    (o.forEach((y, _) => {
      const M = f + _ * 4;
      for (let A = 0; A < 4; A++)
        (d.set([y.p[A * 2], n, y.p[A * 2 + 1]], (M + A) * 3),
          p.set([0, 1, 0], (M + A) * 3),
          v.set(
            [A === 1 || A === 2 ? y.L : 0, A < 2 ? 0.15 : 0.85, 0],
            (M + A) * 3,
          ));
      g.push(M, M + 2, M + 1, M, M + 3, M + 2);
    }),
      s.dispose());
    const x = new THREE.BufferGeometry();
    (x.setAttribute("position", new THREE.BufferAttribute(d, 3)),
      x.setAttribute("normal", new THREE.BufferAttribute(p, 3)),
      x.setAttribute("aEdge", new THREE.BufferAttribute(v, 3)),
      x.setIndex(g),
      x.computeBoundingSphere());
    const m = new THREE.ShaderMaterial({
        uniforms: {
          ...t.uniforms,
          ...e,
        },
        vertexShader: t.GLSL_COMMON + EDGE_VERTEX_SHADER,
        fragmentShader:
          t.GLSL_COMMON + GLSL_STUDIO_REFLECTION + EDGE_FRAGMENT_SHADER,
        side: THREE.DoubleSide,
      }),
      w = new THREE.Mesh(x, m);
    return ((w.name = "glassEdges"), (w.userData.noReflect = !0), w);
  }
  ring(t, e, i, s = 1) {
    const n = this.panes[t],
      o = this.ctx.uniforms.uTime.value;
    (n.uniforms.uRings.value[n.ring].set(e, i, o, s),
      (n.ring = (n.ring + 1) % 4),
      n.uniforms.uShake.value.set(Math.min(1.5, s), o));
  }
  brush(t, e, i, s) {
    for (const n of this.panes)
      ((n.brushGoal = n.k === t ? 1 : 0),
        n.k === t &&
          n.uniforms.uBrush.value.set(e, i, s, n.uniforms.uBrush.value.w));
  }
  update(t) {
    this.ctx.camera.getWorldPosition(cameraPositionScratch);
    let e = 0,
      i = 0;
    for (const s of this.panes) {
      const o =
        paneToCameraScratch.copy(cameraPositionScratch).sub(s.c).dot(s.n) > 0
          ? 20.5 + i++ * 0.01
          : 20 + e++ * 0.01;
      ((s.mul.renderOrder = o), (s.over.renderOrder = o + 0.005));
      const a = s.uniforms.uBrush.value;
      ((a.w += (s.brushGoal * 0.9 - a.w) * Math.min(1, t * 10)),
        a.w < 0.003 && (a.w = 0));
    }
  }
}
