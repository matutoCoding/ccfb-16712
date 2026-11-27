import type { Project, Vec3 } from './types';

export interface ElevRect {
  id: string;
  /** 米制坐标：x 从立面左到右，y 从地面向上 */
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  floor: number;
}
export interface ElevLayout {
  key: string;
  label: string;
  /** 水平轴向 */
  horizontal: 'x' | 'z';
  widthM: number;
  heightM: number;
  minH: number;
  rects: ElevRect[];
}

function facadeOf(n: Vec3): { key: string; label: string; horizontal: 'x' | 'z' } {
  if (Math.abs(n.y) > 0.7) return { key: 'top', label: '屋面', horizontal: 'x' };
  if (Math.abs(n.z) >= Math.abs(n.x)) {
    return n.z >= 0
      ? { key: 'north', label: '北立面 (+Z)', horizontal: 'x' }
      : { key: 'south', label: '南立面 (-Z)', horizontal: 'x' };
  }
  return n.x >= 0
    ? { key: 'east', label: '东立面 (+X)', horizontal: 'z' }
    : { key: 'west', label: '西立面 (-X)', horizontal: 'z' };
}

/** 把玻璃四边形按朝向分组为正交立面，返回米制矩形布局。 */
export function buildElevations(project: Project): ElevLayout[] {
  const groups = new Map<string, ElevLayout>();

  for (const s of project.surfaces) {
    const f = facadeOf(s.normal);
    if (!groups.has(f.key)) {
      groups.set(f.key, { key: f.key, label: f.label, horizontal: f.horizontal, widthM: 0, heightM: 0, minH: Infinity, rects: [] });
    }
    const g = groups.get(f.key)!;
    const hc = f.horizontal;
    const hs = s.corners.map((c) => c[hc]);
    const ys = s.corners.map((c) => c.y);
    const h0 = Math.min(...hs);
    const h1 = Math.max(...hs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    g.rects.push({
      id: s.id,
      x: h0,
      y: y0,
      w: Math.max(0.2, h1 - h0),
      h: Math.max(0.2, y1 - y0),
      name: s.name,
      floor: s.floor,
    });
    g.minH = Math.min(g.minH, h0);
  }

  const out: ElevLayout[] = [];
  for (const g of groups.values()) {
    if (!g.rects.length) continue;
    let maxH = -Infinity;
    let maxY = -Infinity;
    let minY = Infinity;
    for (const r of g.rects) {
      r.x -= g.minH;
      maxH = Math.max(maxH, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
      minY = Math.min(minY, r.y);
    }
    g.widthM = maxH;
    g.heightM = maxY;
    // 把 y 平移到从 0 起
    if (minY > 0 && minY < 2) {
      for (const r of g.rects) r.y -= minY;
      g.heightM = maxY - minY;
    }
    out.push(g);
  }
  // 固定立面顺序
  const order = ['south', 'north', 'east', 'west', 'top'];
  out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return out;
}
