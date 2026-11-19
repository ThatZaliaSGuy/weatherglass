/**
 * Time-of-day slider drawn as a sun-path curve with clock and day-phase readout and a play/pause day cycle button.
 */
import {
  DomBinding,
  TextBinding,
  bindPointerDrag,
  clamp2,
  createEl,
  htmlToElement,
  playUiSound,
  positiveMod,
  wrapSignedDelta,
} from "./dom.js";
import { ICONS } from "./icons.js";
const TIME_TRACK_MARGIN = 0.035;
const TIME_CURVE_AMPLITUDE = 0.36;
const TIME_HORIZON_Y = 0.5;
const timeToTrackX = (r) => TIME_TRACK_MARGIN + r * (1 - 2 * TIME_TRACK_MARGIN);
const timeToTrackY = (r) =>
  TIME_HORIZON_Y - TIME_CURVE_AMPLITUDE * Math.sin((r - 0.25) * Math.PI * 2);
function dayPhaseName(r) {
  return r < 0.2
    ? "Night"
    : r < 0.25
      ? "Dawn"
      : r < 0.31
        ? "Sunrise"
        : r < 0.44
          ? "Morning"
          : r < 0.56
            ? "Midday"
            : r < 0.68
              ? "Afternoon"
              : r < 0.75
                ? "Golden hour"
                : r < 0.81
                  ? "Dusk"
                  : "Night";
}
function formatClock(r) {
  const t = Math.floor(positiveMod(r, 1) * 24 * 60 + 1e-6) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
export class TimeSlider {
  constructor(t, e, i) {
    ((this.ctx = t),
      (this.hud = e),
      (this.dragging = !1),
      (this.target = null),
      (this.glide = null),
      (this.w = 200),
      (this.h = 56));
    const s = (this.el = createEl("div", {
      class: "wg-panel wg-time",
    }));
    ((this.playBtn = createEl(
      "button",
      {
        class: "wg-ibtn wg-play",
        type: "button",
        "aria-pressed": "false",
        "aria-label": "Play the day",
      },
      [htmlToElement(ICONS.play), htmlToElement(ICONS.pause)],
    )),
      this.playBtn.addEventListener("click", () => this.togglePlay()));
    const n = createEl("span", {
        class: "wg-time-clock",
      }),
      o = createEl("span", {
        class: "wg-time-phase",
      });
    (s.append(
      createEl(
        "div",
        {
          class: "wg-time-head",
        },
        [
          this.playBtn,
          createEl(
            "div",
            {
              class: "wg-time-read",
            },
            [n, o],
          ),
        ],
      ),
    ),
      (this.clockTxt = new TextBinding(n)),
      (this.phaseTxt = new TextBinding(o)));
    const a = 200,
      l = 56;
    let c = "";
    for (let p = 0; p <= 64; p++) {
      const v = p / 64;
      c += `${p ? "L" : "M"}${(timeToTrackX(v) * a).toFixed(2)} ${(timeToTrackY(v) * l).toFixed(2)}`;
    }
    const h = TIME_HORIZON_Y * l,
      f = (p) =>
        `<line class="wg-time-tick" x1="${(timeToTrackX(p) * a).toFixed(2)}" y1="${h - 3}" x2="${(timeToTrackX(p) * a).toFixed(2)}" y2="${h + 3}"/>`,
      u = `
      <svg class="wg-time-svg" viewBox="0 0 ${a} ${l}" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <clipPath id="wg-clip-day"><rect x="0" y="0" width="${a}" height="${h}"/></clipPath>
          <clipPath id="wg-clip-night"><rect x="0" y="${h}" width="${a}" height="${l - h}"/></clipPath>
          <linearGradient id="wg-day-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffd98a" stop-opacity=".30"/>
            <stop offset="1" stop-color="#ffd98a" stop-opacity="0"/>
          </linearGradient>
          <linearGradient id="wg-day-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0.22" stop-color="#f3a36a"/>
            <stop offset="0.5" stop-color="#ffe2a0"/>
            <stop offset="0.78" stop-color="#f3a36a"/>
          </linearGradient>
        </defs>
        <path class="wg-time-dayfill" d="${c}L${a} ${h}L0 ${h}Z" clip-path="url(#wg-clip-day)"/>
        <path class="wg-time-night" d="${c}" clip-path="url(#wg-clip-night)"/>
        <line class="wg-time-horizon" x1="0" y1="${h}" x2="${a}" y2="${h}"/>
        <path class="wg-time-day" d="${c}" clip-path="url(#wg-clip-day)"/>
        ${f(0.25)}${f(0.5)}${f(0.75)}
      </svg>`;
    ((this.knob = createEl(
      "div",
      {
        class: "wg-time-knob",
        "aria-hidden": "true",
      },
      [
        createEl("span", {
          class: "wg-time-disc",
        }),
        htmlToElement(ICONS.sunFace),
        htmlToElement(ICONS.moonFace),
      ],
    )),
      (this.track = createEl(
        "div",
        {
          class: "wg-time-track",
          role: "slider",
          tabindex: "0",
          "aria-label": "Time of day",
          "aria-valuemin": "0",
          "aria-valuemax": "24",
        },
        [htmlToElement(u), this.knob],
      )),
      s.append(this.track),
      i.append(s),
      (this.knobT = new DomBinding(this.knob, "style", "transform")),
      (this.night = new DomBinding(this.knob, "var", "--night")),
      (this.isNight = new DomBinding(this.el, "class", "is-night")),
      (this.ariaNow = new DomBinding(this.track, "attr", "aria-valuenow")),
      (this.ariaText = new DomBinding(this.track, "attr", "aria-valuetext")),
      (this.playing = new DomBinding(this.playBtn, "attr", "aria-pressed")),
      (this.playClass = new DomBinding(this.el, "class", "is-playing")),
      (this.playLabel = new DomBinding(this.playBtn, "attr", "aria-label")),
      (this.sky = new DomBinding(this.el, "var", "--sky")));
    const d = () => {
      const p = this.track.getBoundingClientRect();
      p.width > 0 &&
        ((this.w = p.width), (this.h = p.height), (this.knobT.v = void 0));
    };
    try {
      new ResizeObserver(d).observe(this.track);
    } catch {
      window.addEventListener("resize", d);
    }
    (requestAnimationFrame(d),
      this._bind(),
      t.events.on("scenario", () => {
        this.glide = null;
      }));
  }
  _timeAt(t, e) {
    const i = (t.clientX - e.left) / Math.max(1, e.width);
    return positiveMod(
      (i - TIME_TRACK_MARGIN) / (1 - 2 * TIME_TRACK_MARGIN),
      1,
    );
  }
  _bind() {
    (bindPointerDrag(this.track, {
      onDown: () => {
        this.hud.markUse("time");
      },
      onDrag: (t, e, i) => {
        (i && this._beginDrag(),
          (this.target = this._timeAt(t, e)),
          this.hud.markUse("time"));
      },
      onUp: (t, e, i) => {
        if ((this.hud.markUse("time"), this.dragging)) {
          ((this.dragging = !1),
            (this.target = null),
            this.track.classList.remove("is-dragging"));
          return;
        }
        i || this.glideTo(this._timeAt(t, e));
      },
    }),
      this.track.addEventListener(
        "wheel",
        (t) => {
          t.preventDefault();
          const e = (t.deltaY + t.deltaX) * (t.deltaMode === 1 ? 16 : 1);
          this.nudge(clamp2(e, -60, 60) * 45e-5);
        },
        {
          passive: !1,
        },
      ),
      this.track.addEventListener("keydown", (t) => {
        const e = t.key;
        let i = !0;
        (e === "ArrowRight" || e === "ArrowUp"
          ? this.nudge(1 / 96)
          : e === "ArrowLeft" || e === "ArrowDown"
            ? this.nudge(-1 / 96)
            : e === "PageUp"
              ? this.nudge(1 / 24)
              : e === "PageDown"
                ? this.nudge(-1 / 24)
                : e === "Home"
                  ? this.glideTo(0.25)
                  : e === "End"
                    ? this.glideTo(0.75)
                    : (i = !1),
          i && (t.preventDefault(), t.stopPropagation()));
      }));
  }
  _stopSky() {
    const t = this.ctx.modules?.sky;
    t && ((t.glide = null), (t.timeVel = 0));
  }
  _beginDrag() {
    ((this.dragging = !0),
      (this.glide = null),
      this._stopSky(),
      this.track.classList.add("is-dragging"));
  }
  glideTo(t) {
    this.hud.markUse("time");
    const e = this.ctx.modules?.sky;
    (e?.glideTo
      ? ((e.timeVel = 0), e.glideTo(t), (this.glide = null))
      : (this.glide = positiveMod(t, 1)),
      playUiSound(this.ctx, "tink", {
        volume: 0.06,
        pitch: 1.2,
      }));
  }
  nudge(t) {
    const e = this.ctx.world;
    (this._stopSky(),
      (this.glide = null),
      (e.timeOfDay = positiveMod(e.timeOfDay + t, 1)),
      this.hud.markUse("time"));
  }
  togglePlay() {
    const t = this.ctx.world;
    ((t.dayCycle = !t.dayCycle),
      this.hud.markUse("time"),
      playUiSound(this.ctx, "pop", {
        volume: 0.12,
        pitch: t.dayCycle ? 1.3 : 1,
      }),
      this.slow());
  }
  frame(t) {
    const e = this.ctx.world;
    (this.glide !== null &&
      this._wrote !== void 0 &&
      Math.abs(e.timeOfDay - this._wrote) > 1e-6 &&
      (this.glide = null),
      (this._wrote = void 0));
    const i = this.dragging ? this.target : this.glide;
    if (i != null) {
      const c = wrapSignedDelta(i - e.timeOfDay, 1),
        h = t > 0 ? 1 - Math.exp(-t * (this.dragging ? 14 : 5)) : 1;
      (this.dragging && (this._stopSky(), this.hud.markUse("time")),
        !this.dragging && Math.abs(c) < 0.0015
          ? ((e.timeOfDay = positiveMod(i, 1)), (this.glide = null))
          : ((e.timeOfDay = positiveMod(e.timeOfDay + c * h, 1)),
            this.dragging || (this._wrote = e.timeOfDay)));
    }
    const s = positiveMod(e.timeOfDay, 1),
      n = timeToTrackX(s) * this.w,
      o = timeToTrackY(s) * this.h;
    this.knobT.set(`translate(${n.toFixed(1)}px, ${o.toFixed(1)}px)`);
    const a = Math.sin((s - 0.25) * Math.PI * 2),
      l = clamp2(0.5 - a * 6, 0, 1);
    this.night.set((Math.round(l * 20) / 20).toFixed(2));
  }
  slow() {
    const t = this.ctx.world,
      e = positiveMod(t.timeOfDay, 1),
      i = formatClock(e);
    this.clockTxt.set(i);
    const s = dayPhaseName(e);
    (this.phaseTxt.set(s),
      this.isNight.set(t.night > 0.5),
      this.ariaNow.set((e * 24).toFixed(2)),
      this.ariaText.set(`${i}, ${s}`));
    const n = !!t.dayCycle;
    (this.playing.set(String(n)),
      this.playClass.set(n),
      this.playLabel.set(n ? "Pause the day" : "Play the day"));
    const o = t.hazeColor;
    if (o) {
      const a = (l) =>
        Math.round(
          clamp2(Math.pow(Math.max(0, l), 0.45454545454545453), 0, 1) * 255,
        );
      this.sky.set(`${a(o.r)} ${a(o.g)} ${a(o.b)}`);
    }
  }
}
