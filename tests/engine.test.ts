import { describe, it, expect } from 'vitest';
import { buildSeedProjects } from '../src/core/seed';
import { defaultGlassLibrary } from '../src/core/glassLibrary';
import { DEFAULT_SETTINGS } from '../src/core/risk';
import { analyzeCpu } from '../src/core/engine';

const glass = defaultGlassLibrary();

describe('种子项目与 CPU 分析引擎', () => {
  it('两个测试项目都生成了足够的玻璃面', () => {
    const [office, mall] = buildSeedProjects();
    expect(office.surfaces.length).toBeGreaterThan(100);
    expect(mall.surfaces.filter((s) => s.isSeeThrough).length).toBeGreaterThan(10);
  });

  it('分析输出每块玻璃的统计且数值合法', () => {
    for (const p of buildSeedProjects()) {
      const r = analyzeCpu(p, glass, DEFAULT_SETTINGS);
      expect(r.stats).toHaveLength(p.surfaces.length);
      expect(r.risks).toHaveLength(p.surfaces.length);
      expect(r.sampleCount).toBeGreaterThan(1000);
      for (const st of r.stats) {
        expect(st.avgFresnel).toBeGreaterThanOrEqual(0);
        expect(st.avgFresnel).toBeLessThanOrEqual(1);
        expect(st.maxFresnel).toBeGreaterThanOrEqual(st.avgFresnel - 1e-6);
        const fracSum = st.skyReflection + st.treeReflection + st.waterReflection;
        expect(fracSum).toBeGreaterThanOrEqual(-1e-6);
        expect(fracSum).toBeLessThanOrEqual(1.0001);
      }
      for (const risk of r.risks) {
        expect(risk.score).toBeGreaterThanOrEqual(0);
        expect(risk.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it('临湖办公楼南立面（树+湖+反射玻璃）应出现高风险玻璃', () => {
    const [office] = buildSeedProjects();
    const r = analyzeCpu(office, glass, DEFAULT_SETTINGS);
    const southHigh = r.risks.filter((risk) => {
      const s = office.surfaces.find((x) => x.id === risk.surfaceId)!;
      return s.source.type === 'box-face' && s.source.face === 'south';
    });
    const maxScore = Math.max(...southHigh.map((x) => x.score));
    expect(maxScore).toBeGreaterThan(55);
  });

  it('商场玻璃连廊的可看穿度应显著高于普通玻璃', () => {
    const [, mall] = buildSeedProjects();
    const r = analyzeCpu(mall, glass, DEFAULT_SETTINGS);
    const corridorIds = new Set(mall.surfaces.filter((s) => s.name.includes('连廊')).map((s) => s.id));
    const corrSee = r.stats.filter((s) => corridorIds.has(s.surfaceId)).reduce((a, s) => a + s.seeThrough, 0) / corridorIds.size;
    const normalSee = r.stats.filter((s) => !corridorIds.has(s.surfaceId)).reduce((a, s) => a + s.seeThrough, 0) /
      Math.max(1, r.stats.length - corridorIds.size);
    expect(corrSee).toBeGreaterThan(0.7);
    expect(corrSee).toBeGreaterThan(normalSee + 0.4);
  });

  it('防鸟点阵玻璃应比同参数无图案玻璃风险更低', () => {
    const [office] = buildSeedProjects();
    const r0 = analyzeCpu(office, glass, DEFAULT_SETTINGS);
    const avg0 = r0.risks.reduce((a, x) => a + x.score, 0) / r0.risks.length;
    // 全部换成 50mm 点阵
    const frit = glass.find((g) => g.id === 'glass-frit-dots-50')!;
    const allFrit = office.surfaces.map((s) => ({ ...s, glassTypeId: frit.id }));
    const p2 = { ...office, surfaces: allFrit };
    const r1 = analyzeCpu(p2, glass, DEFAULT_SETTINGS);
    const avg1 = r1.risks.reduce((a, x) => a + x.score, 0) / r1.risks.length;
    expect(avg1).toBeLessThan(avg0 - 8);
  });
});
