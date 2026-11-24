import { clamp } from './math';

// 非偏振介质表面的精确 Fresnel 公式。n1 通常是空气 1.0,n2 是玻璃等效折射率。
export function fresnelUnpolarized(cosTheta: number, n1 = 1, n2 = 1.52): number {
  const cosI = clamp(Math.abs(cosTheta), 0, 1);
  const ratio = n1 / n2;
  const sin2T = ratio * ratio * Math.max(0, 1 - cosI * cosI);
  if (sin2T >= 1) return 1;

  const cosT = Math.sqrt(Math.max(0, 1 - sin2T));
  const rsNumerator = n1 * cosI - n2 * cosT;
  const rsDenominator = n1 * cosI + n2 * cosT;
  const rpNumerator = n2 * cosI - n1 * cosT;
  const rpDenominator = n2 * cosI + n1 * cosT;

  const rs = rsNumerator / rsDenominator;
  const rp = rpNumerator / rpDenominator;
  return clamp((rs * rs + rp * rp) * 0.5, 0, 1);
}

// 由法向反射率 F0=((n2-n1)/(n2+n1))^2 反推等效折射率。
export function iorFromNormalReflectance(reflectance: number): number {
  const f0 = clamp(reflectance, 0, 0.98);
  const root = Math.sqrt(f0);
  return (1 + root) / Math.max(1e-6, 1 - root);
}

export function normalReflectanceFromIor(ior: number): number {
  const r = (ior - 1) / (ior + 1);
  return r * r;
}

export function materialFresnel(reflectance: number, ior: number | undefined, cosTheta: number): number {
  const n2 = ior && Number.isFinite(ior) && ior > 1 ? ior : iorFromNormalReflectance(reflectance);
  return fresnelUnpolarized(cosTheta, 1, n2);
}

export const FRESNEL_TEST_ANGLES = [0, 5, 10, 15, 20, 30, 40, 50, 55, 60, 65, 70, 75, 80, 85, 89, 90];

export function fresnelReferenceTable(ior = 1.52) {
  return FRESNEL_TEST_ANGLES.map((angleDeg) => {
    const expected = fresnelUnpolarized(Math.cos((angleDeg * Math.PI) / 180), 1, ior);
    return { angleDeg, expected };
  });
}

export function compareFresnelValues(actual: Float32Array | number[], ior = 1.52) {
  const points = FRESNEL_TEST_ANGLES.map((angleDeg, i) => {
    const expected = fresnelUnpolarized(Math.cos((angleDeg * Math.PI) / 180), 1, ior);
    const value = actual[i] ?? Number.NaN;
    const absoluteError = Math.abs(value - expected);
    const relativeError = absoluteError / Math.max(expected, 1e-6);
    return { angleDeg, expected, actual: value, absoluteError, relativeError };
  });
  const maxAbsoluteError = Math.max(...points.map((p) => p.absoluteError));
  const maxRelativeError = Math.max(...points.map((p) => p.relativeError));
  return {
    points,
    maxAbsoluteError,
    maxRelativeError,
    passed: maxAbsoluteError < 0.01 && maxRelativeError < 0.01,
  };
}
