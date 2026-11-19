/**
 * Hud module assembling the toolbar, climate dock, time slider, thermometer, season dial, toasts and coach, with compact drawer and hide handling.
 */
import {
  DomBinding,
  TextBinding,
  createEl,
  htmlToElement,
  nowMs,
  playUiSound,
} from "./dom.js";
import { ICONS } from "./icons.js";
import { Toolbar } from "./toolbar.js";
import { SeasonDial } from "./seasonDial.js";
import { TimeSlider } from "./timeSlider.js";
import {
  Thermometer,
  describeConditions,
  formatDegrees,
} from "./thermometer.js";
import { TopBar } from "./topBar.js";
import { Coach, ToastStack } from "./coach.js";
const HUD_SLOW_INTERVAL_MS = 100;
const COMPACT_MEDIA_QUERY = "(max-width: 859px), (max-height: 519px)";
export class Hud {
  constructor(t) {
    ((this.ctx = t),
      (this._uses = Object.create(null)),
      (this._lastSlow = 0),
      (this._errs = new Set()),
      (this.hiddenByUser = !1),
      (this.drawerOpen = !1));
    const e = document.getElementById("ui") || document.body,
      i = (this.root = createEl("div", {
        class: "wg-hud",
      }));
    (this._shield(i), (this.top = new TopBar(t, this, i)));
    const s = createEl("div", {
      class: "wg-bottom",
    });
    (i.append(s),
      (this.toolbar = new Toolbar(t, this, s)),
      (this.drawerBtn = createEl(
        "button",
        {
          class: "wg-panel wg-drawer-btn",
          type: "button",
          "aria-expanded": "false",
          "aria-controls": "wg-dock",
          "aria-label": "Time, temperature & season",
        },
        [
          htmlToElement(ICONS.climate),
          createEl("span", {
            class: "wg-tool-label",
            text: "Climate",
          }),
        ],
      )),
      this.drawerBtn.addEventListener("click", () =>
        this.setDrawer(!this.drawerOpen),
      ),
      s.append(this.drawerBtn));
    const n = (this.dock = createEl("div", {
      class: "wg-dock",
      id: "wg-dock",
    }));
    (i.append(n), (this.time = new TimeSlider(t, this, n)));
    const o = createEl("div", {
        class: "wg-panel wg-climate",
      }),
      a = createEl("span", {
        class: "wg-temp",
      }),
      l = createEl("span", {
        class: "wg-offset",
      }),
      c = createEl("span", {
        class: "wg-cond",
      });
    o.append(
      createEl(
        "div",
        {
          class: "wg-climate-head",
        },
        [
          createEl(
            "span",
            {
              class: "wg-temp-row",
            },
            [a, l],
          ),
          c,
        ],
      ),
    );
    const h = createEl("div", {
      class: "wg-climate-body",
    });
    (o.append(h),
      n.append(o),
      (this.thermo = new Thermometer(t, this, h)),
      (this.season = new SeasonDial(t, this, h)),
      (this.tempTxt = new TextBinding(a)),
      (this.offTxt = new TextBinding(l)),
      (this.offShow = new DomBinding(l, "class", "is-shown")),
      (this.condTxt = new TextBinding(c)),
      (this.condTitle = new DomBinding(c, "attr", "title")),
      (this.toasts = new ToastStack(i)),
      (this.coach = new Coach(t, this, this.toasts)),
      e.append(i),
      (this.unhide = createEl(
        "button",
        {
          class: "wg-unhide",
          type: "button",
          "aria-label": "Show controls (U)",
          title: "Show controls (U)",
        },
        [htmlToElement(ICONS.eye)],
      )),
      this.unhide.addEventListener("click", () => this.setHidden(!1)),
      this._shield(this.unhide),
      document.body.append(this.unhide));
    try {
      this.mq = window.matchMedia(COMPACT_MEDIA_QUERY);
      const u = () => {
        (i.classList.toggle("is-compact", this.mq.matches),
          this.mq.matches || this.setDrawer(!1),
          this.coach.retarget());
      };
      (this.mq.addEventListener?.("change", u), u());
    } catch {}
    (t.events.on("hud:hint", (u) => this._hint(u?.text, u?.ms)),
      t.events.on("key", (u) => this._key(u || {})),
      t.events.on("scenario", () => this.slow()));
    const f = () => this.coach.start(2600);
    if (document.body.classList.contains("ready")) f();
    else {
      const u = new MutationObserver(() => {
        document.body.classList.contains("ready") && (u.disconnect(), f());
      });
      u.observe(document.body, {
        attributes: !0,
        attributeFilter: ["class"],
      });
    }
    ((this._dt = 0),
      (this._frameTime = () => this.time.frame(this._dt)),
      (this._frameSeason = () => this.season.frame(this._dt)),
      (this._frameThermo = () => this.thermo.frame(this._dt)),
      (this._slowCoach = () => this.coach.slow()),
      this.slow());
  }
  toast(t, e = 3200, i) {
    return this.toasts.toast(t, e, i);
  }
  setHidden(t) {
    (document.body.classList.toggle("no-ui", t),
      (this.hiddenByUser = t),
      this.unhide.classList.toggle("is-shown", t),
      t || this.slow());
  }
  setDrawer(t) {
    ((t = !!t && this.isCompact()),
      t !== this.drawerOpen &&
        ((this.drawerOpen = t),
        this.root.classList.toggle("is-drawer-open", t),
        this.drawerBtn.setAttribute("aria-expanded", String(t)),
        this.drawerBtn.classList.toggle("is-active", t),
        playUiSound(this.ctx, "pop", {
          volume: 0.1,
          pitch: t ? 1.25 : 1,
        }),
        this.coach.retarget()));
  }
  isCompact() {
    return !!this.mq?.matches;
  }
  seasonTarget() {
    return this.isCompact() && !this.drawerOpen
      ? this.drawerBtn
      : this.season.el;
  }
  markUse(t) {
    this._uses[t] = nowMs();
  }
  usedRecently(t, e) {
    return nowMs() - (this._uses[t] ?? -1e9) < e;
  }
  _shield(t) {
    const e = (i) => i.stopPropagation();
    for (const i of [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
      "wheel",
      "click",
      "dblclick",
      "touchstart",
      "touchmove",
    ])
      t.addEventListener(
        i,
        e,
        i === "wheel" || i.startsWith("touch")
          ? {
              passive: !0,
            }
          : !1,
      );
    for (const i of ["contextmenu", "dragstart", "selectstart"])
      t.addEventListener(i, (s) => s.preventDefault());
  }
  _hint(t, e) {
    if (((t = String(t ?? "").trim()), !t || this.coach.text === t)) return;
    const i = nowMs();
    (this._hinted ?? (this._hinted = new Map()),
      !(i - (this._hinted.get(t) ?? -1e9) < 3e4) &&
        (this._hinted.set(t, i), this.toast(t, e || 3600)));
  }
  _key({ key: t, event: e }) {
    if (!t || e?.ctrlKey || e?.metaKey || e?.altKey || e?.repeat) return;
    const i = e?.target?.tagName;
    i === "INPUT" ||
      i === "TEXTAREA" ||
      (t === "u" || t === "U"
        ? this.setHidden(!document.body.classList.contains("no-ui"))
        : t === "Escape" &&
          (this.drawerOpen
            ? this.setDrawer(!1)
            : this.hiddenByUser && this.setHidden(!1)));
  }
  _safe(t, e) {
    try {
      e();
    } catch (i) {
      this._errs.has(t) || (this._errs.add(t), console.error(`[hud] ${t}`, i));
    }
  }
  update(t) {
    const e = document.body.classList.contains("no-ui");
    ((this._dt = t),
      this._safe("time", this._frameTime),
      this._safe("season", this._frameSeason),
      this._safe("thermo", this._frameThermo));
    const i = nowMs();
    i - this._lastSlow >= HUD_SLOW_INTERVAL_MS &&
      ((this._lastSlow = i),
      this._safe("coach", this._slowCoach),
      e || this.slow());
  }
  slow() {
    const t = this.ctx.world;
    (this._safe("top", () => this.top.slow()),
      this._safe("time.slow", () => this.time.slow()),
      this._safe("season.slow", () => this.season.slow()),
      this._safe("thermo.slow", () => this.thermo.slow()),
      this._safe("climate", () => {
        this.tempTxt.set(formatDegrees(t.seaLevelTemp ?? 10));
        const e = Math.round(t.tempOffset || 0);
        (this.offTxt.set(e === 0 ? "" : `${e > 0 ? "+" : "−"}${Math.abs(e)}`),
          this.offShow.set(e !== 0));
        const i = describeConditions(t);
        (this.condTxt.set(i), this.condTitle.set(i));
      }));
  }
}
