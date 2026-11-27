import type {
  GlassSurface,
  GlassType,
  Project,
  SurfaceReflectionStat,
  Vec3,
} from './types';
import { clamp, headingToDir, quadPoint } from './geom';
import { fresnelByCosine } from './fresnel';
import { scoreSurface } from './risk';
import type { RiskResult, Settings } from './types';

/* 分类编号必须与 shaders.ts 中 CLS_* 完全一致 */
export const CLS_SKY = 0;
export const CLS_TREE = 1;
export const CLS_WATER = 2;
export const CLS_BUILDING = 3;
export const CLS_GROUND = 4;

export interface TraceTree {
  c: Vec3;
  r: number;
}
export interface TraceBox {
  min: Vec3;
  max: Vec3;
  bodyId: string;
}
export interface TraceWater {
  cx: number;
  y: number;
  cz: number;
  hw: number;
  hd: number;
}
export interface TraceScene {
  trees: TraceTree[];
  boxes: TraceBox[];
  waters: TraceWater[];
}

export function buildTraceScene(project: Project): TraceScene {
  const trees: TraceTree[] = [];
  const waters: TraceWater[] = [];
  for (const e of project.environment) {
    if (e.kind === 'tree') {
      trees.push({
        c: { x: e.position.x, y: e.heightM * 0.62, z: e.position.z },
        r: e.crownRadiusM,
      });
    } else {
      waters.push({ cx: e.center.x, y: 0.03, cz: e.center.z, hw: e.widthM / 2, hd: e.depthM / 2 });
    }
  }
  const boxes: TraceBox[] = project.buildingBodies.map((b) => {
    if (b.kind === 'box') {
      return {
        bodyId: b.id,
        min: {
          x: b.center.x - b.size.x / 2,
          y: b.center.y - b.size.y / 2,
          z: b.center.z - b.size.z / 2,
        },
        max: {
          x: b.center.x + b.size.x / 2,
          y: b.center.y + b.size.y / 2,
          z: b.center.z + b.size.z / 2,
        },
      };
    }
    const s = b.scale;
    return {
      bodyId: b.id,
      min: {
        x: b.translation.x + minArr(b.positions, 0) * s,
        y: b.translation.y + minArr(b.positions, 1) * s,
        z: b.translation.z + minArr(b.positions, 2) * s,
      },
      max: {
        x: b.translation.x + maxArr(b.positions, 0) * s,
        y: b.translation.y + maxArr(b.positions, 1) * s,
        z: b.translation.z + maxArr(b.positions, 2) * s,
      },
    };
  });
  return { trees, boxes, waters };
}

function minArr(a: Float32Array, comp: 0 | 1 | 2): number {
  let m = Infinity;
  for (let i = comp; i < a.length; i += 3) m = Math.min(m, a[i]);
  return Number.isFinite(m) ? m : 0;
}
function maxArr(a: Float32Array, comp: 0 | 1 | 2): number {
  let m = -Infinity;
  for (let i = comp; i < a.length; i += 3) m = Math.max(m, a[i]);
  return Number.isFinite(m) ? m : 1;
}

/* ---------------- 光线求交（CPU 参考，WGSL 镜像） ---------------- */

interface Hit {
  t: number;
  cls: number;
}

function raySphere(o: Vec3, d: Vec3, c: Vec3, r: number): number {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 1e-4) t = -b + sq;
  return t > 1e-4 ? t : Infinity;
}

function rayBox(o: Vec3, d: Vec3, mn: Vec3, mx: Vec3): number {
  let tmin = -Infinity;
  let tmax = Infinity;
  const axes: [number, number, number][] = [
    [o.x, d.x, 0],
    [o.y, d.y, 1],
    [o.z, d.z, 2],
  ];
  const lo = [mn.x, mn.y, mn.z];
  const hi = [mx.x, mx.y, mx.z];
  for (const [origin, dir, i] of axes) {
    if (Math.abs(dir) < 1e-8) {
      if (origin < lo[i] || origin > hi[i]) return Infinity;
    } else {
      let t1 = (lo[i] - origin) / dir;
      let t2 = (hi[i] - origin) / dir;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  if (tmin > 1e-4) return tmin;
  if (tmax > 1e-4) return tmax;
  return Infinity;
}

function rayWater(o: Vec3, d: Vec3, w: TraceWater): number {
  if (Math.abs(d.y) < 1e-8) return Infinity;
  const t = (w.y - o.y) / d.y;
  if (t < 1e-4) return Infinity;
  const x = o.x + d.x * t;
  const z = o.z + d.z * t;
  if (Math.abs(x - w.cx) <= w.hw && Math.abs(z - w.cz) <= w.hd) return t;
  return Infinity;
}

/** 追踪反射光线，返回最近环境分类。skipBoxIndex 为玻璃所属建筑体。 */
export function traceEnvironment(
  o: Vec3,
  d: Vec3,
  scene: TraceScene,
  skipBoxIndex: number,
): Hit {
  let bestT = Infinity;
  let cls = CLS_SKY;

  for (const t of scene.trees) {
    const tt = raySphere(o, d, t.c, t.r);
    if (tt < bestT) {
      bestT = tt;
      cls = CLS_TREE;
    }
  }
  for (const w of scene.waters) {
    const tt = rayWater(o, d, w);
    if (tt < bestT) {
      bestT = tt;
      cls = CLS_WATER;
    }
  }
  for (let i = 0; i < scene.boxes.length; i++) {
    if (i === skipBoxIndex) continue;
    const b = scene.boxes[i];
    const tt = rayBox(o, d, b.min, b.max);
    if (tt < bestT) {
      bestT = tt;
      cls = CLS_BUILDING;
    }
  }
  // 地面 y=0
  if (d.y < -1e-8) {
    const t = -o.y / d.y;
    if (t > 1e-4 && t < bestT) {
      bestT = t;
      cls = CLS_GROUND;
    }
  }
  if (!Number.isFinite(bestT)) return { t: Infinity, cls: CLS_SKY };
  return { t: bestT, cls };
}

/* ---------------- 采样射线构建 ---------------- */

export interface SampleRay {
  surfaceIndex: number;
  pos: Vec3;
  normal: Vec3;
  obs: Vec3;
  ior: number;
  trans: number;
  seeFlag: number;
  skipBoxIndex: number;
}

function wrap180(a: number): number {
  let x = ((a + 180) % 360 + 360) % 360 - 180;
  return x;
}

export function bodyIndexMap(project: Project): Map<string, number> {
  const m = new Map<string, number>();
  project.buildingBodies.forEach((b, i) => m.set(b.id, i));
  return m;
}

/** 为每块玻璃生成「玻璃采样点 × 鸟高度 × 观察方向」射线组。 */
export function buildSamples(
  project: Project,
  glassOf: (s: GlassSurface) => GlassType | undefined,
): SampleRay[] {
  const out: SampleRay[] = [];
  const bim = bodyIndexMap(project);
  const bird = project.bird;
  const heights: number[] = [];
  const hs = Math.max(1, bird.heightSteps);
  for (let i = 0; i < hs; i++) {
    const t = hs === 1 ? 0.5 : i / (hs - 1);
    heights.push(bird.minHeightM + (bird.maxHeightM - bird.minHeightM) * t);
  }
  const dirs = Math.max(1, bird.headingSteps);

  project.surfaces.forEach((s, surfaceIndex) => {
    const glass = glassOf(s);
    const ior = glass?.ior ?? 1.5;
    const trans = glass?.transmittance ?? 0.5;
    const [c0, c1, , c3] = s.corners;
    const width = Math.hypot(c1.x - c0.x, c1.y - c0.y, c1.z - c0.z);
    const height = Math.hypot(c3.x - c0.x, c3.y - c0.y, c3.z - c0.z);
    const U = width > 4 ? 4 : 2;
    const V = height > 2.5 ? 3 : 2;
    const skipBoxIndex = s.source.type === 'box-face' ? (bim.get(s.source.bodyId) ?? -1) : -1;

    const normalAz = (Math.atan2(s.normal.x, s.normal.z) * 180) / Math.PI;
    // 鸟来袭方位 heading → 观察者位于其反方向
    const deltaCenter = clamp(wrap180(bird.headingDeg + 180 - normalAz), -70, 70);

    for (let iu = 0; iu < U; iu++) {
      for (let iv = 0; iv < V; iv++) {
        const u = (iu + 0.5) / U;
        const v = (iv + 0.5) / V;
        const p = quadPoint(s.corners, u, v);
        for (const h of heights) {
          for (let j = 0; j < dirs; j++) {
            const tj = dirs === 1 ? 0.5 : j / (dirs - 1);
            const spread = bird.headingSpreadDeg;
            const delta = clamp(
              deltaCenter + (-spread / 2 + spread * tj),
              -80,
              80,
            );
            const beta = normalAz + delta;
            const hd = headingToDir(beta);
            const D = bird.observerDistanceM;
            const obs: Vec3 = { x: p.x + hd.x * D, y: h, z: p.z + hd.z * D };
            out.push({
              surfaceIndex,
              pos: p,
              normal: s.normal,
              obs,
              ior,
              trans,
              seeFlag: s.isSeeThrough ? 1 : 0,
              skipBoxIndex,
            });
          }
        }
      }
    }
  });
  return out;
}

/* ---------------- 单样本求值（CPU/GPU 共同数学） ---------------- */

export interface SampleValue {
  fresnel: number;
  see: number;
  habitat: number;
  cls: number;
}

/**
 * 计算一条采样：入射角 → 严格菲涅尔 R；反射方向 → 环境分类；
 * 透射项 → 看穿度。WGSL analyzeSample() 必须与此一致。
 */
export function analyzeSample(sm: SampleRay, scene: TraceScene): SampleValue {
  const n = sm.normal;
  // 从玻璃指向观察者
  let vi = { x: sm.obs.x - sm.pos.x, y: sm.obs.y - sm.pos.y, z: sm.obs.z - sm.pos.z };
  const vl = Math.hypot(vi.x, vi.y, vi.z) || 1;
  vi = { x: vi.x / vl, y: vi.y / vl, z: vi.z / vl };

  let cosI = vi.x * n.x + vi.y * n.y + vi.z * n.z;
  // 双面：若从背面观察，翻转法线
  let nn = n;
  if (cosI < 0) {
    cosI = -cosI;
    nn = { x: -n.x, y: -n.y, z: -n.z };
  }
  cosI = clamp(cosI, 0, 1);
  const fr = fresnelByCosine(cosI, sm.ior).r;

  // 反射方向 r = 2 cosI n - vi（vi 指向观察者），等价于 reflect(-vi, nn)
  const rdir = {
    x: 2 * cosI * nn.x - vi.x,
    y: 2 * cosI * nn.y - vi.y,
    z: 2 * cosI * nn.z - vi.z,
  };
  const eps = 0.08;
  const ro = { x: sm.pos.x + nn.x * eps, y: sm.pos.y + nn.y * eps, z: sm.pos.z + nn.z * eps };
  const hit = traceEnvironment(ro, rdir, scene, sm.skipBoxIndex);

  const habitat =
    hit.cls === CLS_SKY || hit.cls === CLS_TREE || hit.cls === CLS_WATER ? 1 : 0;

  // 看穿度：透射能量 (1-R)*T；人工连廊/转角标记给高基准
  const transmitted = (1 - fr) * sm.trans;
  const see = sm.seeFlag > 0.5 ? Math.max(0.82, 0.55 + 0.4 * transmitted) : 0.18 * transmitted;

  return { fresnel: fr, see, habitat, cls: hit.cls };
}

/* ---------------- CPU 全量分析 ---------------- */

export interface AnalysisResult {
  engine: 'webgpu' | 'cpu-reference';
  stats: SurfaceReflectionStat[];
  risks: RiskResult[];
  sampleCount: number;
  durationMs: number;
  fresnelGpuMaxRelErrorPct?: number;
}

export function analyzeCpu(
  project: Project,
  glassTypes: GlassType[],
  settings: Settings,
  opts: { useRetrofit?: boolean; engine?: 'webgpu' | 'cpu-reference'; fresnelGpuError?: number } = {},
): AnalysisResult {
  const t0 = performance.now();
  const glassMap = new Map(glassTypes.map((g) => [g.id, g]));
  const glassOf = (s: GlassSurface) =>
    glassMap.get(opts.useRetrofit && s.retrofitGlassTypeId ? s.retrofitGlassTypeId : s.glassTypeId);

  const scene = buildTraceScene(project);
  const samples = buildSamples(project, glassOf);

  const acc = project.surfaces.map(() => ({
    count: 0,
    sumF: 0,
    maxF: 0,
    sumHabInt: 0,
    hab: 0,
    tree: 0,
    sky: 0,
    water: 0,
    see: 0,
  }));

  for (const sm of samples) {
    const v = analyzeSample(sm, scene);
    const a = acc[sm.surfaceIndex];
    a.count++;
    a.sumF += v.fresnel;
    a.maxF = Math.max(a.maxF, v.fresnel);
    a.sumHabInt += v.fresnel * v.habitat;
    a.hab += v.habitat;
    if (v.cls === CLS_TREE) a.tree++;
    else if (v.cls === CLS_SKY) a.sky++;
    else if (v.cls === CLS_WATER) a.water++;
    a.see += v.see;
  }

  const stats: SurfaceReflectionStat[] = project.surfaces.map((s, i) => {
    const a = acc[i];
    const n = Math.max(1, a.count);
    return {
      surfaceId: s.id,
      sampleCount: a.count,
      avgFresnel: a.sumF / n,
      maxFresnel: a.maxF,
      habitatReflection: a.hab / n,
      treeReflection: a.tree / n,
      skyReflection: a.sky / n,
      waterReflection: a.water / n,
      seeThrough: a.see / n,
      reflectionIntensity: clamp(a.sumHabInt / n, 0, 1),
    };
  });

  const risks = stats.map((stat) => {
    const s = project.surfaces.find((x) => x.id === stat.surfaceId)!;
    return scoreSurface({ surface: s, stat, glass: glassOf(s), project, settings });
  });

  return {
    engine: opts.engine ?? 'cpu-reference',
    stats,
    risks,
    sampleCount: samples.length,
    durationMs: performance.now() - t0,
    fresnelGpuMaxRelErrorPct: opts.fresnelGpuError,
  };
}
