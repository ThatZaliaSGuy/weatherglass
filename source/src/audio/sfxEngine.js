/**
 * Web Audio voice abstraction, envelope helpers, synthesized one-shot sound recipes (grab, thunder, chime, splash...) and the polyphony-limited SfxEngine with master bus chain.
 */
import {
  clampNumber,
  createReverbImpulse,
  getNoiseBank,
} from "./audioNoise.js";
class SoundVoice {
  constructor(t, e, i, s, n) {
    const o = t.ac;
    ((this.eng = t),
      (this.ac = o),
      (this.name = e),
      (this.t0 = s),
      (this.end = s),
      (this.nodes = []),
      (this.srcs = []),
      (this.live = 0),
      (this.killed = !1),
      (this.disposed = !1),
      (this.persistent = !1),
      (this.out = o.createGain()),
      this.nodes.push(this.out),
      (this.panner = null),
      n != null && o.createStereoPanner
        ? ((this.panner = o.createStereoPanner()),
          (this.panner.pan.value = clampNumber(n, -1, 1)),
          this.out.connect(this.panner),
          this.panner.connect(i),
          this.nodes.push(this.panner))
        : this.out.connect(i));
  }
  gain(t = 0) {
    const e = this.ac.createGain();
    return ((e.gain.value = t), this.nodes.push(e), e);
  }
  filter(t, e, i = 0.707) {
    const s = this.ac.createBiquadFilter();
    return (
      (s.type = t),
      (s.frequency.value = e),
      (s.Q.value = i),
      this.nodes.push(s),
      s
    );
  }
  osc(t, e, i = this.t0) {
    const s = this.ac.createOscillator();
    return (
      (s.type = t),
      (s.frequency.value = e),
      this.nodes.push(s),
      this.srcs.push({
        s,
        t: i,
        offset: -1,
      }),
      s
    );
  }
  noise(t, e = this.t0, i = 1) {
    const s = this.ac.createBufferSource();
    return (
      (s.buffer = t),
      (s.loop = !0),
      (s.playbackRate.value = i),
      this.nodes.push(s),
      this.srcs.push({
        s,
        t: e,
        offset: Math.random() * t.duration * 0.9,
      }),
      s
    );
  }
  sample(t, e = this.t0, i = 1) {
    const s = this.ac.createBufferSource();
    return (
      (s.buffer = t),
      (s.playbackRate.value = i),
      this.nodes.push(s),
      this.srcs.push({
        s,
        t: e,
        offset: 0,
      }),
      s
    );
  }
  chain(...t) {
    for (let e = 0; e < t.length - 1; e++) t[e].connect(t[e + 1]);
    return t[t.length - 1];
  }
  send(t) {
    if (!this.eng.verbIn || !(t > 0)) return;
    const e = this.gain(t);
    (this.out.connect(e), e.connect(this.eng.verbIn));
  }
  start(t) {
    if (((this.end = t ?? 1 / 0), (this.live = this.srcs.length), !this.live)) {
      this.dispose();
      return;
    }
    const e = () => {
      --this.live <= 0 && this.dispose();
    };
    for (const { s: i, t: s, offset: n } of this.srcs)
      ((i.onended = e),
        n >= 0 ? i.start(s, n) : i.start(s),
        t != null && i.stop(Math.max(t, s + 0.02)));
  }
  stopAt(t) {
    for (const { s: e } of this.srcs)
      try {
        e.stop(t);
      } catch {}
    this._fallback((t - this.ac.currentTime) * 1e3 + 400);
  }
  kill(t = this.ac.currentTime) {
    if (!(this.killed || this.disposed)) {
      this.killed = !0;
      try {
        const e = this.out.gain;
        (e.cancelScheduledValues(t),
          e.setValueAtTime(e.value, t),
          e.linearRampToValueAtTime(0, t + 0.04));
      } catch {}
      this.stopAt(t + 0.05);
    }
  }
  _fallback(t) {
    (this._fb && clearTimeout(this._fb),
      (this._fb = setTimeout(
        () => this.dispose(),
        Math.max(200, Math.min(t, 2e4)),
      )));
  }
  dispose() {
    if (!this.disposed) {
      ((this.disposed = !0), this._fb && clearTimeout(this._fb));
      for (const { s: t } of this.srcs) t.onended = null;
      for (const t of this.nodes)
        try {
          t.disconnect();
        } catch {}
      ((this.nodes.length = 0),
        (this.srcs.length = 0),
        this.eng._removeVoice(this));
    }
  }
}
function attackDecayEnvelope(r, t, e, i, s) {
  return (
    r.setValueAtTime(0, t),
    r.linearRampToValueAtTime(i, t + e),
    r.setTargetAtTime(0, t + e, s),
    t + e + s * 7
  );
}
export function trapezoidEnvelope(r, t, e, i, s = 0.01, n = 0.02) {
  const o = Math.min(s, e * 0.4),
    a = Math.min(n, e * 0.4);
  (r.setValueAtTime(0, t),
    r.linearRampToValueAtTime(i, t + o),
    r.linearRampToValueAtTime(i * 0.8, t + e - a),
    r.linearRampToValueAtTime(0, t + e));
}
export function expSweep(r, t, e, i, s) {
  (r.setValueAtTime(Math.max(1, e), t),
    r.exponentialRampToValueAtTime(Math.max(1, i), t + Math.max(0.001, s)));
}
function sineBlip(r, t, e, i, s, n, o, a = 0.035) {
  const l = r.osc("sine", i, e),
    c = r.gain(0);
  return (
    expSweep(l.frequency, e, i, i * s, a),
    l.connect(c),
    c.connect(t),
    attackDecayEnvelope(c.gain, e, 0.002, n, o)
  );
}
function filteredNoiseBurst(r, t, e, i, s, n, o, a, l, c) {
  const h = r.noise(i, e),
    f = r.filter(s, n, o),
    u = r.gain(0);
  return (r.chain(h, f, u, t), attackDecayEnvelope(u.gain, e, a, l, c), f);
}
function thunderCrack(r, t, e, i = 1) {
  const s = r.eng.noise,
    n = clampNumber(e.strength, 0.1, 1.5) * i;
  filteredNoiseBurst(
    r,
    r.out,
    t,
    s.white,
    "highpass",
    250,
    0.5,
    8e-4,
    0.75 * n,
    0.022,
  );
  const o = r.sample(
      s.crackle[Math.floor(e.rand() * 3)],
      t,
      0.8 + e.rand() * 0.4,
    ),
    a = r.filter("highpass", 900, 0.6),
    l = r.gain(0);
  (r.chain(o, a, l, r.out),
    l.gain.setValueAtTime(0, t),
    l.gain.linearRampToValueAtTime(0.5 * n, t + 0.003),
    l.gain.setTargetAtTime(0, t + 0.05, 0.11));
  const c = filteredNoiseBurst(
    r,
    r.out,
    t,
    s.brown,
    "lowpass",
    900,
    0.7,
    0.004,
    0.75 * n,
    0.13,
  );
  return (
    c.frequency.setValueAtTime(1400, t),
    c.frequency.exponentialRampToValueAtTime(220, t + 0.5),
    t + 1.2
  );
}
function rumbleEnvelopeCurve(r, t, e, i) {
  const s = new Float32Array(t),
    n = 3 + Math.floor(r() * 4 + i * 2),
    o = [],
    a = [],
    l = [];
  for (let f = 0; f < n; f++)
    (o.push(f === 0 ? 0.03 + r() * 0.05 : r() * 0.75),
      a.push(f === 0 ? 1 : 0.35 + r() * 0.65),
      l.push(0.04 + r() * 0.12));
  let c = 1e-6;
  for (let f = 0; f < t; f++) {
    const u = f / (t - 1);
    let d = 0;
    for (let p = 0; p < n; p++) {
      const v = (u - o[p]) / l[p];
      d += a[p] * Math.exp(-v * v);
    }
    ((d = (0.25 + d) * Math.exp(-u * 2.6)), (s[f] = d), (c = Math.max(c, d)));
  }
  const h = Math.max(2, Math.floor(t * (0.05 / e)));
  for (let f = 0; f < t; f++) ((s[f] /= c), f < h && (s[f] *= f / h));
  return ((s[t - 1] = 0), s);
}
function thunderRumble(r, t, e) {
  const i = r.eng.noise,
    s = clampNumber(e.strength, 0.15, 1.5),
    n = 3.4 + 3.5 * s + e.rand() * 1.5,
    o = r.noise(i.brown, t, 0.9 + e.rand() * 0.2),
    a = r.filter("lowpass", 700, 0.6),
    l = r.filter("lowshelf", 90, 0.7);
  l.gain.value = 5;
  const c = r.gain(0);
  (r.chain(o, a, l, c, r.out),
    a.frequency.setValueAtTime(500 + 700 * s, t),
    a.frequency.exponentialRampToValueAtTime(130, t + n * 0.85));
  const h = rumbleEnvelopeCurve(e.rand, 96, n, s);
  for (let v = 0; v < h.length; v++) h[v] *= 0.8 * s;
  c.gain.setValueCurveAtTime(h, t, n);
  const f = r.noise(i.pink, t),
    u = r.filter("bandpass", 160, 0.8),
    d = r.gain(0);
  (r.chain(f, u, d, r.out),
    u.frequency.setValueAtTime(260, t),
    u.frequency.exponentialRampToValueAtTime(90, t + n));
  const p = rumbleEnvelopeCurve(e.rand, 96, n, s);
  for (let v = 0; v < p.length; v++) p[v] *= 0.45 * s;
  return (d.gain.setValueCurveAtTime(p, t + 0.05, n), t + n + 0.15);
}
const SFX_RECIPES = {
  grab(r, t, e) {
    const i = r.eng.noise,
      s = e.pitch,
      n = filteredNoiseBurst(
        r,
        r.out,
        t,
        i.pink,
        "bandpass",
        2400 * s,
        0.9,
        0.006,
        0.7,
        0.04,
      );
    (n.frequency.setValueAtTime(2800 * s, t),
      n.frequency.exponentialRampToValueAtTime(900 * s, t + 0.15));
    const o = 420 * s,
      a = r.osc("sine", o * 1.5, t);
    expSweep(a.frequency, t, o * 1.5, o, 0.05);
    const l = r.gain(0);
    (r.chain(a, l, r.out), attackDecayEnvelope(l.gain, t, 0.004, 0.42, 0.07));
    const c = r.osc("triangle", o * 3.01, t),
      h = r.gain(0);
    return (
      r.chain(c, h, r.out),
      attackDecayEnvelope(h.gain, t, 0.003, 0.1, 0.03),
      r.send(0.25),
      t + 0.7
    );
  },
  release(r, t, e) {
    const i = r.eng.noise,
      s = e.pitch,
      n = r.noise(i.pink, t),
      o = r.filter("bandpass", 1200 * s, 0.8),
      a = r.filter("lowpass", 3200 * s, 0.6),
      l = r.gain(0);
    return (
      r.chain(n, o, a, l, r.out),
      expSweep(o.frequency, t, 1300 * s, 320 * s, 0.42),
      attackDecayEnvelope(l.gain, t, 0.035, 0.75, 0.11),
      filteredNoiseBurst(
        r,
        r.out,
        t,
        i.brown,
        "lowpass",
        420 * s,
        0.7,
        0.02,
        0.35,
        0.09,
      ),
      r.send(0.15),
      t + 1
    );
  },
  squish(r, t, e) {
    const i = r.eng.noise,
      s = e.pitch,
      n = r.noise(i.pink, t),
      o = r.filter("bandpass", 400 * s, 4.5),
      a = r.filter("lowpass", 2600 * s, 0.7),
      l = r.gain(0);
    (r.chain(n, o, a, l, r.out),
      o.frequency.setValueAtTime(240 * s, t),
      o.frequency.exponentialRampToValueAtTime(1050 * s, t + 0.09),
      o.frequency.exponentialRampToValueAtTime(480 * s, t + 0.28),
      attackDecayEnvelope(l.gain, t, 0.022, 1.5, 0.085));
    const c = 2 + Math.floor(e.rand() * 3);
    for (let h = 0; h < c; h++) {
      const f = t + 0.015 + e.rand() * 0.17;
      sineBlip(
        r,
        r.out,
        f,
        (240 + e.rand() * 260) * s,
        2.1,
        0.17 * (1 - h * 0.15),
        0.018,
        0.04,
      );
    }
    return (r.send(0.12), t + 0.75);
  },
  merge(r, t, e) {
    const i = r.eng.noise,
      s = e.pitch,
      n = r.osc("sine", 95 * s, t);
    expSweep(n.frequency, t, 95 * s, 42 * s, 0.38);
    const o = r.gain(0);
    (r.chain(n, o, r.out), attackDecayEnvelope(o.gain, t, 0.018, 0.5, 0.22));
    const a = r.osc("sine", 190 * s, t);
    expSweep(a.frequency, t, 190 * s, 96 * s, 0.25);
    const l = r.gain(0);
    return (
      r.chain(a, l, r.out),
      attackDecayEnvelope(l.gain, t, 0.012, 0.22, 0.08),
      filteredNoiseBurst(
        r,
        r.out,
        t,
        i.brown,
        "lowpass",
        280 * s,
        0.9,
        0.03,
        0.65,
        0.2,
      ),
      filteredNoiseBurst(
        r,
        r.out,
        t,
        i.pink,
        "bandpass",
        650 * s,
        0.7,
        0.05,
        0.16,
        0.14,
      ),
      r.send(0.3),
      t + 1.9
    );
  },
  zap(r, t, e) {
    const i = r.eng.noise,
      s = e.pitch,
      n = clampNumber(e.strength, 0.2, 1.5),
      o = r.sample(
        i.crackle[Math.floor(e.rand() * 3)],
        t,
        (0.75 + e.rand() * 0.5) * s,
      ),
      a = r.filter("highpass", 1300, 0.7),
      l = r.filter("peaking", 3800 * s, 1.2);
    l.gain.value = 5;
    const c = r.gain(0);
    r.chain(o, a, l, c, r.out);
    const h = 0.06 + 0.12 * n * e.rand();
    (c.gain.setValueAtTime(0, t),
      c.gain.linearRampToValueAtTime(0.55, t + 0.003),
      c.gain.setTargetAtTime(0, t + h, 0.04));
    const f = r.osc("sawtooth", (95 + e.rand() * 40) * s, t),
      u = r.filter("bandpass", 1900 * s, 2.5),
      d = r.gain(0);
    return (
      r.chain(f, u, d, r.out),
      attackDecayEnvelope(d.gain, t, 0.004, 0.06, 0.035),
      r.send(0.15),
      t + h + 0.35
    );
  },
  crack(r, t, e) {
    return (r.send(0.4), thunderCrack(r, t, e, 1));
  },
  rumble(r, t, e) {
    return (r.send(0.3), thunderRumble(r, t, e));
  },
  thunder(r, t, e) {
    const i = clampNumber(1.25 - (e.delay || 0) * 0.9, 0.15, 1);
    return (
      thunderCrack(r, t, e, i),
      r.send(0.35),
      Math.max(t + 1.2, thunderRumble(r, t + 0.02 + (1 - i) * 0.08, e))
    );
  },
  tink(r, t, e) {
    const i = r.eng.noise,
      s = e.pitch,
      n = 1850 * s * (1 + (e.rand() - 0.5) * 0.04),
      o = [1, 2.32, 4.25, 6.63, 9.38],
      a = [1, 0.5, 0.3, 0.16, 0.08],
      l = [0.38, 0.19, 0.1, 0.055, 0.03];
    let c = t + 0.3;
    for (let p = 0; p < o.length; p++) {
      const v = n * o[p] * (1 + (e.rand() - 0.5) * 0.006);
      if (v > 17e3) break;
      const g = r.osc("sine", v, t),
        x = r.gain(0);
      (r.chain(g, x, r.out),
        (c = Math.max(
          c,
          attackDecayEnvelope(x.gain, t, 0.0015, 0.24 * a[p], l[p]),
        )));
    }
    const h = r.osc("sine", n * 1.0035, t),
      f = r.gain(0);
    (r.chain(h, f, r.out), attackDecayEnvelope(f.gain, t, 0.003, 0.1, 0.34));
    const u = r.osc("sine", 330 * s, t),
      d = r.gain(0);
    return (
      r.chain(u, d, r.out),
      attackDecayEnvelope(d.gain, t, 0.002, 0.1, 0.025),
      filteredNoiseBurst(
        r,
        r.out,
        t,
        i.white,
        "highpass",
        4200,
        0.7,
        5e-4,
        0.22,
        0.004,
      ),
      r.send(0.4),
      c
    );
  },
  whoosh(r, t, e) {
    const i = r.eng.noise,
      s = e.pitch,
      n = 0.55 / Math.sqrt(s),
      o = r.noise(i.pink, t),
      a = r.filter("bandpass", 400 * s, 1.4),
      l = r.gain(0);
    if (
      (r.chain(o, a, l, r.out),
      a.frequency.setValueAtTime(330 * s, t),
      a.frequency.exponentialRampToValueAtTime(1500 * s, t + n * 0.45),
      a.frequency.exponentialRampToValueAtTime(480 * s, t + n),
      l.gain.setValueAtTime(0, t),
      l.gain.linearRampToValueAtTime(1.2, t + n * 0.4),
      l.gain.setTargetAtTime(0, t + n * 0.45, n * 0.2),
      r.panner)
    ) {
      const c = e.panGiven ? r.panner.pan.value : 0,
        h = e.rand() < 0.5 ? -1 : 1;
      (r.panner.pan.setValueAtTime(clampNumber(c - 0.35 * h, -1, 1), t),
        r.panner.pan.linearRampToValueAtTime(
          clampNumber(c + 0.35 * h, -1, 1),
          t + n,
        ));
    }
    return (r.send(0.1), t + n * 1.9 + 0.1);
  },
  splash(r, t, e) {
    const i = r.eng.noise,
      s = e.pitch;
    sineBlip(
      r,
      r.out,
      t,
      360 * s * (0.9 + e.rand() * 0.2),
      2.4,
      0.55,
      0.03,
      0.05,
    );
    const n = r.osc("sine", 150 * s, t);
    expSweep(n.frequency, t, 150 * s, 85 * s, 0.08);
    const o = r.gain(0);
    (r.chain(n, o, r.out),
      attackDecayEnvelope(o.gain, t, 0.003, 0.22, 0.04),
      filteredNoiseBurst(
        r,
        r.out,
        t + 0.004,
        i.white,
        "bandpass",
        2600 * s,
        0.8,
        0.003,
        0.6,
        0.055,
      ));
    const a = 2 + Math.floor(e.rand() * 3);
    for (let l = 0; l < a; l++)
      sineBlip(
        r,
        r.out,
        t + 0.07 + e.rand() * 0.3,
        (900 + e.rand() * 1300) * s,
        1.6,
        0.08 + e.rand() * 0.08,
        0.012,
        0.025,
      );
    return (r.send(0.2), t + 0.75);
  },
  drip(r, t, e) {
    const i = r.eng.noise,
      n = 1150 * e.pitch * (0.9 + e.rand() * 0.2);
    return (
      sineBlip(r, r.out, t, n, 1.9, 0.5, 0.022, 0.03),
      filteredNoiseBurst(
        r,
        r.out,
        t,
        i.white,
        "highpass",
        3e3,
        0.7,
        5e-4,
        0.07,
        0.002,
      ),
      r.send(0.3),
      t + 0.35
    );
  },
  pop(r, t, e) {
    const i = r.eng.noise,
      s = e.pitch;
    return (
      sineBlip(r, r.out, t, 290 * s, 2.6, 0.62, 0.03, 0.045),
      filteredNoiseBurst(
        r,
        r.out,
        t,
        i.pink,
        "lowpass",
        1300 * s,
        0.7,
        0.004,
        0.3,
        0.028,
      ),
      r.send(0.2),
      t + 0.4
    );
  },
  chime(r, t, e) {
    const i = e.pitch,
      s = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4],
      n = 1568 * i,
      o = 3 + Math.floor(e.rand() * 2);
    let a = Math.floor(e.rand() * 3),
      l = t,
      c = t;
    for (let h = 0; h < o; h++) {
      const f = n * s[Math.min(a, s.length - 1)],
        u = r.osc("sine", f, l),
        d = r.osc("sine", f * 3.5, l),
        p = r.gain(0),
        v = r.gain(0);
      (r.chain(d, p, u.frequency),
        r.chain(u, v, r.out),
        p.gain.setValueAtTime(f * 1.1, l),
        p.gain.setTargetAtTime(0, l, 0.06),
        (c = Math.max(
          c,
          attackDecayEnvelope(v.gain, l, 0.002, 0.16 * (1 - h * 0.12), 0.26),
        )),
        (a += 1 + Math.floor(e.rand() * 2)),
        (l += 0.05 + e.rand() * 0.05));
    }
    return (r.send(0.55), c);
  },
  squeak(r, t, e) {
    const i = r.eng.noise,
      n = 1150 * e.pitch * (0.9 + e.rand() * 0.25),
      o = 0.1 + e.rand() * 0.12,
      a = r.osc("triangle", n, t);
    (a.frequency.setValueAtTime(n, t),
      a.frequency.linearRampToValueAtTime(
        n * (1.08 + e.rand() * 0.1),
        t + o * 0.45,
      ),
      a.frequency.linearRampToValueAtTime(n * (0.94 + e.rand() * 0.06), t + o));
    const l = r.osc("sine", 24 + e.rand() * 14, t),
      c = r.gain(n * 0.025);
    r.chain(l, c, a.frequency);
    const h = r.filter("bandpass", n * 2, 5),
      f = r.gain(0);
    return (
      r.chain(a, h, f, r.out),
      f.gain.setValueAtTime(0, t),
      f.gain.linearRampToValueAtTime(0.55, t + 0.02),
      f.gain.setTargetAtTime(0, t + o, 0.03),
      filteredNoiseBurst(
        r,
        r.out,
        t,
        i.pink,
        "bandpass",
        3200,
        1,
        0.02,
        0.18,
        0.03 + o * 0.15,
      ),
      r.send(0.2),
      t + o + 0.25
    );
  },
  click(r, t, e) {
    const i = r.eng.noise,
      s = e.pitch,
      n = r.osc("sine", 1250 * s, t);
    expSweep(n.frequency, t, 1250 * s, 900 * s, 0.02);
    const o = r.gain(0);
    return (
      r.chain(n, o, r.out),
      attackDecayEnvelope(o.gain, t, 0.001, 0.5, 0.012),
      filteredNoiseBurst(
        r,
        r.out,
        t,
        i.white,
        "bandpass",
        3500 * s,
        1.2,
        5e-4,
        0.25,
        0.004,
      ),
      r.send(0.1),
      t + 0.15
    );
  },
};
const SFX_POLYPHONY = {
  grab: 3,
  release: 3,
  squish: 4,
  merge: 3,
  zap: 4,
  crack: 3,
  rumble: 3,
  thunder: 3,
  tink: 6,
  whoosh: 5,
  splash: 6,
  drip: 8,
  pop: 6,
  chime: 4,
  squeak: 3,
  click: 3,
};
const AUTO_PANNED_SFX = new Set(["whoosh"]);
function softClipCurve(r = 2048) {
  const t = new Float32Array(r);
  for (let e = 0; e < r; e++) {
    const i = ((e / (r - 1)) * 2 - 1) * 2,
      s = Math.abs(i),
      n = s <= 0.75 ? s : 0.75 + 0.22 * Math.tanh((s - 0.75) / 0.22);
    t[e] = Math.sign(i) * n;
  }
  return t;
}
function createCompressor(r, t, e, i, s, n) {
  const o = r.createDynamicsCompressor();
  return (
    (o.threshold.value = t),
    (o.knee.value = e),
    (o.ratio.value = i),
    (o.attack.value = s),
    (o.release.value = n),
    o
  );
}
export class SfxEngine {
  constructor(t, e = {}) {
    if (
      ((this.ac = t),
      (this.tier = e.tier ?? 1),
      (this.noise = getNoiseBank(t)),
      (this.voices = []),
      (this.maxVoices = this.tier === 0 ? 22 : 36),
      (this.limiter = createCompressor(t, -3, 0, 20, 0.002, 0.15)),
      (this.comp = createCompressor(t, -18, 12, 2.5, 0.008, 0.35)),
      (this.master = t.createGain()),
      (this.master.gain.value = e.level ?? 0.8),
      (this.clipIn = t.createGain()),
      (this.clipIn.gain.value = 0.5),
      (this.clip = t.createWaveShaper()),
      (this.clip.curve = softClipCurve()),
      this.master.connect(this.comp),
      this.comp.connect(this.limiter),
      this.limiter.connect(this.clipIn),
      this.clipIn.connect(this.clip),
      this.clip.connect(e.destination || t.destination),
      (this.sfx = t.createGain()),
      this.sfx.connect(this.master),
      (this.beds = t.createGain()),
      this.beds.connect(this.master),
      (this.verbIn = null),
      e.reverb !== !1)
    ) {
      this.verbIn = t.createGain();
      const i = t.createConvolver();
      ((i.buffer = createReverbImpulse(t, this.tier >= 2 ? 1.8 : 1.4)),
        (this.verbOut = t.createGain()),
        (this.verbOut.gain.value = 0.5),
        this.verbIn.connect(i),
        i.connect(this.verbOut),
        this.verbOut.connect(this.master),
        (this.conv = i));
    }
  }
  get now() {
    return this.ac.currentTime;
  }
  voice(t, e, i, s, n = SFX_POLYPHONY[t] ?? 6) {
    let o = 0,
      a = 0,
      l = null,
      c = null;
    for (const u of this.voices)
      u.killed ||
        (a++,
        u.name === t && (o++, l || (l = u)),
        !c && !u.persistent && (c = u));
    const h = this.ac.currentTime;
    o >= n && l ? l.kill(h) : a >= this.maxVoices && c && c.kill(h);
    const f = new SoundVoice(this, t, e || this.sfx, i, s);
    return (this.voices.push(f), f);
  }
  _removeVoice(t) {
    const e = this.voices.indexOf(t);
    e >= 0 && this.voices.splice(e, 1);
  }
  has(t) {
    return Object.prototype.hasOwnProperty.call(SFX_RECIPES, t);
  }
  play(t, e = {}, i = null) {
    const s = this.has(t) ? SFX_RECIPES[t] : null;
    if (!s) return !1;
    const n = clampNumber(Number.isFinite(e.volume) ? e.volume : 1, 0, 2);
    if (n <= 0.001) return !1;
    const o = clampNumber(Number.isFinite(e.delay) ? e.delay : 0, 0, 30),
      a = i ?? this.ac.currentTime + 0.006 + o,
      l = Number.isFinite(e.pan),
      c = l ? clampNumber(e.pan, -1, 1) : AUTO_PANNED_SFX.has(t) ? 0 : null,
      h = this.voice(t, this.sfx, a, c);
    h.out.gain.value = n;
    const f = {
      pitch: clampNumber(Number.isFinite(e.pitch) ? e.pitch : 1, 0.25, 4),
      strength: clampNumber(Number.isFinite(e.strength) ? e.strength : 1, 0, 2),
      delay: o,
      panGiven: l,
      rand: Math.random,
    };
    let u;
    try {
      u = s(h, a, f);
    } catch (d) {
      throw (h.dispose(), d);
    }
    return (h.start(u), !0);
  }
  stopAll() {
    for (const t of this.voices.slice()) t.kill();
  }
}
