import type { AppSettings, AssessmentSettings, GlassMaterial } from '../types';
import { iorFromNormalReflectance } from './fresnel';

export const DEFAULT_SETTINGS: AssessmentSettings = {
  birdHeight: 6,
  birdDirection: 0,
  bidirectional: true,
  viewDistance: 14,
  sampleCount: 128,
  greenRadiusM: 30,
  reflectionWeight: 40,
  greenWeight: 25,
  floorWeight: 15,
  seeThroughWeight: 20,
  highThreshold: 65,
  mediumThreshold: 38,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: 'app',
  defaultBirdHeight: 6,
  defaultBirdDirection: 0,
  defaultSampleCount: 128,
  reduceMotion: false,
};

const mat = (m: Omit<GlassMaterial, 'ior'> & { ior?: number }): GlassMaterial => ({
  ...m,
  ior: m.ior ?? iorFromNormalReflectance(m.reflectance),
});

export function createDefaultMaterials(): GlassMaterial[] {
  return [
    mat({
      id: 'mat-clear',
      name: '高透清玻 6+12A+6',
      manufacturer: '原片库',
      reflectance: 0.043,
      transmittance: 0.86,
      coatingColor: '#b9d9e8',
      pattern: { kind: 'none', spacingXMm: 100, spacingYMm: 100, dotRadiusMm: 6, stripeWidthMm: 12, orientation: 'horizontal', color: '#f7fafc' },
      birdSafe: false,
      costPerM2: 180,
      note: '普通透明玻璃,法向 Fresnel 反射率约 4.3%。',
      builtin: true,
    }),
    mat({
      id: 'mat-low-iron',
      name: '超白高透玻璃',
      manufacturer: '原片库',
      reflectance: 0.035,
      transmittance: 0.91,
      coatingColor: '#d8f1f4',
      pattern: { kind: 'none', spacingXMm: 100, spacingYMm: 100, dotRadiusMm: 6, stripeWidthMm: 12, orientation: 'horizontal', color: '#f7fafc' },
      birdSafe: false,
      costPerM2: 240,
      note: '低铁超白,透射更高,看穿型连廊需配合图案。',
      builtin: true,
    }),
    mat({
      id: 'mat-low-e',
      name: '浅蓝 Low-E 镀膜',
      manufacturer: '节能玻璃',
      reflectance: 0.12,
      transmittance: 0.62,
      coatingColor: '#6fa8c9',
      pattern: { kind: 'none', spacingXMm: 100, spacingYMm: 100, dotRadiusMm: 6, stripeWidthMm: 12, orientation: 'horizontal', color: '#f7fafc' },
      birdSafe: false,
      costPerM2: 320,
      note: '柔和浅蓝镀膜,天空反射较明显。',
      builtin: true,
    }),
    mat({
      id: 'mat-reflective-blue',
      name: '湖蓝高反射幕墙',
      manufacturer: '映像镀膜',
      reflectance: 0.24,
      transmittance: 0.28,
      coatingColor: '#246b9b',
      pattern: { kind: 'none', spacingXMm: 100, spacingYMm: 100, dotRadiusMm: 6, stripeWidthMm: 12, orientation: 'horizontal', color: '#f7fafc' },
      birdSafe: false,
      costPerM2: 420,
      note: '临湖项目常用,掠射角接近镜面,绿化倒影风险高。',
      builtin: true,
    }),
    mat({
      id: 'mat-frit-dots',
      name: '防鸟圆点夹胶玻璃 50×50',
      manufacturer: '羽安 Frit',
      reflectance: 0.1,
      transmittance: 0.52,
      coatingColor: '#9fc4d8',
      pattern: { kind: 'dots', spacingXMm: 50, spacingYMm: 50, dotRadiusMm: 6, stripeWidthMm: 12, orientation: 'horizontal', color: '#f8fafc' },
      birdSafe: true,
      costPerM2: 560,
      note: '圆点直径 12mm,横向与纵向净距均不超过 50mm。',
      builtin: true,
    }),
    mat({
      id: 'mat-frit-stripes',
      name: '防鸟横条纹玻璃 50 间距',
      manufacturer: '羽安 Frit',
      reflectance: 0.1,
      transmittance: 0.48,
      coatingColor: '#8fb8cc',
      pattern: { kind: 'stripes', spacingXMm: 100, spacingYMm: 50, dotRadiusMm: 6, stripeWidthMm: 12, orientation: 'horizontal', color: '#f8fafc' },
      birdSafe: true,
      costPerM2: 520,
      note: '12mm 宽横向条纹,条间净距约 38mm。',
      builtin: true,
    }),
    mat({
      id: 'mat-grid',
      name: '密格陶瓷点阵玻璃',
      manufacturer: '羽安 Frit',
      reflectance: 0.09,
      transmittance: 0.44,
      coatingColor: '#87a9bb',
      pattern: { kind: 'grid', spacingXMm: 50, spacingYMm: 50, dotRadiusMm: 5, stripeWidthMm: 8, orientation: 'horizontal', color: '#f8fafc' },
      birdSafe: true,
      costPerM2: 610,
      note: '双向 8mm 线宽,适合连廊和转角等高穿透位置。',
      builtin: true,
    }),
  ];
}

export function patternDeterrence(pattern: GlassMaterial['pattern']): number {
  if (!pattern || pattern.kind === 'none') return 0;
  const gap = Math.min(pattern.spacingXMm, pattern.spacingYMm);
  let spacingScore = 0.15;
  if (gap <= 50) spacingScore = 0.86;
  else if (gap <= 75) spacingScore = 0.72;
  else if (gap <= 100) spacingScore = 0.55;
  else if (gap <= 150) spacingScore = 0.34;
  else if (gap <= 220) spacingScore = 0.18;

  const markerSize = pattern.kind === 'dots' ? pattern.dotRadiusMm * 2 : pattern.stripeWidthMm;
  const sizeFactor = markerSize >= 10 ? 1 : markerSize >= 6 ? 0.86 : 0.68;
  const kindBonus = pattern.kind === 'grid' ? 0.05 : 0;
  return Math.min(0.94, spacingScore * sizeFactor + kindBonus);
}

export function patternKindLabel(kind: string): string {
  const labels: Record<string, string> = { none: '无图案', dots: '圆点', stripes: '条纹', grid: '网格' };
  return labels[kind] ?? kind;
}

export function facadeLabel(f: string): string {
  const labels: Record<string, string> = { south: '南立面', north: '北立面', east: '东立面', west: '西立面', corner: '玻璃转角', corridor: '玻璃连廊', roof: '采光顶', other: '其他面' };
  return labels[f] ?? f;
}
