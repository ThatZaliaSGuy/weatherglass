/**
 * PrecipitationSystem: assigns cloud precipitation sources to slots, aggregates rain/snow/hail amounts and updates all precipitation layers and lightning.
 */
import * as THREE from "three";
import { CLOUD_LAYER } from "../core/config.js";
import {
  PRECIP_SLOT_COUNT,
  PrecipCurtains,
  PrecipFallLayer,
  PrecipHail,
  PrecipSlot,
  PrecipSplashes,
} from "./precipitationLayers.js";
import { LightningSystem } from "./lightning.js";
const SLOT_REUSE_GRACE = 0.35;
export class PrecipitationSystem {
  constructor(t) {
    ((this.ctx = t), (this.slots = []));
    for (let e = 0; e < PRECIP_SLOT_COUNT; e++)
      this.slots.push(new PrecipSlot(e));
    ((this.rainAmount = 0),
      (this.snowAmount = 0),
      (this.hailAmount = 0),
      (this._wind = {
        x: 0,
        z: 0,
      }),
      (this._px = new THREE.Vector2()),
      (this._prefill = 0.6),
      (this.fall = new PrecipFallLayer(t, this.slots)),
      (this.curtain = new PrecipCurtains(t, this.slots)),
      (this.splash = new PrecipSplashes(t, this.slots)),
      (this.hail = new PrecipHail(t, this.slots)),
      (this.lightning = new LightningSystem(t)),
      t.events.on("scenario", () => {
        this._prefill = 0.6;
      }));
  }
  strike({ start: t, end: e, strength: i = 1 } = {}) {
    const s = this.ctx;
    if (!t) {
      const n = s.modules.clouds?.list;
      let o = null;
      if (n)
        for (const a of n) (!o || (a.charge ?? 0) > (o.charge ?? 0)) && (o = a);
      t = o
        ? new THREE.Vector3(
            o.position.x,
            o.position.y - (o.size ?? 1) * 0.3,
            o.position.z,
          )
        : new THREE.Vector3(
            (Math.random() - 0.5) * 6,
            CLOUD_LAYER.defaultY,
            (Math.random() - 0.5) * 4,
          );
    }
    (e || (e = this.lightning.pickTarget(t, new THREE.Vector3())),
      s.events.emit("lightning", {
        start: t,
        end: e,
        strength: i,
      }));
  }
  _cloudById(t) {
    const e = this.ctx.modules.clouds?.list;
    if (!e || t == null) return null;
    for (let i = 0; i < e.length; i++) if (e[i].id === t) return e[i];
    return null;
  }
  _assign(t) {
    const e = this.slots,
      i = this.ctx.precip.sources;
    for (const n of e) n.claimed = !1;
    const s = this._prefill > 0;
    for (let n = 0; n < i.length; n++) {
      const o = i[n];
      if (!(o.rate > 0.002) || !(o.radius > 0)) continue;
      const a = this._cloudById(o.cloudId);
      let l = null;
      for (const f of e)
        if (!(
          f.claimed ||
          !f.visible ||
          !(o.cloudId != null
            ? f.cloudId === o.cloudId
            : f.cloudId == null && Math.hypot(f.x - o.x, f.z - o.z) < 0.8)
        )) {
          if (f.live || f.clock - f.tStop < SLOT_REUSE_GRACE) {
            l = f;
            break;
          }
          f.cloudId = null;
        }
      if (l) {
        ((l.claimed = !0), l.feed(o, a, t));
        continue;
      }
      let c = null,
        h = -1 / 0;
      for (const f of e) {
        if (f.claimed) continue;
        const u = f.visible ? (f.live ? -1 : f.clock - f.tStop) : 1e9;
        u > h && ((c = f), (h = u));
      }
      !c || h < 0 || ((c.claimed = !0), c.begin(o, a, s));
    }
    for (const n of e) n.live && !n.claimed && n.stop();
  }
  update(t, e) {
    const i = this.ctx;
    (this._assign(t), this._prefill > 0 && (this._prefill -= t));
    const s = i.renderer.getDrawingBufferSize(this._px).y || 720,
      n = (2 * Math.tan(THREE.MathUtils.degToRad(i.camera.fov) * 0.5)) / s;
    let o = 0,
      a = 0;
    for (const l of this.slots) {
      if (!l.visible) continue;
      (l.update(t, i, this._wind),
        (l.storm = Math.max(i.world.storminess, l.cloud?.storm ?? 0)));
      const c = l.rate * l.arrival;
      ((o += c * (1 - l.snowGround)), (a += c * l.snowGround));
    }
    ((this.rainAmount = o),
      (this.snowAmount = a),
      this.fall.update(t, n),
      this.curtain.update(t, e, n),
      this.splash.update(t, e, n),
      (this.hailAmount = this.hail.update(t, e)),
      this.lightning.update(t, e, n));
  }
}
