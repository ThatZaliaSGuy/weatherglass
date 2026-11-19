/**
 * Rotary season dial control with drag, wheel, keyboard and glide-to-season interaction.
 */
import {
  DomBinding,
  TextBinding,
  bindPointerDrag,
  clamp2,
  createEl,
  hapticTap,
  htmlToElement,
  linearColorToSrgbTriplet,
  nowMs,
  playUiSound,
  positiveMod,
  wrapSignedDelta,
} from "./dom.js";
import { ICONS, SEASON_ICON_KEYS } from "./icons.js";
const SEASON_NAMES2 = ["Spring", "Summer", "Autumn", "Winter"];
function describeSeason(r) {
  r = positiveMod(r, 4);
  const t = Math.round(r) & 3,
    e = wrapSignedDelta(r - Math.round(r), 4);
  return e > 0.22
    ? {
        sub: "Late",
        name: SEASON_NAMES2[t],
      }
    : e < -0.22
      ? {
          sub: "Early",
          name: SEASON_NAMES2[t],
        }
      : {
          sub: t === 1 || t === 3 ? "Mid" : "",
          name: SEASON_NAMES2[t],
        };
}
export class SeasonDial {
  constructor(t, e, i) {
    ((this.ctx = t),
      (this.hud = e),
      (this.dragging = !1),
      (this.dragTarget = 0),
      (this.lastEmit = 0),
      (this.lastHeart = null));
    const s = (this.el = createEl("div", {
      class: "wg-dial",
      role: "slider",
      tabindex: "0",
      "aria-label": "Season dial",
      "aria-valuemin": "0",
      "aria-valuemax": "4",
    }));
    s.append(
      createEl("div", {
        class: "wg-dial-dish",
      }),
      createEl("div", {
        class: "wg-dial-ring",
      }),
      createEl("div", {
        class: "wg-dial-glow",
      }),
    );
    let n = "";
    for (let l = 0; l < 12; l++) {
      if (l % 3 === 0) continue;
      const c = (l / 12) * Math.PI * 2,
        h = 50 + Math.sin(c) * 35,
        f = 50 - Math.cos(c) * 35,
        u = 50 + Math.sin(c) * 37.4,
        d = 50 - Math.cos(c) * 37.4;
      n += `<line x1="${h.toFixed(2)}" y1="${f.toFixed(2)}" x2="${u.toFixed(2)}" y2="${d.toFixed(2)}"/>`;
    }
    (s.append(
      htmlToElement(
        `<svg class="wg-dial-ticks" viewBox="0 0 100 100" aria-hidden="true">${n}</svg>`,
      ),
    ),
      (this.glyphs = SEASON_ICON_KEYS.map((l, c) => {
        const h = createEl(
          "div",
          {
            class: `wg-dial-glyph wg-g-${l}`,
            "data-s": c,
            title: SEASON_NAMES2[c],
            "aria-hidden": "true",
          },
          [htmlToElement(ICONS[l])],
        );
        return (
          h.style.setProperty("--a", `${c * 90}deg`),
          s.append(h),
          {
            el: h,
            near: new DomBinding(h, "var", "--near"),
            on: new DomBinding(h, "class", "is-near"),
          }
        );
      })),
      (this.arm = createEl(
        "div",
        {
          class: "wg-dial-arm",
          "aria-hidden": "true",
        },
        [
          createEl("span", {
            class: "wg-dial-knob",
          }),
        ],
      )),
      s.append(this.arm));
    const o = createEl("span", {
        class: "wg-dial-sub",
      }),
      a = createEl("span", {
        class: "wg-dial-name",
      });
    (s.append(
      createEl(
        "div",
        {
          class: "wg-dial-label",
        },
        [o, a],
      ),
    ),
      (this.subTxt = new TextBinding(o)),
      (this.nameTxt = new TextBinding(a)),
      (this.armRot = new DomBinding(this.arm, "style", "transform")),
      (this.tint = new DomBinding(s, "var", "--tint")),
      (this.tint2 = new DomBinding(s, "var", "--tint2")),
      (this.ariaNow = new DomBinding(s, "attr", "aria-valuenow")),
      (this.ariaText = new DomBinding(s, "attr", "aria-valuetext")),
      i.append(s),
      this._bind());
  }
  _angleSeason(t, e) {
    const i = e.left + e.width / 2,
      s = e.top + e.height / 2,
      n = Math.atan2(t.clientX - i, -(t.clientY - s));
    return positiveMod((n / (Math.PI * 2)) * 4, 4);
  }
  _bind() {
    const t = this.el,
      e = this.ctx.world;
    let i = null,
      s = -1;
    (bindPointerDrag(t, {
      onDown: (n, o) => {
        const a = n.target.closest?.(".wg-dial-glyph"),
          l = o.left + o.width / 2,
          c = o.top + o.height / 2,
          h = Math.hypot(n.clientX - l, n.clientY - c) / (o.width / 2);
        ((s = a ? Number(a.dataset.s) : -1),
          (i = a ? "glyph" : h > 0.7 ? "ring" : "centre"),
          this.hud.markUse("season"),
          i === "ring" && this._startDrag(this._angleSeason(n, o)));
      },
      onDrag: (n, o) => {
        (this.dragging || this._startDrag(this._angleSeason(n, o)),
          (this.dragTarget = this._angleSeason(n, o)),
          this.hud.markUse("season"));
      },
      onUp: (n, o, a) => {
        if (this.dragging) {
          ((this.dragging = !1),
            t.classList.remove("is-dragging"),
            this._emit(!0));
          return;
        }
        a ||
          (i === "glyph" && s >= 0
            ? this.glideTo(s)
            : i === "centre" && this.glideTo((Math.round(e.season) + 1) & 3));
      },
    }),
      t.addEventListener(
        "wheel",
        (n) => {
          n.preventDefault();
          const o = (n.deltaY + n.deltaX) * (n.deltaMode === 1 ? 16 : 1);
          this.nudge(clamp2(o, -60, 60) * 0.0016);
        },
        {
          passive: !1,
        },
      ),
      t.addEventListener("keydown", (n) => {
        const o = n.key;
        let a = !0;
        (o === "ArrowRight" || o === "ArrowUp"
          ? this.nudge(0.05)
          : o === "ArrowLeft" || o === "ArrowDown"
            ? this.nudge(-0.05)
            : o === "PageUp" || o === "Enter" || o === " "
              ? this.glideTo((Math.round(e.season) + 1) & 3)
              : o === "PageDown"
                ? this.glideTo((Math.round(e.season) + 3) & 3)
                : o === "Home"
                  ? this.glideTo(0)
                  : (a = !1),
          a && (n.preventDefault(), n.stopPropagation()));
      }));
  }
  _startDrag(t) {
    ((this.dragging = !0),
      (this.dragTarget = t),
      (this.ctx.world.seasonTarget = null),
      this.el.classList.add("is-dragging"),
      (this.lastHeart = Math.round(this.ctx.world.season) & 3));
  }
  glideTo(t) {
    (this.ctx.world.setSeasonTarget?.(t),
      this.hud.markUse("season"),
      this.ctx.events.emit("season", {
        season: t,
        target: !0,
      }),
      playUiSound(this.ctx, "chime", {
        volume: 0.14,
        pitch: 0.9 + t * 0.12,
      }),
      hapticTap(8));
    const i = this.glyphs[t]?.el;
    i &&
      (i.classList.remove("is-picked"),
      i.offsetWidth,
      i.classList.add("is-picked"));
  }
  nudge(t) {
    const e = this.ctx.world;
    ((e.seasonTarget = null),
      (e.season = positiveMod(e.season + t, 4)),
      this.hud.markUse("season"),
      this._emit(!1));
  }
  _emit(t) {
    const e = nowMs();
    (!t && e - this.lastEmit < 120) ||
      ((this.lastEmit = e),
      this.ctx.events.emit("season", {
        season: this.ctx.world.season,
      }));
  }
  frame(t) {
    const e = this.ctx.world;
    if (this.dragging) {
      const s = wrapSignedDelta(this.dragTarget - e.season, 4),
        n = t > 0 ? 1 - Math.exp(-t * 16) : 1;
      ((e.seasonTarget = null), (e.season = positiveMod(e.season + s * n, 4)));
      const o = Math.round(e.season) & 3;
      (o !== this.lastHeart &&
        Math.abs(wrapSignedDelta(e.season - Math.round(e.season), 4)) < 0.12 &&
        ((this.lastHeart = o),
        hapticTap(5),
        playUiSound(this.ctx, "tink", {
          volume: 0.06,
          pitch: 1.4 + o * 0.1,
        })),
        this._emit(!1));
    }
    const i = positiveMod(e.season, 4);
    this.armRot.set(`rotate(${(i * 90).toFixed(2)}deg)`);
    for (let s = 0; s < 4; s++) {
      const n = Math.max(0, 1 - Math.abs(wrapSignedDelta(i - s, 4)) * 1.15),
        o = Math.round(n * 40) / 40;
      (this.glyphs[s].near.set(o.toFixed(3)), this.glyphs[s].on.set(o > 0.55));
    }
  }
  slow() {
    const t = this.ctx.world,
      e = positiveMod(t.season, 4),
      { sub: i, name: s } = describeSeason(e);
    (this.subTxt.set(i), this.nameTxt.set(s));
    const n = t.seasonal;
    (n?.foliage && this.tint.set(linearColorToSrgbTriplet(n.foliage)),
      n?.grass && this.tint2.set(linearColorToSrgbTriplet(n.grass)),
      this.ariaNow.set(e.toFixed(2)),
      this.ariaText.set(`${i ? i + " " : ""}${s}`.trim()));
  }
}
