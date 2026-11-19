/**
 * Cabin dimensions, color palette and the CabinBuilder that generates the log cabin, roof, chimney, porch, yard (stump, barrel, fence, stones) and jetty geometry along with bird perches and anchor points.
 */
import * as THREE from "three";
import { mulberry32 } from "../util/noise.js";
import { smoothstep2 } from "../util/math.js";
import { CABIN2, LAKE2, terrainHeight2 } from "../world/terrainShape.js";
import { FOOTPATHS } from "../world/terrainPaths.js";
import {
  PROP_KIND,
  PropGeometryBuilder,
  childMatrix,
  hexColor,
} from "./propGeometryBuilder.js";
const CABIN_HALF_WIDTH = 0.35;
const CABIN_HALF_DEPTH = 0.25;
const LOG_RADIUS = 0.022;
const LOG_COURSE_HEIGHT = 0.05;
const LOG_BASE_Y = 0.055;
const LOG_OVERHANG = 0.045;
const ROOF_PITCH = (40 * Math.PI) / 180;
const ROOF_PITCH_TAN = Math.tan(ROOF_PITCH);
const EAVE_HEIGHT = 0.375;
const RIDGE_HEIGHT = EAVE_HEIGHT + CABIN_HALF_DEPTH * ROOF_PITCH_TAN;
const ROOF_DECK_THICKNESS = 0.016;
const ROOF_OVERHANG_FRONT = 0.1;
const ROOF_OVERHANG_BACK = 0.08;
const ROOF_EXTENT_LEFT = 0.405;
const ROOF_EXTENT_RIGHT = 0.45;
export const CABIN_PALETTE = {
  log: hexColor("#8a6440"),
  logB: hexColor("#9c7348"),
  logC: hexColor("#7a5636"),
  chink: hexColor("#d8d0bc"),
  plank: hexColor("#8f6b47"),
  plankL: hexColor("#9c7650"),
  grey: hexColor("#8a857a"),
  bark: hexColor("#4a3a2c"),
  barkL: hexColor("#5d4a36"),
  door: hexColor("#7a2c22"),
  trim: hexColor("#e4dcc6"),
  shutter: hexColor("#3c5e48"),
  iron: hexColor("#2a2826"),
  stone: hexColor("#7e776b"),
  stoneW: hexColor("#8c806c"),
  stoneD: hexColor("#5f5a53"),
  mortar: hexColor("#77726a"),
  shingle: hexColor("#76604c"),
  glass: hexColor("#101418"),
  hull: hexColor("#3d6b5e"),
  hullBottom: hexColor("#7a3426"),
  boatIn: hexColor("#a07a4e"),
  rope: hexColor("#b59a6a"),
  soot: hexColor("#151210"),
  box: hexColor("#5f7f52"),
};
const propSeedRandom = mulberry32(9091);
const surfaceSpec = (r, t, e = {}) => ({
  col: r,
  kind: t,
  seed: e.seed ?? propSeedRandom() * 10,
  expo: e.expo ?? 1,
  param: e.param ?? 0,
  ...e,
});
function distanceToTrail(r, t) {
  let e = 1 / 0;
  for (const i of FOOTPATHS)
    for (const s of i.pts)
      e = Math.min(e, Math.hypot(s.x - r, s.z - t) - i.width * 0.5);
  return e;
}
export class CabinBuilder {
  constructor(t, e, i) {
    ((this.ctx = t), (this.rand = mulberry32(5150)));
    const s = (o, a) => o + (a - o) * this.rand();
    ((this.R = s),
      (this.cabinFrame = new THREE.Matrix4()
        .makeRotationY(CABIN2.rot)
        .setPosition(CABIN2.x, CABIN2.y, CABIN2.z)),
      (this.cabinRot = new THREE.Matrix3().setFromMatrix4(this.cabinFrame)));
    const n = new PropGeometryBuilder();
    ((this.perches = []),
      this._buildCabin(n),
      this._buildYard(n),
      this._buildJetty(n),
      (this.geometry = n.toGeometry()),
      (this.lu = i));
  }
  cabinPoint(t, e, i, s = new THREE.Vector3()) {
    return s.set(t, e, i).applyMatrix4(this.cabinFrame);
  }
  _buildCabin(t) {
    const e = this.cabinFrame,
      i = this.R,
      s = [
        {
          name: "front",
          m: childMatrix(e, 0, 0, CABIN_HALF_DEPTH, 0),
          half: CABIN_HALF_WIDTH,
          open: [
            {
              x0: 0.06,
              x1: 0.2,
              y0: LOG_BASE_Y,
              y1: 0.285,
              door: !0,
            },
            {
              x0: -0.24,
              x1: -0.1,
              y0: 0.135,
              y1: 0.255,
              win: 0,
              shutters: !0,
              box: !0,
            },
          ],
          off: 0,
        },
        {
          name: "back",
          m: childMatrix(e, 0, 0, -CABIN_HALF_DEPTH, Math.PI),
          half: CABIN_HALF_WIDTH,
          open: [
            {
              x0: -0.09,
              x1: 0.05,
              y0: 0.135,
              y1: 0.255,
              win: 1,
            },
          ],
          off: 0,
        },
        {
          name: "left",
          m: childMatrix(e, -CABIN_HALF_WIDTH, 0, 0, -Math.PI / 2),
          half: CABIN_HALF_DEPTH,
          open: [
            {
              x0: -0.215,
              x1: -0.125,
              y0: 0.15,
              y1: 0.25,
              win: 2,
            },
          ],
          off: 0.5,
        },
        {
          name: "right",
          m: childMatrix(e, CABIN_HALF_WIDTH, 0, 0, Math.PI / 2),
          half: CABIN_HALF_DEPTH,
          open: [
            {
              x0: -0.06,
              x1: 0.06,
              y0: 0.135,
              y1: 0.255,
              win: 3,
              shutters: !0,
            },
          ],
          off: 0.5,
        },
      ];
    this.walls = s;
    for (const n of s) {
      for (let l = 0; l < 6; l++) {
        const c = LOG_BASE_Y + LOG_RADIUS + (l + n.off) * LOG_COURSE_HEIGHT;
        let h = [
          [
            -n.half - LOG_OVERHANG - i(0, 0.012),
            n.half + LOG_OVERHANG + i(0, 0.012),
          ],
        ];
        for (const u of n.open)
          if (c + LOG_RADIUS * 0.6 > u.y0 && c - LOG_RADIUS * 0.6 < u.y1) {
            const d = [];
            for (const [p, v] of h) {
              if (u.x1 <= p || u.x0 >= v) {
                d.push([p, v]);
                continue;
              }
              (u.x0 - p > 0.02 && d.push([p, u.x0]),
                v - u.x1 > 0.02 && d.push([u.x1, v]));
            }
            h = d;
          }
        const f = [CABIN_PALETTE.log, CABIN_PALETTE.logB, CABIN_PALETTE.logC][
          Math.floor(i(0, 3))
        ]
          .clone()
          .multiplyScalar(i(0.88, 1.1));
        for (const [u, d] of h) {
          const p = LOG_RADIUS * i(0.94, 1.06),
            v = 0.35 + 0.25 * (1 - l / 6);
          t.cylinder(
            n.m,
            u,
            c,
            0,
            d,
            c + i(-0.002, 0.002),
            0,
            p,
            10,
            surfaceSpec(f, PROP_KIND.log, {
              expo: v,
              param: p,
              pith: [i(-0.003, 0.003), i(-0.003, 0.003)],
            }),
          );
        }
      }
      const o = LOG_BASE_Y + 6 * LOG_COURSE_HEIGHT + n.off * LOG_COURSE_HEIGHT,
        a = childMatrix(n.m, 0, (LOG_BASE_Y + o) / 2, -0.001);
      t.box(
        a,
        n.half * 2 + 0.01,
        o - LOG_BASE_Y,
        0.012,
        surfaceSpec(CABIN_PALETTE.chink, PROP_KIND.mortar, {
          expo: 0.2,
          skip: "nz",
        }),
      );
      for (const l of n.open) this._opening(t, n, l);
    }
    for (const n of [CABIN_HALF_DEPTH, -CABIN_HALF_DEPTH]) {
      const o = childMatrix(e, 0, 0.358, n + Math.sign(n) * 0.004);
      t.box(
        o,
        CABIN_HALF_WIDTH * 2 + 0.08,
        0.034,
        0.03,
        surfaceSpec(CABIN_PALETTE.plank, PROP_KIND.plank, {
          expo: 0.15,
          grain: "x",
          pith: [0.03, 0.02],
        }),
      );
    }
    for (const n of [s[2], s[3]]) {
      const o = EAVE_HEIGHT - 0.02 * ROOF_PITCH_TAN - 0.012,
        a = CABIN_HALF_DEPTH + 0.02,
        l = RIDGE_HEIGHT - 0.005,
        c = surfaceSpec(CABIN_PALETTE.plank, PROP_KIND.plank, {
          expo: 0.3,
          param: 0.032,
        }),
        h = 0.004;
      t.tri(
        n.m,
        [
          [-a, o, h],
          [a, o, h],
          [0, l, h],
        ],
        [
          [o, -a, 0.04],
          [o, a, 0.04],
          [l, 0, 0.04],
        ],
        c,
      );
      for (let f = -a + 0.032; f < a - 0.01; f += 0.032) {
        const u = l - Math.abs(f) * ROOF_PITCH_TAN - 0.006;
        u - o < 0.02 ||
          t.box(
            childMatrix(n.m, f, (o + u) / 2, h + 0.004),
            0.007,
            u - o,
            0.006,
            surfaceSpec(CABIN_PALETTE.plankL, PROP_KIND.plank, {
              expo: 0.3,
              grain: "y",
              pith: [0.02, 0.03],
            }),
          );
      }
      n.name === "right" &&
        (t.box(
          childMatrix(n.m, 0, 0.47, h + 0.006),
          0.05,
          0.03,
          0.006,
          surfaceSpec(CABIN_PALETTE.trim, PROP_KIND.paint, {
            expo: 0.3,
            grain: "x",
          }),
        ),
        t.box(
          childMatrix(n.m, 0, 0.47, h + 0.008),
          0.04,
          0.02,
          0.004,
          surfaceSpec(CABIN_PALETTE.soot, PROP_KIND.soot, {
            expo: 0,
          }),
        ));
    }
    (this._buildRoof(t),
      this._buildChimney(t),
      this._buildFoundationAndPorch(t));
  }
  _opening(t, e, i) {
    const s = this.R,
      n = e.m,
      o = (i.x0 + i.x1) / 2,
      a = (i.y0 + i.y1) / 2,
      l = i.x1 - i.x0,
      c = i.y1 - i.y0,
      h = 0.012,
      f = surfaceSpec(
        i.door ? CABIN_PALETTE.plankL : CABIN_PALETTE.trim,
        i.door ? PROP_KIND.plank : PROP_KIND.paint,
        {
          expo: 0.3,
          grain: "y",
          pith: [0.02, 0.03],
        },
      );
    (t.box(childMatrix(n, i.x0 - h / 2, a, 0.001), h, c + h * 2, 0.048, f),
      t.box(childMatrix(n, i.x1 + h / 2, a, 0.001), h, c + h * 2, 0.048, f),
      t.box(childMatrix(n, o, i.y1 + h / 2, 0.001), l + h * 2, h, 0.048, {
        ...f,
        grain: "x",
      }),
      i.door ||
        t.box(childMatrix(n, o, i.y0 - h / 2, 0.001), l + h * 2, h, 0.048, {
          ...f,
          grain: "x",
        }));
    const u = LOG_RADIUS + 0.004,
      d = 0.006,
      p = 0.014;
    if (
      (t.box(
        childMatrix(n, i.x0 - h - p / 2 + 0.004, a + 0.002, u),
        p,
        c + h * 2 + p,
        d,
        f,
      ),
      t.box(
        childMatrix(n, i.x1 + h + p / 2 - 0.004, a + 0.002, u),
        p,
        c + h * 2 + p,
        d,
        f,
      ),
      t.box(
        childMatrix(n, o, i.y1 + h + p / 2 - 0.002, u),
        l + h * 2 + p * 2,
        p,
        d,
        {
          ...f,
          grain: "x",
        },
      ),
      t.box(
        childMatrix(n, o, i.y1 + h + p + 0.002, u + 0.004),
        l + h * 2 + p * 2 + 0.01,
        0.005,
        0.016,
        {
          ...f,
          grain: "x",
          expo: 0.8,
        },
      ),
      i.door)
    ) {
      const x = surfaceSpec(CABIN_PALETTE.door, PROP_KIND.paint, {
        expo: 0.25,
        param: 0.029,
        grain: "y",
        pith: [0, 0.03],
      });
      t.box(childMatrix(n, o, a, 0.008), l, c, 0.012, x);
      const m = surfaceSpec(
        CABIN_PALETTE.door.clone().multiplyScalar(0.85),
        PROP_KIND.paint,
        {
          expo: 0.25,
          grain: "x",
          pith: [0.02, 0.03],
        },
      );
      (t.box(childMatrix(n, o, i.y0 + 0.04, 0.016), l - 0.016, 0.018, 0.006, m),
        t.box(
          childMatrix(n, o, i.y1 - 0.04, 0.016),
          l - 0.016,
          0.018,
          0.006,
          m,
        ));
      const w = Math.atan2(c - 0.08, l - 0.03);
      t.box(
        childMatrix(n, o, a, 0.016, 0, 0, w),
        Math.hypot(c - 0.08, l - 0.03) - 0.01,
        0.016,
        0.006,
        m,
      );
      const y = surfaceSpec(CABIN_PALETTE.iron, PROP_KIND.metal, {
        expo: 0.3,
      });
      (t.box(
        childMatrix(n, i.x0 + 0.03, i.y0 + 0.04, 0.021),
        0.05,
        0.007,
        0.003,
        y,
      ),
        t.box(
          childMatrix(n, i.x0 + 0.03, i.y1 - 0.04, 0.021),
          0.05,
          0.007,
          0.003,
          y,
        ),
        t.cylinder(
          n,
          i.x1 - 0.022,
          a - 0.01,
          0.02,
          i.x1 - 0.022,
          a + 0.012,
          0.02,
          0.0028,
          6,
          y,
        ),
        t.box(
          childMatrix(n, i.x1 - 0.022, a + 0.016, 0.017),
          0.012,
          0.004,
          0.006,
          y,
        ),
        t.box(
          childMatrix(n, o, 0.03, 0.17, 0.04),
          l + 0.05,
          0.024,
          0.07,
          surfaceSpec(CABIN_PALETTE.stoneW, PROP_KIND.stone, {
            stone: !0,
            expo: 1,
          }),
        ));
      const _ = i.x1 + h + p + 0.03,
        M = 0.235;
      (t.box(
        childMatrix(n, _, M + 0.04, LOG_RADIUS + 0.004),
        0.012,
        0.03,
        0.004,
        y,
      ),
        t.box(
          childMatrix(n, _, M + 0.05, LOG_RADIUS + 0.02),
          0.004,
          0.004,
          0.034,
          y,
        ),
        t.box(
          childMatrix(n, _, M + 0.034, LOG_RADIUS + 0.036),
          0.002,
          0.02,
          0.002,
          y,
        ),
        t.box(
          childMatrix(n, _, M - 0, LOG_RADIUS + 0.036),
          0.026,
          0.005,
          0.026,
          y,
        ),
        t.box(
          childMatrix(n, _, M + 0.017, LOG_RADIUS + 0.036),
          0.019,
          0.028,
          0.019,
          surfaceSpec(CABIN_PALETTE.glass, PROP_KIND.lantern, {
            expo: 0,
            stone: !0,
          }),
        ));
      for (const [A, b] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ])
        t.box(
          childMatrix(
            n,
            _ + A * 0.0105,
            M + 0.017,
            LOG_RADIUS + 0.036 + b * 0.0105,
          ),
          0.003,
          0.03,
          0.003,
          y,
        );
      (t.box(
        childMatrix(n, _, M + 0.034, LOG_RADIUS + 0.036),
        0.024,
        0.004,
        0.024,
        y,
      ),
        t.box(
          childMatrix(n, _, M + 0.04, LOG_RADIUS + 0.036, Math.PI / 4),
          0.014,
          0.008,
          0.014,
          y,
        ),
        (this.lantern = new THREE.Vector3(
          _,
          M + 0.017,
          LOG_RADIUS + 0.036,
        ).applyMatrix4(n)));
      return;
    }
    const v = i.win;
    t.quad(
      n,
      [
        [i.x0, i.y0, 0.006],
        [i.x1, i.y0, 0.006],
        [i.x1, i.y1, 0.006],
        [i.x0, i.y1, 0.006],
      ],
      [
        [0, 0, v],
        [1, 0, v],
        [1, 1, v],
        [0, 1, v],
      ],
      surfaceSpec(CABIN_PALETTE.glass, PROP_KIND.window, {
        expo: 0,
      }),
    );
    const g = surfaceSpec(CABIN_PALETTE.trim, PROP_KIND.paint, {
      expo: 0.2,
      grain: "y",
      pith: [0.01, 0.01],
    });
    if (
      (t.box(childMatrix(n, o, a, 0.009), 0.006, c, 0.006, g),
      t.box(childMatrix(n, o, a, 0.009), l, 0.006, 0.006, {
        ...g,
        grain: "x",
      }),
      t.box(
        childMatrix(n, o, i.y0 - h - 0.002, u + 0.008),
        l + h * 2 + 0.03,
        0.007,
        0.03,
        {
          ...f,
          grain: "x",
          expo: 0.9,
        },
      ),
      i.shutters)
    ) {
      const x = surfaceSpec(CABIN_PALETTE.shutter, PROP_KIND.paint, {
          expo: 0.4,
          param: 0.022,
          grain: "y",
          pith: [0.01, 0.03],
        }),
        m = l / 2 + 0.008;
      for (const w of [-1, 1]) {
        const y =
          w < 0 ? i.x0 - h - p - m / 2 - 0.002 : i.x1 + h + p + m / 2 + 0.002;
        (t.box(
          childMatrix(n, y, a + 0.002, LOG_RADIUS + 0.006, w * 0.08),
          m,
          c + 0.02,
          0.006,
          x,
        ),
          t.box(
            childMatrix(
              n,
              y,
              a + 0.002 + c * 0.28,
              LOG_RADIUS + 0.011,
              w * 0.08,
            ),
            m - 0.006,
            0.01,
            0.004,
            {
              ...x,
              grain: "x",
              param: 0,
            },
          ),
          t.box(
            childMatrix(
              n,
              y,
              a + 0.002 - c * 0.28,
              LOG_RADIUS + 0.011,
              w * 0.08,
            ),
            m - 0.006,
            0.01,
            0.004,
            {
              ...x,
              grain: "x",
              param: 0,
            },
          ));
      }
    }
    if (i.box) {
      const x = i.y0 - h - 0.026;
      (t.box(
        childMatrix(n, o, x, u + 0.022),
        l + 0.03,
        0.03,
        0.032,
        surfaceSpec(CABIN_PALETTE.box, PROP_KIND.paint, {
          expo: 0.8,
          grain: "x",
          param: 0.015,
        }),
      ),
        t.box(
          childMatrix(n, o, x + 0.014, u + 0.022),
          l + 0.022,
          0.003,
          0.026,
          surfaceSpec(hexColor("#3b2a1c"), PROP_KIND.soot, {
            expo: 0.8,
          }),
        ));
      const m = [
        hexColor("#d7263d"),
        hexColor("#f25c78"),
        hexColor("#ffffff"),
        hexColor("#f4a259"),
        hexColor("#d7263d"),
      ];
      for (let w = 0; w < 9; w++) {
        const y =
          i.x0 - 0.008 + ((w + 0.5) * (l + 0.016)) / 9 + s(-0.004, 0.004);
        (t.blob(
          n,
          y,
          x + 0.02 + s(0, 0.004),
          u + 0.022 + s(-0.008, 0.008),
          0.009,
          surfaceSpec(hexColor("#2f5a24"), PROP_KIND.leaf, {
            expo: 0.8,
          }),
          0,
          0.8,
        ),
          (w % 2 === 0 || s(0, 1) > 0.5) &&
            t.blob(
              n,
              y + s(-0.003, 0.003),
              x + 0.03 + s(0, 0.005),
              u + 0.024 + s(-0.006, 0.006),
              0.0065,
              surfaceSpec(m[w % m.length], PROP_KIND.leaf, {
                expo: 0.8,
              }),
              0,
            ));
      }
      for (let w = 0; w < 4; w++)
        t.blob(
          n,
          i.x0 + s(0, l),
          x - 0.016 - s(0, 0.01),
          u + 0.04,
          0.006,
          surfaceSpec(hexColor("#355f2a"), PROP_KIND.leaf, {
            expo: 0.8,
          }),
          0,
          1.6,
        );
    }
  }
  _buildRoof(t) {
    const e = this.cabinFrame,
      i = this.R,
      s = 0.034,
      n = 0.0055,
      o = Math.sin(ROOF_PITCH),
      a = Math.cos(ROOF_PITCH),
      l = new THREE.Vector3();
    for (const c of [1, -1]) {
      const h = c > 0 ? ROOF_OVERHANG_FRONT : ROOF_OVERHANG_BACK,
        f = c * (CABIN_HALF_DEPTH + h),
        u = Math.abs(f) / a,
        d = RIDGE_HEIGHT + ROOF_DECK_THICKNESS / a,
        p = [0, a, c * o];
      l.set(p[0], p[1], p[2]).applyMatrix3(this.cabinRot).normalize();
      const v = (b, S, E) => [
          b + p[0] * E,
          d - S * o + p[1] * E,
          c * S * a + p[2] * E,
        ],
        g = Math.ceil(u / s),
        x = 14,
        m = surfaceSpec(CABIN_PALETTE.shingle, PROP_KIND.roof, {
          expo: 1,
          seed: c,
        });
      for (let b = 0; b < g; b++) {
        const S = u - b * s,
          E = Math.max(0, S - s),
          T = (n * (S - E)) / s;
        for (let R = 0; R < x; R++) {
          const z =
              -ROOF_EXTENT_LEFT +
              ((ROOF_EXTENT_LEFT + ROOF_EXTENT_RIGHT) * R) / x,
            L =
              -ROOF_EXTENT_LEFT +
              ((ROOF_EXTENT_LEFT + ROOF_EXTENT_RIGHT) * (R + 1)) / x,
            k =
              c > 0
                ? [v(z, S, T), v(L, S, T), v(L, E, 0), v(z, E, 0)]
                : [v(L, S, T), v(z, S, T), v(z, E, 0), v(L, E, 0)],
            U = c > 0 ? [z, L, L, z] : [L, z, z, L],
            F = [S, S, E, E],
            G = [T, T, 0, 0];
          t.quad(
            e,
            k,
            U.map((q, X) => [q, F[X], b]),
            m,
            G.map((q) => [l.x, l.y, l.z, q]),
          );
          const B =
            c > 0
              ? [v(z, S, 0), v(L, S, 0), v(L, S, T), v(z, S, T)]
              : [v(L, S, 0), v(z, S, 0), v(z, S, T), v(L, S, T)];
          t.quad(
            e,
            B,
            (c > 0 ? [z, L, L, z] : [L, z, z, L]).map((q, X) => [
              q,
              S + 0.001,
              b,
            ]),
            m,
            [0, 0, T, T].map((q) => [l.x, l.y, l.z, q]),
          );
        }
      }
      const w = u / 2,
        y = c * ROOF_PITCH,
        _ = childMatrix(
          e,
          (ROOF_EXTENT_RIGHT - ROOF_EXTENT_LEFT) / 2,
          RIDGE_HEIGHT + ROOF_DECK_THICKNESS / 2 / a - w * o,
          c * w * a,
          0,
          y,
        );
      t.box(
        _,
        ROOF_EXTENT_LEFT + ROOF_EXTENT_RIGHT,
        ROOF_DECK_THICKNESS,
        u + 0.004,
        surfaceSpec(CABIN_PALETTE.plank, PROP_KIND.plank, {
          expo: 0.1,
          grain: "z",
          param: 0.03,
          pith: [0.03, 0.02],
          skip: "py",
        }),
      );
      const M = RIDGE_HEIGHT - u * o,
        A = c * u * a;
      t.box(
        childMatrix(
          e,
          (ROOF_EXTENT_RIGHT - ROOF_EXTENT_LEFT) / 2,
          M + 0.009,
          A + c * 0.004,
        ),
        ROOF_EXTENT_LEFT + ROOF_EXTENT_RIGHT + 0.02,
        0.03,
        0.008,
        surfaceSpec(CABIN_PALETTE.plankL, PROP_KIND.plank, {
          expo: 0.7,
          grain: "x",
          pith: [0.02, 0.02],
        }),
      );
      for (const b of [-ROOF_EXTENT_LEFT - 0.005, ROOF_EXTENT_RIGHT + 0.005])
        t.box(
          childMatrix(e, b, RIDGE_HEIGHT + 0.004 - w * o, c * w * a, 0, y),
          0.01,
          0.036,
          u + 0.02,
          surfaceSpec(CABIN_PALETTE.plankL, PROP_KIND.plank, {
            expo: 0.7,
            grain: "z",
            pith: [0.02, 0.02],
          }),
        );
      t.box(
        childMatrix(
          e,
          (ROOF_EXTENT_RIGHT - ROOF_EXTENT_LEFT) / 2,
          d + 0.004 - 0.012 * o,
          c * 0.012 * a,
          0,
          y,
        ),
        ROOF_EXTENT_LEFT + ROOF_EXTENT_RIGHT + 0.016,
        0.006,
        0.03,
        surfaceSpec(CABIN_PALETTE.grey, PROP_KIND.grey, {
          expo: 1,
          grain: "x",
          pith: [0.02, 0.02],
        }),
      );
    }
    for (const c of [-0.25, 0.02, 0.28]) {
      const h = this.cabinPoint(
        c + i(-0.03, 0.03),
        RIDGE_HEIGHT + ROOF_DECK_THICKNESS / Math.cos(ROOF_PITCH) + 0.012,
        0,
      );
      this.perches.push({
        x: h.x,
        y: h.y,
        z: h.z,
        shelter: !1,
        roof: !0,
      });
    }
    this.ridgeY = CABIN2.y + RIDGE_HEIGHT;
  }
  _buildChimney(t) {
    const e = this.cabinFrame,
      i = this.R,
      s = childMatrix(e, -CABIN_HALF_WIDTH, 0, 0, -Math.PI / 2),
      n = [CABIN_PALETTE.stone, CABIN_PALETTE.stoneW, CABIN_PALETTE.stoneD],
      o = (f, u, d, p, v, g, x) => {
        const m = [
          {
            ax: "x",
            a: f,
            b: u,
            c: p,
            n: 1,
          },
          {
            ax: "x",
            a: f,
            b: u,
            c: d,
            n: -1,
          },
          {
            ax: "z",
            a: d,
            b: p,
            c: u,
            n: 1,
          },
          {
            ax: "z",
            a: d,
            b: p,
            c: f,
            n: -1,
          },
        ];
        for (const w of m) {
          let y = w.a - i(0, 0.02);
          for (; y < w.b - 0.01;) {
            const _ = Math.min(i(0.035, 0.07), w.b + 0.01 - y),
              M = y + _ / 2,
              A = i(0.026, 0.04),
              b = i(-0.0025, 0.003),
              S = g - i(0.003, 0.006),
              E = n[Math.floor(i(0, 3))].clone().multiplyScalar(i(0.82, 1.15)),
              T = surfaceSpec(E, PROP_KIND.stone, {
                stone: !0,
                expo: 0.9,
                param: x,
              });
            (w.ax === "x"
              ? t.box(
                  childMatrix(
                    s,
                    M,
                    v + g / 2 + i(-0.002, 0.002),
                    w.c - (w.n * A) / 2 + w.n * b,
                    i(-0.05, 0.05),
                    i(-0.04, 0.04),
                  ),
                  _ - 0.004,
                  S,
                  A,
                  T,
                )
              : t.box(
                  childMatrix(
                    s,
                    w.c - (w.n * A) / 2 + w.n * b,
                    v + g / 2 + i(-0.002, 0.002),
                    M,
                    i(-0.05, 0.05),
                    0,
                    i(-0.04, 0.04),
                  ),
                  A,
                  S,
                  _ - 0.004,
                  T,
                ),
              (y += _));
          }
        }
        t.box(
          childMatrix(s, (f + u) / 2, v + g / 2, (d + p) / 2),
          u - f - 0.012,
          g,
          p - d - 0.012,
          surfaceSpec(CABIN_PALETTE.mortar, PROP_KIND.mortar, {
            expo: 0.3,
          }),
        );
      };
    let a = -0.035;
    for (; a < 0.36;) {
      const f = i(0.026, 0.036);
      (o(-0.088, 0.088, 0.02, 0.185, a, f, 0), (a += f));
    }
    (t.box(
      childMatrix(s, 0, a + 0.007, 0.105),
      0.19,
      0.014,
      0.17,
      surfaceSpec(CABIN_PALETTE.stoneD, PROP_KIND.stone, {
        stone: !0,
        expo: 1,
      }),
    ),
      (a += 0.014),
      t.box(
        childMatrix(s, 0, a + 0.01, 0.118),
        0.15,
        0.02,
        0.125,
        surfaceSpec(CABIN_PALETTE.stone, PROP_KIND.stone, {
          stone: !0,
          expo: 1,
        }),
      ),
      (a += 0.02));
    const l = 0.79;
    for (; a < l - 0.03;) {
      const f = i(0.026, 0.034);
      (o(-0.055, 0.055, 0.07, 0.17, a, f, smoothstep2(0.55, 0.78, a)),
        (a += f));
    }
    const c = a + 0.008,
      h = (f, u, d, p) =>
        t.box(
          childMatrix(s, f, c, u, i(-0.04, 0.04)),
          d,
          0.016,
          p,
          surfaceSpec(CABIN_PALETTE.stoneD, PROP_KIND.stone, {
            stone: !0,
            expo: 1,
            param: 0.5,
          }),
        );
    (h(0, 0.07 + 0.012, 0.135, 0.032),
      h(0, 0.17 - 0.012, 0.135, 0.032),
      h(-0.052, 0.12, 0.032, 0.07),
      h(0.052, 0.12, 0.032, 0.07),
      t.box(
        childMatrix(s, 0, c - 0.004, 0.12),
        0.07,
        0.016,
        0.068,
        surfaceSpec(CABIN_PALETTE.soot, PROP_KIND.soot, {
          expo: 0,
        }),
      ),
      (this.chimneyTop = new THREE.Vector3(0, c + 0.01, 0.12).applyMatrix4(s)),
      this.perches.push({
        x: this.chimneyTop.x + 0.03,
        y: this.chimneyTop.y + 0.006,
        z: this.chimneyTop.z,
        shelter: !1,
      }));
  }
  _buildFoundationAndPorch(t) {
    const e = this.cabinFrame,
      i = this.R,
      s = [CABIN_PALETTE.stone, CABIN_PALETTE.stoneW, CABIN_PALETTE.stoneD],
      n = CABIN_HALF_WIDTH + 0.025,
      o = CABIN_HALF_DEPTH + 0.025;
    for (let u = 0; u < 2; u++) {
      const d = -0.03 + u * 0.042,
        p = 0.042,
        v = [
          [-n, n, o, "x", 1],
          [-n, n, -o, "x", -1],
          [-o, o, n, "z", 1],
          [-o, o, -n, "z", -1],
        ];
      for (const [g, x, m, w, y] of v) {
        let _ = g - i(0, 0.03);
        for (; _ < x;) {
          const M = Math.min(i(0.045, 0.085), x + 0.02 - _),
            A = _ + M / 2,
            b = s[Math.floor(i(0, 3))].clone().multiplyScalar(i(0.8, 1.12)),
            S = surfaceSpec(b, PROP_KIND.stone, {
              stone: !0,
              expo: 0.85,
            }),
            E = 0.045,
            T = i(-0.003, 0.003);
          (w === "x"
            ? t.box(
                childMatrix(
                  e,
                  A,
                  d + p / 2,
                  m - (y * E) / 2 + y * (0.01 + T),
                  i(-0.05, 0.05),
                  i(-0.03, 0.03),
                ),
                M - 0.005,
                p - i(0.004, 0.008),
                E,
                S,
              )
            : t.box(
                childMatrix(
                  e,
                  m - (y * E) / 2 + y * (0.01 + T),
                  d + p / 2,
                  A,
                  i(-0.05, 0.05),
                  0,
                  i(-0.03, 0.03),
                ),
                E,
                p - i(0.004, 0.008),
                M - 0.005,
                S,
              ),
            (_ += M));
        }
      }
    }
    t.box(
      childMatrix(e, 0, 0.012, 0),
      n * 2 - 0.03,
      0.08,
      o * 2 - 0.03,
      surfaceSpec(CABIN_PALETTE.mortar, PROP_KIND.mortar, {
        expo: 0.2,
      }),
    );
    const a = CABIN_HALF_DEPTH + 0.035,
      l = CABIN_HALF_DEPTH + ROOF_OVERHANG_FRONT - 0.004,
      c = 0.062,
      h = 4;
    for (let u = 0; u < h; u++) {
      const d = a + ((u + 0.5) * (l - a)) / h;
      t.box(
        childMatrix(
          e,
          i(-0.004, 0.004),
          c - 0.004 + i(-0.001, 0.001),
          d,
          i(-0.006, 0.006),
        ),
        CABIN_HALF_WIDTH * 2 + 0.05 + i(-0.01, 0.01),
        0.008,
        (l - a) / h - 0.003,
        surfaceSpec(
          CABIN_PALETTE.plankL.clone().multiplyScalar(i(0.85, 1.08)),
          PROP_KIND.plank,
          {
            expo: 0.15,
            grain: "x",
            pith: [i(0.02, 0.05), i(0.02, 0.04)],
          },
        ),
      );
    }
    t.box(
      childMatrix(e, 0, c - 0.03, l - 0.004),
      CABIN_HALF_WIDTH * 2 + 0.05,
      0.05,
      0.01,
      surfaceSpec(CABIN_PALETTE.plank, PROP_KIND.plank, {
        expo: 0.4,
        grain: "x",
        pith: [0.03, 0.02],
      }),
    );
    const f = EAVE_HEIGHT - ROOF_OVERHANG_FRONT * ROOF_PITCH_TAN;
    for (const u of [-CABIN_HALF_WIDTH + 0.01, CABIN_HALF_WIDTH - 0.01]) {
      const d = surfaceSpec(CABIN_PALETTE.plank, PROP_KIND.plank, {
        expo: 0.4,
        grain: "y",
        pith: [0.02, 0.025],
      });
      (t.box(childMatrix(e, u, (c + f) / 2, l - 0.012), 0.019, f - c, 0.019, d),
        t.box(
          childMatrix(
            e,
            u + (u < 0 ? 0.022 : -0.022),
            f - 0.024,
            l - 0.012,
            0,
            0,
            u < 0 ? -0.75 : 0.75,
          ),
          0.008,
          0.06,
          0.008,
          d,
        ),
        t.box(
          childMatrix(e, u, -0.004, l - 0.012),
          0.034,
          0.03,
          0.034,
          surfaceSpec(CABIN_PALETTE.stoneW, PROP_KIND.stone, {
            stone: !0,
            expo: 0.6,
          }),
        ));
    }
    t.box(
      childMatrix(e, 0, f - 0.006, l - 0.012),
      CABIN_HALF_WIDTH * 2 + 0.03,
      0.014,
      0.016,
      surfaceSpec(CABIN_PALETTE.plank, PROP_KIND.plank, {
        expo: 0.2,
        grain: "x",
        pith: [0.02, 0.02],
      }),
    );
    {
      let p = c;
      for (let v = 0; v < 7; v++) {
        const g = i(0.0105, 0.0125);
        p += g;
        let x = 0.262 + (v % 2) * 0.004;
        for (; x + g * 2 < 0.328 + 0.004;) {
          const m = g * i(0.86, 1.1),
            w = x + m,
            y = CABIN_PALETTE.plankL.clone().multiplyScalar(i(0.85, 1.12)),
            _ = surfaceSpec(
              CABIN_PALETTE.bark.clone().lerp(CABIN_PALETTE.barkL, i(0, 1)),
              PROP_KIND.bark,
              {
                expo: 0.15,
                param: m,
                twist: i(0, 6.3),
                capMat: surfaceSpec(y, PROP_KIND.bark, {
                  expo: 0.15,
                }),
              },
            );
          (t.cylinder(
            e,
            w,
            p + i(-0.0015, 0.0015),
            a + 0.002 + i(0, 0.004),
            w + i(-0.003, 0.003),
            p + i(-0.0015, 0.0015),
            l - 0.004 - i(0, 0.006),
            m,
            Math.floor(i(5, 8)),
            _,
          ),
            (x += m * 2 + 8e-4));
        }
        p += g * 0.82;
      }
      (this.perches.push({
        ...this._wp(e, 0.295, p + 0.006, (a + l) / 2),
        shelter: !0,
      }),
        this.perches.push({
          ...this._wp(e, -0.2, c + 0.004, l - 0.02),
          shelter: !0,
        }));
    }
  }
  _buildYard(t) {
    const e = this.cabinFrame,
      i = this.R,
      s = (n, o) => {
        const a = this.cabinPoint(n, 0, o);
        return terrainHeight2(a.x, a.z) - CABIN2.y;
      };
    {
      const a = s(-0.56, 0.5),
        l = childMatrix(e, -0.56, a, 0.5),
        c = 0.034;
      t.cylinder(
        l,
        0,
        -0.01,
        0,
        0,
        0.042,
        0,
        [c * 1.08, c],
        9,
        surfaceSpec(CABIN_PALETTE.bark, PROP_KIND.bark, {
          expo: 1,
          param: c,
          capMat: surfaceSpec(CABIN_PALETTE.plankL, PROP_KIND.bark, {
            expo: 1,
          }),
        }),
      );
      const h = childMatrix(l, 0.006, 0.05, 0.002, 0.6, 0, -0.55);
      (t.box(
        childMatrix(h, 0, 0.03, 0),
        0.006,
        0.07,
        0.006,
        surfaceSpec(hexColor("#a07a50"), PROP_KIND.plank, {
          expo: 1,
          grain: "y",
          pith: [0.01, 0.01],
        }),
      ),
        t.box(
          childMatrix(h, 0.007, 0, 0),
          0.02,
          0.014,
          0.004,
          surfaceSpec(CABIN_PALETTE.iron, PROP_KIND.metal, {
            expo: 1,
          }),
        ));
      for (let f = 0; f < 4; f++) {
        const u = i(0, Math.PI * 2),
          d = i(0.05, 0.1),
          p = Math.cos(u) * d,
          v = Math.sin(u) * d,
          g = i(0.008, 0.012),
          x = childMatrix(
            l,
            p,
            s(-0.56 + p, 0.5 + v) - a + g * 0.7,
            v,
            i(0, Math.PI),
          );
        t.cylinder(
          x,
          -0.03,
          0,
          0,
          0.03,
          0,
          0,
          g,
          5,
          surfaceSpec(CABIN_PALETTE.barkL, PROP_KIND.bark, {
            expo: 1,
            param: g,
            twist: i(0, 6),
            capMat: surfaceSpec(CABIN_PALETTE.plankL, PROP_KIND.bark, {
              expo: 1,
            }),
          }),
        );
      }
      for (let f = 0; f < 10; f++) {
        const u = i(0, Math.PI * 2),
          d = i(0.04, 0.12),
          p = Math.cos(u) * d,
          v = Math.sin(u) * d;
        t.box(
          childMatrix(l, p, s(-0.56 + p, 0.5 + v) - a + 0.002, v, i(0, 3)),
          i(0.006, 0.012),
          0.003,
          i(0.004, 0.008),
          surfaceSpec(CABIN_PALETTE.plankL, PROP_KIND.plank, {
            expo: 1,
          }),
        );
      }
      this.perches.push({
        ...this._wp(l, 0, 0.044, -0.012),
        shelter: !1,
      });
    }
    {
      const n = CABIN_HALF_WIDTH + 0.07,
        o = CABIN_HALF_DEPTH + 0.07,
        a = s(n, o),
        l = childMatrix(e, n, a, o),
        c = 0.036;
      (t.cylinder(
        l,
        0,
        0,
        0,
        0,
        0.092,
        0,
        [c * 0.9, c * 0.9],
        14,
        surfaceSpec(CABIN_PALETTE.plank, PROP_KIND.plank, {
          expo: 0.5,
          param: 0.012,
          grain: "x",
        }),
        !1,
      ),
        t.cylinder(
          l,
          0,
          0.03,
          0,
          0,
          0.062,
          0,
          [c * 0.93, c * 0.93],
          14,
          surfaceSpec(CABIN_PALETTE.plank, PROP_KIND.plank, {
            expo: 0.5,
            param: 0.012,
          }),
          !1,
        ));
      for (const h of [0.012, 0.046, 0.08])
        t.cylinder(
          l,
          0,
          h - 0.003,
          0,
          0,
          h + 0.003,
          0,
          c * 0.92 + 0.0015,
          14,
          surfaceSpec(CABIN_PALETTE.iron, PROP_KIND.metal, {
            expo: 0.6,
          }),
          !1,
        );
      (t.cylinder(
        l,
        0,
        0.082,
        0,
        0,
        0.083,
        0,
        c * 0.86,
        14,
        surfaceSpec(hexColor("#1d2a2e"), PROP_KIND.soot, {
          expo: 0,
        }),
      ),
        this.perches.push({
          ...this._wp(l, c * 0.85, 0.094, 0),
          shelter: !1,
        }));
    }
    {
      const n = [
          [-0.55, -0.42],
          [-0.78, -0.12],
          [-0.86, 0.24],
          [-0.84, 0.6],
          [-0.66, 0.92],
          [-0.42, 1.08],
        ],
        o = [];
      for (const [a, l] of n) {
        const c = this.cabinPoint(a, 0, l);
        if (distanceToTrail(c.x, c.z) < 0.08) continue;
        const h = s(a, l),
          f = i(0.1, 0.115),
          u = childMatrix(e, a, h, l, i(0, 3));
        (t.box(
          childMatrix(
            u,
            0,
            f / 2 - 0.012,
            0,
            0,
            i(-0.05, 0.05),
            i(-0.05, 0.05),
          ),
          0.016,
          f + 0.024,
          0.016,
          surfaceSpec(
            CABIN_PALETTE.grey.clone().multiplyScalar(i(0.75, 1)),
            PROP_KIND.grey,
            {
              expo: 1,
              grain: "y",
              pith: [0.01, 0.015],
            },
          ),
        ),
          o.push({
            lx: a,
            lz: l,
            gy: h,
            h: f,
          }),
          this.perches.push({
            ...this._wp(e, a, h + f + 0.004, l),
            shelter: !1,
          }));
      }
      for (let a = 0; a < o.length - 1; a++) {
        const l = o[a],
          c = o[a + 1];
        for (const h of [0.045, 0.085]) {
          const f = l.gy + h + i(-0.004, 0.004),
            u = c.gy + h + i(-0.004, 0.004);
          t.cylinder(
            e,
            l.lx,
            f,
            l.lz,
            c.lx,
            u,
            c.lz,
            i(0.0065, 0.008),
            5,
            surfaceSpec(
              CABIN_PALETTE.grey.clone().multiplyScalar(i(0.8, 1.05)),
              PROP_KIND.grey,
              {
                expo: 1,
                twist: i(0, 6),
              },
            ),
          );
        }
      }
    }
    {
      const n = [[0.235, 0.478]];
      for (const [o, a] of n) {
        const l = s(o, a);
        t.box(
          childMatrix(e, o, l + 0.004, a, i(0, 3)),
          i(0.05, 0.065),
          0.016,
          i(0.04, 0.05),
          surfaceSpec(
            CABIN_PALETTE.stoneW.clone().multiplyScalar(i(0.85, 1.05)),
            PROP_KIND.stone,
            {
              stone: !0,
              expo: 1,
            },
          ),
        );
      }
    }
  }
  _wp(t, e, i, s) {
    const n = new THREE.Vector3(e, i, s).applyMatrix4(t);
    return {
      x: n.x,
      y: n.y,
      z: n.z,
    };
  }
  _buildJetty(t) {
    const e = this.R,
      i = FOOTPATHS[0].pts,
      s = i[i.length - 1];
    let n = LAKE2.cx - s.x,
      o = LAKE2.cz - s.z;
    const a = Math.hypot(n, o);
    ((n /= a), (o /= a));
    const l = Math.atan2(-o, n),
      c = 0.262,
      h = new THREE.Matrix4().makeRotationY(l).setPosition(s.x, 0, s.z);
    ((this.jettyFrame = h),
      (this.jettyDir = {
        x: n,
        z: o,
        theta: l,
      }),
      (this.jettyDeckY = c));
    const f = -0.06,
      u = 0.8,
      d = 0.085,
      p = (m, w) => new THREE.Vector3(m, 0, w).applyMatrix4(h),
      v = (m, w) => {
        const y = p(m, w);
        return terrainHeight2(y.x, y.z);
      };
    let g = f;
    for (; g < u;) {
      const m = e(0.021, 0.026),
        w = d * 2 + e(-0.008, 0.012),
        y = CABIN_PALETTE.grey.clone().multiplyScalar(e(0.78, 1.12));
      (e(0, 1) < 0.15 && y.lerp(hexColor("#7d6a52"), 0.5),
        t.box(
          childMatrix(
            h,
            g + m / 2,
            c - 0.004 + e(-0.0012, 0.0012),
            e(-0.004, 0.004),
            e(-0.025, 0.025),
            0,
            e(-0.01, 0.01),
          ),
          m - 0.0035,
          0.008,
          w,
          surfaceSpec(y, PROP_KIND.grey, {
            expo: 1,
            grain: "z",
            pith: [e(0.02, 0.05), e(0.02, 0.05)],
          }),
        ),
        (g += m + e(0.003, 0.0055)));
    }
    for (const m of [-0.055, 0.055])
      t.box(
        childMatrix(h, (f + u) / 2, c - 0.018, m),
        u - f,
        0.02,
        0.014,
        surfaceSpec(
          CABIN_PALETTE.grey.clone().multiplyScalar(0.8),
          PROP_KIND.grey,
          {
            expo: 0.3,
            grain: "x",
            pith: [0.03, 0.03],
          },
        ),
      );
    const x = [0.1, 0.34, 0.57, 0.78];
    this.jettyPosts = [];
    for (const m of x) {
      const w = m === x[x.length - 1];
      for (const y of [-d + 0.006, d - 0.006]) {
        const _ = v(m, y),
          M = c + (w ? 0.06 : 0.004),
          A = e(0.0105, 0.0125);
        if (
          (t.cylinder(
            h,
            m,
            _ - 0.05,
            y,
            m + e(-0.003, 0.003),
            M,
            y + e(-0.003, 0.003),
            A,
            8,
            surfaceSpec(
              CABIN_PALETTE.grey.clone().multiplyScalar(e(0.7, 0.9)),
              PROP_KIND.grey,
              {
                expo: 1,
                param: A,
                capMat: surfaceSpec(CABIN_PALETTE.grey, PROP_KIND.grey, {
                  expo: 1,
                }),
              },
            ),
          ),
          w)
        ) {
          const b = p(m, y);
          (this.jettyPosts.push({
            x: b.x,
            y: M,
            z: b.z,
            l: y,
          }),
            this.perches.push({
              x: b.x,
              y: M + 0.004,
              z: b.z,
              shelter: !1,
            }));
        }
      }
      t.box(
        childMatrix(h, m, c - 0.034, 0),
        0.016,
        0.014,
        d * 2 + 0.01,
        surfaceSpec(
          CABIN_PALETTE.grey.clone().multiplyScalar(0.75),
          PROP_KIND.grey,
          {
            expo: 0.3,
            grain: "z",
            pith: [0.03, 0.02],
          },
        ),
      );
    }
    for (let m = 0; m < x.length - 1; m++)
      for (const w of [-d + 0.002, d - 0.002]) {
        const y = x[m],
          _ = x[m + 1],
          M = c - 0.03,
          A = Math.max(v(_, w), 0.02) + 0.03;
        t.cylinder(
          h,
          y,
          M,
          w,
          _,
          A,
          w,
          0.0055,
          5,
          surfaceSpec(
            CABIN_PALETTE.grey.clone().multiplyScalar(0.7),
            PROP_KIND.grey,
            {
              expo: 0.6,
            },
          ),
        );
      }
    for (let m = 0; m < 3; m++) {
      const w = f - 0.05 - m * 0.07,
        y = e(-0.03, 0.03),
        _ = v(w, y);
      t.box(
        childMatrix(h, w, _ + 0.004, y, e(0, 3)),
        e(0.05, 0.07),
        0.016,
        e(0.045, 0.06),
        surfaceSpec(
          CABIN_PALETTE.stoneW.clone().multiplyScalar(e(0.8, 1.05)),
          PROP_KIND.stone,
          {
            stone: !0,
            expo: 1,
          },
        ),
      );
    }
    {
      const w = d - 0.03;
      for (let y = 0; y < 3; y++) {
        const _ = 0.016 - y * 0.004,
          M = 10;
        for (let A = 0; A < M; A++) {
          const b = (A / M) * Math.PI * 2,
            S = ((A + 1) / M) * Math.PI * 2;
          t.cylinder(
            h,
            0.7 + Math.cos(b) * _,
            c + 0.003 + y * 0.003,
            w + Math.sin(b) * _,
            0.7 + Math.cos(S) * _,
            c + 0.003 + y * 0.003,
            w + Math.sin(S) * _,
            0.0028,
            4,
            surfaceSpec(CABIN_PALETTE.rope, PROP_KIND.rope, {
              expo: 0.8,
            }),
            !1,
          );
        }
      }
    }
    ((this.jettyEnd = p(u, 0)),
      (this.boatHome = p(0.53, d + 0.095)),
      (this.boatHome.y = 0),
      (this.boatYaw = l),
      (this.boatRopeAnchor = new THREE.Vector3(
        this.jettyPosts.find((m) => m.l > 0)?.x ?? this.jettyEnd.x,
        c + 0.045,
        this.jettyPosts.find((m) => m.l > 0)?.z ?? this.jettyEnd.z,
      )));
  }
}
