/**
 * Planar mirror reflection renderer with oblique clipping, sub-rect viewport fitting and adaptive update throttling.
 */
import * as THREE from "three";
const mirrorPlane = new THREE.Plane();
const clipPlaneView = new THREE.Vector4();
const clipPlaneCorner = new THREE.Vector4();
const cameraRotation = new THREE.Matrix4();
const mirrorEyePos = new THREE.Vector3();
const eyeLookTarget = new THREE.Vector3();
const mirrorLookTarget = new THREE.Vector3();
const mirroredEyePos = new THREE.Vector3();
const mirrorPlanePoint = new THREE.Vector3();
const mirrorUp = new THREE.Vector3(0, 1, 0);
const savedClearColor = new THREE.Color();
const drawingBufferSize = new THREE.Vector2();
const viewProjMatrix = new THREE.Matrix4();
const subRectProjMatrix = new THREE.Matrix4();
const cameraFrustum = new THREE.Frustum();
const mirrorBox = new THREE.Box3();
const cornerClip = new THREE.Vector4();
const cameraForward = new THREE.Vector3();
const MIN_REFLECT_RADIUS = 0.03;
export class WaterReflection {
  constructor(t, e, i, s) {
    ((this.ctx = t), (this.wu = e), (this.own = i), (this.bounds = s));
    const n = t.quality;
    ((this.baseScale = n.pick(0.25, 0.34, 0.5)),
      (this.maxScale = n.pick(0.34, 0.5, 0.62)),
      (this.fastEvery = n.pick(2, 2, 1)),
      (this.slowEvery = n.pick(5, 4, 3)),
      (this.camera = new THREE.PerspectiveCamera()),
      (this.camera.matrixAutoUpdate = !0),
      (this.rt = new THREE.WebGLRenderTarget(4, 4, {
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: !1,
        depthBuffer: !0,
        stencilBuffer: !1,
      })),
      (this.rt.texture.name = "waterMirror"),
      (this.rt.scissorTest = !0),
      (this.hidden = []),
      (this.valid = !1),
      (this.since = 1e9),
      (this.lastPos = new THREE.Vector3(1e9, 0, 0)),
      (this.lastFwd = new THREE.Vector3()),
      (this.lastLight = new THREE.Vector3()),
      (this.lastLevel = -1e9),
      (this.stats = {
        renders: 0,
        skipped: 0,
        pixels: 0,
        hidden: 0,
      }),
      (this._collect = this._collect.bind(this)));
    const o = new THREE.BufferGeometry();
    (o.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    ),
      (this.fixMesh = new THREE.Mesh(
        o,
        new THREE.ShaderMaterial({
          vertexShader:
            "void main() { gl_Position = vec4(position.xy, 0.99995, 1.0); }",
          fragmentShader:
            "void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }",
          depthTest: !0,
          depthWrite: !1,
          depthFunc: THREE.GreaterDepth,
          transparent: !0,
          blending: THREE.CustomBlending,
          blendEquation: THREE.AddEquation,
          blendSrc: THREE.ZeroFactor,
          blendDst: THREE.OneFactor,
          blendSrcAlpha: THREE.OneFactor,
          blendDstAlpha: THREE.ZeroFactor,
        }),
      )),
      (this.fixMesh.frustumCulled = !1),
      (this.fixScene = new THREE.Scene()),
      this.fixScene.add(this.fixMesh),
      (this.fixCam = new THREE.Camera()),
      this.resize(),
      (e.uReflTex.value = this.rt.texture),
      (e.uReflOn.value = 0));
  }
  resize() {
    (this.ctx.renderer.getDrawingBufferSize(drawingBufferSize),
      (this.screenW = drawingBufferSize.x),
      (this.screenH = drawingBufferSize.y));
    const t = Math.max(64, Math.ceil(drawingBufferSize.x * this.maxScale)),
      e = Math.max(36, Math.ceil(drawingBufferSize.y * this.maxScale));
    (t !== this.rt.width || e !== this.rt.height) &&
      (this.rt.setSize(t, e), (this.valid = !1));
  }
  _motion(t, e) {
    const i = this.bounds;
    cameraForward.set(0, 0, -1).transformDirection(t.matrixWorld);
    const s = Math.max(
        1,
        Math.hypot(
          mirrorEyePos.x - (i.minX + i.maxX) * 0.5,
          mirrorEyePos.y - e,
          mirrorEyePos.z - (i.minZ + i.maxZ) * 0.5,
        ),
      ),
      n = mirrorEyePos.distanceTo(this.lastPos) / s,
      o = 1 - Math.min(1, cameraForward.dot(this.lastFwd)),
      a = this.ctx.world.lightDir.distanceTo(this.lastLight);
    return n + o * 4 + a * 0.5 + Math.abs(e - this.lastLevel) * 4;
  }
  render(t, e = 0) {
    const i = this.wu;
    this.since++;
    const { renderer: s, scene: n, camera: o, lights: a, world: l } = this.ctx;
    if (
      (s.getDrawingBufferSize(drawingBufferSize),
      (drawingBufferSize.x !== this.screenW ||
        drawingBufferSize.y !== this.screenH) &&
        this.resize(),
      a?.key?.castShadow && !a.key.shadow.map)
    )
      return;
    if (
      (o.updateMatrixWorld(),
      mirrorEyePos.setFromMatrixPosition(o.matrixWorld),
      mirrorEyePos.y <= t + 0.01 || e > 0.97)
    ) {
      ((i.uReflOn.value = 0), (this.valid = !1));
      return;
    }
    const c = this.bounds;
    if (
      (viewProjMatrix.multiplyMatrices(
        o.projectionMatrix,
        o.matrixWorldInverse,
      ),
      cameraFrustum.setFromProjectionMatrix(viewProjMatrix),
      mirrorBox.min.set(c.minX, t - 0.06, c.minZ),
      mirrorBox.max.set(c.maxX, t + 0.06, c.maxZ),
      !cameraFrustum.intersectsBox(mirrorBox))
    ) {
      this.stats.skipped++;
      return;
    }
    const f = (this.valid ? this._motion(o, t) : 1) > 0.0015 || l.flash > 0.02;
    if (this.valid && this.since < (f ? this.fastEvery : this.slowEvery))
      return;
    ((this.since = 0),
      this.lastPos.copy(mirrorEyePos),
      cameraForward.set(0, 0, -1).transformDirection(o.matrixWorld),
      this.lastFwd.copy(cameraForward),
      this.lastLight.copy(l.lightDir),
      (this.lastLevel = t),
      mirrorPlanePoint.set(mirrorEyePos.x, t, mirrorEyePos.z),
      mirroredEyePos
        .subVectors(mirrorPlanePoint, mirrorEyePos)
        .reflect(mirrorUp)
        .negate()
        .add(mirrorPlanePoint),
      cameraRotation.extractRotation(o.matrixWorld),
      eyeLookTarget
        .set(0, 0, -1)
        .applyMatrix4(cameraRotation)
        .add(mirrorEyePos),
      mirrorLookTarget
        .subVectors(mirrorPlanePoint, eyeLookTarget)
        .reflect(mirrorUp)
        .negate()
        .add(mirrorPlanePoint));
    const u = this.camera;
    (u.position.copy(mirroredEyePos),
      u.up.set(0, 1, 0).applyMatrix4(cameraRotation).reflect(mirrorUp),
      u.lookAt(mirrorLookTarget),
      (u.far = o.far),
      (u.near = o.near),
      u.updateMatrixWorld(),
      viewProjMatrix.multiplyMatrices(
        o.projectionMatrix,
        u.matrixWorldInverse,
      ));
    let d = 1,
      p = -1,
      v = 1,
      g = -1,
      x = !1;
    for (let gt = 0; gt < 4; gt++) {
      if (
        (cornerClip
          .set(gt & 1 ? c.maxX : c.minX, t, gt & 2 ? c.maxZ : c.minZ, 1)
          .applyMatrix4(viewProjMatrix),
        cornerClip.w < 0.001)
      ) {
        x = !0;
        break;
      }
      const Qt = cornerClip.x / cornerClip.w,
        te = cornerClip.y / cornerClip.w;
      (Qt < d && (d = Qt),
        Qt > p && (p = Qt),
        te < v && (v = te),
        te > g && (g = te));
    }
    const m = 0.04 + (f ? 0.05 : 0.02);
    if (
      (x && ((d = -1), (p = 1), (v = -1), (g = 1)),
      (d = Math.max(-1, d - m)),
      (p = Math.min(1, p + m)),
      (v = Math.max(-1, v - m)),
      (g = Math.min(1, g + m)),
      p - d < 0.001 || g - v < 0.001)
    ) {
      this.stats.skipped++;
      return;
    }
    this.stats.rect = [d, p, v, g];
    const w = (p - d) * 0.5 * this.screenW,
      y = (g - v) * 0.5 * this.screenH,
      _ = this.screenW * this.screenH * this.baseScale * this.baseScale,
      M = Math.min(this.maxScale, Math.sqrt(_ / Math.max(w * y, 1))),
      A = this.rt.width,
      b = this.rt.height,
      S = Math.max(8, Math.min(A, Math.ceil(w * M))),
      E = Math.max(8, Math.min(b, Math.ceil(y * M)));
    (this.rt.viewport.set(0, 0, S, E), this.rt.scissor.set(0, 0, S, E));
    const T = 2 / (p - d),
      R = 2 / (g - v);
    (subRectProjMatrix.set(
      T,
      0,
      0,
      -T * (d + p) * 0.5,
      0,
      R,
      0,
      -R * (v + g) * 0.5,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
    ),
      u.projectionMatrix.multiplyMatrices(
        subRectProjMatrix,
        o.projectionMatrix,
      ),
      mirrorPlane
        .setFromNormalAndCoplanarPoint(mirrorUp, mirrorPlanePoint)
        .applyMatrix4(u.matrixWorldInverse),
      clipPlaneView.set(
        mirrorPlane.normal.x,
        mirrorPlane.normal.y,
        mirrorPlane.normal.z,
        mirrorPlane.constant,
      ));
    const z = u.projectionMatrix.elements;
    ((clipPlaneCorner.x = (Math.sign(clipPlaneView.x) + z[8]) / z[0]),
      (clipPlaneCorner.y = (Math.sign(clipPlaneView.y) + z[9]) / z[5]),
      (clipPlaneCorner.z = -1),
      (clipPlaneCorner.w = (1 + z[10]) / z[14]),
      clipPlaneView.multiplyScalar(2 / clipPlaneView.dot(clipPlaneCorner)),
      (z[2] = clipPlaneView.x),
      (z[6] = clipPlaneView.y),
      (z[10] = clipPlaneView.z + 1 - 0.003),
      (z[14] = clipPlaneView.w),
      u.projectionMatrixInverse.copy(u.projectionMatrix).invert());
    const L = S / A,
      k = E / b,
      U = i.uReflMatrix.value;
    (U.set(
      0.5 * L,
      0,
      0,
      0.5 * L,
      0,
      0.5 * k,
      0,
      0.5 * k,
      0,
      0,
      0.5,
      0.5,
      0,
      0,
      0,
      1,
    ),
      U.multiply(u.projectionMatrix).multiply(u.matrixWorldInverse),
      i.uReflClamp.value.set(0.5 / A, 0.5 / b, (S - 0.5) / A, (E - 0.5) / b),
      i.uReflShift.value.set(T * L, R * k));
    const F = this.hidden;
    F.length = 0;
    for (const gt of this.own()) gt.visible && F.push(gt);
    n.traverseVisible(this._collect);
    for (const gt of F) gt.visible = !1;
    this.stats.hidden = F.length;
    const G = s.getRenderTarget(),
      B = s.shadowMap.autoUpdate,
      q = s.autoClear,
      X = n.background;
    s.getClearColor(savedClearColor);
    const vt = s.getClearAlpha();
    ((s.shadowMap.autoUpdate = !1),
      (s.autoClear = !0),
      (n.background = null),
      s.setClearColor(0, 0),
      s.setRenderTarget(this.rt),
      s.state.buffers.depth.setMask(!0),
      s.clear(),
      s.render(n, u),
      (s.autoClear = !1),
      s.render(this.fixScene, this.fixCam),
      s.setRenderTarget(G),
      s.setClearColor(savedClearColor, vt),
      (s.autoClear = q),
      (s.shadowMap.autoUpdate = B),
      (n.background = X));
    for (const gt of F) gt.visible = !0;
    ((F.length = 0),
      (i.uReflOn.value = 1),
      (this.valid = !0),
      this.stats.renders++,
      (this.stats.pixels = S * E));
  }
  _collect(t) {
    if (!(t === this.ctx.scene || !t.visible)) {
      if (t.renderOrder >= 5 || t.userData.noReflect) {
        this.hidden.push(t);
        return;
      }
      if (t.isInstancedMesh) {
        t.count > 3e3 && this.hidden.push(t);
        return;
      }
      if (t.isMesh && t.frustumCulled !== !1) {
        const e = t.geometry;
        (e.boundingSphere || e.computeBoundingSphere(),
          e.boundingSphere.radius * t.matrixWorld.getMaxScaleOnAxis() <
            MIN_REFLECT_RADIUS && this.hidden.push(t));
      }
    }
  }
  dispose() {
    (this.rt.dispose(),
      this.fixMesh.geometry.dispose(),
      this.fixMesh.material.dispose());
  }
}
