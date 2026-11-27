import type { GlassType } from './types';
import { iorFromNormalReflectance } from './fresnel';

function make(g: Omit<GlassType, 'ior'> & { ior?: number }): GlassType {
  const reflectance = g.reflectance;
  return { ...g, ior: g.ior ?? iorFromNormalReflectance(reflectance) };
}

/** 内置玻璃库：反射率/透射率/镀膜色 + 防鸟撞点阵、条纹。 */
export const BUILTIN_GLASS: GlassType[] = [
  make({
    id: 'glass-clear-dgu',
    name: '普通透明中空玻璃',
    vendor: '通用',
    reflectance: 0.08,
    transmittance: 0.78,
    coatingColor: '#b9d4e3',
    birdSafe: false,
    pattern: { type: 'none', color: '#ffffff', sizeM: 0, spacingXM: 0, spacingYM: 0 },
    note: '高透无图案，镜面反射与看穿风险均高',
    builtin: true,
  }),
  make({
    id: 'glass-low-e',
    name: '高透 Low-E 镀膜玻璃',
    vendor: '通用',
    reflectance: 0.16,
    transmittance: 0.7,
    coatingColor: '#9fc3d8',
    birdSafe: false,
    pattern: { type: 'none', color: '#ffffff', sizeM: 0, spacingXM: 0, spacingYM: 0 },
    note: '离线 Low-E，反射略高',
    builtin: true,
  }),
  make({
    id: 'glass-reflective-blue',
    name: '蓝灰热反射镀膜玻璃',
    vendor: '通用',
    reflectance: 0.34,
    transmittance: 0.32,
    coatingColor: '#5b7fa6',
    birdSafe: false,
    pattern: { type: 'none', color: '#ffffff', sizeM: 0, spacingXM: 0, spacingYM: 0 },
    note: '强镜面反射，映天映树，高风险',
    builtin: true,
  }),
  make({
    id: 'glass-mirror-silver',
    name: '银镜反射玻璃',
    vendor: '通用',
    reflectance: 0.55,
    transmittance: 0.12,
    coatingColor: '#c7d2dc',
    birdSafe: false,
    pattern: { type: 'none', color: '#ffffff', sizeM: 0, spacingXM: 0, spacingYM: 0 },
    note: '近似镜面，掠射角反射率趋近 1',
    builtin: true,
  }),
  make({
    id: 'glass-frit-dots-50',
    name: '防鸟撞釉面点阵 50×50',
    vendor: '防鸟撞标准',
    reflectance: 0.12,
    transmittance: 0.62,
    coatingColor: '#a9c6d8',
    birdSafe: true,
    pattern: { type: 'dots', color: '#f4f6f8', sizeM: 0.012, spacingXM: 0.05, spacingYM: 0.05 },
    note: 'Ø12mm 圆点 @50mm，符合 2×2 规则',
    builtin: true,
  }),
  make({
    id: 'glass-frit-dots-100',
    name: '防鸟撞点阵 100×100（稀疏）',
    vendor: '防鸟撞标准',
    reflectance: 0.12,
    transmittance: 0.68,
    coatingColor: '#a9c6d8',
    birdSafe: true,
    pattern: { type: 'dots', color: '#f4f6f8', sizeM: 0.01, spacingXM: 0.1, spacingYM: 0.1 },
    note: 'Ø10mm @100mm，间距偏大，需评估',
    builtin: true,
  }),
  make({
    id: 'glass-frit-stripes-20',
    name: '防鸟撞竖条纹 20mm 间距',
    vendor: '防鸟撞标准',
    reflectance: 0.13,
    transmittance: 0.6,
    coatingColor: '#9fb9cc',
    birdSafe: true,
    pattern: { type: 'stripes', color: '#eef3f6', sizeM: 0.02, spacingXM: 0.02, spacingYM: 0.1 },
    note: '20mm 宽竖条，周期 100mm（条间净距 80mm）',
    builtin: true,
  }),
  make({
    id: 'glass-frit-stripes-50',
    name: '防鸟撞密条纹 50mm 周期',
    vendor: '防鸟撞标准',
    reflectance: 0.13,
    transmittance: 0.55,
    coatingColor: '#9fb9cc',
    birdSafe: true,
    pattern: { type: 'stripes', color: '#eef3f6', sizeM: 0.025, spacingXM: 0.05, spacingYM: 0.1 },
    note: '25mm 条 @50mm 周期，净距 25mm，高效',
    builtin: true,
  }),
  make({
    id: 'glass-uv-pattern',
    name: 'UV 紫外防鸟图案玻璃',
    vendor: '防鸟撞标准',
    reflectance: 0.07,
    transmittance: 0.72,
    coatingColor: '#cfe6ef',
    birdSafe: true,
    pattern: { type: 'dots', color: '#7c5cff', sizeM: 0.008, spacingXM: 0.08, spacingYM: 0.08 },
    note: '人类近乎不可见、鸟类可见的 UV 点阵（示意色）',
    builtin: true,
  }),
];

export function defaultGlassLibrary(): GlassType[] {
  return BUILTIN_GLASS.map((g) => ({ ...g, pattern: { ...g.pattern } }));
}
