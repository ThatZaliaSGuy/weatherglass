/**
 * Preset weather and season scenarios (calm, rain, storm, snow, fog, autumn, night, dusk) and their application.
 */
import { CLOUD_LAYER } from "./config.js";
function getCloudsModule(r) {
  return r.modules.clouds;
}
function spawnScenarioCloud(r, t) {
  try {
    return getCloudsModule(r)?.spawn?.(t) ?? null;
  } catch (e) {
    return (console.error("[scenario] spawn", e), null);
  }
}
export const SCENARIOS = {
  calm(r) {
    const { world: t } = r;
    ((t.season = 0.25),
      (t.timeOfDay = 0.635),
      (t.tempOffset = 0),
      getCloudsModule(r)?.clear?.(),
      spawnScenarioCloud(r, {
        x: -2.6,
        z: -0.6,
        size: 0.9,
        water: 0.3,
      }),
      spawnScenarioCloud(r, {
        x: 2.2,
        z: 0.4,
        y: 5.9,
        size: 1.1,
        water: 0.35,
      }),
      spawnScenarioCloud(r, {
        x: 0.2,
        z: 2.2,
        y: 5.2,
        size: 0.7,
        water: 0.25,
      }));
  },
  rain(r) {
    const { world: t, fields: e } = r;
    ((t.season = 0.9),
      (t.timeOfDay = 0.55),
      getCloudsModule(r)?.clear?.(),
      spawnScenarioCloud(r, {
        x: -1.2,
        z: 0.6,
        size: 1.35,
        water: 0.9,
        squeeze: 0.75,
      }),
      spawnScenarioCloud(r, {
        x: 2.6,
        z: 2.2,
        size: 1.2,
        water: 0.85,
        squeeze: 0.7,
      }),
      spawnScenarioCloud(r, {
        x: 3.4,
        z: -1.5,
        y: 6,
        size: 0.8,
        water: 0.4,
      }),
      e.addWet(-1.2, 0.6, 2.2, 0.8),
      (t.waterRise = 0.06));
  },
  storm(r) {
    const { world: t, fields: e, wind: i } = r;
    ((t.season = 1.3),
      (t.timeOfDay = 0.66),
      getCloudsModule(r)?.clear?.(),
      spawnScenarioCloud(r, {
        x: -0.6,
        z: -0.2,
        size: 2,
        water: 1.4,
        squeeze: 0.9,
        charge: 0.95,
        storm: 1,
      }),
      spawnScenarioCloud(r, {
        x: 3,
        z: 1.8,
        size: 1.5,
        water: 1.1,
        squeeze: 0.7,
        charge: 0.5,
        storm: 0.7,
      }),
      spawnScenarioCloud(r, {
        x: -3.8,
        z: 1.6,
        size: 1.2,
        water: 0.9,
        squeeze: 0.4,
      }),
      e.addWet(0, 0.5, 5, 1),
      (t.waterRise = 0.14),
      (i.ambientDir = 0.6),
      (t.storminess = 0.9));
  },
  snow(r) {
    const { world: t, fields: e } = r;
    ((t.season = 3),
      (t.timeOfDay = 0.45),
      (t.tempOffset = 0),
      getCloudsModule(r)?.clear?.(),
      spawnScenarioCloud(r, {
        x: -1.5,
        z: 0.2,
        size: 1.4,
        water: 1,
        squeeze: 0.6,
      }),
      spawnScenarioCloud(r, {
        x: 2.6,
        z: -0.8,
        y: 6,
        size: 1.1,
        water: 0.8,
        squeeze: 0.45,
      }),
      t.update(0),
      (e.lakeFrozen = 1),
      e.fillSnowByTemperature(0.9));
  },
  mountainsnow(r) {
    const { world: t, fields: e } = r;
    ((t.season = 2.2),
      (t.timeOfDay = 0.42),
      (t.tempOffset = -2),
      getCloudsModule(r)?.clear?.(),
      spawnScenarioCloud(r, {
        x: -2.8,
        z: -2.4,
        y: 5.9,
        size: 1.4,
        water: 1.1,
        squeeze: 0.8,
      }),
      spawnScenarioCloud(r, {
        x: 1.8,
        z: -2.6,
        y: 6.1,
        size: 1.2,
        water: 0.9,
        squeeze: 0.6,
      }),
      t.update(0),
      e.fillSnowByTemperature(0.8));
  },
  fog(r) {
    const { world: t } = r;
    ((t.season = 2),
      (t.timeOfDay = 0.29),
      (t.humidity = 0.9),
      getCloudsModule(r)?.clear?.(),
      spawnScenarioCloud(r, {
        x: 1.5,
        z: -1.8,
        y: 6.2,
        size: 0.8,
        water: 0.3,
      }));
    const e = r.modules.fog;
    try {
      (e?.addFog?.(0.5, 1.2, 3.5, 1),
        e?.addFog?.(-3, 0.5, 2.5, 0.8),
        e?.addFog?.(2.8, 2.6, 2.2, 0.9));
    } catch (i) {
      console.error(i);
    }
    try {
      r.modules.glass?.setCondensation?.(0.7);
    } catch (i) {
      console.error(i);
    }
  },
  autumn(r) {
    const { world: t, wind: e } = r;
    ((t.season = 2.05),
      (t.timeOfDay = 0.58),
      getCloudsModule(r)?.clear?.(),
      spawnScenarioCloud(r, {
        x: -2,
        z: 0.4,
        size: 1,
        water: 0.5,
      }),
      spawnScenarioCloud(r, {
        x: 2.5,
        z: -1,
        y: 6,
        size: 1.2,
        water: 0.6,
      }));
    for (let i = 0; i < 6; i++)
      e.addForce(-4 + i * 1.5, 0.5, 4.5, 0.8, 1.4, 0.8);
  },
  night(r) {
    const { world: t } = r;
    ((t.season = 1),
      (t.timeOfDay = 0.96),
      getCloudsModule(r)?.clear?.(),
      spawnScenarioCloud(r, {
        x: 3.2,
        z: -1.2,
        y: 6.1,
        size: 0.8,
        water: 0.3,
      }));
  },
  dusk(r) {
    const { world: t } = r;
    ((t.season = 1.1),
      (t.timeOfDay = 0.735),
      getCloudsModule(r)?.clear?.(),
      spawnScenarioCloud(r, {
        x: -2.4,
        z: -1,
        size: 1.1,
        water: 0.4,
      }),
      spawnScenarioCloud(r, {
        x: 1.8,
        z: 0.8,
        y: CLOUD_LAYER.maxY - 0.3,
        size: 0.9,
        water: 0.35,
      }));
  },
};
export function applyScenario(r, t) {
  const e = SCENARIOS[t];
  return e
    ? (e(r),
      (r.world.seasonTarget = null),
      r.world.update(0),
      r.events.emit("scenario", {
        name: t,
      }),
      !0)
    : (console.warn(`[scenario] unknown "${t}"`), !1);
}
