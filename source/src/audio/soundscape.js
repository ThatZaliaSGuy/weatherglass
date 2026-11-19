/**
 * Looping noise beds for wind, rain, snow, water and room tone combined with wildlife into the ambient Soundscape and its state.
 */
import { clampNumber, smoothstep3, valueNoise1D } from "./audioNoise.js";
import { BirdChorus, FrogChorus, InsectChorus } from "./wildlife.js";
function createBiquad(r, t, e, i = 0.707) {
  const s = r.createBiquadFilter();
  return ((s.type = t), (s.frequency.value = e), (s.Q.value = i), s);
}
class NoiseBed {
  constructor(t, e, i, { pan: s = !1, rate: n = 1, dest: o = null } = {}) {
    const a = t.ac;
    ((this.sc = t),
      (this.ac = a),
      (this.buf = e),
      (this.rate = n),
      (this.input = a.createGain()),
      (this.gain = a.createGain()),
      (this.gain.gain.value = 0),
      (this.nodes = [this.input, this.gain]),
      (i ? i(a, this.input, this) : this.input).connect(this.gain),
      (this.panner = null));
    const c = o || t.out;
    (s && a.createStereoPanner
      ? ((this.panner = a.createStereoPanner()),
        this.nodes.push(this.panner),
        this.gain.connect(this.panner),
        this.panner.connect(c))
      : this.gain.connect(c),
      (this.src = null),
      (this.quietSince = -1));
  }
  set(t, e, i = 0.35) {
    t > 2e-4
      ? ((this.quietSince = -1),
        this.src || this._start(e),
        this.gain.gain.setTargetAtTime(t, e, i))
      : this.src &&
        (this.quietSince < 0
          ? ((this.quietSince = e), this.gain.gain.setTargetAtTime(0, e, i))
          : e - this.quietSince > i * 9 + 0.5 && this._stop(e));
  }
  get active() {
    return !!this.src;
  }
  pan(t, e, i = 0.3) {
    this.panner &&
      this.src &&
      this.panner.pan.setTargetAtTime(clampNumber(t, -1, 1), e, i);
  }
  _start(t) {
    const e = this.ac.createBufferSource();
    ((e.buffer = this.buf),
      (e.loop = !0),
      (e.playbackRate.value = this.rate),
      e.connect(this.input),
      e.start(t, Math.random() * this.buf.duration * 0.95),
      (this.src = e));
  }
  _stop(t) {
    const e = this.src;
    if (((this.src = null), (this.quietSince = -1), !!e)) {
      e.onended = () => {
        try {
          e.disconnect();
        } catch {}
      };
      try {
        e.stop(t + 0.05);
      } catch {}
    }
  }
  dispose() {
    this._stop(this.ac.currentTime);
    for (const t of this.nodes)
      try {
        t.disconnect();
      } catch {}
  }
}
function playOneShotBuffer(r, t, e, i, s, n) {
  const o = r.createBufferSource();
  ((o.buffer = t), (o.playbackRate.value = s));
  const a = r.createGain();
  ((a.gain.value = n),
    o.connect(a),
    a.connect(e),
    (o.onended = () => {
      (o.disconnect(), a.disconnect());
    }),
    o.start(i));
}
class BurstScheduler {
  constructor() {
    this.next = 0;
  }
  run(t, e, i, s, n = 40) {
    if (!(e > 0)) {
      this.next = 0;
      return;
    }
    this.next < t && (this.next = t + (Math.random() / e) * 0.5);
    const o = t + i;
    let a = 0;
    for (; this.next < o && a++ < n;)
      (s(this.next), (this.next += -Math.log(1 - Math.random() * 0.999) / e));
  }
}
class WindBed {
  constructor(t) {
    const e = t.N;
    ((this.body = new NoiseBed(
      t,
      e.pink,
      (i, s, n) => (
        (n.bp = createBiquad(i, "bandpass", 400, 0.8)),
        (n.lp = createBiquad(i, "lowpass", 2200, 0.5)),
        n.nodes.push(n.bp, n.lp),
        s.connect(n.bp),
        n.bp.connect(n.lp),
        n.lp
      ),
    )),
      (this.rustle = new NoiseBed(
        t,
        e.white,
        (i, s, n) => (
          (n.hp = createBiquad(i, "highpass", 2800, 0.6)),
          (n.lp = createBiquad(i, "lowpass", 8e3, 0.5)),
          n.nodes.push(n.hp, n.lp),
          s.connect(n.hp),
          n.hp.connect(n.lp),
          n.lp
        ),
      )),
      (this.howl = new NoiseBed(
        t,
        e.pink,
        (i, s, n) => {
          ((n.b1 = createBiquad(i, "bandpass", 220, 9)),
            (n.b2 = createBiquad(i, "bandpass", 330, 11)));
          const o = i.createGain();
          return (
            n.nodes.push(n.b1, n.b2, o),
            s.connect(n.b1),
            s.connect(n.b2),
            n.b1.connect(o),
            n.b2.connect(o),
            o
          );
        },
        {
          rate: 0.98,
        },
      )),
      (this.t = Math.random() * 100));
  }
  update(t, e, i) {
    this.t += i;
    const s = smoothstep3(0, 2.4, t.wind),
      n = valueNoise1D(this.t * 0.21, 3),
      o = valueNoise1D(this.t * 0.83, 7),
      a = n * 0.7 + o * 0.3,
      l = 0.6 + 0.85 * a * (0.35 + 0.65 * s);
    (this.body.set((0.05 + 0.55 * Math.pow(s, 1.1)) * l, e, 0.4),
      this.body.active &&
        (this.body.bp.frequency.setTargetAtTime(
          240 + 620 * s + 260 * a,
          e,
          0.5,
        ),
        this.body.bp.Q.setTargetAtTime(0.6 + 0.9 * s, e, 0.5)));
    const c = 0.2 + 0.8 * clampNumber(t.leaf, 0, 1);
    this.rustle.set(
      0.12 * smoothstep3(0.12, 1, s) * c * (0.25 + 0.95 * o * a),
      e,
      0.25,
    );
    const h = smoothstep3(0.25, 0.85, t.storm);
    if (
      (this.howl.set(h * (0.5 + 0.6 * s) * (0.45 + 0.65 * a) * 1.1, e, 0.6),
      this.howl.active)
    ) {
      const f = 170 + 140 * valueNoise1D(this.t * 0.13, 11) + 90 * s;
      (this.howl.b1.frequency.setTargetAtTime(f, e, 0.4),
        this.howl.b2.frequency.setTargetAtTime(
          f * (1.42 + 0.12 * valueNoise1D(this.t * 0.2, 13)),
          e,
          0.4,
        ));
    }
  }
  dispose() {
    (this.body.dispose(), this.rustle.dispose(), this.howl.dispose());
  }
}
class RainBed {
  constructor(t) {
    const e = t.N,
      i = t.ac;
    ((this.sc = t),
      (this.ac = i),
      (this.hiss = new NoiseBed(
        t,
        e.white,
        (s, n, o) => (
          (o.hp = createBiquad(s, "highpass", 450, 0.5)),
          (o.lp = createBiquad(s, "lowpass", 2500, 0.5)),
          o.nodes.push(o.hp, o.lp),
          n.connect(o.hp),
          o.hp.connect(o.lp),
          o.lp
        ),
      )),
      (this.roar = new NoiseBed(
        t,
        e.pink,
        (s, n, o) => (
          (o.lp = createBiquad(s, "lowpass", 650, 0.6)),
          (o.hp = createBiquad(s, "highpass", 70, 0.7)),
          o.nodes.push(o.lp, o.hp),
          n.connect(o.lp),
          o.lp.connect(o.hp),
          o.hp
        ),
      )),
      (this.tickBus = i.createGain()),
      this.tickBus.connect(t.out),
      (this.sched = new BurstScheduler()),
      (this.tierMul = [0.5, 0.8, 1][clampNumber(t.tier, 0, 2)]),
      (this.t = 0));
  }
  update(t, e, i) {
    this.t += i;
    const s = clampNumber(t.rain / 2.2, 0, 1.4),
      n = smoothstep3(0.35, 1.1, s);
    (this.hiss.set(
      0.3 *
        Math.pow(smoothstep3(0, 1, s), 0.9) *
        (0.85 + 0.3 * valueNoise1D(this.t * 0.4, 21)),
      e,
      0.6,
    ),
      this.hiss.active &&
        this.hiss.lp.frequency.setTargetAtTime(
          1800 + 4800 * smoothstep3(0, 1.2, s),
          e,
          0.8,
        ),
      this.roar.set(0.22 * n, e, 0.8));
    const o = s > 0.005 ? (4 + 75 * Math.pow(s, 0.85)) * this.tierMul : 0,
      a = this.sc.N.drops,
      l = 1 - 0.45 * n;
    this.sched.run(e, o, 0.18, (c) => {
      const h = Math.random();
      playOneShotBuffer(
        this.ac,
        a[(Math.random() * a.length) | 0],
        this.tickBus,
        c,
        0.65 + Math.random() * 0.9,
        (0.04 + 0.16 * h * h * h) * l,
      );
    });
  }
  dispose() {
    (this.hiss.dispose(), this.roar.dispose());
    try {
      this.tickBus.disconnect();
    } catch {}
  }
}
class SnowBed {
  constructor(t) {
    this.hush = new NoiseBed(
      t,
      t.N.pink,
      (e, i, s) => (
        (s.lp = createBiquad(e, "lowpass", 1e3, 0.5)),
        (s.hp = createBiquad(e, "highpass", 180, 0.6)),
        s.nodes.push(s.lp, s.hp),
        i.connect(s.lp),
        s.lp.connect(s.hp),
        s.hp
      ),
      {
        rate: 0.9,
      },
    );
  }
  update(t, e) {
    this.hush.set(0.09 * smoothstep3(0, 1.4, t.snow), e, 1.2);
  }
  dispose() {
    this.hush.dispose();
  }
}
class WaterBed {
  constructor(t) {
    const e = t.N,
      i = t.ac;
    ((this.sc = t),
      (this.ac = i),
      (this.fall = new NoiseBed(
        t,
        e.pink,
        (s, n, o) => (
          (o.hp = createBiquad(s, "highpass", 140, 0.6)),
          (o.lp = createBiquad(s, "lowpass", 1400, 0.5)),
          o.nodes.push(o.hp, o.lp),
          n.connect(o.hp),
          o.hp.connect(o.lp),
          o.lp
        ),
        {
          pan: !0,
        },
      )),
      (this.brook = new NoiseBed(
        t,
        e.pink,
        (s, n, o) => (
          (o.bp = createBiquad(s, "bandpass", 1900, 0.9)),
          o.nodes.push(o.bp),
          n.connect(o.bp),
          o.bp
        ),
        {
          pan: !0,
          rate: 1.03,
        },
      )),
      (this.gurgleBus = i.createGain()),
      i.createStereoPanner
        ? ((this.gurglePan = i.createStereoPanner()),
          this.gurgleBus.connect(this.gurglePan),
          this.gurglePan.connect(t.out))
        : this.gurgleBus.connect(t.out),
      (this.sched = new BurstScheduler()),
      (this.tierMul = [0.5, 0.8, 1][clampNumber(t.tier, 0, 2)]),
      (this.t = Math.random() * 50),
      (this.plinks = null));
  }
  update(t, e, i) {
    this.t += i;
    const s = 1 - 0.88 * clampNumber(t.riverFreeze, 0, 1),
      n = clampNumber(
        1 + 1.2 * smoothstep3(0, 2, t.rain) + 4 * t.waterRise,
        1,
        2.6,
      );
    (this.fall.set(0.1 * s * (0.75 + 0.35 * (n - 1)), e, 1),
      this.fall.active &&
        (this.fall.lp.frequency.setTargetAtTime(1300 + 1300 * (n - 1), e, 1),
        this.fall.pan(t.panFall * 0.8, e, 0.4)));
    const o = 0.6 + 0.5 * valueNoise1D(this.t * 1.3, 5);
    (this.brook.set(0.045 * s * o * Math.pow(n, 0.6), e, 0.3),
      this.brook.active &&
        (this.brook.bp.frequency.setTargetAtTime(
          1500 + 900 * valueNoise1D(this.t * 0.6, 9) + 400 * (n - 1),
          e,
          0.3,
        ),
        this.brook.pan(t.panRiver * 0.8, e, 0.4)),
      this.gurglePan &&
        this.gurglePan.pan.setTargetAtTime(
          clampNumber(t.panRiver * 0.7, -1, 1),
          e,
          0.4,
        ),
      this.plinks ||
        (this.plinks = this.sc.N.drops.filter((l) => l.kind === 2)));
    const a = (4 + 4 * (n - 1)) * s * this.tierMul;
    this.sched.run(e, a, 0.2, (l) => {
      const c = this.plinks[(Math.random() * this.plinks.length) | 0];
      playOneShotBuffer(
        this.ac,
        c,
        this.gurgleBus,
        l,
        0.32 + Math.random() * 0.45,
        (0.012 + 0.03 * Math.random() ** 2) * (0.8 + 0.3 * (n - 1)),
      );
    });
  }
  dispose() {
    (this.fall.dispose(), this.brook.dispose());
    try {
      (this.gurgleBus.disconnect(), this.gurglePan?.disconnect());
    } catch {}
  }
}
class RoomTone {
  constructor(t) {
    this.layer = new NoiseBed(
      t,
      t.N.brown,
      (e, i, s) => (
        (s.lp = createBiquad(e, "lowpass", 220, 0.6)),
        s.nodes.push(s.lp),
        i.connect(s.lp),
        s.lp
      ),
      {
        rate: 0.85,
      },
    );
  }
  update(t, e) {
    this.layer.set(0.03, e, 1.5);
  }
  dispose() {
    this.layer.dispose();
  }
}
export class Soundscape {
  constructor(t, { tier: e = 1 } = {}) {
    ((this.eng = t),
      (this.ac = t.ac),
      (this.N = t.noise),
      (this.tier = e),
      (this.out = this.ac.createGain()),
      (this.out.gain.value = 0.7),
      this.out.connect(t.beds),
      (this.wind = new WindBed(this)),
      (this.rain = new RainBed(this)),
      (this.snow = new SnowBed(this)),
      (this.water = new WaterBed(this)),
      (this.room = new RoomTone(this)),
      (this.birds = new BirdChorus(this)),
      (this.insects = new InsectChorus(this)),
      (this.frogs = new FrogChorus(this)),
      (this.beds = [
        this.wind,
        this.rain,
        this.snow,
        this.water,
        this.room,
        this.birds,
        this.insects,
        this.frogs,
      ]));
  }
  update(t, e, i) {
    for (const s of this.beds) s.update(t, e, i);
  }
  dispose() {
    for (const t of this.beds) t.dispose?.();
    try {
      this.out.disconnect();
    } catch {}
  }
}
export function createSoundscapeState() {
  return {
    wind: 0.3,
    storm: 0,
    rain: 0,
    snow: 0,
    day: 1,
    night: 0,
    golden: 0,
    timeOfDay: 0.4,
    season: 0.25,
    activity: 1,
    leaf: 0.85,
    temp: 15,
    waterRise: 0,
    ice: 0,
    riverFreeze: 0,
    snowCover: 0,
    panFall: -0.2,
    panRiver: 0,
    panLake: 0.4,
  };
}
