import type { GlassSurface, Vec3 } from './types';
import type { ParsedObjGroup } from './obj';
import { cross, uid } from './geom';

/**
 * 从一个 OBJ 分组的非索引三角形拟合代表性平面四边形，
 * 用于把 OBJ 子网格「标为玻璃」后参与采样与评估。
 */
export function groupToGlassSurface(
  group: ParsedObjGroup,
  transform: { scale: number; translation: Vec3 },
  glassTypeId: string,
  rangeIndex: number,
): GlassSurface {
  const pos = group.positions;
  const s = transform.scale;
  const t = transform.translation;
  const wp = (i: number): Vec3 => ({ x: pos[i] * s + t.x, y: pos[i + 1] * s + t.y, z: pos[i + 2] * s + t.z });

  // 面积加权平均法线与面积
  let nx = 0, ny = 0, nz = 0;
  let area = 0;
  const center: Vec3 = { x: 0, y: 0, z: 0 };
  let vertCount = 0;
  for (let tri = 0; tri < group.triangleCount; tri++) {
    const a = wp(tri * 9);
    const b = wp(tri * 9 + 3);
    const c = wp(tri * 9 + 6);
    const e1 = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const e2 = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const cr = cross(e1, e2);
    const a2 = Math.hypot(cr.x, cr.y, cr.z);
    area += a2 / 2;
    nx += cr.x; ny += cr.y; nz += cr.z;
    center.x += (a.x + b.x + c.x) / 3;
    center.y += (a.y + b.y + c.y) / 3;
    center.z += (a.z + b.z + c.z) / 3;
    vertCount++;
  }
  const nl = Math.hypot(nx, ny, nz) || 1;
  const normal: Vec3 = { x: nx / nl, y: ny / nl, z: nz / nl };
  center.x /= Math.max(1, vertCount);
  center.y /= Math.max(1, vertCount);
  center.z /= Math.max(1, vertCount);

  // 选一个与法线垂直的主轴做切向
  const ref = Math.abs(normal.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  let u = cross(ref, normal);
  const ul = Math.hypot(u.x, u.y, u.z) || 1;
  u = { x: u.x / ul, y: u.y / ul, z: u.z / ul };
  const v = cross(normal, u);

  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const p = wp(i);
    const d = { x: p.x - center.x, y: p.y - center.y, z: p.z - center.z };
    const uu = d.x * u.x + d.y * u.y + d.z * u.z;
    const vv = d.x * v.x + d.y * v.y + d.z * v.z;
    minU = Math.min(minU, uu); maxU = Math.max(maxU, uu);
    minV = Math.min(minV, vv); maxV = Math.max(maxV, vv);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minU)) { minU = -1; maxU = 1; minV = -1; maxV = 1; minY = 0; maxY = 2; }

  const corner = (uu: number, vv: number): Vec3 => ({
    x: center.x + u.x * uu + v.x * vv,
    y: center.y + u.y * uu + v.y * vv,
    z: center.z + u.z * uu + v.z * vv,
  });
  const corners: [Vec3, Vec3, Vec3, Vec3] = [
    corner(minU, minV),
    corner(maxU, minV),
    corner(maxU, maxV),
    corner(minU, maxV),
  ];

  return {
    id: uid('srf'),
    name: `${group.name}（OBJ 玻璃）`,
    glassTypeId,
    source: { type: 'obj-range', bodyId: '', rangeIndex },
    corners,
    normal,
    areaM2: Math.max(0.5, area),
    floor: 0,
    centerHeightM: (minY + maxY) / 2,
    isCorner: false,
    isSeeThrough: false,
    retrofitGlassTypeId: null,
  };
}
