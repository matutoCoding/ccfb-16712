import type { Vec3 } from './types';

export const uid = (prefix = 'id'): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 方位角（度，0=北/+Z，顺时针）转水平方向向量。 */
export function headingToDir(headingDeg: number): Vec3 {
  const rad = (headingDeg * Math.PI) / 180;
  return { x: Math.sin(rad), y: 0, z: Math.cos(rad) };
}

/** 由四边形四角计算单位法线（假设逆时针，外侧）。 */
export function quadNormal(c: [Vec3, Vec3, Vec3, Vec3]): Vec3 {
  const e1 = sub(c[1], c[0]);
  const e2 = sub(c[3], c[0]);
  return norm(cross(e1, e2));
}

export function quadArea(c: [Vec3, Vec3, Vec3, Vec3]): number {
  // 两个三角形面积之和
  const tri = (a: Vec3, b: Vec3, d: Vec3) => len(cross(sub(b, a), sub(d, a))) * 0.5;
  return tri(c[0], c[1], c[2]) + tri(c[0], c[2], c[3]);
}

export function quadCenter(c: Vec3[]): Vec3 {
  return {
    x: (c[0].x + c[1].x + c[2].x + c[3].x) / 4,
    y: (c[0].y + c[1].y + c[2].y + c[3].y) / 4,
    z: (c[0].z + c[1].z + c[2].z + c[3].z) / 4,
  };
}

/** 双线性插值取四边形上的点，u,v ∈ [0,1]。 */
export function quadPoint(c: [Vec3, Vec3, Vec3, Vec3], u: number, v: number): Vec3 {
  const p01 = add(c[0], scale(sub(c[1], c[0]), u));
  const p32 = add(c[3], scale(sub(c[2], c[3]), u));
  return add(p01, scale(sub(p32, p01), v));
}

/** 四边形局部坐标轴（u: 0→1 边沿，v: 0→3 边沿），单位长度。 */
export function quadAxes(c: [Vec3, Vec3, Vec3, Vec3]): { ux: Vec3; vy: Vec3; width: number; height: number } {
  const eu = sub(c[1], c[0]);
  const ev = sub(c[3], c[0]);
  const width = len(eu);
  const height = len(ev);
  return { ux: scale(eu, 1 / (width || 1)), vy: scale(ev, 1 / (height || 1)), width, height };
}

/** 点到线段距离（2D 水平），用于绿化距离。 */
export function dist2D(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** 风险热力配色：蓝(低)→青→黄→橙→红(高)。t∈[0,1]，返回 sRGB 0..255。 */
export function heatColor(t: number): [number, number, number] {
  const x = clamp(t, 0, 1);
  const stops: [number, [number, number, number]][] = [
    [0.0, [37, 99, 235]],
    [0.25, [14, 165, 233]],
    [0.5, [250, 204, 21]],
    [0.75, [249, 115, 22]],
    [1.0, [220, 38, 38]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (x >= t0 && x <= t1) {
      const k = (x - t0) / (t1 - t0);
      return [
        Math.round(lerp(c0[0], c1[0], k)),
        Math.round(lerp(c0[1], c1[1], k)),
        Math.round(lerp(c0[2], c1[2], k)),
      ];
    }
  }
  return [220, 38, 38];
}

export function hexToRgb01(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function formatArea(m2: number): string {
  if (m2 >= 10000) return `${(m2 / 10000).toFixed(2)} 万㎡`;
  return `${m2.toFixed(1)} ㎡`;
}
