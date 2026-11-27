import type { Vec3 } from './types';

export interface ParsedObjGroup {
  name: string;
  positions: number[]; // 非索引三角形顶点 xyz
  normals: number[];
  triangleCount: number;
}

export interface ParsedObj {
  groups: ParsedObjGroup[];
  vertexCount: number;
  triangleCount: number;
  /** 包围盒 */
  bounds: { min: Vec3; max: Vec3 };
}

/**
 * 极简 OBJ 解析器：支持 v / vn / f（v、v//vn、v/vt/vn、v/vt），
 * 按 o/g 分组，三角化扇形面。忽略材质与纹理坐标。
 */
export function parseObj(text: string): ParsedObj {
  const vertices: Vec3[] = [];
  const normals: Vec3[] = [];
  const groups = new Map<string, ParsedObjGroup>();
  let current = 'default';
  groups.set(current, { name: current, positions: [], normals: [], triangleCount: 0 });

  const ensure = (name: string) => {
    if (!groups.has(name)) {
      groups.set(name, { name, positions: [], normals: [], triangleCount: 0 });
    }
    current = name;
  };

  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const cmd = parts[0];
    if (cmd === 'v' && parts.length >= 4) {
      vertices.push({ x: +parts[1], y: +parts[2], z: +parts[3] });
    } else if (cmd === 'vn' && parts.length >= 4) {
      normals.push({ x: +parts[1], y: +parts[2], z: +parts[3] });
    } else if (cmd === 'o' || cmd === 'g') {
      ensure(parts[1] || current || 'default');
    } else if (cmd === 'f') {
      const g = groups.get(current)!;
      const cornerIdx: { vi: number; ni: number }[] = [];
      for (let i = 1; i < parts.length; i++) {
        const token = parts[i];
        const segs = token.split('/');
        const vi = parseInt(segs[0], 10) - 1;
        let ni = -1;
        if (segs.length === 3 && segs[2] !== '') ni = parseInt(segs[2], 10) - 1;
        else if (segs.length === 2 && segs[1] !== '') {
          // v/vt 无 vn
          ni = -1;
        }
        if (!Number.isFinite(vi) || vi < 0 || !vertices[vi]) continue;
        cornerIdx.push({ vi, ni });
      }
      // 扇形三角化
      for (let k = 1; k + 1 < cornerIdx.length; k++) {
        const tri = [cornerIdx[0], cornerIdx[k], cornerIdx[k + 1]];
        for (const c of tri) {
          const p = vertices[c.vi];
          g.positions.push(p.x, p.y, p.z);
          if (c.ni >= 0 && normals[c.ni]) {
            const n = normals[c.ni];
            g.normals.push(n.x, n.y, n.z);
          } else {
            g.normals.push(0, 1, 0);
          }
        }
        g.triangleCount++;
      }
    }
  }

  const outGroups = [...groups.values()].filter((g) => g.triangleCount > 0);
  const allPos = outGroups.flatMap((g) => g.positions);
  const min: Vec3 = { x: Infinity, y: Infinity, z: Infinity };
  const max: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (let i = 0; i < allPos.length; i += 3) {
    min.x = Math.min(min.x, allPos[i]);
    min.y = Math.min(min.y, allPos[i + 1]);
    min.z = Math.min(min.z, allPos[i + 2]);
    max.x = Math.max(max.x, allPos[i]);
    max.y = Math.max(max.y, allPos[i + 1]);
    max.z = Math.max(max.z, allPos[i + 2]);
  }
  if (!Number.isFinite(min.x)) {
    min.x = min.y = min.z = 0;
    max.x = max.y = max.z = 1;
  }
  return {
    groups: outGroups,
    vertexCount: vertices.length,
    triangleCount: outGroups.reduce((s, g) => s + g.triangleCount, 0),
    bounds: { min, max },
  };
}
