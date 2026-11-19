/**
 * Per-section frame profiler and on-screen FPS/CPU/draw-call overlay.
 */
export class FrameProfiler {
  constructor() {
    ((this.acc = new Map()),
      (this.t0 = new Map()),
      (this.frames = 0),
      (this.steps = 0),
      (this.calls = 0),
      (this.tris = 0),
      (this.lastCalls = 0),
      (this.lastTris = 0));
  }
  tick() {
    this.steps++;
  }
  begin(t) {
    this.t0.set(t, performance.now());
  }
  end(t) {
    const e = this.t0.get(t);
    e !== void 0 &&
      this.acc.set(t, (this.acc.get(t) || 0) + performance.now() - e);
  }
  frame(t) {
    (this.frames++,
      (this.lastCalls = t.render.calls),
      (this.lastTris = t.render.triangles),
      (this.calls += this.lastCalls),
      (this.tris += this.lastTris));
  }
  report() {
    const t = Math.max(1, this.steps),
      e = Math.max(1, this.frames),
      i = {
        frames: this.frames,
        steps: this.steps,
        drawCalls: Math.round(this.calls / e),
        triangles: Math.round(this.tris / e),
        ms: {},
      };
    let s = 0;
    for (const [n, o] of this.acc) {
      const a = n === "render" || n === "beforeRender" ? e : t;
      ((i.ms[n] = +(o / a).toFixed(3)), n !== "render" && (s += o / a));
    }
    return (
      (i.cpuUpdateMs = +s.toFixed(3)),
      this.acc.clear(),
      (this.frames = 0),
      (this.steps = 0),
      (this.calls = 0),
      (this.tris = 0),
      i
    );
  }
}
export class ProfilerOverlay {
  constructor(t) {
    ((this.prof = t),
      (this.el = document.createElement("div")),
      (this.el.style.cssText =
        "position:fixed;left:8px;bottom:8px;z-index:50;font:11px/1.35 ui-monospace,Menlo,monospace;color:#d8f0d8;background:rgba(0,0,0,.55);padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre"),
      document.body.appendChild(this.el),
      (this.acc = 0),
      (this.n = 0),
      (this.worst = 0));
  }
  update(t, e) {
    if (
      ((this.acc += t),
      this.n++,
      (this.worst = Math.max(this.worst, t)),
      this.acc < 0.5)
    )
      return;
    const i = this.n / this.acc,
      s = this.prof.report(),
      n = Object.entries(s.ms)
        .filter(([o]) => o !== "render")
        .sort((o, a) => a[1] - o[1])
        .slice(0, 4)
        .map(([o, a]) => `${o} ${a.toFixed(2)}`)
        .join("  ");
    ((this.el.textContent = `${i.toFixed(0)} fps  worst ${(this.worst * 1e3).toFixed(0)}ms  dpr ${e.toFixed(2)}
cpu ${s.cpuUpdateMs.toFixed(2)}ms  draws ${s.drawCalls}  tris ${(s.triangles / 1e3).toFixed(0)}k
${n}`),
      (this.acc = 0),
      (this.n = 0),
      (this.worst = 0));
  }
}
