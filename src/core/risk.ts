import type {
  GlassSurface,
  GlassType,
  Project,
  RiskResult,
  RiskWeights,
  Settings,
  SurfaceReflectionStat,
  TreeItem,
} from './types';
import { dist2D } from './geom';

export const DEFAULT_WEIGHTS: RiskWeights = {
  reflection: 0.35,
  greenProximity: 0.2,
  floorHeight: 0.15,
  seeThrough: 0.2,
  corner: 0.1,
};

export const DEFAULT_SETTINGS: Settings = {
  id: 'app-settings',
  mediumThreshold: 35,
  highThreshold: 60,
  criticalThreshold: 80,
  fresnelTolerancePct: 1,
  autoSave: true,
  theme: 'light',
  organization: '城市生物多样性与鸟撞研究评估中心',
  evaluator: '',
};

/** 最近绿化（树冠）距离 m：玻璃中心到树干水平距离减去树冠半径。 */
export function nearestGreenDistance(surface: GlassSurface, trees: TreeItem[]): number {
  if (surface.greenDistanceOverrideM != null) return surface.greenDistanceOverrideM;
  const c = { x: (surface.corners[0].x + surface.corners[2].x) / 2, z: (surface.corners[0].z + surface.corners[2].z) / 2 };
  let best = Infinity;
  for (const t of trees) {
    const d = dist2D(c, t.position) - t.crownRadiusM;
    if (d < best) best = d;
  }
  if (!Number.isFinite(best)) return 30; // 无绿化时视为较远
  return Math.max(0.3, best);
}

export function greenProximityScore(distanceM: number): number {
  // 5m 内接近满分，30m 外趋近 0
  return Math.max(0, Math.min(100, 100 * Math.exp(-Math.max(distanceM - 2, 0) / 11)));
}

export function floorHeightScore(heightM: number): number {
  // 鸟撞集中在 0~25m 低中层，峰值约 12m
  return Math.max(0, Math.min(100, 100 * Math.exp(-((heightM - 12) ** 2) / (2 * 13 ** 2))));
}

/**
 * 防鸟图案威慑/削减比例。
 * 依据常见「2×2 / 2×4 规则」：图案中心间距越密、净开口越小，鸟类越能识别。
 * 返回 0..0.9。
 */
export function patternMitigation(glass: GlassType | undefined): number {
  if (!glass || glass.pattern.type === 'none') return 0;
  const p = glass.pattern;
  let pitch: number;
  if (p.type === 'dots') {
    pitch = Math.max(p.spacingXM, p.spacingYM);
  } else {
    pitch = p.spacingXM; // 条纹周期
  }
  if (pitch <= 0) return 0;
  // 50mm 间距 → 0.5，25mm → 0.75，100mm → 0.17，≥108mm → ~0
  const m = 0.9 * (1 - pitch / 0.12);
  return Math.max(0, Math.min(0.9, m));
}

export function levelForScore(score: number, s: Settings): RiskResult['level'] {
  if (score >= s.criticalThreshold) return 'critical';
  if (score >= s.highThreshold) return 'high';
  if (score >= s.mediumThreshold) return 'medium';
  return 'low';
}

export const LEVEL_LABEL: Record<RiskResult['level'], string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '极高',
};

export function scoreSurface(args: {
  surface: GlassSurface;
  stat: SurfaceReflectionStat;
  glass: GlassType | undefined;
  project: Project;
  settings: Settings;
  weights?: RiskWeights;
}): RiskResult {
  const { surface, stat, glass, project, settings } = args;
  const w = args.weights ?? project.weights ?? DEFAULT_WEIGHTS;
  const trees = project.environment.filter((e): e is TreeItem => e.kind === 'tree');
  const greenD = nearestGreenDistance(surface, trees);

  // 反射分量：GPU/CPU 统计出的菲涅尔加权栖息地反射强度
  const reflectionScore = Math.max(0, Math.min(100, stat.reflectionIntensity * 130));
  const greenScore = greenProximityScore(greenD);
  const floorScore = surface.floor <= 0 ? Math.max(55, floorHeightScore(surface.centerHeightM)) : floorHeightScore(surface.centerHeightM);

  // 看穿分量：统计看穿度 + 人工「可看穿」标记兜底
  const seeRaw = surface.isSeeThrough ? Math.max(stat.seeThrough, 0.85) : stat.seeThrough;
  const seeThroughScore = Math.max(0, Math.min(100, seeRaw * 100));

  // 转角分量
  const cornerScore = surface.isCorner ? 100 : 0;

  const wSum = w.reflection + w.greenProximity + w.floorHeight + w.seeThrough + w.corner || 1;
  let base =
    (reflectionScore * w.reflection +
      greenScore * w.greenProximity +
      floorScore * w.floorHeight +
      seeThroughScore * w.seeThrough +
      cornerScore * w.corner) /
    wSum;

  // 防鸟图案削减
  const mitigation = patternMitigation(glass);
  base *= 1 - mitigation;

  // 人工看穿标记的连廊额外加成（即便有图案，对穿通道仍危险）
  if (surface.isSeeThrough && !glass?.birdSafe) base = Math.max(base, 72);
  if (surface.isCorner && !glass?.birdSafe) base = Math.min(100, base + 6);

  const score = Math.round(Math.max(0, Math.min(100, base)) * 10) / 10;
  return {
    surfaceId: surface.id,
    score,
    level: levelForScore(score, settings),
    reflectionScore: Math.round(reflectionScore),
    greenScore: Math.round(greenScore),
    floorScore: Math.round(floorScore),
    seeThroughScore: Math.round(seeThroughScore),
    cornerScore: Math.round(cornerScore),
    nearestGreenDistanceM: Math.round(greenD * 10) / 10,
    mitigationPct: Math.round(mitigation * 100),
    glassReflectance: glass?.reflectance ?? 0.1,
  };
}
