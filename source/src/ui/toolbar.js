/**
 * Tool definitions and the bottom toolbar with tooltips, active-tool puck and touch explanations.
 */
import { createEl, htmlToElement } from "./dom.js";
import { ICONS } from "./icons.js";
const TOOL_DEFS = [
  {
    id: "hand",
    label: "Hand",
    key: "1",
    desc: "Grab & fling clouds · hold still to squeeze rain · shake for lightning · drag the sun",
  },
  {
    id: "wind",
    label: "Wind",
    key: "2",
    desc: "Sweep across the land to blow",
  },
  {
    id: "cloud",
    label: "Cloud",
    key: "3",
    desc: "Press in the sky to condense a cloud",
  },
  {
    id: "fog",
    label: "Fog",
    key: "4",
    desc: "Brush mist into the valley",
  },
  {
    id: "wipe",
    label: "Wipe",
    key: "5",
    desc: "Wipe condensation off the glass",
  },
];
export class Toolbar {
  constructor(t, e, i) {
    ((this.ctx = t),
      (this.hud = e),
      (this.buttons = new Map()),
      (this.el = createEl("div", {
        class: "wg-panel wg-toolbar",
        role: "toolbar",
        "aria-label": "Tools",
      })),
      (this.puck = createEl("span", {
        class: "wg-puck",
        "aria-hidden": "true",
      })),
      this.el.append(this.puck));
    let s = "mouse";
    (this.el.addEventListener("pointerdown", (n) => {
      s = n.pointerType;
    }),
      TOOL_DEFS.forEach((n, o) => {
        const a = createEl(
            "span",
            {
              class: "wg-tip",
              role: "tooltip",
            },
            [
              createEl(
                "span",
                {
                  class: "wg-tip-head",
                },
                [
                  createEl("b", {
                    text: n.label,
                  }),
                  createEl("kbd", {
                    text: n.key,
                  }),
                ],
              ),
              createEl("span", {
                class: "wg-tip-body",
                text: n.desc,
              }),
            ],
          ),
          l = createEl(
            "button",
            {
              class: "wg-tool",
              type: "button",
              "data-tool": n.id,
              "aria-label": `${n.label} tool (${n.key}) — ${n.desc}`,
              "aria-pressed": "false",
            },
            [
              htmlToElement(ICONS[n.id]),
              createEl("span", {
                class: "wg-tool-label",
                text: n.label,
              }),
              a,
            ],
          );
        (l.style.setProperty("--n", o),
          l.addEventListener("click", () => {
            const c = this.ctx.input;
            if (c?.tool === n.id) {
              s !== "mouse" &&
                this.hud.toast(n.desc, 3200, {
                  icon: n.id,
                });
              return;
            }
            (c?.setTool?.(n.id),
              s !== "mouse" &&
                !this._explained?.has(n.id) &&
                ((this._explained ?? (this._explained = new Set())).add(n.id),
                this.hud.toast(n.desc, 3200, {
                  icon: n.id,
                })));
          }),
          this.buttons.set(n.id, l),
          this.el.append(l));
      }),
      i.append(this.el),
      (this.active = null),
      this.setActive(t.input?.tool || "hand"),
      t.events.on("tool", ({ tool: n } = {}) => this.setActive(n)));
  }
  setActive(t) {
    if (!this.buttons.has(t) || t === this.active) return;
    const e = this.buttons.get(this.active);
    e &&
      (e.classList.remove("is-active"),
      e.setAttribute("aria-pressed", "false"));
    const i = this.buttons.get(t);
    (i.classList.add("is-active"), i.setAttribute("aria-pressed", "true"));
    const s = TOOL_DEFS.findIndex((n) => n.id === t);
    (this.el.style.setProperty("--i", s),
      this.active !== null &&
        (i.classList.remove("is-popping"),
        this.puck.classList.remove("is-moving"),
        i.offsetWidth,
        i.classList.add("is-popping"),
        this.puck.classList.add("is-moving")),
      (this.active = t));
  }
  button(t) {
    return this.buttons.get(t);
  }
}
