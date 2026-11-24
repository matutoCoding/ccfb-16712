import type { FacadeKind, GlassMeta, ID, SceneObject, Vec3 } from '../types';
import { cross, dot, normalize, uid } from './math';

export function createBoxObject(options: {
  name: string;
  width: number;
  height: number;
  depth: number;
  center?: Vec3;
  color?: string;
  id?: ID;
}): SceneObject {
  const { width: w, height: h, depth: d } = options;
  const c = options.center ?? [0, h / 2, 0];
  const x0 = c[0] - w / 2;
  const x1 = c[0] + w / 2;
  const y0 = c[1] - h / 2;
  const y1 = c[1] + h / 2;
  const z0 = c[2] - d / 2;
  const z1 = c[2] + d / 2;
  const color = options.color ?? '#d8dee7';

  const faces: Array<{ n: Vec3; v: Vec3[] }> = [
    { n: [0, 0, 1], v: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
    { n: [0, 0, -1], v: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] },
    { n: [1, 0, 0], v: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]] },
    { n: [-1, 0, 0], v: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] },
    { n: [0, 1, 0], v: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]] },
    { n: [0, -1, 0], v: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  faces.forEach((face) => {
    const base = positions.length / 3;
    face.v.forEach((p) => {
      positions.push(...p);
      normals.push(...face.n);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });

  return {
    id: options.id ?? uid('obj'),
    name: options.name,
    kind: 'mass',
    positions,
    normals,
    indices,
    color,
    visible: true,
    source: 'builtin',
  };
}

export function createQuadObject(options: {
  name: string;
  corners: [Vec3, Vec3, Vec3, Vec3];
  color?: string;
  glass?: GlassMeta;
  kind?: SceneObject['kind'];
  id?: ID;
}): SceneObject {
  const positions = options.corners.flat();
  const e1 = [options.corners[1][0] - options.corners[0][0], options.corners[1][1] - options.corners[0][1], options.corners[1][2] - options.corners[0][2]] as Vec3;
  const e2 = [options.corners[2][0] - options.corners[0][0], options.corners[2][1] - options.corners[0][1], options.corners[2][2] - options.corners[0][2]] as Vec3;
  const n = normalize(cross(e1, e2));
  const normals = Array.from({ length: 4 }, () => n).flat();
  return {
    id: options.id ?? uid('glass'),
    name: options.name,
    kind: options.kind ?? 'glass',
    positions,
    normals,
    indices: [0, 1, 2, 0, 2, 3],
    color: options.color ?? '#9fc7dc',
    visible: true,
    source: 'builtin',
    glass: options.glass,
  };
}

export function createPlaneObject(name: string, width: number, depth: number, center: Vec3, color: string): SceneObject {
  const [x, y, z] = center;
  return createQuadObject({
    name,
    color,
    kind: 'ground',
    corners: [
      [x - width / 2, y, z - depth / 2],
      [x + width / 2, y, z - depth / 2],
      [x + width / 2, y, z + depth / 2],
      [x - width / 2, y, z + depth / 2],
    ],
  });
}

export function createSphereObject(options: { name: string; radius: number; center: Vec3; color: string; segments?: number; rings?: number }): SceneObject {
  const seg = options.segments ?? 12;
  const rings = options.rings ?? 8;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const [cx, cy, cz] = options.center;

  for (let r = 0; r <= rings; r++) {
    const theta = (r / rings) * Math.PI;
    for (let s = 0; s <= seg; s++) {
      const phi = (s / seg) * Math.PI * 2;
      const nx = Math.sin(theta) * Math.cos(phi);
      const ny = Math.cos(theta);
      const nz = Math.sin(theta) * Math.sin(phi);
      normals.push(nx, ny, nz);
      positions.push(cx + nx * options.radius, cy + ny * options.radius, cz + nz * options.radius);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s;
      const b = a + seg + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { id: uid('crown'), name: options.name, kind: 'mass', positions, normals, indices, color: options.color, visible: true, source: 'builtin' };
}

export function createCylinderObject(options: { name: string; radiusTop: number; radiusBottom: number; height: number; center: Vec3; color: string; segments?: number }): SceneObject {
  const seg = options.segments ?? 8;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const [cx, cy, cz] = options.center;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const x = Math.cos(a);
    const z = Math.sin(a);
    positions.push(cx + x * options.radiusBottom, cy - options.height / 2, cz + z * options.radiusBottom);
    normals.push(x, 0.15, z);
    positions.push(cx + x * options.radiusTop, cy + options.height / 2, cz + z * options.radiusTop);
    normals.push(x, 0.15, z);
  }
  for (let i = 0; i < seg; i++) {
    const b = i * 2;
    indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  return { id: uid('trunk'), name: options.name, kind: 'mass', positions, normals, indices, color: options.color, visible: true, source: 'builtin' };
}

export interface FacadePanelSpec {
  buildingId: ID;
  facade: FacadeKind;
  axis: 'x' | 'z';
  fixed: number;
  sign: 1 | -1;
  length: number;
  bays: number;
  floors: number;
  floorHeight: number;
  baseY?: number;
  centerAlong?: number;
  materialId: ID;
  namePrefix: string;
  seeThroughFloors?: number[];
  corner?: boolean;
}

export function createFacadePanels(spec: FacadePanelSpec): SceneObject[] {
  const objects: SceneObject[] = [];
  const baseY = spec.baseY ?? 0;
  const centerAlong = spec.centerAlong ?? 0;
  const bay = spec.length / spec.bays;
  const panelW = Math.max(0.4, bay - 0.28);
  const panelH = Math.max(0.8, spec.floorHeight - 0.72);

  for (let floor = 0; floor < spec.floors; floor++) {
    for (let col = 0; col < spec.bays; col++) {
      const along = centerAlong - spec.length / 2 + bay * (col + 0.5);
      const y = baseY + floor * spec.floorHeight + spec.floorHeight / 2;
      let corners: [Vec3, Vec3, Vec3, Vec3];
      let center: Vec3;
      let normal: Vec3;
      if (spec.axis === 'x') {
        const x0 = along - panelW / 2;
        const x1 = along + panelW / 2;
        const z = spec.fixed + spec.sign * 0.08;
        corners = [[x0, y - panelH / 2, z], [x1, y - panelH / 2, z], [x1, y + panelH / 2, z], [x0, y + panelH / 2, z]];
        center = [along, y, z];
        normal = [0, 0, spec.sign];
      } else {
        const z0 = along - panelW / 2;
        const z1 = along + panelW / 2;
        const x = spec.fixed + spec.sign * 0.08;
        corners = [[x, y - panelH / 2, z0], [x, y - panelH / 2, z1], [x, y + panelH / 2, z1], [x, y + panelH / 2, z0]];
        center = [x, y, along];
        normal = [spec.sign, 0, 0];
      }
      const seeThrough = spec.seeThroughFloors?.includes(floor + 1) ?? false;
      const facade = spec.corner ? 'corner' : spec.facade;
      objects.push(createQuadObject({
        id: uid('panel'),
        name: `${spec.namePrefix}-${floor + 1}F-${col + 1}`,
        corners,
        color: '#8fb9cf',
        glass: {
          materialId: spec.materialId,
          buildingId: spec.buildingId,
          floor: floor + 1,
          facade,
          seeThrough,
          areaM2: panelW * panelH,
          center,
          normal,
          width: panelW,
          height: panelH,
          elevation: y - panelH / 2,
          row: floor,
          col,
        },
      }));
    }
  }
  return objects;
}

export function geometryCenterAndArea(obj: SceneObject): { center: Vec3; area: number; normal: Vec3; width: number; height: number } {
  let area = 0;
  const weightedNormal: Vec3 = [0, 0, 0];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const centerSum: Vec3 = [0, 0, 0];
  let triCount = 0;

  for (let i = 0; i < obj.indices.length; i += 3) {
    const ia = obj.indices[i] * 3;
    const ib = obj.indices[i + 1] * 3;
    const ic = obj.indices[i + 2] * 3;
    const a: Vec3 = [obj.positions[ia], obj.positions[ia + 1], obj.positions[ia + 2]];
    const b: Vec3 = [obj.positions[ib], obj.positions[ib + 1], obj.positions[ib + 2]];
    const c: Vec3 = [obj.positions[ic], obj.positions[ic + 1], obj.positions[ic + 2]];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as Vec3;
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as Vec3;
    const cr = cross(ab, ac);
    const triArea = Math.hypot(...cr) / 2;
    const n = normalize(cr);
    area += triArea;
    weightedNormal[0] += n[0] * triArea;
    weightedNormal[1] += n[1] * triArea;
    weightedNormal[2] += n[2] * triArea;
    for (const p of [a, b, c]) {
      centerSum[0] += p[0];
      centerSum[1] += p[1];
      centerSum[2] += p[2];
      triCount++;
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], p[k]);
        max[k] = Math.max(max[k], p[k]);
      }
    }
  }

  const center: Vec3 = triCount ? [centerSum[0] / triCount, centerSum[1] / triCount, centerSum[2] / triCount] : [0, 0, 0];
  const normal = normalize(weightedNormal);
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const width = Math.max(size[0], size[2]);
  const height = size[1];
  return { center, area, normal: dot(normal, normal) > 0 ? normal : [0, 0, 1], width, height };
}

export function deindexGeometry(obj: SceneObject) {
  const vertices: number[] = [];
  for (const index of obj.indices) {
    vertices.push(
      obj.positions[index * 3],
      obj.positions[index * 3 + 1],
      obj.positions[index * 3 + 2],
      obj.normals[index * 3] ?? 0,
      obj.normals[index * 3 + 1] ?? 1,
      obj.normals[index * 3 + 2] ?? 0,
    );
  }
  return new Float32Array(vertices);
}
