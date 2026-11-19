/**
 * WebGL renderer creation and the effect composer chain with MSAA render pass, bloom, tilt-shift blur and filmic grade/grain.
 */
import * as THREE from "three";
import { CopyShader } from "three/addons/shaders/CopyShader.js";
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
class MsaaRenderPass extends Pass {
  constructor(t, e, i) {
    (super(),
      (this.scene = t),
      (this.camera = e),
      (this.needsSwap = !1),
      (this.target =
        i > 0
          ? new THREE.WebGLRenderTarget(1, 1, {
              type: THREE.HalfFloatType,
              samples: i,
            })
          : null),
      (this.copy = new FullScreenQuad(
        new THREE.ShaderMaterial({
          uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
          vertexShader: CopyShader.vertexShader,
          fragmentShader: CopyShader.fragmentShader,
          depthTest: !1,
          depthWrite: !1,
        }),
      )));
  }
  setSize(t, e) {
    this.target?.setSize(t, e);
  }
  render(t, e, i) {
    const s = this.target || i;
    (t.setRenderTarget(s),
      t.autoClear === !1 && t.clear(),
      t.render(this.scene, this.camera),
      this.target &&
        ((this.copy.material.uniforms.tDiffuse.value = this.target.texture),
        t.setRenderTarget(i),
        this.copy.render(t)));
  }
  dispose() {
    (this.target?.dispose(), this.copy.dispose());
  }
}
const TILT_SHIFT_SHADER = {
  uniforms: {
    tDiffuse: {
      value: null,
    },
    uDir: {
      value: new THREE.Vector2(1, 0),
    },
    uResolution: {
      value: new THREE.Vector2(1, 1),
    },
    uFocus: {
      value: 0.52,
    },
    uBand: {
      value: 0.2,
    },
    uAmount: {
      value: 1,
    },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uDir;
    uniform vec2 uResolution;
    uniform float uFocus;
    uniform float uBand;
    uniform float uAmount;
    varying vec2 vUv;
    void main() {
      float d = abs(vUv.y - uFocus);
      float k = smoothstep(uBand, uBand + 0.38, d);
      float r = k * uAmount * (uResolution.y / 900.0) * 3.2;
      vec4 sum = texture2D(tDiffuse, vUv) * 0.2270270270;
      if (r < 0.05) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec2 st = uDir / uResolution * r;
      sum += texture2D(tDiffuse, vUv + st * 1.3846153846) * 0.3162162162;
      sum += texture2D(tDiffuse, vUv - st * 1.3846153846) * 0.3162162162;
      sum += texture2D(tDiffuse, vUv + st * 3.2307692308) * 0.0702702703;
      sum += texture2D(tDiffuse, vUv - st * 3.2307692308) * 0.0702702703;
      gl_FragColor = sum;
    }
  `,
};
const COLOR_GRADE_SHADER = {
  uniforms: {
    tDiffuse: {
      value: null,
    },
    uTime: {
      value: 0,
    },
    uVignette: {
      value: 0.32,
    },
    uGrain: {
      value: 0.035,
    },
    uFlash: {
      value: 0,
    },
    uResolution: {
      value: new THREE.Vector2(1, 1),
    },
  },
  vertexShader: TILT_SHIFT_SHADER.vertexShader,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uFlash;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = vUv - 0.5;
      q.x *= uResolution.x / uResolution.y;
      float v = smoothstep(1.05, 0.25, length(q));
      c.rgb *= mix(1.0 - uVignette, 1.0, v);
      // gentle filmic lift in the shadows, warm highlights
      c.rgb = c.rgb * vec3(1.01, 1.0, 0.985) + vec3(0.008, 0.007, 0.01) * (1.0 - c.rgb);
      float g = h(vUv * uResolution + fract(uTime * 7.13) * 100.0) - 0.5;
      c.rgb += g * uGrain * (1.0 - c.rgb * 0.6);
      c.rgb += uFlash * 0.05;
      gl_FragColor = c;
    }
  `,
};
export function createRenderer(r, t) {
  const e = new THREE.WebGLRenderer({
    canvas: r,
    antialias: !1,
    powerPreference: "high-performance",
    preserveDrawingBuffer: !1,
    stencil: !1,
  });
  return (
    e.setPixelRatio(t.dpr),
    e.setSize(window.innerWidth, window.innerHeight, !1),
    (e.outputColorSpace = THREE.SRGBColorSpace),
    (e.toneMapping = THREE.ACESFilmicToneMapping),
    (e.toneMappingExposure = 1),
    (e.shadowMap.enabled = !0),
    (e.shadowMap.type = THREE.PCFShadowMap),
    e.setClearColor(855051, 1),
    e
  );
}
export class PostProcessing {
  constructor(t, e, i, s) {
    ((this.renderer = t),
      (this.scene = e),
      (this.camera = i),
      (this.quality = s));
    const n = t.getDrawingBufferSize(new THREE.Vector2()),
      o = new THREE.WebGLRenderTarget(n.x, n.y, {
        type: THREE.HalfFloatType,
      });
    ((this.composer = new EffectComposer(t, o)),
      (this.renderPass = new MsaaRenderPass(e, i, s.tier === 0 ? 0 : 4)),
      this.composer.addPass(this.renderPass),
      (this.bloom = new UnrealBloomPass(
        new THREE.Vector2(n.x, n.y),
        0.32,
        0.55,
        0.92,
      )),
      this.composer.addPass(this.bloom),
      (this.tiltX = new ShaderPass(TILT_SHIFT_SHADER)),
      (this.tiltY = new ShaderPass(TILT_SHIFT_SHADER)),
      this.tiltY.uniforms.uDir.value.set(0, 1),
      (this.tiltX.enabled = this.tiltY.enabled = s.tier > 0),
      this.composer.addPass(this.tiltX),
      this.composer.addPass(this.tiltY),
      (this.output = new OutputPass()),
      this.composer.addPass(this.output),
      (this.grade = new ShaderPass(COLOR_GRADE_SHADER)),
      this.composer.addPass(this.grade),
      this.setSize(window.innerWidth, window.innerHeight));
  }
  setTiltShift(t, e, i) {
    for (const s of [this.tiltX, this.tiltY])
      (t !== void 0 && (s.uniforms.uFocus.value = t),
        e !== void 0 && (s.uniforms.uBand.value = e),
        i !== void 0 && (s.uniforms.uAmount.value = i));
  }
  setSize(t, e) {
    (this.renderer.setPixelRatio(this.quality.dpr),
      this.renderer.setSize(t, e, !1),
      this.composer.setPixelRatio(this.quality.dpr),
      this.composer.setSize(t, e));
    const i = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    (this.tiltX.uniforms.uResolution.value.copy(i),
      this.tiltY.uniforms.uResolution.value.copy(i),
      this.grade.uniforms.uResolution.value.copy(i));
  }
  render(t, e, i) {
    ((this.grade.uniforms.uTime.value = e),
      (this.grade.uniforms.uFlash.value = i.flash),
      (this.bloom.strength =
        0.3 + i.flash * 0.9 * (1 - 0.6 * i.day) + i.night * 0.25),
      this.composer.render(t));
  }
}
