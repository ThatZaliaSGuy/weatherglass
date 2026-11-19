/**
 * Terrain view assembling the surface mesh, soil skirt, rocks and detail masks into the scene.
 */
import * as THREE from "three";
import {
  buildTerrainGrid,
  createTerrainSkirtGeometry,
  createTerrainSurfaceGeometry,
} from "./terrainGeometry.js";
import {
  createTerrainSoilMaterial,
  createTerrainSurfaceMaterial,
} from "./terrainMaterials.js";
import { RIVER_CROSSING, TerrainDetailMasks } from "./terrainPaths.js";
import { createRockInstances } from "./rocks.js";
export class TerrainView {
  constructor(t) {
    this.ctx = t;
    const { quality: e, scene: i } = t,
      [s, n] = e.pick([160, 108], [288, 192], [384, 256]);
    this.grid = buildTerrainGrid(s, n);
    const { mesh: o, rocks: a } = createRockInstances(t);
    ((this.rockMesh = o),
      (this.rocks = a),
      (this.crossing = RIVER_CROSSING),
      (this.masks = new TerrainDetailMasks(t.terrain)),
      this.masks.stampRocks(a),
      (this.detailTexture = this.masks.texture),
      (this.uniforms = {
        uTDetail: {
          value: this.detailTexture,
        },
        uTIce: {
          value: 0,
        },
      }),
      (this.mesh = new THREE.Mesh(
        createTerrainSurfaceGeometry(this.grid),
        createTerrainSurfaceMaterial(t, this.uniforms),
      )),
      (this.mesh.name = "terrain-surface"),
      (this.mesh.castShadow = !0),
      (this.mesh.receiveShadow = !0),
      (this.skirt = new THREE.Mesh(
        createTerrainSkirtGeometry(this.grid),
        createTerrainSoilMaterial(t, this.uniforms),
      )),
      (this.skirt.name = "terrain-soil"),
      (this.skirt.castShadow = !0),
      (this.skirt.receiveShadow = !0),
      (this.mesh.geometry.boundingSphere.radius += 0.1),
      (this.skirt.geometry.boundingSphere.radius += 0.1),
      i.add(this.mesh, this.skirt, this.rockMesh),
      (this._treeCount = -1),
      (this._treeRef = null),
      (this._treePoll = 0));
  }
  bareAt(t, e) {
    return this.masks.bareAt(t, e);
  }
  rockAt(t, e) {
    for (const i of this.rocks)
      if ((i.x - t) ** 2 + (i.z - e) ** 2 < i.r * i.r) return i;
    return null;
  }
  update(t) {
    const { ctx: e } = this,
      i = e.modules.water,
      s = typeof i?.ice == "number" ? i.ice : e.fields.lakeFrozen || 0;
    if (
      ((this.uniforms.uTIce.value = s),
      (this._treePoll -= Math.max(t, 1 / 60)),
      this._treePoll <= 0)
    ) {
      this._treePoll = 0.5;
      const n = e.modules.vegetation?.trees;
      Array.isArray(n) &&
        (n !== this._treeRef || n.length !== this._treeCount) &&
        ((this._treeRef = n),
        (this._treeCount = n.length),
        this.masks.stampTrees(n));
    }
  }
}
