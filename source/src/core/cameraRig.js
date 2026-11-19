/**
 * Orbit camera rig with named presets, smoothing, idle drift, aspect fit and shake.
 */
import * as THREE from "three";
import { clamp, damp } from "../util/math.js";
const CAMERA_PRESETS = {
  front: {
    theta: 0,
    phi: 1.2,
    radius: 21,
    target: [0, 1.6, 0],
  },
  hero: {
    theta: 0.38,
    phi: 1.13,
    radius: 21.5,
    target: [0, 1.7, 0],
  },
  side: {
    theta: 1.25,
    phi: 1.2,
    radius: 21,
    target: [0, 1.6, 0],
  },
  top: {
    theta: 0,
    phi: 0.3,
    radius: 20,
    target: [0, 1, 0],
  },
  low: {
    theta: 0.12,
    phi: 1.47,
    radius: 17,
    target: [0, 1.2, 0],
  },
  close: {
    theta: 0.5,
    phi: 1.1,
    radius: 12,
    target: [1, 1, 1],
  },
  mountains: {
    theta: -0.3,
    phi: 1,
    radius: 13,
    target: [-1.5, 2.6, -2.2],
  },
  lake: {
    theta: 0.25,
    phi: 1.36,
    radius: 12,
    target: [2.6, 0.2, 2.8],
  },
};
export class CameraRig {
  constructor(t) {
    ((this.camera = t),
      (this.target = new THREE.Vector3(0, 1.7, 0)),
      (this.goalTarget = this.target.clone()),
      (this.theta = 0.38),
      (this.phi = 1.13),
      (this.radius = 21.5),
      (this.goal = {
        theta: this.theta,
        phi: this.phi,
        radius: this.radius,
      }),
      (this.limits = {
        minPhi: 0.22,
        maxPhi: 1.5,
        minRadius: 8.5,
        maxRadius: 34,
      }),
      (this.idle = 0),
      (this.shakeAmount = 0),
      (this.time = 0),
      (this.enabledDrift = !0),
      (this._offset = new THREE.Vector3()),
      this.update(0));
  }
  preset(t, e = !1) {
    const i = CAMERA_PRESETS[t];
    i &&
      ((this.goal.theta = i.theta),
      (this.goal.phi = i.phi),
      (this.goal.radius = i.radius),
      this.goalTarget.set(...i.target),
      e &&
        ((this.theta = i.theta),
        (this.phi = i.phi),
        (this.radius = i.radius),
        this.target.copy(this.goalTarget),
        this.update(0)));
  }
  rotate(t, e) {
    ((this.goal.theta -= t * 0.0052),
      (this.goal.phi = clamp(
        this.goal.phi - e * 0.0045,
        this.limits.minPhi,
        this.limits.maxPhi,
      )),
      (this.idle = 0));
  }
  zoom(t) {
    ((this.goal.radius = clamp(
      this.goal.radius * t,
      this.limits.minRadius,
      this.limits.maxRadius,
    )),
      (this.idle = 0));
  }
  pan(t, e) {
    const i = this.radius * 0.0012,
      s = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0),
      n = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
    (this.goalTarget.addScaledVector(s, -t * i).addScaledVector(n, e * i),
      (this.goalTarget.x = clamp(this.goalTarget.x, -5, 5)),
      (this.goalTarget.y = clamp(this.goalTarget.y, -0.5, 5)),
      (this.goalTarget.z = clamp(this.goalTarget.z, -3.5, 3.5)),
      (this.idle = 0));
  }
  shake(t) {
    this.shakeAmount = Math.max(this.shakeAmount, t);
  }
  poke() {
    this.idle = 0;
  }
  _updateFit() {
    const t = this.camera.aspect;
    if (t === this._aspect) return;
    this._aspect = t;
    const e = t < 1 ? 34 + (1 - t) * 20 : 34;
    Math.abs(this.camera.fov - e) > 0.01 &&
      ((this.camera.fov = e), this.camera.updateProjectionMatrix());
    const i = 12.5 / (2 * Math.tan(THREE.MathUtils.degToRad(e / 2)) * t);
    this.fit = Math.max(1, i / 21.5);
  }
  update(t) {
    (this._updateFit(),
      (this.time += t),
      (this.idle += t),
      this.enabledDrift &&
        this.idle > 30 &&
        (this.goal.theta += Math.sin(this.time * 0.05) * t * 0.012));
    const e = 7;
    ((this.theta = damp(this.theta, this.goal.theta, e, t)),
      (this.phi = damp(this.phi, this.goal.phi, e, t)),
      (this.radius = damp(this.radius, this.goal.radius, 6, t)),
      (this.target.x = damp(this.target.x, this.goalTarget.x, 5, t)),
      (this.target.y = damp(this.target.y, this.goalTarget.y, 5, t)),
      (this.target.z = damp(this.target.z, this.goalTarget.z, 5, t)),
      t === 0 &&
        ((this.theta = this.goal.theta),
        (this.phi = this.goal.phi),
        (this.radius = this.goal.radius),
        this.target.copy(this.goalTarget)));
    const i = Math.sin(this.phi);
    if (
      (this._offset
        .set(
          i * Math.sin(this.theta),
          Math.cos(this.phi),
          i * Math.cos(this.theta),
        )
        .multiplyScalar(this.radius * (this.fit || 1)),
      this.camera.position.copy(this.target).add(this._offset),
      (this.camera.position.y += Math.sin(this.time * 0.4) * 0.03),
      this.shakeAmount > 0.001)
    ) {
      const s = this.shakeAmount;
      ((this.camera.position.x += (Math.random() - 0.5) * s * 0.25),
        (this.camera.position.y += (Math.random() - 0.5) * s * 0.25),
        (this.shakeAmount *= Math.exp(-t * 6)));
    }
    this.camera.lookAt(this.target);
  }
}
