import { describe, it, expect } from 'vitest';
import {
  fresnelReflectanceDeg,
  fresnelByCosine,
  iorFromNormalReflectance,
  normalReflectanceFromIor,
  brewsterAngleDeg,
  maxRelativeErrorVsReference,
} from '../src/core/fresnel';

describe('菲涅尔方程硬指标', () => {
  it('法向入射 n=1.5 时 R 必须等于 4%', () => {
    expect(fresnelReflectanceDeg(0, 1.5)).toBeCloseTo(0.04, 10);
  });

  it('掠射角 90° 时反射率必须为 1', () => {
    expect(fresnelReflectanceDeg(89.999, 1.52)).toBeGreaterThan(0.999);
    expect(fresnelByCosine(0, 1.52).r).toBe(1);
  });

  it('布儒斯特角处 p 偏振反射为 0', () => {
    const thetaB = brewsterAngleDeg(1.52);
    const r = fresnelByCosine(Math.cos((thetaB * Math.PI) / 180), 1.52);
    expect(r.rp).toBeLessThan(1e-9);
  });

  it('反射率随入射角单调不减', () => {
    let prev = -1;
    for (let a = 0; a <= 89; a += 1) {
      const r = fresnelReflectanceDeg(a, 1.52);
      expect(r).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = r;
    }
  });

  it('反射率始终在 [0,1]', () => {
    for (let n of [1.3, 1.45, 1.52, 1.9, 2.5]) {
      for (let a = 0; a <= 90; a += 0.5) {
        const r = fresnelReflectanceDeg(Math.min(a, 89.999), n);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
      }
    }
  });

  it('反射率↔折射率互解一致', () => {
    for (const r0 of [0.04, 0.08, 0.16, 0.34, 0.55]) {
      const n = iorFromNormalReflectance(r0);
      expect(normalReflectanceFromIor(n)).toBeCloseTo(r0, 9);
    }
  });

  it('与独立解析参考在全角度上的误差必须 < 1%（实际应远小）', () => {
    for (const n of [1.45, 1.52, 1.6, 1.9]) {
      const { maxRelErrorPct } = maxRelativeErrorVsReference(n);
      expect(maxRelErrorPct).toBeLessThan(1);
      // 同一数学实现的独立三角形式，误差应在数值精度量级
      expect(maxRelErrorPct).toBeLessThan(1e-8);
    }
  });

  it('关键角度的教科书数值（K=玻璃）', () => {
    // n=1.5: R0=4%; 45° 附近非偏振 R≈5%; 75° ≈ 26%~28%
    expect(fresnelReflectanceDeg(0, 1.5) * 100).toBeCloseTo(4, 5);
    const r45 = fresnelReflectanceDeg(45, 1.5);
    expect(r45).toBeGreaterThan(0.045);
    expect(r45).toBeLessThan(0.06);
    const r75 = fresnelReflectanceDeg(75, 1.5);
    expect(r75).toBeGreaterThan(0.23);
    expect(r75).toBeLessThan(0.3);
  });
});
