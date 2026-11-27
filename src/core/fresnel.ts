/**
 * 菲涅尔反射率 —— 全系统唯一的反射率数学实现（CPU 参考）。
 *
 * 采用严格的电介质菲涅尔方程（非 Schlick 近似），WGSL 端
 * src/gpu/shaders.ts 中的 fresnelDielectric() 必须与本文件逐行对应，
 * 并由「设置 → GPU 菲涅尔自检」对 GPU 读回值做 <1% 误差校验。
 *
 * 空气折射率 n1 = 1.0，玻璃折射率 n2 = ior（建筑玻璃典型 1.45~1.9）。
 */

export const AIR_IOR = 1.0;

/** 由法向反射率 R0 = ((n - 1) / (n + 1))^2 反解折射率 n = (1+√R0)/(1−√R0)。 */
export function iorFromNormalReflectance(reflectance: number): number {
  const r = Math.min(0.9999, Math.max(0, reflectance));
  const sqrtR = Math.sqrt(r);
  if (sqrtR >= 1) return 100;
  return (1 + sqrtR) / (1 - sqrtR);
}

/** 法向入射（θ=0）反射率 R0 = ((n1−n2)/(n1+n2))²。 */
export function normalReflectanceFromIor(ior: number): number {
  const a = (AIR_IOR - ior) / (AIR_IOR + ior);
  return a * a;
}

export interface FresnelResult {
  /** 入射角（弧度，表面法线与指向观察者方向的夹角，0 = 垂直正视）。 */
  thetaI: number;
  /** 折射角（弧度）。全反射时为 NaN。 */
  thetaT: number;
  /** s 偏振（垂直入射面）反射率。 */
  rs: number;
  /** p 偏振（平行入射面）反射率。 */
  rp: number;
  /** 非偏振光平均反射率 (Rs + Rp) / 2 —— 评估使用的主值。 */
  r: number;
  /** 是否发生全反射（空气→玻璃不会，保留接口完整性）。 */
  totalInternalReflection: boolean;
}

/**
 * 严格菲涅尔方程。
 * @param cosThetaI 入射角余弦，clamp 到 [0,1]；掠射角时趋近 0。
 * @param ior 玻璃折射率 n2（n1=1）。
 */
export function fresnelByCosine(cosThetaI: number, ior: number): FresnelResult {
  const cosI = Math.min(1, Math.max(0, cosThetaI));
  const n1 = AIR_IOR;
  const n2 = Math.max(1.0001, ior);

  // 完美掠射：方程为 0/0，物理极限 R → 1。
  if (cosI <= 1e-7) {
    const thetaI = Math.PI / 2;
    return { thetaI, thetaT: 0, rs: 1, rp: 1, r: 1, totalInternalReflection: false };
  }

  const sinI2 = Math.max(0, 1 - cosI * cosI);
  // 斯涅尔定律 n1·sinθi = n2·sinθt
  const sinT2 = ((n1 * n1) / (n2 * n2)) * sinI2;

  if (sinT2 > 1) {
    return {
      thetaI: Math.acos(cosI),
      thetaT: NaN,
      rs: 1,
      rp: 1,
      r: 1,
      totalInternalReflection: true,
    };
  }

  const cosT = Math.sqrt(Math.max(0, 1 - sinT2));

  // 振幅系数 → 功率反射率（先平方）
  const rsAmp = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
  const rpAmp = (n2 * cosI - n1 * cosT) / (n2 * cosI + n1 * cosT);
  const rs = rsAmp * rsAmp;
  const rp = rpAmp * rpAmp;
  const r = (rs + rp) * 0.5;

  return {
    thetaI: Math.acos(cosI),
    thetaT: Math.acos(cosT),
    rs,
    rp,
    r: Math.min(1, Math.max(0, r)),
    totalInternalReflection: false,
  };
}

/** 按入射角（弧度）计算非偏振菲涅尔反射率。 */
export function fresnelReflectance(thetaRadians: number, ior: number): number {
  return fresnelByCosine(Math.cos(thetaRadians), ior).r;
}

/** 角度版本（度），便于 UI 与自检。 */
export function fresnelReflectanceDeg(thetaDegrees: number, ior: number): number {
  return fresnelReflectance((thetaDegrees * Math.PI) / 180, ior);
}

/** 布儒斯特角（度）：tan θB = n2/n1，此时 Rp = 0。 */
export function brewsterAngleDeg(ior: number): number {
  return (Math.atan(ior / AIR_IOR) * 180) / Math.PI;
}

/**
 * 与独立解析参考值的最大相对误差（百分比）。
 * 参考实现使用等价但独立书写的三角形式，避免「同一份代码自证」。
 */
export function maxRelativeErrorVsReference(ior: number): {
  maxRelErrorPct: number;
  worstAngleDeg: number;
  samples: number;
} {
  let maxErr = 0;
  let worst = 0;
  const N = 1800;
  for (let k = 0; k <= N; k++) {
    const deg = (89.999 * k) / N;
    const th = (deg * Math.PI) / 180;
    // —— 独立参考：直接使用角度形式的经典教科书公式 ——
    let ref: number;
    if (deg < 1e-9) {
      ref = normalReflectanceFromIor(ior);
    } else {
      const sinT = Math.sin(th) / ior;
      const tt = Math.asin(Math.min(1, sinT));
      const RsRef = Math.pow(
        Math.sin(th - tt) / Math.sin(th + tt),
        2,
      );
      const RpRef = Math.pow(
        Math.tan(th - tt) / Math.tan(th + tt),
        2,
      );
      ref = (RsRef + RpRef) / 2;
    }

    const got = fresnelReflectance(th, ior);
    // 误差口径：与公式值之差 / 满量程 1（避免在 R≈0 处相对误差爆炸），
    // 同时记录严格相对误差用于 <1% 判定。
    const denom = Math.max(ref, 1e-6);
    const rel = Math.abs(got - ref) / denom;
    if (rel > maxErr) {
      maxErr = rel;
      worst = deg;
    }
  }
  return { maxRelErrorPct: maxErr * 100, worstAngleDeg: worst, samples: N + 1 };
}
