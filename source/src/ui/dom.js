/**
 * HUD helpers: clamping/wrapping math, DOM element creation, cached text/attribute bindings, localStorage wrapper, pointer-drag binding, haptics, UI sound and colour conversion.
 */
export const clamp2 = (r, t, e) => (r < t ? t : r > e ? e : r);
export const positiveMod = (r, t) => ((r % t) + t) % t;
export const wrapSignedDelta = (r, t) => (
  (r = positiveMod(r, t)),
  r > t / 2 ? r - t : r
);
export const nowMs = () => performance.now();
export function createEl(r, t = null, e = null) {
  const i = document.createElement(r);
  if (t)
    for (const s in t) {
      const n = t[s];
      n === !1 ||
        n === null ||
        n === void 0 ||
        (s === "html"
          ? (i.innerHTML = n)
          : s === "text"
            ? (i.textContent = n)
            : s === "style" && typeof n == "object"
              ? Object.assign(i.style, n)
              : i.setAttribute(s, n === !0 ? "" : String(n)));
    }
  if (e) for (const s of [].concat(e)) s != null && s !== !1 && i.append(s);
  return i;
}
export function htmlToElement(r) {
  const t = document.createElement("template");
  return ((t.innerHTML = r.trim()), t.content.firstElementChild);
}
export class TextBinding {
  constructor(t) {
    ((this.el = t), (this.v = void 0));
  }
  set(t) {
    t !== this.v && ((this.v = t), (this.el.textContent = t));
  }
}
export class DomBinding {
  constructor(t, e, i) {
    ((this.el = t), (this.kind = e), (this.name = i), (this.v = void 0));
  }
  set(t) {
    if (t === this.v) return;
    this.v = t;
    const { el: e, kind: i, name: s } = this;
    i === "var"
      ? e.style.setProperty(s, t)
      : i === "attr"
        ? e.setAttribute(s, t)
        : i === "style"
          ? (e.style[s] = t)
          : i === "class" && e.classList.toggle(s, !!t);
  }
}
export const localStore = {
  get(r, t = null) {
    try {
      const e = window.localStorage.getItem(r);
      return e === null ? t : JSON.parse(e);
    } catch {
      return t;
    }
  },
  set(r, t) {
    try {
      window.localStorage.setItem(r, JSON.stringify(t));
    } catch {}
  },
};
export function bindPointerDrag(
  r,
  { onDown: t, onDrag: e, onUp: i, slop: s = 4, immediate: n = !1 } = {},
) {
  let o = null,
    a = 0,
    l = 0,
    c = !1,
    h = null;
  (r.addEventListener("pointerdown", (u) => {
    if (
      o === null &&
      !(u.pointerType === "mouse" && u.button !== 0) &&
      ((h = r.getBoundingClientRect()), !(t && t(u, h) === !1))
    ) {
      ((o = u.pointerId), (a = u.clientX), (l = u.clientY), (c = !1));
      try {
        r.setPointerCapture(o);
      } catch {}
      (u.preventDefault(), n && ((c = !0), e?.(u, h, !0)));
    }
  }),
    r.addEventListener("pointermove", (u) => {
      if (u.pointerId !== o) return;
      let d = !1;
      (!c &&
        Math.hypot(u.clientX - a, u.clientY - l) > s &&
        ((c = !0), (d = !0)),
        c && e?.(u, h, d));
    }));
  const f = (u, d) => {
    if (u.pointerId === o) {
      o = null;
      try {
        r.releasePointerCapture(u.pointerId);
      } catch {}
      (i?.(u, h, c, d), (c = !1));
    }
  };
  return (
    r.addEventListener("pointerup", (u) => f(u, !1)),
    r.addEventListener("pointercancel", (u) => f(u, !0)),
    r.addEventListener("lostpointercapture", (u) => {
      u.pointerId === o && f(u, !0);
    }),
    {
      get active() {
        return o !== null;
      },
    }
  );
}
export function hapticTap(r = 6) {
  try {
    navigator.vibrate?.(r);
  } catch {}
}
export function playUiSound(r, t, e) {
  try {
    r.audio?.play?.(t, e);
  } catch {}
}
export function linearColorToSrgbTriplet(r, t = 0) {
  const e = (i) => {
    i = Math.max(0, i);
    const s = i <= 0.0031308 ? i * 12.92 : 1.055 * Math.pow(i, 1 / 2.4) - 0.055;
    return Math.round(clamp2(s + t, 0, 1) * 255);
  };
  return `${e(r.r)} ${e(r.g)} ${e(r.b)}`;
}
