/**
 * Scene-wide constants: glass box dimensions, terrain bounds, cloud layer, water levels, scene frame, temperature model and tool names.
 */
export const BOX = {
  halfW: 6,
  halfD: 4,
  bottomY: -1.8,
  topY: 7.4,
  glass: 0.08,
};
export const TERRAIN_BOUNDS = {
  minX: -BOX.halfW,
  minZ: -BOX.halfD,
  sizeX: BOX.halfW * 2,
  sizeZ: BOX.halfD * 2,
};
export const CLOUD_LAYER = {
  minY: 4.5,
  maxY: 6.5,
  defaultY: 5.5,
};
export const WATER_LEVELS = {
  lakeLevel: 0.1,
  maxRise: 0.28,
};
export const SCENE_FRAME = {
  radius: 11.5,
  center: [0, 0.5, 0],
  yaw: -0.55,
};
export function rotateToSceneFrame(r) {
  const t = Math.cos(SCENE_FRAME.yaw),
    e = Math.sin(SCENE_FRAME.yaw),
    i = r.x * t + r.z * e;
  return ((r.z = -r.x * e + r.z * t), (r.x = i), r);
}
export const TEMPERATURE_MODEL = {
  lapse: 5,
  seasonBase: [12, 24, 10, -7],
  dayNightSwing: 4.5,
};
export const TOOL_NAMES = ["hand", "wind", "cloud", "fog", "wipe"];
