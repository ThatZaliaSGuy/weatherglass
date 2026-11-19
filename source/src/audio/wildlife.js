/**
 * Procedural bird songs and season/time-aware bird chorus, insect chirp loops and frog chorus.
 */
import {
  clampNumber,
  seasonDistance,
  seededRandom,
  smoothstep3,
  valueNoise1D,
} from "./audioNoise.js";
import { expSweep, trapezoidEnvelope } from "./sfxEngine.js";
function warblerSong(r, t, e, i) {
  const s = r.osc("sine", 2500, t),
    n = r.gain(0);
  r.chain(s, n, r.out);
  const o = r.osc("sine", 30 + e() * 30, t),
    a = r.gain(0);
  r.chain(o, a, s.frequency);
  const l = (2100 + e() * 1300) * i(),
    c = 4 + Math.floor(e() * 6);
  let h = t;
  for (let f = 0; f < c; f++) {
    const u = 0.06 + e() * 0.13,
      d = l * (0.85 + e() * 0.6),
      p = d * (0.7 + e() * 0.65);
    (expSweep(s.frequency, h, d, p, u),
      a.gain.setValueAtTime(d * (e() < 0.4 ? 0.035 : 0.006), h),
      trapezoidEnvelope(n.gain, h, u, 0.75 + e() * 0.25, 0.012, 0.02),
      (h += u + 0.025 + e() * 0.07));
  }
  return h + 0.05;
}
function chickadeeSong(r, t, e, i) {
  const s = r.osc("sine", 4e3, t),
    n = r.gain(0);
  r.chain(s, n, r.out);
  const o = (3600 + e() * 600) * i(),
    a = 0.26 + e() * 0.1,
    l = 0.28 + e() * 0.12,
    c = 0.04 + e() * 0.05;
  (s.frequency.setValueAtTime(o, t),
    s.frequency.linearRampToValueAtTime(o * 0.985, t + a),
    trapezoidEnvelope(n.gain, t, a, 0.9, 0.035, 0.05));
  const h = t + a + c,
    f = o * (0.84 + e() * 0.04);
  return (
    s.frequency.setValueAtTime(f, h),
    s.frequency.linearRampToValueAtTime(f * 0.975, h + l * 0.5),
    s.frequency.linearRampToValueAtTime(f * 0.99, h + l),
    trapezoidEnvelope(n.gain, h, l, 0.7, 0.03, 0.06),
    h + l + 0.05
  );
}
function trillSong(r, t, e, i) {
  const s = r.osc("sine", 5e3, t),
    n = r.gain(0);
  r.chain(s, n, r.out);
  const o = 10 + Math.floor(e() * 14),
    a = 14 + e() * 10,
    l = (4e3 + e() * 1800) * i(),
    c = 0.72 + e() * 0.2,
    h = 0.62 / a;
  for (let f = 0; f < o; f++) {
    const u = t + f / a,
      d = f / (o - 1),
      p = l * (1 - (1 - c) * d);
    (expSweep(s.frequency, u, p * 1.1, p * 0.82, h),
      trapezoidEnvelope(
        n.gain,
        u,
        h,
        0.35 + 0.65 * Math.sin(Math.PI * (0.1 + 0.8 * d)),
        0.004,
        0.008,
      ));
  }
  return t + o / a + 0.05;
}
function sparrowSong(r, t, e, i) {
  const s = r.osc("sine", 4e3, t),
    n = r.gain(0);
  r.chain(s, n, r.out);
  const o = 2 + Math.floor(e() * 4),
    a = (2900 + e() * 1500) * i();
  let l = t;
  for (let c = 0; c < o; c++) {
    const h = 0.045 + e() * 0.045,
      f = a * (0.9 + e() * 0.25);
    (s.frequency.setValueAtTime(f * 0.85, l),
      s.frequency.exponentialRampToValueAtTime(f * 1.65, l + h * 0.4),
      s.frequency.exponentialRampToValueAtTime(f * 1.1, l + h),
      trapezoidEnvelope(n.gain, l, h, 0.8, 0.006, 0.012),
      (l += h + 0.08 + e() * 0.16));
  }
  return l;
}
function cooingPhrase(r, t, e, i, s, n, o, a, l = 0) {
  const c = r.osc("triangle", e, t),
    h = r.filter("lowpass", n, 0.7),
    f = r.gain(0);
  if ((r.chain(c, h, f, r.out), l)) {
    const d = r.osc("sine", l, t),
      p = r.gain(e * 0.012);
    r.chain(d, p, c.frequency);
  }
  let u = t;
  for (let d = 0; d < i.length; d++) {
    const [p, v, g] = i[d],
      x = e * v;
    (c.frequency.setValueAtTime(x * 0.93, u),
      c.frequency.linearRampToValueAtTime(x, u + p * 0.3),
      c.frequency.linearRampToValueAtTime(x * 0.92, u + p),
      trapezoidEnvelope(f.gain, u, p, g, o, a),
      (u += p + (s[d] || 0)));
  }
  return u + 0.05;
}
function doveSong(r, t, e, i) {
  const s = (540 + e() * 90) * i();
  return cooingPhrase(
    r,
    t,
    s,
    [
      [0.32, 1, 0.6],
      [0.55, 1.07, 1],
      [0.3, 0.96, 0.7],
      [0.32, 0.95, 0.65],
    ],
    [0.12, 0.28, 0.1],
    1100,
    0.07,
    0.12,
  );
}
function owlHoot(r, t, e, i) {
  const s = (340 + e() * 70) * i();
  return cooingPhrase(
    r,
    t,
    s,
    [
      [0.38, 1, 0.8],
      [0.16, 1.02, 0.6],
      [0.16, 1.02, 0.6],
      [0.65, 0.99, 1],
    ],
    [0.45, 0.07, 0.12],
    650,
    0.06,
    0.15,
    5 + e() * 2,
  );
}
function cuckooCall(r, t, e, i) {
  const s = r.osc("triangle", 700, t),
    n = r.filter("lowpass", 1500, 0.7),
    o = r.gain(0);
  r.chain(s, n, o, r.out);
  const a = (690 + e() * 80) * i();
  (s.frequency.setValueAtTime(a, t),
    s.frequency.linearRampToValueAtTime(a * 0.98, t + 0.16),
    trapezoidEnvelope(o.gain, t, 0.17, 0.9, 0.02, 0.05));
  const l = t + 0.24,
    c = a * 0.8;
  return (
    s.frequency.setValueAtTime(c, l),
    s.frequency.linearRampToValueAtTime(c * 0.97, l + 0.3),
    trapezoidEnvelope(o.gain, l, 0.3, 0.8, 0.02, 0.1),
    l + 0.35
  );
}
const BIRD_SPECIES = {
  warbler: {
    vol: 0.07,
    reps: [2, 5],
    gap: [2.5, 5],
    fn: warblerSong,
  },
  chickadee: {
    vol: 0.055,
    reps: [2, 4],
    gap: [2, 4],
    fn: chickadeeSong,
  },
  trill: {
    vol: 0.05,
    reps: [2, 4],
    gap: [3, 6],
    fn: trillSong,
  },
  sparrow: {
    vol: 0.055,
    reps: [2, 6],
    gap: [1.2, 3.5],
    fn: sparrowSong,
  },
  dove: {
    vol: 0.08,
    reps: [2, 3],
    gap: [3, 6],
    fn: doveSong,
  },
  cuckoo: {
    vol: 0.08,
    reps: [3, 6],
    gap: [1, 1.6],
    fn: cuckooCall,
  },
  owl: {
    vol: 0.085,
    reps: [2, 4],
    gap: [5, 9],
    fn: owlHoot,
  },
};
export class BirdChorus {
  constructor(t) {
    const e = t.ac;
    ((this.sc = t),
      (this.eng = t.eng),
      (this.ac = e),
      (this.bus = e.createGain()),
      (this.bus.gain.value = 1.25),
      this.bus.connect(t.out),
      this.eng.verbIn &&
        ((this.send = e.createGain()),
        (this.send.gain.value = 0.22),
        this.bus.connect(this.send),
        this.send.connect(this.eng.verbIn)),
      (this.singers = []),
      (this.maxSingers = [2, 4, 5][clampNumber(t.tier, 0, 2)]));
  }
  update(t, e, i) {
    const s = smoothstep3(0.25, 0.6, t.storm),
      n = smoothstep3(0.25, 1.6, t.rain),
      o = smoothstep3(0.3, 1.2, t.snow),
      a = Math.exp(-(((t.timeOfDay - 0.28) / 0.05) ** 2)),
      l = Math.exp(-(((t.timeOfDay - 0.72) / 0.04) ** 2)),
      c =
        (1 - s) *
        (1 - 0.85 * n) *
        (1 - 0.6 * o) *
        (1 - 0.5 * smoothstep3(1.2, 2.6, t.wind)),
      h =
        Math.pow(clampNumber(t.activity, 0, 1), 1.4) *
        smoothstep3(0.15, 0.7, t.day) *
        c *
        (1 + 1.4 * a + 0.5 * l),
      f = smoothstep3(0.5, 0.9, t.night) * c;
    this.dayAct = h;
    const u = Math.max(1, Math.round(this.maxSingers * clampNumber(h, 0, 1.2))),
      d = this.singers.filter((v) => v.species !== "owl").length;
    h > 0.02 &&
      d < u &&
      Math.random() < 0.25 * h * i * (d ? 1 : 2.5) &&
      this._add(this._pickDay(t.season), e);
    const p =
      0.35 + 0.65 * (1 - smoothstep3(0.3, 1.2, seasonDistance(t.season, 2.6)));
    f > 0.05 &&
      !this.singers.some((v) => v.species === "owl") &&
      Math.random() < 0.03 * f * p * i &&
      this._add("owl", e);
    for (let v = this.singers.length - 1; v >= 0; v--) {
      const g = this.singers[v];
      if (e < g.next) continue;
      const x = g.species === "owl" ? f : h;
      if (g.left <= 0 || x < 0.02) {
        this.singers.splice(v, 1);
        continue;
      }
      const m = this._sing(g, e + 0.02);
      (g.left--, (g.next = m + g.gap * (0.7 + Math.random() * 0.6)));
    }
  }
  _pickDay(t) {
    const e = 1 - smoothstep3(0, 1, seasonDistance(t, 0.2)),
      i = 1 - smoothstep3(0, 1, seasonDistance(t, 1.1)),
      s = 1 - smoothstep3(0, 1, seasonDistance(t, 2.1)),
      n = 1 - smoothstep3(0, 1, seasonDistance(t, 3.1)),
      o = [
        ["warbler", 3 * e + 2 * i + 0.6 * s + 0.1 * n],
        ["chickadee", 1.5 * e + 1 * i + 2 * s + 3 * n],
        ["trill", 2 * e + 2 * i + 0.6 * s],
        ["sparrow", 2 * e + 2 * i + 2 * s + 1 * n],
        ["dove", 0.6 * e + 1.5 * i + 0.4 * s],
        ["cuckoo", 1 * e + 0.3 * i],
      ];
    let a = 0;
    for (const [, c] of o) a += c;
    let l = Math.random() * a;
    for (const [c, h] of o) if ((l -= h) <= 0) return c;
    return "sparrow";
  }
  _add(t, e) {
    const i = BIRD_SPECIES[t];
    this.singers.push({
      species: t,
      seed: (Math.random() * 1e9) | 0,
      pan: (Math.random() * 2 - 1) * 0.85,
      vol: i.vol * (0.45 + 0.55 * Math.random()),
      left: i.reps[0] + Math.floor(Math.random() * (i.reps[1] - i.reps[0] + 1)),
      gap: i.gap[0] + Math.random() * (i.gap[1] - i.gap[0]),
      next: e + Math.random() * 0.8,
    });
  }
  sing(t, e, i = 0, s = null, n = 1) {
    return this._sing(
      {
        species: t,
        seed: n,
        pan: i,
        vol: s ?? BIRD_SPECIES[t].vol,
      },
      e,
    );
  }
  _sing(t, e) {
    const i = this.eng.voice("bird", this.bus, e, t.pan, 6);
    i.out.gain.value = t.vol;
    const s = seededRandom(t.seed),
      n = () => 0.97 + Math.random() * 0.06,
      o = BIRD_SPECIES[t.species].fn(i, e, s, n);
    return (i.start(o), o);
  }
  dispose() {
    try {
      (this.bus.disconnect(), this.send?.disconnect());
    } catch {}
  }
}
function createChirpLoop(
  r,
  {
    seconds: t,
    carrier: e,
    period: i,
    pulses: s,
    pan: n,
    seed: o,
    pulseDur: a = 0.016,
    pulseGap: l = 0.016,
    amp: c = 0.5,
  },
) {
  const h = r.sampleRate,
    f = Math.floor(t * h),
    u = r.createBuffer(2, f, h),
    d = u.getChannelData(0),
    p = u.getChannelData(1),
    v = Math.cos(((n + 1) * Math.PI) / 4),
    g = Math.sin(((n + 1) * Math.PI) / 4),
    x = seededRandom(o),
    m = s * (a + l);
  let w = 0.02 + x() * 0.1;
  for (; w + m < t - 0.02;) {
    const y = (2 * Math.PI * e * (1 + (x() - 0.5) * 0.01)) / h,
      _ = Math.floor(a * h);
    for (let M = 0; M < s; M++) {
      const A = Math.floor((w + M * (a + l)) * h),
        b = c * (M === 0 ? 0.65 : 1) * (0.85 + 0.15 * x());
      for (let S = 0; S < _; S++) {
        const E = A + S;
        if (E >= f) break;
        const T = Math.sin((Math.PI * S) / _),
          R = y * E,
          z =
            b *
            T *
            T *
            (Math.sin(R) + 0.2 * Math.sin(2 * R) + 0.05 * Math.sin(3 * R));
        ((d[E] += z * v), (p[E] += z * g));
      }
    }
    w += i * (0.93 + x() * 0.14);
  }
  return u;
}
function createInsectLoops(r, t = 1) {
  const e = [
    createChirpLoop(r, {
      seconds: 3.1,
      carrier: 4600,
      period: 0.52,
      pulses: 3,
      pan: -0.55,
      seed: 11,
    }),
    createChirpLoop(r, {
      seconds: 3.7,
      carrier: 4100,
      period: 0.71,
      pulses: 4,
      pan: 0.5,
      seed: 23,
      amp: 0.4,
    }),
  ];
  return (
    t > 0 &&
      e.push(
        createChirpLoop(r, {
          seconds: 4.4,
          carrier: 2900,
          period: 2.1,
          pulses: 60,
          pan: 0.12,
          seed: 37,
          pulseDur: 0.011,
          pulseGap: 0.011,
          amp: 0.22,
        }),
      ),
    e
  );
}
export class InsectChorus {
  constructor(t) {
    ((this.sc = t),
      (this.ac = t.ac),
      (this.bus = this.ac.createGain()),
      (this.bus.gain.value = 0),
      this.bus.connect(t.out),
      (this.loops = null),
      (this.voices = null),
      (this.quietSince = -1),
      (this.t = Math.random() * 100));
  }
  level(t) {
    const e = 1 - smoothstep3(0.15, 0.9, seasonDistance(t.season, 1.25)),
      i = smoothstep3(9, 16, t.temp),
      s =
        (1 - smoothstep3(0.2, 0.6, t.storm)) *
        (1 - smoothstep3(0.15, 0.9, t.rain)) *
        (1 - smoothstep3(0.05, 0.5, t.snow));
    return e * i * smoothstep3(0.25, 0.75, t.night) * s;
  }
  update(t, e, i) {
    this.t += i;
    const s = 0.3 * this.level(t);
    if (s > 0.002) {
      ((this.quietSince = -1),
        this.voices || this._start(e),
        this.bus.gain.setTargetAtTime(s, e, 1.5));
      const n = 0.95 + 0.1 * smoothstep3(10, 28, t.temp);
      for (let o = 0; o < this.voices.length; o++) {
        const { src: a, gain: l } = this.voices[o];
        (l.gain.setTargetAtTime(
          0.5 + 0.5 * valueNoise1D(this.t * 0.12, 31 + o),
          e,
          0.6,
        ),
          a.playbackRate.setTargetAtTime(n * (1 + o * 0.004), e, 2));
      }
    } else
      this.voices &&
        (this.quietSince < 0
          ? ((this.quietSince = e), this.bus.gain.setTargetAtTime(0, e, 1.5))
          : e - this.quietSince > 12 && this._stop(e));
  }
  _start(t) {
    (this.loops || (this.loops = createInsectLoops(this.ac, this.sc.tier)),
      (this.voices = this.loops.map((e) => {
        const i = this.ac.createBufferSource();
        ((i.buffer = e), (i.loop = !0));
        const s = this.ac.createGain();
        return (
          (s.gain.value = 0.7),
          i.connect(s),
          s.connect(this.bus),
          i.start(t, Math.random() * e.duration),
          {
            src: i,
            gain: s,
          }
        );
      })));
  }
  _stop(t) {
    for (const { src: e, gain: i } of this.voices || []) {
      e.onended = () => {
        (e.disconnect(), i.disconnect());
      };
      try {
        e.stop(t + 0.05);
      } catch {}
    }
    ((this.voices = null), (this.quietSince = -1));
  }
  dispose() {
    this.voices && this._stop(this.ac.currentTime);
    try {
      this.bus.disconnect();
    } catch {}
  }
}
class PoissonScheduler {
  constructor() {
    this.next = 0;
  }
  run(t, e, i, s) {
    if (!(e > 0)) {
      this.next = 0;
      return;
    }
    this.next < t && (this.next = t + (Math.random() / e) * 0.5);
    let n = 0;
    for (; this.next < t + i && n++ < 12;)
      (s(this.next), (this.next += -Math.log(1 - Math.random() * 0.999) / e));
  }
}
export class FrogChorus {
  constructor(t) {
    ((this.sc = t),
      (this.eng = t.eng),
      (this.ac = t.ac),
      (this.bus = this.ac.createGain()),
      this.bus.connect(t.out),
      (this.croaks = new PoissonScheduler()),
      (this.peeps = new PoissonScheduler()),
      (this.peepers = [0, 1, 2].map(() => ({
        f: 2550 + Math.random() * 500,
        pan: 0,
      }))));
  }
  level(t) {
    return (
      (1 - smoothstep3(0.1, 0.8, seasonDistance(t.season, 0.4))) *
      smoothstep3(0.3, 0.8, t.night) *
      smoothstep3(6, 11, t.temp) *
      (1 - smoothstep3(0.2, 0.6, t.storm)) *
      (1 - 0.6 * smoothstep3(0.3, 1.5, t.rain)) *
      (1 - clampNumber(t.ice, 0, 1))
    );
  }
  update(t, e) {
    const i = this.level(t);
    if (i < 0.03) {
      ((this.croaks.next = 0), (this.peeps.next = 0));
      return;
    }
    const s = clampNumber(t.panLake, -0.8, 0.8);
    (this.croaks.run(e, 0.7 * i, 0.25, (n) =>
      this._croak(n, s + (Math.random() - 0.5) * 0.5),
    ),
      this.peeps.run(e, 2.4 * i, 0.25, (n) => this._peep(n, s)));
  }
  _croak(t, e) {
    const i = this.eng.voice("frog", this.bus, t, clampNumber(e, -0.9, 0.9), 4);
    i.out.gain.value = 0.05 + 0.04 * Math.random();
    const s = 150 + Math.random() * 80,
      n = i.osc("sawtooth", s, t),
      o = i.filter("bandpass", 750 + Math.random() * 300, 2.5),
      a = i.filter("lowpass", 1800, 0.7),
      l = i.gain(0);
    i.chain(n, o, a, l, i.out);
    const c = 2 + (Math.random() < 0.4 ? 1 : 0);
    let h = t;
    for (let f = 0; f < c; f++) {
      const u = 0.04 + Math.random() * 0.02;
      (expSweep(n.frequency, h, s * 0.92, s * 1.08, u),
        trapezoidEnvelope(l.gain, h, u, 0.9, 0.008, 0.015),
        (h += u + 0.025));
    }
    i.start(h + 0.05);
  }
  _peep(t, e) {
    const i = this.peepers[(Math.random() * this.peepers.length) | 0],
      s = clampNumber(e + (i.f - 2800) / 900, -0.9, 0.9),
      n = this.eng.voice("frog", this.bus, t, s, 4);
    n.out.gain.value = 0.03 * (0.7 + 0.3 * Math.random());
    const o = n.osc("sine", i.f, t),
      a = n.gain(0);
    (n.chain(o, a, n.out),
      expSweep(o.frequency, t, i.f, i.f * 1.12, 0.11),
      trapezoidEnvelope(a.gain, t, 0.12, 0.9, 0.02, 0.03),
      n.start(t + 0.15));
  }
  dispose() {
    try {
      this.bus.disconnect();
    } catch {}
  }
}
