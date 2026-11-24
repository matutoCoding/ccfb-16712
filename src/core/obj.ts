import type { SceneObject } from '../types';
import { geometryCenterAndArea } from './geometry';
import { iorFromNormalReflectance } from './fresnel';
import { uid } from './math';

interface ObjVertex {
  x: number;
  y: number;
  z: number;
}

export interface ObjImportOptions {
  scale?: number;
  centerXZ?: boolean;
  groundToZero?: boolean;
  defaultGlass?: boolean;
}

function parseFaceIndex(token: string): number {
  const first = token.split('/')[0];
  const n = Number.parseInt(first, 10);
  if (Number.isNaN(n)) throw new Error(`无法解析 OBJ 面索引:${token}`);
  return n;
}

function normalizeIndex(n: number, count: number): number {
  return n < 0 ? count + n : n - 1;
}

export function parseObj(text: string, options: ObjImportOptions = {}): SceneObject[] {
  const scale = options.scale ?? 1;
  const vertices: ObjVertex[] = [];
  interface RawGroup {
    name: string;
    material: string;
    faces: number[][];
  }
  const groups: RawGroup[] = [];
  let current: RawGroup = { name: 'OBJ-01', material: '', faces: [] };
  groups.push(current);

  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const cmd = parts[0];
    if (cmd === 'v') {
      vertices.push({ x: Number(parts[1]) * scale, y: Number(parts[2]) * scale, z: Number(parts[3]) * scale });
    } else if (cmd === 'o' || cmd === 'g') {
      const name = parts.slice(1).join(' ') || `OBJ-${groups.length + 1}`;
      current = { name, material: current.material, faces: [] };
      groups.push(current);
    } else if (cmd === 'usemtl') {
      const material = parts[1] ?? '';
      if (current.faces.length === 0 && groups.length) {
        current.material = material;
        current.name = current.name === 'OBJ-01' && groups.length === 1 ? material || current.name : current.name;
      } else {
        current = { name: `${current.name}-${material}`, material, faces: [] };
        groups.push(current);
      }
    } else if (cmd === 'f') {
      const indices = parts.slice(1).map(parseFaceIndex).map((i) => normalizeIndex(i, vertices.length));
      for (let i = 1; i < indices.length - 1; i++) {
        current.faces.push([indices[0], indices[i], indices[i + 1]]);
      }
    }
  }

  const usedGroups = groups.filter((g) => g.faces.length > 0);
  if (!usedGroups.length) throw new Error('OBJ 中没有可导入的三角面或多边形面');

  let offsetX = 0;
  let offsetZ = 0;
  let minY = Infinity;
  if (options.centerXZ || options.groundToZero) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const v of vertices) {
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      minZ = Math.min(minZ, v.z);
      maxZ = Math.max(maxZ, v.z);
    }
    if (options.centerXZ) {
      offsetX = -(minX + maxX) / 2;
      offsetZ = -(minZ + maxZ) / 2;
    }
  }

  return usedGroups.map((group) => {
    const positions: number[] = [];
    for (const tri of group.faces) {
      for (const idx of tri) {
        const v = vertices[idx];
        if (!v) throw new Error('OBJ 面索引超出顶点范围');
        positions.push(v.x + offsetX, v.y - (options.groundToZero && Number.isFinite(minY) ? minY : 0), v.z + offsetZ);
      }
    }
    const normals = computeFlatNormals(positions);
    const indices = positions.length / 3 > 65535 ? Array.from({ length: positions.length / 3 }, (_, i) => i) : Array.from({ length: positions.length / 3 }, (_, i) => i);
    const isGlassName = /glass|glazing|window|curtain|玻璃|幕墙|窗/i.test(`${group.name} ${group.material}`);
    const kind = options.defaultGlass || isGlassName ? 'glass' : 'mass';
    const obj: SceneObject = {
      id: uid('obj'),
      name: group.name || group.material || '导入对象',
      kind,
      positions,
      normals,
      indices,
      color: kind === 'glass' ? '#8fb9cf' : '#c9d2dc',
      visible: true,
      source: 'obj',
    };
    if (kind === 'glass') attachGlassMeta(obj, 'mat-clear');
    return obj;
  });
}

export function computeFlatNormals(positions: number[]): number[] {
  const normals = new Array(positions.length).fill(0);
  for (let i = 0; i < positions.length; i += 9) {
    const a = [positions[i], positions[i + 1], positions[i + 2]];
    const b = [positions[i + 3], positions[i + 4], positions[i + 5]];
    const c = [positions[i + 6], positions[i + 7], positions[i + 8]];
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (let j = 0; j < 3; j++) {
      normals[i + j * 3] = nx;
      normals[i + j * 3 + 1] = ny;
      normals[i + j * 3 + 2] = nz;
    }
  }
  return normals;
}

export function attachGlassMeta(obj: SceneObject, materialId: string, floor = 1) {
  const info = geometryCenterAndArea(obj);
  obj.kind = 'glass';
  obj.glass = {
    materialId,
    buildingId: obj.glass?.buildingId ?? 'imported',
    floor,
    facade: obj.glass?.facade ?? 'other',
    seeThrough: obj.glass?.seeThrough ?? false,
    areaM2: Math.max(0.1, info.area),
    center: info.center,
    normal: info.normal,
    width: Math.max(0.5, info.width),
    height: Math.max(0.5, info.height),
    elevation: Math.max(0, info.center[1] - info.height / 2),
  };
}

export function materialIor(m: { reflectance: number; ior?: number }): number {
  return m.ior && m.ior > 1 ? m.ior : iorFromNormalReflectance(m.reflectance);
}
