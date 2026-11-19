/**
 * Dimensions of the glass case (rails, lid, corner posts, plinth, plaque, gauge) and the per-pane definitions.
 */
import { BOX } from "../core/config.js";
const GLASS_THICKNESS = BOX.glass;
export const GLASS_OUTER_HALF_W = BOX.halfW + GLASS_THICKNESS;
export const GLASS_OUTER_HALF_D = BOX.halfD + GLASS_THICKNESS;
const PANE_HALF_W = BOX.halfW + GLASS_THICKNESS * 0.5;
const PANE_HALF_D = BOX.halfD + GLASS_THICKNESS * 0.5;
export const BASE_RAIL = {
  y0: BOX.bottomY - 0.25,
  y1: BOX.bottomY + 0.2,
  t: 0.09,
};
const PANE_BOTTOM_Y = BASE_RAIL.y0 + 0.04;
export const TOP_RAIL = {
  y0: BOX.topY - 0.24,
  y1: BOX.topY,
  t: 0.055,
};
export const LID_SLAB = {
  y0: BOX.topY,
  y1: BOX.topY + 0.11,
  x: GLASS_OUTER_HALF_W + TOP_RAIL.t + 0.028,
  z: GLASS_OUTER_HALF_D + TOP_RAIL.t + 0.028,
  bevel: 0.026,
  cornerR: 0.07,
};
export const CORNER_POST = {
  x: GLASS_OUTER_HALF_W,
  z: GLASS_OUTER_HALF_D,
  r: 0.088,
  collar: 0.125,
  cap: 0.122,
};
export const PLINTH = {
  top: BASE_RAIL.y0,
  coreW: 6.36,
  coreD: 4.36,
  cornerR: 0.12,
  friezeOffset: 0.1,
  friezeTop: 0.28,
  friezeBottom: 0.86,
  height: 1.22,
  footOffset: 0.27,
};
PLINTH.bottom = PLINTH.top - PLINTH.height;
PLINTH.friezeZ = PLINTH.coreD + PLINTH.friezeOffset;
PLINTH.friezeY = PLINTH.top - (PLINTH.friezeTop + PLINTH.friezeBottom) * 0.5;
export const TABLE_Y = PLINTH.bottom;
export const PLAQUE = {
  x: 0,
  w: 2.3,
  h: 0.3,
  t: 0.014,
};
export const GAUGE = {
  x: 3.75,
  r: 0.24,
  bezel: 0.278,
};
export const GLASS_DRIP_LIMITS = {
  maxDrips: 6,
};
export function buildPaneDefinitions() {
  const r = PANE_BOTTOM_Y,
    t = BOX.topY,
    e = (r + t) * 0.5,
    i = (t - r) * 0.5,
    s = BASE_RAIL.y1 - e,
    n = TOP_RAIL.y0 - e,
    o = CORNER_POST.r - GLASS_THICKNESS * 0.5,
    a = (h, f, u, d, p, v) => ({
      name: h,
      n: f,
      t: u,
      b: [0, 1, 0],
      c: d,
      hu: p,
      hv: i,
      pitch: v,
      vis: [-p + o, p - o, s, n],
    }),
    l = LID_SLAB.x - LID_SLAB.bevel,
    c = LID_SLAB.z - LID_SLAB.bevel;
  return [
    a("front", [0, 0, 1], [1, 0, 0], [0, e, PANE_HALF_D], PANE_HALF_W, 1),
    a("back", [0, 0, -1], [-1, 0, 0], [0, e, -PANE_HALF_D], PANE_HALF_W, 0.93),
    a("right", [1, 0, 0], [0, 0, -1], [PANE_HALF_W, e, 0], PANE_HALF_D, 1.12),
    a("left", [-1, 0, 0], [0, 0, 1], [-PANE_HALF_W, e, 0], PANE_HALF_D, 1.07),
    {
      name: "lid",
      n: [0, 1, 0],
      t: [1, 0, 0],
      b: [0, 0, -1],
      c: [0, LID_SLAB.y1, 0],
      hu: l,
      hv: c,
      pitch: 0.8,
      lid: !0,
      vis: [-l, l, -c, c],
    },
  ];
}
