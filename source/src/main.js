/**
 * Module registry, URL params, error capture and the boot function that builds the context, modules, simulation/render loop and debug API, started inside a top-level try/catch.
 */
import "./style.css";
import * as THREE from "three";
import { BOX } from "./core/config.js";
import { EventBus } from "./core/events.js";
import { QualityManager } from "./core/quality.js";
import { PostProcessing, createRenderer } from "./render/postprocessing.js";
import { CameraRig } from "./core/cameraRig.js";
import { InputController } from "./input/input.js";
import { installWindTool } from "./tools/windTool.js";
import { LightingRig } from "./render/lighting.js";
import { TerrainSampler, detectFloatLinearSupport } from "./world/terrain.js";
import {
  COMMON_GLSL,
  installCloudShadowHook,
  sharedUniforms,
  syncSharedUniforms,
} from "./shaders/shared.js";
import { SCENARIOS, applyScenario } from "./core/scenarios.js";
import { FrameProfiler, ProfilerOverlay } from "./core/profiler.js";
import { WorldState } from "./world/worldState.js";
import { WindField } from "./weather/windField.js";
import { SurfaceCoverField } from "./weather/surfaceCover.js";
import { TerrainView } from "./world/terrainView.js";
import { WaterSystem } from "./water/waterSystem.js";
import { VegetationSystem } from "./vegetation/vegetationSystem.js";
import { GlassCase } from "./glass/glassCase.js";
import { SkyController } from "./sky/skyController.js";
import { LifeSystem } from "./life/lifeSystem.js";
import { CloudSystem } from "./clouds/cloudSystem.js";
import { PrecipitationSystem } from "./weather/precipitation.js";
import { FogSystem } from "./weather/fogSystem.js";
import { Hud } from "./ui/hud.js";
import { AudioManager } from "./audio/audioManager.js";
const MODULE_REGISTRY = [
  ["audio", AudioManager],
  ["sky", SkyController],
  ["terrain", TerrainView],
  ["water", WaterSystem],
  ["vegetation", VegetationSystem],
  ["life", LifeSystem],
  ["clouds", CloudSystem],
  ["precipitation", PrecipitationSystem],
  ["fog", FogSystem],
  ["glass", GlassCase],
  ["hud", Hud],
];
const urlParams = new URLSearchParams(location.search);
const bootErrors = [];
window.addEventListener("error", (r) =>
  bootErrors.push(String(r.message || r)),
);
window.addEventListener("unhandledrejection", (r) =>
  bootErrors.push(String(r.reason)),
);
function boot() {
  installCloudShadowHook();
  const r = document.getElementById("scene"),
    t = new QualityManager(urlParams),
    e = createRenderer(r, t);
  detectFloatLinearSupport(e);
  const i = new THREE.Scene(),
    s = new THREE.PerspectiveCamera(
      34,
      window.innerWidth / window.innerHeight,
      0.1,
      250,
    ),
    n = new CameraRig(s),
    o = new EventBus(),
    a = new WorldState(),
    l = new TerrainSampler();
  sharedUniforms.uTerrainTex.value = l.texture;
  const c = new WindField(a),
    h = new SurfaceCoverField(a, l.baked),
    f = {
      THREE: THREE,
      scene: i,
      camera: s,
      cameraRig: n,
      renderer: e,
      events: o,
      quality: t,
      params: urlParams,
      world: a,
      wind: c,
      fields: h,
      terrain: l,
      uniforms: sharedUniforms,
      GLSL_COMMON: COMMON_GLSL,
      precip: {
        sources: [],
      },
      modules: {},
      audio: null,
      time: 0,
      box: BOX,
    };
  ((i.onBeforeRender = (T, R, z) => {
    (z.updateMatrixWorld(),
      sharedUniforms.uCameraWorld.value.copy(z.matrixWorld));
  }),
    (f.input = new InputController(f)),
    installWindTool(f),
    (f.lights = new LightingRig(f)),
    (f.post = new PostProcessing(e, i, s, t)),
    (f.moduleObjects = {}));
  for (const [T, R] of MODULE_REGISTRY) {
    const z = new Set(i.children);
    try {
      const L = new R(f);
      ((f.modules[T] = L),
        (f.moduleObjects[T] = i.children.filter((k) => !z.has(k))),
        T === "audio" && (f.audio = L));
    } catch (L) {
      (console.error(`[boot] module "${T}" failed to initialise`, L),
        bootErrors.push(`${T}: ${L.message}`));
    }
  }
  const u = urlParams.get("scenario") || "calm";
  (SCENARIOS[u] && applyScenario(f, u),
    urlParams.has("season") && (a.season = parseFloat(urlParams.get("season"))),
    urlParams.has("time") && (a.timeOfDay = parseFloat(urlParams.get("time"))),
    urlParams.has("temp") && (a.tempOffset = parseFloat(urlParams.get("temp"))),
    urlParams.has("tool") && f.input.setTool(urlParams.get("tool")),
    n.preset(urlParams.get("cam") || "hero", !0),
    urlParams.get("ui") === "0" && document.body.classList.add("no-ui"));
  const d = new Set(),
    p = new FrameProfiler();
  f.profiler = p;
  let v = !1;
  function g(T) {
    p.begin("fields");
    for (const R of f.precip.sources) h.deposit(R.x, R.z, R.radius, R.rate, T);
    (h.update(T), p.end("fields"), (v = !0));
  }
  function x(T) {
    ((v = !1), (f.time += T));
    const R = f.time;
    (p.tick(),
      p.begin("sim"),
      a.update(T),
      c.update(T),
      f.input.update(T),
      n.update(T),
      p.end("sim"),
      (f.precip.sources.length = 0));
    for (const [k] of MODULE_REGISTRY) {
      k === "precipitation" && g(T);
      const U = f.modules[k];
      if (!(!U || !U.update || d.has(k))) {
        p.begin(k);
        try {
          U.update(T, R);
        } catch (F) {
          (console.error(`[loop] module "${k}" update failed; disabling`, F),
            bootErrors.push(`${k}.update: ${F.message}`),
            d.add(k));
        }
        p.end(k);
      }
    }
    v || g(T);
    let z = 0,
      L = 0;
    for (const k of f.precip.sources) {
      const U = a.snowFractionAt(Math.max(0, l.height(k.x, k.z)));
      ((z += k.rate * (1 - U)), (L += k.rate * U));
    }
    ((a.rainfall = z),
      (a.snowfall = L),
      f.lights.update(T),
      syncSharedUniforms(f, R));
  }
  e.info.autoReset = !1;
  function m(T) {
    (e.info.reset(), p.begin("beforeRender"));
    for (const [R] of MODULE_REGISTRY) {
      const z = f.modules[R];
      if (z?.beforeRender && !d.has(R))
        try {
          z.beforeRender(T, f.time);
        } catch (L) {
          (console.error(`[render] ${R}.beforeRender`, L), d.add(R));
        }
    }
    (p.end("beforeRender"),
      p.begin("render"),
      f.post.render(T, f.time, a),
      p.end("render"),
      p.frame(e.info));
  }
  function w() {
    ((s.aspect = window.innerWidth / window.innerHeight),
      s.updateProjectionMatrix(),
      f.post.setSize(window.innerWidth, window.innerHeight));
    for (const T of Object.values(f.modules))
      T?.resize?.(window.innerWidth, window.innerHeight);
  }
  (window.addEventListener("resize", () => {
    (t.refreshDpr(), w());
  }),
    r.addEventListener(
      "webglcontextlost",
      (T) => {
        T.preventDefault();
      },
      !1,
    ),
    r.addEventListener("webglcontextrestored", () => location.reload(), !1),
    (t.onChange = () => w()),
    (t.onPostLevel = (T) => {
      ((f.post.tiltX.enabled = f.post.tiltY.enabled = T >= 2 && t.tier > 0),
        (f.post.bloom.enabled = T >= 1));
    }));
  let y = performance.now(),
    _ = 0;
  const M = urlParams.has("paused"),
    A = urlParams.has("stats") ? new ProfilerOverlay(p) : null;
  function b() {
    requestAnimationFrame(b);
    const T = performance.now(),
      R = Math.max(0, (T - y) / 1e3);
    y = T;
    const z = M ? 0 : Math.min(R, 1 / 20);
    (t.sample(R),
      x(z),
      m(z),
      A?.update(R, t.dpr),
      _++,
      _ === 2 && (document.body.classList.add("ready"), (S.ready = !0)));
  }
  const S = {
    ready: !1,
    ctx: f,
    errors: bootErrors,
    scenario: (T) => applyScenario(f, T),
    simulate(T) {
      const R = Math.round(T * 30);
      for (let z = 0; z < R; z++) x(1 / 30);
      return R;
    },
    camera: (T) => n.preset(T, !0),
    frames: () => _,
    profile: () => p.report(),
    setVisible(T, R) {
      for (const z of f.moduleObjects[T] || []) z.visible = R;
    },
  };
  window.__wg = S;
  const E = parseFloat(urlParams.get("warm") || "0");
  (x(0),
    E > 0 && S.simulate(E),
    urlParams.has("cam") && n.preset(urlParams.get("cam"), !0),
    b());
}
try {
  boot();
} catch (r) {
  (console.error("[boot] fatal", r), bootErrors.push(`fatal: ${r.message}`));
  const t = document.getElementById("fatal");
  t &&
    ((t.textContent = "Weatherglass could not start: " + r.message),
    (t.style.display = "block"));
}
