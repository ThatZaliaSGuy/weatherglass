/**
 * Studio softbox layout, shared studio uniforms, PMREM-baked studio env map and the onBeforeCompile patcher for case materials.
 */
import * as THREE from "three";
import { SOFTBOX_COUNT } from "./glassShaders.js";
const DEG_TO_RAD = Math.PI / 180;
const SOFTBOX_LAYOUT = [
  {
    az: -30,
    el: -0.02,
    hw: 0.07,
    hh: 0.82,
    soft: 0.045,
    i: 2.6,
  },
  {
    az: 62,
    el: 0.04,
    hw: 0.09,
    hh: 0.8,
    soft: 0.06,
    i: 2,
  },
  {
    az: 156,
    el: 0,
    hw: 0.11,
    hh: 0.8,
    soft: 0.07,
    i: 1.5,
  },
  {
    az: -124,
    el: 0,
    hw: 0.085,
    hh: 0.8,
    soft: 0.06,
    i: 1.4,
  },
  {
    dir: [0.12, 0.93, -0.35],
    hw: 0.42,
    hh: 0.22,
    soft: 0.12,
    i: 0.9,
  },
];
export const DEFAULT_ROOM_COLOR = new THREE.Color(0.085, 0.075, 0.068);
function softboxBasis(r) {
  const t = r.dir
      ? new THREE.Vector3(...r.dir).normalize()
      : new THREE.Vector3(
          Math.sin(r.az * DEG_TO_RAD) * Math.cos(r.el),
          Math.sin(r.el),
          Math.cos(r.az * DEG_TO_RAD) * Math.cos(r.el),
        ),
    e =
      Math.abs(t.y) > 0.8
        ? new THREE.Vector3(0, 0, -1)
        : new THREE.Vector3(0, 1, 0),
    i = e.clone().addScaledVector(t, -e.dot(t)).normalize(),
    s = new THREE.Vector3().crossVectors(i, t).normalize();
  return {
    c: t,
    up: i,
    rt: s,
  };
}
export function createStudioUniforms() {
  const r = [],
    t = [],
    e = [],
    i = [];
  for (let s = 0; s < SOFTBOX_COUNT; s++) {
    const n = SOFTBOX_LAYOUT[s],
      { c: o, up: a, rt: l } = softboxBasis(n);
    (r.push(o),
      t.push(l),
      e.push(a),
      i.push(new THREE.Vector4(n.hw, n.hh, n.soft, n.i)));
  }
  return {
    uRoom: {
      value: DEFAULT_ROOM_COLOR.clone(),
    },
    uStudio: {
      value: 1,
    },
    uSbC: {
      value: r,
    },
    uSbR: {
      value: t,
    },
    uSbU: {
      value: e,
    },
    uSbS: {
      value: i,
    },
    uSunPos: {
      value: new THREE.Vector3(0, 12, 0),
    },
    uSunCol: {
      value: new THREE.Color(0, 0, 0),
    },
    uMoonPos: {
      value: new THREE.Vector3(0, -12, 0),
    },
    uMoonCol: {
      value: new THREE.Color(0, 0, 0),
    },
    uFlashPos: {
      value: new THREE.Vector3(0, 6, 0),
    },
    uBdRoom: {
      value: DEFAULT_ROOM_COLOR.clone(),
    },
    uHaloDir: {
      value: new THREE.Vector3(0, 0, -1),
    },
    uHalo: {
      value: 1,
    },
    uHaloTint: {
      value: new THREE.Color(1.12, 1, 0.84),
    },
    uExtAmb: {
      value: new THREE.Color(0.25, 0.21, 0.18),
    },
    uHemiK: {
      value: 0.3,
    },
  };
}
export function bakeStudioEnvMap(r) {
  const t = new THREE.Scene(),
    e = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: !1,
      uniforms: {
        uRoom: {
          value: DEFAULT_ROOM_COLOR.clone(),
        },
      },
      vertexShader:
        "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `
      uniform vec3 uRoom; varying vec3 vDir;
      void main() {
        float up = normalize(vDir).y;
        vec3 wall = uRoom * (0.9 + 1.2 * exp(-up * up * 9.0));
        vec3 ceil = uRoom * 0.4;
        vec3 table = uRoom * vec3(0.75, 0.52, 0.36) * 0.9;
        vec3 c = up > 0.0 ? mix(wall, ceil, smoothstep(0.2, 0.9, up)) : mix(wall, table, smoothstep(0.0, -0.12, up));
        gl_FragColor = vec4(c, 1.0);
      }`,
    }),
    i = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), e);
  t.add(i);
  const s = new THREE.PlaneGeometry(1, 1),
    n = [],
    o = 20;
  for (let c = 0; c < SOFTBOX_COUNT; c++) {
    const h = SOFTBOX_LAYOUT[c],
      { c: f, up: u, rt: d } = softboxBasis(h),
      p = new THREE.MeshBasicMaterial({
        color: new THREE.Color(1, 0.95, 0.88).multiplyScalar(h.i),
        side: THREE.DoubleSide,
      });
    n.push(p);
    const v = new THREE.Mesh(s, p);
    v.position.copy(f).multiplyScalar(o);
    const g = new THREE.Matrix4().makeBasis(d, u, f.clone().negate());
    (v.quaternion.setFromRotationMatrix(g),
      v.scale.set(
        2 * (h.hw + h.soft * 0.5) * o,
        2 * (h.hh + h.soft * 0.5) * o,
        1,
      ),
      t.add(v));
  }
  const a = new THREE.PMREMGenerator(r),
    l = a.fromScene(t, 0.015, 0.1, 100);
  (a.dispose(), i.geometry.dispose(), e.dispose(), s.dispose());
  for (const c of n) c.dispose();
  return ((l.texture.name = "glassStudioEnv"), l.texture);
}
export function patchStudioMaterial(
  r,
  t,
  e,
  {
    key: i,
    uniforms: s = {},
    vars: n = "",
    color: o = "",
    rough: a = "",
    metal: l = "",
    light: c = "",
    final: h = "",
    normal: f = "",
  },
) {
  return (
    (r.onBeforeCompile = (u) => {
      Object.assign(u.uniforms, t.uniforms, e, s);
      const d = `
      varying vec3 vXWorld;
      varying vec3 vXNormal;
      uniform vec3 uExtAmb;
      uniform float uHemiK;
      ${n}
    `;
      ((u.vertexShader =
        t.GLSL_COMMON +
        u.vertexShader
          .replace(
            "#include <common>",
            `#include <common>
` + d,
          )
          .replace(
            "#include <worldpos_vertex>",
            `#include <worldpos_vertex>
        vXWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vXNormal = normalize(mat3(modelMatrix) * objectNormal);`,
          )),
        (u.fragmentShader =
          t.GLSL_COMMON +
          u.fragmentShader
            .replace(
              "#include <common>",
              `#include <common>
` + d,
            )
            .replace(
              "#include <color_fragment>",
              `#include <color_fragment>
` + o,
            )
            .replace(
              "#include <roughnessmap_fragment>",
              `#include <roughnessmap_fragment>
` + a,
            )
            .replace(
              "#include <metalnessmap_fragment>",
              `#include <metalnessmap_fragment>
` + l,
            )
            .replace(
              "#include <normal_fragment_maps>",
              `#include <normal_fragment_maps>
` + f,
            )
            .replace(
              "#include <lights_fragment_maps>",
              `
        irradiance = irradiance * uHemiK + uExtAmb;
        #include <lights_fragment_maps>`,
            )
            .replace(
              "#include <aomap_fragment>",
              c +
                `
#include <aomap_fragment>`,
            )
            .replace(
              "#include <opaque_fragment>",
              `#include <opaque_fragment>
` + h,
            )));
    }),
    (r.customProgramCacheKey = () => i),
    r
  );
}
