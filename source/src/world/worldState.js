/**
 * Season palettes and the world state simulation of time of day, seasons, temperature, sun/moon light and sky/haze colors.
 */
import * as THREE from "three";
import {
  SCENE_FRAME,
  TEMPERATURE_MODEL,
  WATER_LEVELS,
  rotateToSceneFrame,
} from "../core/config.js";
import { clamp, damp, lerp2, smoothstep2 } from "../util/math.js";
const SEASON_NAMES = ["Spring", "Summer", "Autumn", "Winter"];
const SEASON_PALETTE = {
  grass: [
    [0.33, 0.6, 0.2],
    [0.33, 0.5, 0.15],
    [0.6, 0.5, 0.2],
    [0.46, 0.42, 0.3],
  ],
  grassDry: [
    [0.52, 0.62, 0.25],
    [0.62, 0.58, 0.26],
    [0.7, 0.52, 0.24],
    [0.55, 0.5, 0.4],
  ],
  foliage: [
    [0.42, 0.68, 0.22],
    [0.2, 0.42, 0.12],
    [0.86, 0.36, 0.08],
    [0.55, 0.3, 0.12],
  ],
  foliage2: [
    [0.62, 0.8, 0.3],
    [0.3, 0.5, 0.16],
    [0.95, 0.68, 0.14],
    [0.5, 0.36, 0.16],
  ],
  pine: [
    [0.13, 0.3, 0.16],
    [0.11, 0.26, 0.13],
    [0.12, 0.25, 0.14],
    [0.13, 0.24, 0.2],
  ],
  leafAmount: [0.85, 1, 0.72, 0],
  flowers: [0.8, 1, 0.15, 0],
  activity: [1, 1, 0.6, 0.15],
  humidity: [0.55, 0.45, 0.6, 0.5],
  breeze: [0.35, 0.2, 0.55, 0.45],
  sunTilt: [0.55, 0.3, 0.62, 0.92],
};
function sampleSeasonal(r, t) {
  const e = Math.floor(t) & 3,
    i = (e + 1) & 3,
    s = t - Math.floor(t),
    n = s * s * (3 - 2 * s),
    o = r[e],
    a = r[i];
  return typeof o == "number"
    ? lerp2(o, a, n)
    : [lerp2(o[0], a[0], n), lerp2(o[1], a[1], n), lerp2(o[2], a[2], n)];
}
const rgb = (r, t, e) => new THREE.Color(r, t, e);
const SUN_COLOR_NOON = rgb(1, 0.94, 0.86);
const SUN_COLOR_GOLDEN = rgb(1, 0.68, 0.38);
const SUN_COLOR_HORIZON = rgb(1, 0.43, 0.2);
const SUN_COLOR_OVERCAST = rgb(0.86, 0.9, 1);
const MOON_COLOR = rgb(0.42, 0.56, 1);
const SKY_COLOR_DAY = rgb(0.4, 0.58, 1);
const SKY_COLOR_GOLDEN = rgb(0.47, 0.5, 0.8);
const SKY_COLOR_TWILIGHT = rgb(0.2, 0.22, 0.46);
const SKY_COLOR_NIGHT = rgb(0.05, 0.075, 0.19);
const SKY_COLOR_STORM_DAY = rgb(0.34, 0.38, 0.44);
const SKY_COLOR_STORM_NIGHT = rgb(0.05, 0.055, 0.08);
const GROUND_BOUNCE_COLOR = rgb(0.3, 0.25, 0.17);
const HAZE_COLOR_DAY = rgb(0.7, 0.8, 0.95);
const HAZE_COLOR_GOLDEN = rgb(1, 0.62, 0.4);
const HAZE_COLOR_NIGHT = rgb(0.04, 0.06, 0.14);
const HAZE_COLOR_STORM = rgb(0.3, 0.33, 0.38);
const ROOM_COLOR = rgb(0.05, 0.045, 0.04);
const SKY_COLOR_FLASH = rgb(0.85, 0.88, 1);
const HAZE_COLOR_FLASH = rgb(0.8, 0.84, 1);
export class WorldState {
  constructor() {
    ((this.season = 0.25),
      (this.seasonTarget = null),
      (this.timeOfDay = 0.4),
      (this.dayCycle = !1),
      (this.daySpeed = 1 / 300),
      (this.tempOffset = 0),
      (this.humidity = 0.5),
      (this.storminess = 0),
      (this.cloudCover = 0),
      (this.rainfall = 0),
      (this.snowfall = 0),
      (this.flash = 0),
      (this.waterRise = 0),
      (this.fogAmount = 0),
      (this.groundWetness = 0),
      (this.snowCover = 0),
      (this.windEnergy = 0),
      (this.elapsed = 0),
      (this.sunDir = new THREE.Vector3(0, 1, 0)),
      (this.moonDir = new THREE.Vector3(0, -1, 0)),
      (this.lightDir = new THREE.Vector3(0, 1, 0)),
      (this.sunPosition = new THREE.Vector3()),
      (this.moonPosition = new THREE.Vector3()),
      (this.sunElevation = 0),
      (this.day = 1),
      (this.night = 0),
      (this.golden = 0),
      (this.lightColor = rgb(1, 1, 1)),
      (this.lightIntensity = 3),
      (this.skyColor = rgb(0.6, 0.75, 1)),
      (this.groundColor = rgb(0.35, 0.3, 0.2)),
      (this.ambientIntensity = 1),
      (this.hazeColor = rgb(0.75, 0.83, 0.95)),
      (this.roomColor = rgb(0.07, 0.065, 0.06)),
      (this.seasonal = {
        grass: rgb(0, 0, 0),
        grassDry: rgb(0, 0, 0),
        foliage: rgb(0, 0, 0),
        foliage2: rgb(0, 0, 0),
        pine: rgb(0, 0, 0),
        leafAmount: 1,
        blossom: 0,
        flowers: 1,
        fallingLeaves: 0,
        activity: 1,
        baseTemp: 15,
        breeze: 0.3,
        name: "Spring",
      }),
      this.update(0));
  }
  get seasonName() {
    return SEASON_NAMES[Math.round(this.season) & 3];
  }
  setSeasonTarget(t) {
    let i = (((t % 4) + 4) % 4) - this.season;
    (i > 2 && (i -= 4),
      i < -2 && (i += 4),
      (this.seasonTarget = this.season + i));
  }
  get seaLevelTemp() {
    return this._seaTemp;
  }
  temperatureAt(t) {
    return this._seaTemp - TEMPERATURE_MODEL.lapse * Math.max(0, t);
  }
  snowFractionAt(t) {
    return smoothstep2(1.2, -1.2, this.temperatureAt(t));
  }
  get freezingLevel() {
    return this._seaTemp / TEMPERATURE_MODEL.lapse;
  }
  get lakeLevel() {
    return WATER_LEVELS.lakeLevel + this.waterRise;
  }
  reportClouds({ cover: t = 0, storm: e = 0 } = {}) {
    ((this.cloudCover = t), (this.storminess = e));
  }
  triggerFlash(t = 1) {
    this.flash = Math.max(this.flash, t);
  }
  update(t) {
    if (((this.elapsed += t), this.seasonTarget !== null)) {
      const u = this.seasonTarget - this.season,
        d =
          Math.sign(u) * Math.min(Math.abs(u), t * (0.35 + Math.abs(u) * 0.9));
      ((this.season += d),
        Math.abs(this.seasonTarget - this.season) < 0.001 &&
          ((this.season = this.seasonTarget), (this.seasonTarget = null)));
    }
    if (this.season >= 4 || this.season < 0) {
      const u = ((this.season % 4) + 4) % 4;
      (this.seasonTarget !== null && (this.seasonTarget += u - this.season),
        (this.season = u));
    }
    this.dayCycle &&
      (this.timeOfDay = (this.timeOfDay + t * this.daySpeed) % 1);
    const e = this.season,
      i = this.seasonal;
    (i.grass.setRGB(...sampleSeasonal(SEASON_PALETTE.grass, e)),
      i.grassDry.setRGB(...sampleSeasonal(SEASON_PALETTE.grassDry, e)),
      i.foliage.setRGB(...sampleSeasonal(SEASON_PALETTE.foliage, e)),
      i.foliage2.setRGB(...sampleSeasonal(SEASON_PALETTE.foliage2, e)),
      i.pine.setRGB(...sampleSeasonal(SEASON_PALETTE.pine, e)),
      (i.leafAmount = sampleSeasonal(SEASON_PALETTE.leafAmount, e)),
      (i.flowers = sampleSeasonal(SEASON_PALETTE.flowers, e)),
      (i.activity = sampleSeasonal(SEASON_PALETTE.activity, e)),
      (i.breeze = sampleSeasonal(SEASON_PALETTE.breeze, e)));
    const s = Math.min(Math.abs(e - 0.1), Math.abs(e - 4.1));
    ((i.blossom = smoothstep2(0.55, 0.05, s)),
      (i.fallingLeaves = smoothstep2(1.55, 2.1, e) * smoothstep2(3, 2.45, e)),
      (i.baseTemp = sampleSeasonal(TEMPERATURE_MODEL.seasonBase, e)),
      (i.name = this.seasonName));
    const n = sampleSeasonal(SEASON_PALETTE.sunTilt, e),
      o = (this.timeOfDay - 0.25) * Math.PI * 2;
    (this.sunDir
      .set(
        Math.cos(o) * 0.96,
        Math.sin(o) * Math.cos(n),
        Math.sin(o) * Math.sin(n) + 0.18,
      )
      .normalize(),
      this.moonDir
        .set(-this.sunDir.x * 0.9, -this.sunDir.y, -this.sunDir.z * 0.4 + 0.35)
        .normalize(),
      rotateToSceneFrame(this.sunDir),
      rotateToSceneFrame(this.moonDir));
    const a = SCENE_FRAME.center;
    (this.sunPosition
      .set(a[0], a[1], a[2])
      .addScaledVector(this.sunDir, SCENE_FRAME.radius),
      this.moonPosition
        .set(a[0], a[1], a[2])
        .addScaledVector(this.moonDir, SCENE_FRAME.radius));
    const l = this.sunDir.y;
    ((this.sunElevation = l),
      (this.day = smoothstep2(-0.12, 0.12, l)),
      (this.night = 1 - smoothstep2(-0.2, 0.02, l)),
      (this.golden =
        smoothstep2(-0.06, 0.06, l) * (1 - smoothstep2(0.12, 0.42, l))));
    const c = Math.sin((this.timeOfDay - 0.36) * Math.PI * 2),
      h = 1 - this.cloudCover * 0.5;
    this._seaTemp =
      i.baseTemp +
      TEMPERATURE_MODEL.dayNightSwing * c * h -
      this.storminess * 4 +
      this.tempOffset;
    const f = clamp(
      sampleSeasonal(SEASON_PALETTE.humidity, e) +
        this.groundWetness * 0.25 +
        this.fogAmount * 0.15 +
        this.storminess * 0.2,
      0,
      1,
    );
    ((this.humidity = damp(this.humidity, f, 0.08, t)),
      (this.waterRise = Math.max(
        0,
        this.waterRise - t * 0.0035 * (1 + Math.max(0, this._seaTemp) / 15),
      )),
      (this.waterRise = Math.min(this.waterRise, WATER_LEVELS.maxRise)),
      (this.flash = Math.max(0, this.flash - t * 3.2 * (0.6 + this.flash))),
      this._updateLight());
  }
  _updateLight() {
    const t = this.sunElevation,
      e = this.storminess,
      i = clamp(this.cloudCover * 0.55 + e * 0.75, 0, 1),
      s = i * i * (3 - 2 * i),
      n = t > -0.03;
    if (
      (this.lightDir.copy(n ? this.sunDir : this.moonDir),
      this.lightDir.y < 0.06 &&
        ((this.lightDir.y = 0.06), this.lightDir.normalize()),
      n)
    ) {
      const h = smoothstep2(0.42, 0, t),
        f = smoothstep2(0.1, -0.03, t);
      this.lightColor
        .copy(SUN_COLOR_NOON)
        .lerp(SUN_COLOR_GOLDEN, h)
        .lerp(SUN_COLOR_HORIZON, f)
        .lerp(SUN_COLOR_OVERCAST, s * 0.6);
      const u = smoothstep2(-0.035, 0.07, t),
        d = 0.68 + 0.32 * smoothstep2(0.1, 0.55, t);
      this.lightIntensity = 4.6 * u * d * lerp2(1, 0.13, s);
    } else
      (this.lightColor.copy(MOON_COLOR),
        (this.lightIntensity = 1 * this.night * lerp2(1, 0.12, s)));
    const o = smoothstep2(0.03, -0.08, t) * (1 - this.night);
    this.skyColor
      .copy(SKY_COLOR_DAY)
      .lerp(SKY_COLOR_GOLDEN, this.golden)
      .lerp(SKY_COLOR_TWILIGHT, o)
      .lerp(SKY_COLOR_NIGHT, this.night)
      .lerp(SKY_COLOR_STORM_DAY, s * this.day * 0.85)
      .lerp(SKY_COLOR_STORM_NIGHT, s * this.night * 0.5);
    const a = clamp(
      (this.lightIntensity * Math.max(this.lightDir.y, 0.1)) / 3.5,
      0,
      1,
    );
    this.groundColor
      .copy(GROUND_BOUNCE_COLOR)
      .multiplyScalar((0.35 + 0.65 * a) * lerp2(1, 0.3, this.night));
    const l = lerp2(1.15, 1.5, s),
      c = lerp2(0.85, 0.6, s);
    if (
      ((this.ambientIntensity =
        lerp2(l, c, this.night) * lerp2(1, 0.82, this.golden * (1 - s))),
      this.hazeColor
        .copy(HAZE_COLOR_DAY)
        .lerp(HAZE_COLOR_GOLDEN, this.golden * 0.85)
        .lerp(HAZE_COLOR_NIGHT, this.night)
        .lerp(HAZE_COLOR_STORM, s * (1 - this.night * 0.6)),
      this.roomColor
        .copy(ROOM_COLOR)
        .multiplyScalar(lerp2(1, 0.5, this.night) * (1 - s * 0.3)),
      this.flash > 0)
    ) {
      const h = this.flash * (1 - 0.65 * this.day);
      (this.skyColor.lerp(SKY_COLOR_FLASH, clamp(h, 0, 1) * 0.8),
        (this.ambientIntensity += h * 2.2),
        this.hazeColor.lerp(HAZE_COLOR_FLASH, clamp(h * 0.6, 0, 1)));
    }
  }
}
