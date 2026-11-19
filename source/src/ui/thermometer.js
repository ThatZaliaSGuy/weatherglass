/**
 * Weather/condition description helpers and the draggable thermometer control for the temperature offset.
 */
import {
  DomBinding,
  bindPointerDrag,
  clamp2,
  createEl,
  hapticTap,
  playUiSound,
} from "./dom.js";
const TEMP_OFFSET_RANGE = 15;
const THERMO_MIN_TEMP = -20;
const THERMO_MAX_TEMP = 40;
const PEAK_SNOW_FREEZING_LEVEL = 4;
export const formatDegrees = (r) => {
  const t = Math.round(r);
  return `${t < 0 ? "−" : ""}${Math.abs(t)}°`;
};
export function describeWind(r) {
  return r < 0.18
    ? "still"
    : r < 0.38
      ? "light air"
      : r < 0.65
        ? "breezy"
        : r < 1.1
          ? "windy"
          : r < 1.7
            ? "gusty"
            : "gale";
}
export function describePrecipitation(r, t) {
  const e = r + t;
  return e < 0.04
    ? "dry"
    : t >= r
      ? t < 0.35
        ? "flurries"
        : t < 1.1
          ? "snow"
          : "heavy snow"
      : t > e * 0.2
        ? "sleet"
        : r < 0.3
          ? "drizzle"
          : r < 1.1
            ? "rain"
            : "downpour";
}
export function describeConditions(r) {
  const t = [],
    e = r.rainfall || 0,
    i = r.snowfall || 0,
    s = r.storminess || 0,
    n = r.fogAmount || 0,
    o = r.windEnergy || 0,
    a = r.seaLevelTemp ?? 10,
    l = r.freezingLevel ?? 10;
  if (
    (s > 0.55 && t.push("thunderstorm"),
    i > 0.05 && i >= e
      ? t.length
        ? t.push("snow")
        : t.push(i > 1.1 ? "heavy snow" : i < 0.35 ? "flurries" : "snowing")
      : e > 0.05 &&
        (t.length ||
          t.push(e > 1.1 ? "downpour" : e < 0.3 ? "drizzle" : "rain"),
        l < PEAK_SNOW_FREEZING_LEVEL && l > 0.2 && t.push("snow on the peaks")),
    n > 0.3 ? t.push("foggy") : n > 0.14 && t.length < 2 && t.push("misty"),
    t.length < 2 &&
      o >= 0.65 &&
      !t.includes("thunderstorm") &&
      t.push(describeWind(o)),
    !t.length)
  ) {
    const c = r.cloudCover || 0;
    (o >= 0.38 && t.push("breezy"),
      c > 0.65
        ? t.push("overcast")
        : c > 0.3
          ? t.push("some cloud")
          : (r.night || 0) > 0.5
            ? t.push(a < 0 ? "frosty night" : "clear night")
            : a < 0
              ? t.push("crisp & clear")
              : a > 26
                ? t.push("hot & sunny")
                : t.push((r.sunElevation || 0) > 0.25 ? "sunny" : "clear"));
  }
  return t.slice(0, 2).join(", ");
}
const MERCURY_COLOR_STOPS = [
  [-15, [130, 186, 255]],
  [0, [186, 222, 246]],
  [10, [255, 216, 140]],
  [22, [255, 164, 92]],
  [34, [240, 96, 72]],
];
function mercuryColor(r) {
  if (r <= MERCURY_COLOR_STOPS[0][0])
    return MERCURY_COLOR_STOPS[0][1].join(" ");
  for (let t = 1; t < MERCURY_COLOR_STOPS.length; t++)
    if (r <= MERCURY_COLOR_STOPS[t][0]) {
      const [e, i] = MERCURY_COLOR_STOPS[t - 1],
        [s, n] = MERCURY_COLOR_STOPS[t],
        o = (r - e) / (s - e);
      return i.map((a, l) => Math.round(a + (n[l] - a) * o)).join(" ");
    }
  return MERCURY_COLOR_STOPS[MERCURY_COLOR_STOPS.length - 1][1].join(" ");
}
export class Thermometer {
  constructor(t, e, i) {
    ((this.ctx = t),
      (this.hud = e),
      (this.dragging = !1),
      (this.target = null),
      (this.level = null),
      (this.railH = 96),
      (this.merc = createEl("div", {
        class: "wg-thermo-merc",
      })),
      (this.tab = createEl("div", {
        class: "wg-thermo-tab",
      })),
      (this.rail = createEl(
        "div",
        {
          class: "wg-thermo-rail",
        },
        [
          createEl("span", {
            class: "wg-thermo-zero",
          }),
          this.tab,
        ],
      )),
      (this.el = createEl(
        "div",
        {
          class: "wg-thermo",
          role: "slider",
          tabindex: "0",
          "aria-label": "Temperature (warmer / colder)",
          "aria-valuemin": String(-TEMP_OFFSET_RANGE),
          "aria-valuemax": String(TEMP_OFFSET_RANGE),
          title: "Drag: warmer / colder · double-click to reset",
        },
        [
          createEl("span", {
            class: "wg-thermo-mark wg-thermo-plus",
            text: "+",
            "aria-hidden": "true",
          }),
          createEl(
            "div",
            {
              class: "wg-thermo-tube",
            },
            [
              this.merc,
              createEl("span", {
                class: "wg-thermo-scale",
              }),
            ],
          ),
          createEl("div", {
            class: "wg-thermo-bulb",
          }),
          this.rail,
          createEl("span", {
            class: "wg-thermo-mark wg-thermo-minus",
            text: "−",
            "aria-hidden": "true",
          }),
        ],
      )),
      i.append(this.el),
      (this.mercT = new DomBinding(this.merc, "style", "transform")),
      (this.tabT = new DomBinding(this.tab, "style", "transform")),
      (this.color = new DomBinding(this.el, "var", "--merc")),
      (this.warm = new DomBinding(this.el, "var", "--warm")),
      (this.ariaNow = new DomBinding(this.el, "attr", "aria-valuenow")),
      (this.ariaText = new DomBinding(this.el, "attr", "aria-valuetext")));
    const s = () => {
      const n = this.rail.getBoundingClientRect();
      n.height > 0 && ((this.railH = n.height), (this.tabT.v = void 0));
    };
    try {
      new ResizeObserver(s).observe(this.rail);
    } catch {
      window.addEventListener("resize", s);
    }
    (requestAnimationFrame(s),
      this._bind(),
      t.events.on("scenario", () => {
        this.target = null;
      }));
  }
  _offsetAt(t) {
    const e = this._railRect || this.rail.getBoundingClientRect(),
      i = 1 - (t.clientY - e.top) / Math.max(1, e.height);
    let s = clamp2(i, 0, 1) * TEMP_OFFSET_RANGE * 2 - TEMP_OFFSET_RANGE;
    return (Math.abs(s) < 0.8 && (s = 0), Math.round(s * 10) / 10);
  }
  _set(t) {
    const e = this.ctx.world,
      i = e.tempOffset;
    ((e.tempOffset = clamp2(t, -TEMP_OFFSET_RANGE, TEMP_OFFSET_RANGE)),
      i !== 0 &&
        e.tempOffset === 0 &&
        (hapticTap(6),
        playUiSound(this.ctx, "tink", {
          volume: 0.05,
          pitch: 1.1,
        })),
      this.hud.markUse("temp"));
  }
  _bind() {
    (bindPointerDrag(this.el, {
      immediate: !0,
      onDown: () => {
        ((this.target = null),
          (this._railRect = this.rail.getBoundingClientRect()),
          this.hud.markUse("temp"));
      },
      onDrag: (t, e, i) => {
        (i && ((this.dragging = !0), this.el.classList.add("is-dragging")),
          this._set(this._offsetAt(t)));
      },
      onUp: () => {
        ((this.dragging = !1), this.el.classList.remove("is-dragging"));
      },
    }),
      this.el.addEventListener("dblclick", (t) => {
        (t.preventDefault(), (this.target = 0), this.hud.markUse("temp"));
      }),
      this.el.addEventListener(
        "wheel",
        (t) => {
          t.preventDefault();
          const e = (t.deltaY + t.deltaX) * (t.deltaMode === 1 ? 16 : 1);
          ((this.target = null),
            this._set(
              Math.round(
                (this.ctx.world.tempOffset - clamp2(e, -60, 60) * 0.02) * 10,
              ) / 10,
            ));
        },
        {
          passive: !1,
        },
      ),
      this.el.addEventListener("keydown", (t) => {
        const e = t.key,
          i = this.ctx.world;
        let s = !0;
        (e === "ArrowUp" || e === "ArrowRight"
          ? this._set(Math.round(i.tempOffset) + 1)
          : e === "ArrowDown" || e === "ArrowLeft"
            ? this._set(Math.round(i.tempOffset) - 1)
            : e === "Home" || e === "0"
              ? (this.target = 0)
              : (s = !1),
          s && (t.preventDefault(), t.stopPropagation()));
      }));
  }
  frame(t) {
    const e = this.ctx.world;
    if (this.target !== null && !this.dragging) {
      const o = t > 0 ? 1 - Math.exp(-t * 7) : 1,
        a = e.tempOffset + (this.target - e.tempOffset) * o;
      ((e.tempOffset = Math.abs(a - this.target) < 0.05 ? this.target : a),
        e.tempOffset === this.target && (this.target = null),
        this.hud.markUse("temp"));
    }
    const i = e.seaLevelTemp ?? 10,
      s = clamp2(
        (i - THERMO_MIN_TEMP) / (THERMO_MAX_TEMP - THERMO_MIN_TEMP),
        0.02,
        1,
      );
    (this.level === null
      ? (this.level = s)
      : (this.level += (s - this.level) * (t > 0 ? 1 - Math.exp(-t * 5) : 1)),
      this.mercT.set(`scaleY(${this.level.toFixed(3)})`));
    const n =
      (clamp2(e.tempOffset, -TEMP_OFFSET_RANGE, TEMP_OFFSET_RANGE) +
        TEMP_OFFSET_RANGE) /
      (TEMP_OFFSET_RANGE * 2);
    this.tabT.set(`translateY(${((1 - n) * this.railH).toFixed(1)}px)`);
  }
  slow() {
    const t = this.ctx.world,
      e = t.seaLevelTemp ?? 10;
    this.color.set(mercuryColor(e));
    const i = t.tempOffset;
    (this.warm.set(i > 0.4 ? "1" : i < -0.4 ? "-1" : "0"),
      this.ariaNow.set(i.toFixed(1)),
      this.ariaText.set(
        `${i >= 0 ? "+" : "−"}${Math.abs(i).toFixed(0)} °C, now ${formatDegrees(e)}`,
      ));
  }
}
