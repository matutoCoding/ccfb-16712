import type { PatternSpec, Vec3 } from '../types';
import { normalize } from './math';

export function glassBasis(normal: Vec3): { tangent: Vec3; bitangent: Vec3 } {
  const n = normalize(normal);
  const up: Vec3 = [0, 1, 0];
  let tangent = normalize([up[1] * n[2] - up[2] * n[1], up[2] * n[0] - up[0] * n[2], up[0] * n[1] - up[1] * n[0]]);
  if (Math.hypot(tangent[0], tangent[1], tangent[2]) < 0.01) tangent = [1, 0, 0];
  const bitangent = normalize([
    n[1] * tangent[2] - n[2] * tangent[1],
    n[2] * tangent[0] - n[0] * tangent[2],
    n[0] * tangent[1] - n[1] * tangent[0],
  ]);
  return { tangent, bitangent };
}

export function localGlassPoint(center: Vec3, normal: Vec3, point: Vec3): { x: number; y: number } {
  const { tangent } = glassBasis(normal);
  const delta: Vec3 = [point[0] - center[0], point[1] - center[1], point[2] - center[2]];
  return { x: delta[0] * tangent[0] + delta[1] * tangent[1] + delta[2] * tangent[2], y: delta[1] };
}

function nearestGridDelta(v: number, spacing: number): number {
  return v - Math.round(v / spacing) * spacing;
}

export function patternMaskAt(pattern: PatternSpec | undefined, localXM: number, localYM: number): boolean {
  if (!pattern || pattern.kind === 'none') return false;
  const sx = Math.max(0.005, pattern.spacingXMm / 1000);
  const sy = Math.max(0.005, pattern.spacingYMm / 1000);
  const dotR = Math.max(0.001, pattern.dotRadiusMm / 1000);
  const stripeHalf = Math.max(0.001, pattern.stripeWidthMm / 2000);
  const dx = nearestGridDelta(localXM, sx);
  const dy = nearestGridDelta(localYM, sy);

  if (pattern.kind === 'dots') return dx * dx + dy * dy <= dotR * dotR;
  if (pattern.kind === 'stripes') {
    return pattern.orientation === 'vertical' ? Math.abs(dx) <= stripeHalf : Math.abs(dy) <= stripeHalf;
  }
  if (pattern.kind === 'grid') return Math.abs(dx) <= stripeHalf || Math.abs(dy) <= stripeHalf;
  return false;
}

export function patternCode(kind: PatternSpec['kind']): number {
  return { none: 0, dots: 1, stripes: 2, grid: 3 }[kind];
}
