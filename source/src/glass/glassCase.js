/**
 * GlassCase: owns studio, frame, stand, panes and condensation, handles wipe/tap input and drives lighting uniforms each frame.
 */
import * as THREE from "three";
import { BOX } from "../core/config.js";
import { clamp, lerp2, smoothstep2 } from "../util/math.js";
import { buildPaneDefinitions } from "./caseLayout.js";
import {
  DEFAULT_ROOM_COLOR,
  bakeStudioEnvMap,
  createStudioUniforms,
} from "./studioEnvironment.js";
import { createBrassMaterial, createCaseFrame } from "./caseFrame.js";
import { CaseStand } from "./caseStand.js";
import { GlassPanes } from "./glassPanes.js";
import { CondensationField } from "./condensation.js";
const WIPE_RADIUS = 0.46;
const WIPE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="11" fill="none" stroke="white" stroke-opacity="0.85" stroke-width="1.5"/><circle cx="16" cy="16" r="11" fill="none" stroke="black" stroke-opacity="0.35" stroke-width="0.6" transform="translate(0.8 0.8)"/><circle cx="16" cy="16" r="1.4" fill="white"/></svg>')}") 16 16, crosshair`;
const paneHitOffset = new THREE.Vector3();
const paneHitPoint = new THREE.Vector3();
const glassCameraPosition = new THREE.Vector3();
const paneHitScratch = new THREE.Vector3();
const CASE_CENTER = new THREE.Vector3(
  0,
  (BOX.bottomY + BOX.topY) * 0.5 - 0.6,
  0,
);
export class GlassCase {
  constructor(t) {
    ((this.ctx = t),
      (this.group = new THREE.Group()),
      (this.group.name = "glass"),
      t.scene.add(this.group),
      (this.exterior = new THREE.Group()),
      (this.exterior.name = "glassExterior"),
      (this.exterior.userData.noReflect = !0),
      this.group.add(this.exterior),
      (this.studio = createStudioUniforms()),
      (this.envMap = bakeStudioEnvMap(t.renderer)),
      (this.brass = createBrassMaterial(t, this.studio, this.envMap)),
      (this.frame = createCaseFrame(t, this.brass)),
      this.exterior.add(this.frame),
      (this.stand = new CaseStand(
        t,
        this.studio,
        this.envMap,
        this.brass,
        this.exterior,
      )),
      (this.defs = buildPaneDefinitions()),
      (this.cond = new CondensationField(t, this.defs)),
      (this.panes = new GlassPanes(
        t,
        this.studio,
        this.cond,
        this.defs,
        this.group,
      )),
      (this.wiping = null),
      this._installInput(),
      t.events.on("tap", (e) => this._onTap(e)));
  }
  setCondensation(t) {
    this.cond.set(t);
  }
  get condensation() {
    return this.cond.average;
  }
  _planeHit(t, e, i = {}) {
    const s = this.panes.panes[t],
      n = e.direction.dot(s.n);
    if (Math.abs(n) < 1e-5) return null;
    const o = paneHitScratch.copy(s.c).sub(e.origin).dot(s.n) / n;
    if (o <= 0) return null;
    (paneHitPoint.copy(e.origin).addScaledVector(e.direction, o),
      paneHitOffset.copy(paneHitPoint).sub(s.c));
    const a = paneHitOffset.dot(s.t),
      l = paneHitOffset.dot(s.b),
      c = s.def.vis;
    return (
      (i.t = o),
      (i.u = a),
      (i.v = l),
      (i.k = t),
      (i.inside = a >= c[0] && a <= c[1] && l >= c[2] && l <= c[3]),
      i
    );
  }
  _filmAt(t, e, i) {
    const s = this.cond,
      n = s.panes[t],
      o = Math.round(((e + n.hu) / (2 * n.hu)) * (s.GX - 1)),
      a = Math.round(((i + n.hv) / (2 * n.hv)) * (s.GY - 1));
    return o < 0 || a < 0 || o >= s.GX || a >= s.GY ? 0 : n.film[a * s.GX + o];
  }
  _wipeTarget(t) {
    this.ctx.camera.getWorldPosition(glassCameraPosition);
    let e = null,
      i = null;
    const s = {};
    for (let n = 0; n < this.panes.panes.length; n++) {
      const o = this.panes.panes[n];
      if (!this._planeHit(n, t, s) || !s.inside) continue;
      paneHitScratch.copy(glassCameraPosition).sub(o.c).dot(o.n) > 0
        ? (!e || s.t < e.t) &&
          (e = {
            ...s,
          })
        : (!i || s.t < i.t) &&
          (i = {
            ...s,
          });
    }
    if (
      e &&
      i &&
      this._filmAt(e.k, e.u, e.v) < 0.05 &&
      this._filmAt(i.k, i.u, i.v) > 0.1
    ) {
      const n = this.ctx.terrain.raycast(t, paneHitPoint);
      if (!n || t.origin.distanceTo(n) > i.t) return i;
    }
    return e;
  }
  _installInput() {
    const { input: t, events: e, audio: i } = this.ctx;
    (t.addHandler({
      name: "glass",
      priority: 10,
      tools: ["wipe"],
      cursor: WIPE_CURSOR,
      activeCursor: WIPE_CURSOR,
      hitTest: (s) => {
        const n = this._wipeTarget(s.ray);
        return n
          ? {
              distance: n.t,
              k: n.k,
              u: n.u,
              v: n.v,
            }
          : null;
      },
      onDown: (s) => (
        (this.wiping = {
          k: s.k,
          u: s.u,
          v: s.v,
          total: 0,
        }),
        this._wipeSegment(s.u, s.v),
        (this.ctx.audio || i)?.play?.("whoosh", {
          volume: 0.06,
          pitch: 2.2,
        }),
        !0
      ),
      onMove: (s) => {
        if (!this.wiping) return;
        const n = this._planeHit(this.wiping.k, s.ray);
        if (!n) return;
        const o = this.defs[this.wiping.k].vis;
        this._wipeSegment(clamp(n.u, o[0], o[1]), clamp(n.v, o[2], o[3]));
      },
      onUp: () => {
        (this.wiping &&
          this.wiping.total > 0.05 &&
          !this._hinted &&
          ((this._hinted = !0),
          e.emit("hud:hint", {
            text: "Wiped glass slowly mists back over",
          })),
          (this.wiping = null));
      },
      onHover: (s) => {
        s ? this.panes.brush(s.k, s.u, s.v, WIPE_RADIUS) : this.panes.brush(-1);
      },
    }),
      e.on("tool", ({ tool: s }) => {
        s !== "wipe" && this.panes.brush(-1);
      }));
  }
  _wipeSegment(t, e) {
    const i = this.wiping,
      s = this.cond.wipe(i.k, i.u, i.v, t, e, WIPE_RADIUS);
    ((i.u = t),
      (i.v = e),
      (i.total += s),
      this.panes.brush(i.k, t, e, WIPE_RADIUS),
      this.ctx.events.emit("glass:wipe", {
        amount: s,
        pane: this.defs[i.k].name,
      }));
  }
  _onTap({ ray: t }) {
    if (!t) return;
    const e = this.stand,
      i = e.hitGauge(t),
      s = e.hitPlinth(t, paneHitPoint);
    let n = null;
    const o = {};
    for (let h = 0; h < this.defs.length; h++) {
      if (!this._planeHit(h, t, o)) continue;
      const f = this.defs[h];
      Math.abs(o.u) > f.hu ||
        Math.abs(o.v) > f.hv ||
        ((!n || o.t < n.t) &&
          (n = {
            ...o,
          }));
    }
    const a = this.ctx.audio;
    if (i < 1 / 0 && (!n || i < n.t)) {
      (e.tapGauge(1),
        a?.play?.("tink", {
          volume: 0.18,
          pitch: 2.4,
        }));
      return;
    }
    if (!n || n.t > s) return;
    const l = this.defs[n.k],
      c = t.origin.clone().addScaledVector(t.direction, n.t);
    (this.panes.ring(n.k, n.u, n.v, 1),
      a?.play?.("tink", {
        volume: 0.5,
        pitch: l.pitch * (0.97 + Math.random() * 0.06),
        pan: clamp(c.x / 8, -0.8, 0.8),
      }),
      this.ctx.events.emit("glass:tap", {
        point: c,
        pane: l.name,
      }));
  }
  update(t) {
    const { world: e, lights: i, camera: s } = this.ctx,
      n = this.studio,
      o = clamp(e.cloudCover * 0.6 + e.storminess * 0.6, 0, 1);
    (n.uRoom.value.copy(e.roomColor), n.uBdRoom.value.copy(e.roomColor));
    const a = lerp2(0.62, 0.18, e.night) * (1 - e.storminess * 0.35);
    ((n.uStudio.value = a + e.flash * 0.5),
      n.uSunPos.value.copy(e.sunPosition));
    const l = smoothstep2(-0.06, 0.04, e.sunElevation) * (1 - 0.8 * o);
    (n.uSunCol.value
      .copy(e.lightColor)
      .lerp(WHITE, 0.35)
      .multiplyScalar(24 * l),
      n.uMoonPos.value.copy(e.moonPosition),
      n.uMoonCol.value
        .setRGB(0.62, 0.7, 1)
        .multiplyScalar(4.5 * e.night * (1 - 0.8 * o)),
      i?.flash && n.uFlashPos.value.copy(i.flash.position),
      s.getWorldPosition(glassCameraPosition),
      n.uHaloDir.value.copy(CASE_CENTER).sub(glassCameraPosition).normalize(),
      (n.uHalo.value =
        lerp2(1, 0.6, e.night) * (1 - 0.3 * e.storminess) + e.flash * 0.6),
      n.uHaloTint.value
        .setRGB(1.12, 1, 0.84)
        .lerp(GOLDEN_HALO_TINT, e.golden * 0.7)
        .lerp(NIGHT_HALO_TINT, e.night),
      n.uExtAmb.value.copy(e.roomColor).multiplyScalar(3.4 + e.flash * 6));
    const c =
      (e.roomColor.r / DEFAULT_ROOM_COLOR.r) * lerp2(1, 0.55, e.night) +
      e.flash * 0.8;
    ((this.brass.envMapIntensity = c),
      (this.panes.shared.uFrost.value = smoothstep2(0.5, -6, e.seaLevelTemp)),
      (this.panes.shared.uRainT.value += t * (1 + e.storminess * 0.8)),
      this.cond.update(t),
      this.panes.update(t),
      this.stand.update(t, c));
  }
}
const WHITE = new THREE.Color(1, 1, 1);
const GOLDEN_HALO_TINT = new THREE.Color(1.3, 0.92, 0.68);
const NIGHT_HALO_TINT = new THREE.Color(0.8, 0.9, 1.2);
